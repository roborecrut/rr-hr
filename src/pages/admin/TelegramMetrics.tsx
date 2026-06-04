/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Admin widget: aggregated metrics for Telegram OIDC routing & rejection reasons.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw } from "lucide-react";

interface ReasonRow { kind: string; reason: string; n: number }
interface Metrics {
  since: string;
  totals: Record<string, number>;
  by_reason: ReasonRow[];
  route: { zero?: number; one?: number; multi?: number; total?: number };
}

export default function TelegramMetrics() {
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const load = async (h = hours) => {
    setLoading(true); setError("");
    try {
      const { data, error } = await supabase.rpc("admin_telegram_metrics", { _hours: h });
      if (error) throw error;
      setData(data as unknown as Metrics);
    } catch (e: unknown) {
      const msg = (e as Error).message || "Ошибка загрузки";
      if (msg.toLowerCase().includes("forbidden")) {
        setError("Недостаточно прав: эта вкладка доступна только администраторам (роль admin в user_roles). Это не ошибка Telegram OIDC.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(hours); /* eslint-disable-next-line */ }, []);

  const total = data?.route?.total || 0;
  const pct = (n?: number) => total > 0 ? Math.round(((n || 0) / total) * 100) : 0;

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-[#E7C768] font-black text-lg">Telegram OIDC · метрики</h3>
        <div className="flex items-center gap-2">
          <select
            value={hours}
            onChange={(e) => { const h = Number(e.target.value); setHours(h); load(h); }}
            className="bg-[#0F1F33] border border-white/10 rounded-lg px-2 py-1 text-xs text-white"
          >
            <option value={1}>1 час</option>
            <option value={24}>24 часа</option>
            <option value={168}>7 дней</option>
            <option value={720}>30 дней</option>
          </select>
          <button
            onClick={() => load(hours)}
            className="text-xs px-3 py-1 rounded-lg bg-[#E7C768]/15 border border-[#E7C768]/30 text-[#E7C768] flex items-center gap-1"
            disabled={loading}
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            Обновить
          </button>
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-300 bg-red-500/10 p-2 rounded">{error}</div>
      )}

      {data && (
        <>
          {/* Totals by kind */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
            {Object.entries(data.totals || {}).map(([k, n]) => (
              <div key={k} className="bg-black/30 rounded-xl p-2 border border-white/5">
                <div className="text-slate-400 uppercase tracking-wider text-[10px]">{k}</div>
                <div className="text-white font-black text-lg">{n}</div>
              </div>
            ))}
            {Object.keys(data.totals || {}).length === 0 && (
              <div className="text-slate-400 col-span-full">Нет событий за период.</div>
            )}
          </div>

          {/* Routing decisions */}
          <div>
            <div className="text-xs uppercase text-slate-400 mb-1">Маршрутизация кандидатов</div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-black/30 rounded-xl p-2 border border-white/5">
                <div className="text-slate-400 text-[10px]">0 вакансий</div>
                <div className="text-white font-black">{data.route?.zero || 0} <span className="text-slate-400 text-xs">({pct(data.route?.zero)}%)</span></div>
              </div>
              <div className="bg-black/30 rounded-xl p-2 border border-white/5">
                <div className="text-slate-400 text-[10px]">1 вакансия</div>
                <div className="text-white font-black">{data.route?.one || 0} <span className="text-slate-400 text-xs">({pct(data.route?.one)}%)</span></div>
              </div>
              <div className="bg-black/30 rounded-xl p-2 border border-white/5">
                <div className="text-slate-400 text-[10px]">2+ вакансий</div>
                <div className="text-white font-black">{data.route?.multi || 0} <span className="text-slate-400 text-xs">({pct(data.route?.multi)}%)</span></div>
              </div>
            </div>
          </div>

          {/* By reason table */}
          <div>
            <div className="text-xs uppercase text-slate-400 mb-1">По причинам</div>
            <div className="max-h-72 overflow-y-auto border border-white/5 rounded-xl">
              <table className="w-full text-xs">
                <thead className="bg-black/30 text-slate-400">
                  <tr>
                    <th className="text-left px-3 py-2">Kind</th>
                    <th className="text-left px-3 py-2">Reason</th>
                    <th className="text-right px-3 py-2">N</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.by_reason || []).map((r, i) => (
                    <tr key={i} className="border-t border-white/5">
                      <td className="px-3 py-1.5 text-white">{r.kind}</td>
                      <td className="px-3 py-1.5 text-slate-300">{r.reason}</td>
                      <td className="px-3 py-1.5 text-right text-white font-mono">{r.n}</td>
                    </tr>
                  ))}
                  {(data.by_reason || []).length === 0 && (
                    <tr><td colSpan={3} className="px-3 py-3 text-center text-slate-500">Нет данных</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}