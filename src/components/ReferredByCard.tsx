/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Gift, Send, Chrome, Mail } from "lucide-react";

interface Referrer {
  owner_user_id: string;
  owner_public_id: string | null;
  ref_code: string;
  referee_kind: string;
  intent: string | null;
  created_at: string;
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

export default function ReferredByCard() {
  const [data, setData] = useState<Referrer | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: rows } = await supabase.rpc("get_my_referrer");
      setData(((rows as Referrer[]) || [])[0] || null);
      setLoaded(true);
    })();
  }, []);

  if (!loaded || !data) return null;

  const name = [data.telegram_first_name, data.telegram_last_name].filter(Boolean).join(" ").trim()
    || data.display_name
    || (data.google_email ? data.google_email.split("@")[0] : `Пользователь`);
  const avatar = data.telegram_photo_url || data.avatar_url;
  const tgLink = data.telegram_username ? `https://t.me/${data.telegram_username}` : null;
  const isTg = data.registered_via === "telegram" || !!data.telegram_username;
  const profileLink = data.owner_public_id ? `/employer${data.owner_public_id}/profile` : null;

  return (
    <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2 text-emerald-300 font-bold text-xs uppercase tracking-wider">
        <Gift className="w-4 h-4" />
        <span>Вы зарегистрировались по приглашению</span>
      </div>
      <div className="flex items-center gap-3 bg-black/25 border border-white/5 rounded-xl p-2.5">
        {avatar ? (
          <img src={avatar} alt={name} referrerPolicy="no-referrer" className="w-12 h-12 rounded-full object-cover border border-emerald-400/40" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-400/40 flex items-center justify-center text-emerald-300 font-black">
            {name.slice(0, 1).toUpperCase()}
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
            {(data.google_email || data.email) && (
              <span className="inline-flex items-center gap-1 truncate">
                <Mail className="w-3 h-3" /> {data.google_email || data.email}
              </span>
            )}
            {tgLink && (
              <a href={tgLink} target="_blank" rel="noreferrer" className="text-[#E7C768] hover:underline">
                @{data.telegram_username}
              </a>
            )}
            {profileLink && (
              <a href={profileLink} className="text-[#E7C768] hover:underline">
                Профиль →
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}