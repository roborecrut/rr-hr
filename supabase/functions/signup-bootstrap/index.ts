/**
 * signup-bootstrap
 * Вызывается клиентом сразу после успешного входа через Google.
 *
 * - Гарантирует наличие строки `employers` для текущего юзера (триггер `grant_employer_bonus`
 *   при этом начисляет приглашённому +10 units = +1000 RR).
 * - Если в теле передан `ref=emp<public_id>` и это валидный другой работодатель —
 *   создаёт идемпотентную запись в `referrals_emp` и начисляет приглашающему +10 units.
 *
 * verify_jwt = false (см. supabase/config.toml), JWT валидируется в коде.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const REFERRAL_BONUS_UNITS = 10; // = 1000 RR

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  // --- Auth: validate JWT via anon client ---
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "unauthorized" }, 401);

  const authed = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userRes, error: userErr } = await authed.auth.getUser();
  if (userErr || !userRes?.user) return json({ error: "unauthorized" }, 401);
  const userId = userRes.user.id;
  const email = userRes.user.email ?? null;

  // --- Body ---
  let body: { ref?: string } = {};
  try { body = await req.json(); } catch { /* empty body ok */ }
  const refRaw = typeof body.ref === "string" ? body.ref.trim().toLowerCase() : "";
  const refMatch = refRaw.match(/^emp(\d+)$/);
  const refPublicId = refMatch ? refMatch[1] : null;

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // --- 1. Ensure employer row exists for this user ---
  const { data: existing } = await admin
    .from("employers")
    .select("id, public_id")
    .eq("user_id", userId)
    .maybeSingle();

  let employerId: string;
  let isNew = false;

  if (existing?.id) {
    employerId = existing.id;
  } else {
    const { data: inserted, error: insErr } = await admin
      .from("employers")
      .insert({
        user_id: userId,
        contact_email: email,
        company_name: email ? email.split("@")[0] : "Новая компания",
      })
      .select("id, public_id")
      .single();
    if (insErr || !inserted) {
      console.error("employer insert failed", insErr);
      return json({ error: "employer_create_failed", detail: insErr?.message }, 500);
    }
    employerId = inserted.id;
    isNew = true;
  }

  // --- 2. Referral binding (only if new employer + valid ref) ---
  let referralAwarded = false;
  if (isNew && refPublicId) {
    const { data: referrer } = await admin
      .from("employers")
      .select("id, user_id")
      .eq("public_id", refPublicId)
      .maybeSingle();

    if (referrer?.id && referrer.id !== employerId) {
      const { data: refRow, error: refErr } = await admin
        .from("referrals_emp")
        .insert({
          referrer_employer_id: referrer.id,
          referred_employer_id: employerId,
          bonus_units: REFERRAL_BONUS_UNITS,
        })
        .select("id")
        .maybeSingle();

      if (!refErr && refRow?.id) {
        const { error: txErr } = await admin.rpc("apply_transaction", {
          _employer: referrer.id,
          _type: "bonus",
          _amount: REFERRAL_BONUS_UNITS,
          _ref_table: "referrals_emp",
          _ref_id: refRow.id,
          _note: "Referral bonus: +1000 RR for inviting new employer",
        });
        if (txErr) console.error("apply_transaction failed", txErr);
        else referralAwarded = true;
      }
    }
  }

  return json({ ok: true, employer_id: employerId, is_new: isNew, referral_awarded: referralAwarded });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}