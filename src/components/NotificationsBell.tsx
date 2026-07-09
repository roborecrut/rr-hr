/**
 * In-app notification bell with realtime updates.
 * Works both for employers (auth.uid via Supabase Auth) and candidates
 * (current_candidate_id via x-candidate-token header). The RPC
 * `notifications_list` auto-detects the viewer.
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Bell, CheckCheck, Loader2, X, UserSquare2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRouter } from "@/components/RouterContext";

type NotifItem = {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
  meta?: any;
};

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const d = Math.max(0, Date.now() - t);
  const m = Math.floor(d / 60000);
  if (m < 1) return "только что";
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  const dd = Math.floor(h / 24);
  return `${dd} дн назад`;
}

export default function NotificationsBell({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const { navigate } = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<NotifItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [viewer, setViewer] = useState<string | null>(null);
  const [detail, setDetail] = useState<NotifItem | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc("notifications_list", { _limit: 30 });
      if (!error && data) {
        setItems(Array.isArray(data.items) ? data.items : []);
        setUnread(Number(data.unread || 0));
        setViewer(data.viewer || null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime: any insert/update on notifications → refetch (RLS filters server-side)
  useEffect(() => {
    const channel = supabase
      .channel("notifications-bell")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
        load();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  // Outside click
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const handleClick = async (n: NotifItem) => {
    if (!n.read_at) {
      await (supabase as any).rpc("notifications_mark_read", { _ids: [n.id] });
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x));
      setUnread(u => Math.max(0, u - 1));
    }
    setOpen(false);
    setDetail({ ...n, read_at: n.read_at || new Date().toISOString() });
  };

  const markAll = async () => {
    await (supabase as any).rpc("notifications_mark_read", { _ids: null });
    setItems(prev => prev.map(x => x.read_at ? x : { ...x, read_at: new Date().toISOString() }));
    setUnread(0);
  };

  if (!viewer && !loading) {
    // No viewer (not logged in as employer nor as candidate) — hide bell
    return null;
  }

  const btnBase = tone === "dark"
    ? "bg-white/10 hover:bg-white/20 border border-white/20 text-white"
    : "bg-black/5 hover:bg-black/10 border border-black/10 text-slate-900";

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="Уведомления"
        className={`relative inline-flex items-center justify-center w-9 h-9 rounded-xl transition ${btnBase}`}
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#FF3B30] text-white text-[10px] font-bold flex items-center justify-center border-2 border-[#17344F]">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[360px] max-w-[92vw] bg-[#17344F] border border-[#E7C768]/40 rounded-2xl shadow-2xl z-[100] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] to-[#E7C768] bg-clip-text text-transparent">
              Уведомления
            </div>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAll}
                className="text-[11px] text-slate-300 hover:text-white inline-flex items-center gap-1"
              >
                <CheckCheck className="w-3.5 h-3.5" /> Прочитать все
              </button>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {loading ? (
              <div className="px-4 py-8 text-center text-slate-300 inline-flex items-center justify-center gap-2 w-full">
                <Loader2 className="w-4 h-4 animate-spin" /> Загрузка…
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center text-slate-400 text-xs">
                Пока пусто. Здесь будут уведомления о важных событиях.
              </div>
            ) : (
              <ul className="divide-y divide-white/5">
                {items.map(n => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleClick(n)}
                      className={`w-full text-left px-4 py-3 transition hover:bg-white/5 ${n.read_at ? "opacity-70" : ""}`}
                    >
                      <div className="flex items-start gap-2">
                        {!n.read_at && (
                          <span className="mt-1.5 w-2 h-2 rounded-full bg-[#E7C768] flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-bold text-white truncate">{n.title}</div>
                          {n.body && (
                            <div className="text-[12px] text-slate-300 mt-0.5 line-clamp-2">{n.body}</div>
                          )}
                          <div className="text-[10px] text-slate-500 mt-1">{timeAgo(n.created_at)}</div>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {detail && createPortal(
        (<div
          className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setDetail(null)}
        >
          <div
            className="bg-gradient-to-b from-[#1E4468] to-[#17344F] border border-[#E7C768]/40 rounded-3xl shadow-2xl p-6 w-full max-w-lg text-white"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <h4 className="text-lg font-bold bg-gradient-to-r from-[#F4EE8E] to-[#E7C768] bg-clip-text text-transparent">
                {detail.title}
              </h4>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="p-1 rounded-lg hover:bg-white/10"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="text-[11px] text-slate-400 mb-3">{new Date(detail.created_at).toLocaleString("ru-RU")}</div>
            {detail.body && (
              <div className="bg-black/25 border border-white/10 rounded-xl p-3 text-[13px] whitespace-pre-wrap leading-relaxed">
                {detail.body}
              </div>
            )}
            <div className="flex flex-wrap gap-2 justify-end mt-5">
              {detail?.meta?.candidate_id && (
                <button
                  type="button"
                  onClick={() => {
                    const id = detail.meta.candidate_id;
                    setDetail(null);
                    // Try in-panel event first; fall back to CRM URL.
                    const ev = new CustomEvent("open-candidate-card", { detail: { id } });
                    window.dispatchEvent(ev);
                    if (detail.link) navigate(`${detail.link}?candidate=${id}`);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-sm hover:opacity-90"
                >
                  <UserSquare2 className="w-4 h-4" /> Открыть карточку кандидата
                </button>
              )}
              {detail.link && !detail?.meta?.candidate_id && !detail?.meta?.decision && (
                <button
                  type="button"
                  onClick={() => { const l = detail.link!; setDetail(null); navigate(l); }}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-sm font-semibold"
                >
                  Перейти
                </button>
              )}
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-sm font-semibold"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>),
        document.body
      )}
    </div>
  );
}