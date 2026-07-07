// Sends a Telegram message duplicating an employer notification.
// Invoked by a Postgres AFTER INSERT trigger on public.notifications via pg_net.

const TG_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escapeHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!TG_TOKEN) {
    return new Response(JSON.stringify({ error: "no_token" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any = null;
  try { body = await req.json(); } catch { /* ignore */ }
  const chatId = Number(body?.chat_id);
  const title = String(body?.title || "").slice(0, 200);
  const text = String(body?.body || "").slice(0, 3500);
  if (!chatId || !Number.isFinite(chatId)) {
    return new Response(JSON.stringify({ error: "bad_chat_id" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const msg = `<b>${escapeHtml(title)}</b>${text ? `\n\n${escapeHtml(text)}` : ""}`;

  const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: msg,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.ok === false) {
    console.error("telegram sendMessage failed", r.status, j);
    return new Response(JSON.stringify({ error: "telegram_failed", status: r.status, details: j }), {
      status: 200, // don't retry: employer's chat_id may be wrong
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});