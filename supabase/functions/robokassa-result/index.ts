// Robokassa ResultURL приёмник. Проверяет подпись и помечает счёт оплаченным.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

async function md5(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("MD5", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function text(body: string, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

Deno.serve(async (req) => {
  // Robokassa отправляет POST application/x-www-form-urlencoded, но допускает и GET.
  let params: URLSearchParams;
  if (req.method === "GET") {
    params = new URL(req.url).searchParams;
  } else {
    const raw = await req.text();
    params = new URLSearchParams(raw);
  }
  const outSum = params.get("OutSum") || "";
  const invId = params.get("InvId") || "";
  const sigIn = (params.get("SignatureValue") || "").toLowerCase();

  if (!outSum || !invId || !sigIn) return text("bad request", 400);

  // Test/prod password 2 — выбираем по флагу + по факту наличия.
  const isTest = (Deno.env.get("ROBOKASSA_IS_TEST") || "1") === "1";
  const pwd2 = isTest
    ? (Deno.env.get("ROBOKASSA_TEST_PASSWORD2") || Deno.env.get("ROBOKASSA_PASSWORD2") || "")
    : (Deno.env.get("ROBOKASSA_PASSWORD2") || "");
  if (!pwd2) return text("not configured", 500);

  const expected = await md5(`${outSum}:${invId}:${pwd2}`);
  if (expected.toLowerCase() !== sigIn) return text("bad signature", 400);

  const supaUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supaUrl, serviceKey);

  const payload: Record<string, string> = {};
  for (const [k, v] of params.entries()) payload[k] = v;

  const { error } = await admin.rpc("robokassa_mark_paid", {
    _inv_id: Number(invId),
    _amount: Number(outSum),
    _payload: payload,
  });
  if (error) return text(`error: ${error.message}`, 500);

  return text(`OK${invId}`);
});