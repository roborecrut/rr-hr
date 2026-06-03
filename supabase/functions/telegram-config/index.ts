// Public: returns Telegram bot username for the Login Widget.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const username = Deno.env.get("TELEGRAM_BOT_USERNAME") || "";
  return jsonResponse({ username });
});