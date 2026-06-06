// Upload a candidate's file (resume or avatar) using the candidate session token.
// Candidates don't use Supabase Auth, so the regular storage RLS policies (auth.uid()-based)
// would block direct uploads. This function validates the candidate_sessions token via
// service role and uploads the file on their behalf into the proper bucket+folder.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !svc) return json({ error: "server_misconfigured" }, 500);
  const admin = createClient(url, svc);

  let form: FormData;
  try { form = await req.formData(); } catch { return json({ error: "bad_form" }, 400); }

  const token = String(form.get("token") || "").trim();
  const kind = String(form.get("kind") || "").trim(); // 'resume' | 'avatar'
  const file = form.get("file");
  if (!token) return json({ error: "no_token" }, 401);
  if (!(file instanceof File)) return json({ error: "no_file" }, 400);
  if (!["resume", "avatar"].includes(kind)) return json({ error: "bad_kind" }, 400);
  if (file.size > 15 * 1024 * 1024) return json({ error: "file_too_large" }, 413);

  // Validate token
  const { data: sess, error: sErr } = await admin
    .from("candidate_sessions")
    .select("candidate_id, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (sErr || !sess?.candidate_id) return json({ error: "bad_token" }, 401);
  if (sess.expires_at && new Date(sess.expires_at).getTime() < Date.now()) {
    return json({ error: "token_expired" }, 401);
  }
  const candidateId = sess.candidate_id as string;

  const bucket = kind === "resume" ? "candidate-resumes" : "candidate-avatars";
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${candidateId}/${Date.now()}_${safeName}`;

  const { error: upErr } = await admin.storage.from(bucket).upload(path, file, {
    upsert: true,
    contentType: file.type || undefined,
  });
  if (upErr) return json({ error: `upload_failed: ${upErr.message}` }, 500);

  // For private bucket return signed url; for public — public url
  let publicUrl: string | null = null;
  let signedUrl: string | null = null;
  if (bucket === "candidate-avatars") {
    const { data } = admin.storage.from(bucket).getPublicUrl(path);
    publicUrl = data?.publicUrl || null;
  }
  {
    const { data } = await admin.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 365);
    signedUrl = data?.signedUrl || null;
  }

  return json({ ok: true, bucket, path, publicUrl, signedUrl, candidate_id: candidateId });
});
