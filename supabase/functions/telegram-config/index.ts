// Public: returns Telegram bot username for the Login Widget.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const raw = Deno.env.get("TELEGRAM_BOT_USERNAME") || "";
  const username = raw.replace(/^@+/, "").trim();
  return jsonResponse({ username });
});