/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users, Send, Mail, Chrome } from "lucide-react";

interface Referee {
  used_by_user_id: string;
  referee_kind: string;
  intent: string | null;
  created_at: string;
  reward_rr: number;
  display_name: string | null;
  email: string | null;
  google_email: string | null;
  telegram_username: string | null;
  telegram_first_name: string | null;
  telegram_last_name: string | null;
  telegram_photo_url: string | null;
  avatar_url: string | null;
  registered_via: string | null;
}

function fullName(r: Referee): string {
  const parts = [r.telegram_first_name, r.telegram_last_name].filter(Boolean).join(" ").trim();
  return parts || r.display_name || (r.google_email ? r.google_email.split("@")[0] : `User ${r.used_by_user_id.slice(0, 6)}`);
}

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

export default function ReferralsList({ publicId }: { publicId?: string }) {
  const [items, setItems] = useState<Referee[] | null>(null);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("get_my_referees");
      if (error) { setErr(error.message); setItems([]); return; }
      setItems((data as Referee[]) || []);
    })();
  }, []);

  const refLink = publicId
    ? `${window.location.origin}/?ref=${publicId}`
    : "";

  return (
    <div className="bg-[#1D3E5E]/60 border border-[#E7C768]/30 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[#E7C768] font-black">
          <Users className="w-5 h-5" />
          <span>Приглашённые по вашей ссылке</span>
        </div>
        <span className="text-xs text-slate-300">{items?.length ?? "…"}</span>
      </div>

      {publicId && (
        <div className="text-[11px] text-slate-400 break-all bg-black/25 border border-white/5 rounded-xl px-3 py-2">
          Ваша ссылка: <span className="text-[#E7C768] font-mono">{refLink}</span>
        </div>
      )}

      {err && (
        <div className="text-xs text-red-300 bg-red-950/30 border border-red-500/30 rounded-xl px-3 py-2">{err}</div>
      )}

      {items && items.length === 0 && !err && (
        <div className="text-xs text-slate-400 italic">
          Пока никто не зарегистрировался по вашей ссылке. Поделитесь ею — за каждого работодателя вы получите +1000 RR.
        </div>
      )}

      {items && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((r) => {
            const name = fullName(r);
            const avatar = r.telegram_photo_url || r.avatar_url;
            const tgLink = r.telegram_username ? `https://t.me/${r.telegram_username}` : null;
            const isTg = r.registered_via === "telegram" || !!r.telegram_username;
            return (
              <li key={r.used_by_user_id} className="flex items-center gap-3 bg-black/25 border border-white/5 rounded-xl p-2.5">
                {avatar ? (
                  <img src={avatar} alt={name} referrerPolicy="no-referrer" className="w-10 h-10 rounded-full object-cover border border-[#E7C768]/40" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-[#E7C768]/15 border border-[#E7C768]/40 flex items-center justify-center text-[#E7C768] font-black text-xs">
                    {initials(name)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white truncate">{name}</div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-300 flex-wrap">
                    {isTg ? (
                      <span className="inline-flex items-center gap-1 bg-sky-950/40 border border-sky-500/30 text-sky-300 px-1.5 py-0.5 rounded">
                        <Send className="w-3 h-3" /> Telegram
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 px-1.5 py-0.5 rounded">
                        <Chrome className="w-3 h-3" /> Google
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-400">
                      {r.referee_kind === "employer" ? "Работодатель" : "Соискатель"}
                    </span>
                    {(r.google_email || r.email) && (
                      <span className="inline-flex items-center gap-1 truncate">
                        <Mail className="w-3 h-3" /> {r.google_email || r.email}
                      </span>
                    )}
                    {tgLink && (
                      <a href={tgLink} target="_blank" rel="noreferrer" className="text-[#E7C768] hover:underline">
                        @{r.telegram_username}
                      </a>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-400">{new Date(r.created_at).toLocaleDateString("ru-RU")}</div>
                  {Number(r.reward_rr) > 0 && (
                    <div className="text-[11px] font-black text-emerald-300">+{Number(r.reward_rr)} RR</div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}