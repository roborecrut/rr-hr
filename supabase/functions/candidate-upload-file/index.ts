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
  const kind = String(form.get("kind") || "").trim(); // 'resume' | 'avatar' | 'doc' | 'list-docs' | 'delete-doc'
  const file = form.get("file");
  if (!token) return json({ error: "no_token" }, 401);
  if (!["resume", "avatar", "doc", "list-docs", "delete-doc"].includes(kind)) return json({ error: "bad_kind" }, 400);
  if (["resume", "avatar", "doc"].includes(kind)) {
    if (!(file instanceof File)) return json({ error: "no_file" }, 400);
    if (file.size > 25 * 1024 * 1024) return json({ error: "file_too_large" }, 413);
  }

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

  // List candidate documents
  if (kind === "list-docs") {
    const { data, error } = await admin.storage.from("candidate-docs").list(candidateId, {
      limit: 100, sortBy: { column: "created_at", order: "desc" },
    });
    if (error) return json({ error: error.message }, 500);
    const items = await Promise.all((data || []).filter((f) => f.name).map(async (f) => {
      const fullPath = `${candidateId}/${f.name}`;
      const { data: sd } = await admin.storage.from("candidate-docs").createSignedUrl(fullPath, 60 * 60 * 24 * 7);
      return { name: f.name, path: fullPath, size: (f.metadata as any)?.size || 0, signedUrl: sd?.signedUrl || null };
    }));
    return json({ ok: true, items });
  }

  // Delete candidate document
  if (kind === "delete-doc") {
    const path = String(form.get("path") || "").trim();
    if (!path.startsWith(`${candidateId}/`)) return json({ error: "forbidden" }, 403);
    const { error } = await admin.storage.from("candidate-docs").remove([path]);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  const bucket = kind === "resume" ? "candidate-resumes" : kind === "doc" ? "candidate-docs" : "candidate-avatars";
  const safeName = (file as File).name.replace(/[^\w.\-]+/g, "_");
  const path = `${candidateId}/${Date.now()}_${safeName}`;

  const { error: upErr } = await admin.storage.from(bucket).upload(path, file as File, {
    upsert: true,
    contentType: (file as File).type || undefined,
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
