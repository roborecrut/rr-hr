// Public, stateless resume upload for the /demo flow.
// Mirrors `candidate-upload-file` but doesn't require a candidate session —
// the file goes into `candidate-resumes` under a `demo/` prefix and is wiped
// shortly after by `ai-ingest-document` (it always deletes the source file
// after parsing). We also reject anything bigger than 10 MB and rate-limit
// per-IP via the shared `rate_limits` table.
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

  // Simple per-IP rate limit (10 uploads / 10 min).
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  try {
    const { data: allowed } = await admin.rpc("rl_hit", { _key: `demo-upload:${ip}`, _window_sec: 600, _limit: 10 });
    if (allowed === false) return json({ error: "rate_limited" }, 429);
  } catch { /* table optional, ignore */ }

  let form: FormData;
  try { form = await req.formData(); } catch { return json({ error: "bad_form" }, 400); }

  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "no_file" }, 400);
  if (file.size > 10 * 1024 * 1024) return json({ error: "file_too_large" }, 413);

  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-80) || "resume.pdf";
  const rand = crypto.randomUUID();
  const bucket = "candidate-resumes";
  const path = `demo/${Date.now()}_${rand}_${safeName}`;

  const { error: upErr } = await admin.storage.from(bucket).upload(path, file, {
    upsert: true, contentType: file.type || undefined,
  });
  if (upErr) return json({ error: `upload_failed: ${upErr.message}` }, 500);

  return json({ ok: true, bucket, path, filename: file.name });
});