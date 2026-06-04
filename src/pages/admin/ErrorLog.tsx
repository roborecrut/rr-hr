/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Временный журнал ошибок: client_errors + интересные telegram_events.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, AlertTriangle } from "lucide-react";

type ClientError = {
  id: string;
  created_at: string;
  source: string;
  message: string;
  user_id: string | null;
  meta: Record<string, unknown>;
};

type TgEvent = {
  id: string;
  created_at: string;
  kind: string;
  reason: string | null;
  intent: string | null;
  host: string | null;
  path: string | null;
};

export default function ErrorLog() {
  const [errors, setErrors] = useState<ClientError[]>([]);
  const [tgEvents, setTgEvents] = useState<TgEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const load = async () => {
    setLoading(true); setErr("");
    try {
      const [{ data: ce, error: ceErr }, { data: te, error: teErr }] = await Promise.all([
        supabase.from("client_errors").select("*").order("created_at", { ascending: false }).limit(200),
        supabase.from("telegram_events").select("id, created_at, kind, reason, intent, host, path")
          .in("kind", ["whitelist_reject", "rate_limited", "turnstile_fail", "next_reject"])
          .order("created_at", { ascending: false }).limit(100),
      ]);
      if (ceErr) throw ceErr;
      if (teErr) throw teErr;
      setErrors((ce as ClientError[]) || []);
      setTgEvents((te as TgEvent[]) || []);
    } catch (e: any) {
      setErr(e?.message || "Не удалось загрузить журнал");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <section className="bg-[#1D3E5E]/85 border border-white/15 rounded-3xl p-6 shadow-xl space-y-5">
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <h2 className="text-lg font-black text-white flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
          Журнал ошибок (последние 200)
        </h2>
        <button onClick={load} className="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Обновить
        </button>
      </div>

      {err && <div className="bg-rose-950/40 border border-rose-500/30 text-rose-200 text-xs p-3 rounded-xl">{err}</div>}

      <div>
        <h3 className="text-xs font-bold uppercase text-[#E7C768] mb-2">Client errors</h3>
        <div className="overflow-auto max-h-[420px] rounded-xl border border-white/10">
          <table className="w-full text-xs">
            <thead className="bg-white/5 sticky top-0">
              <tr className="text-left text-slate-300">
                <th className="p-2">Время</th>
                <th className="p-2">Источник</th>
                <th className="p-2">Сообщение</th>
                <th className="p-2">Meta</th>
              </tr>
            </thead>
            <tbody>
              {errors.length === 0 && (
                <tr><td colSpan={4} className="p-3 text-slate-400 text-center">Пусто</td></tr>
              )}
              {errors.map((e) => (
                <tr key={e.id} className="border-t border-white/5 align-top">
                  <td className="p-2 font-mono text-[10px] text-slate-400 whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                  <td className="p-2 font-mono text-amber-300">{e.source}</td>
                  <td className="p-2 text-white">{e.message}</td>
                  <td className="p-2 font-mono text-[10px] text-slate-300 max-w-[400px] truncate" title={JSON.stringify(e.meta)}>{JSON.stringify(e.meta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-bold uppercase text-[#E7C768] mb-2">Telegram события (отказы/лимиты)</h3>
        <div className="overflow-auto max-h-[320px] rounded-xl border border-white/10">
          <table className="w-full text-xs">
            <thead className="bg-white/5 sticky top-0">
              <tr className="text-left text-slate-300">
                <th className="p-2">Время</th>
                <th className="p-2">Kind</th>
                <th className="p-2">Reason</th>
                <th className="p-2">Intent</th>
                <th className="p-2">Host</th>
                <th className="p-2">Path</th>
              </tr>
            </thead>
            <tbody>
              {tgEvents.length === 0 && (
                <tr><td colSpan={6} className="p-3 text-slate-400 text-center">Пусто</td></tr>
              )}
              {tgEvents.map((e) => (
                <tr key={e.id} className="border-t border-white/5">
                  <td className="p-2 font-mono text-[10px] text-slate-400 whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                  <td className="p-2 font-mono text-rose-300">{e.kind}</td>
                  <td className="p-2 text-amber-200">{e.reason || "—"}</td>
                  <td className="p-2 text-slate-200">{e.intent || "—"}</td>
                  <td className="p-2 text-slate-300">{e.host || "—"}</td>
                  <td className="p-2 text-slate-400 truncate max-w-[260px]">{e.path || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}