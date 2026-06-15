// Robokassa: создаёт счёт через RPC и формирует подписанный URL платёжной формы.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import md5 from "https://esm.sh/blueimp-md5@2.19.0";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return jsonResponse({ error: "unauthorized" }, 401);

  let body: { amount_rub?: number; offer_accepted?: boolean; return_origin?: string } = {};
  try { body = await req.json(); } catch { return jsonResponse({ error: "bad_json" }, 400); }
  const amount = Math.floor(Number(body.amount_rub || 0));
  if (!Number.isFinite(amount) || amount < 100) return jsonResponse({ error: "min_100" }, 400);
  if (body.offer_accepted !== true) return jsonResponse({ error: "offer_required" }, 400);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supa = createClient(url, anon, { global: { headers: { Authorization: auth } } });

  const { data, error } = await supa.rpc("robokassa_create_invoice", {
    _amount_rub: amount, _offer_accepted: true,
  });
  if (error) return jsonResponse({ error: error.message }, 400);
  const invId = Number((data as any)?.inv_id);
  const outSum = Number((data as any)?.amount_rub).toFixed(2);
  if (!invId) return jsonResponse({ error: "no_invoice" }, 500);

  const login = Deno.env.get("ROBOKASSA_LOGIN") || "";
  const isTest = (Deno.env.get("ROBOKASSA_IS_TEST") || "1") === "1";
  const pwd1 = isTest
    ? (Deno.env.get("ROBOKASSA_TEST_PASSWORD1") || Deno.env.get("ROBOKASSA_PASSWORD1") || "")
    : (Deno.env.get("ROBOKASSA_PASSWORD1") || "");

  if (!login || !pwd1) {
    // Возвращаем счёт без URL — фронт покажет «временно недоступно».
    return jsonResponse({ ok: false, error: "robokassa_not_configured", inv_id: invId });
  }

  const desc = `Пополнение баланса RR на ${amount} RR (счёт #${invId})`;

  // Фискальный чек: УСН доходы-расходы, НДС 5%.
  const receipt = {
    sno: "usn_income_outcome",
    items: [{
      name: desc.slice(0, 128),
      quantity: 1,
      sum: Number(outSum),
      payment_method: "full_payment",
      payment_object: "service",
      tax: "vat5",
    }],
  };
  const receiptJson = JSON.stringify(receipt);
  const receiptEncoded = encodeURIComponent(receiptJson);

  // Подпись: MerchantLogin:OutSum:InvId:Receipt(url-encoded):Password1
  const signature = md5(`${login}:${outSum}:${invId}:${receiptEncoded}:${pwd1}`);

  // Собираем query-string вручную, чтобы Receipt был закодирован ровно один раз
  // и совпал с тем, что вошло в подпись.
  const pairs: Array<[string, string]> = [
    ["MerchantLogin", encodeURIComponent(login)],
    ["OutSum", encodeURIComponent(outSum)],
    ["InvId", encodeURIComponent(String(invId))],
    ["Description", encodeURIComponent(desc)],
    ["Receipt", receiptEncoded],
    ["SignatureValue", encodeURIComponent(signature)],
    ["Culture", "ru"],
    ["Encoding", "utf-8"],
  ];
  if (isTest) pairs.push(["IsTest", "1"]);
  const qs = pairs.map(([k, v]) => `${k}=${v}`).join("&");

  const payUrl = `https://auth.robokassa.ru/Merchant/Index.aspx?${qs}`;
  return jsonResponse({ ok: true, inv_id: invId, amount: amount, payment_url: payUrl, is_test: isTest });
});