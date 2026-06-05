import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Bot, X } from "lucide-react";

export type AILogEntry = {
  id: string;
  at: string;
  channel: string;        // ai-company-analyze, ai-enhance:single, etc.
  direction: "request" | "response" | "error";
  text: string;           // serialized payload
};

/** Dispatch from anywhere: window.dispatchEvent(new CustomEvent("ai-log", { detail: AILogEntry })) */
export function pushAILog(channel: string, direction: AILogEntry["direction"], payload: any) {
  const entry: AILogEntry = {
    id: Math.random().toString(36).slice(2),
    at: new Date().toLocaleTimeString("ru-RU", { hour12: false }),
    channel,
    direction,
    text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2),
  };
  try { window.dispatchEvent(new CustomEvent("ai-log", { detail: entry })); } catch {}
}

export default function AIDialogPanel() {
  const [items, setItems] = useState<AILogEntry[]>([]);
  const [open, setOpen] = useState(true);
  const [visible, setVisible] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onLog = (e: Event) => {
      const d = (e as CustomEvent<AILogEntry>).detail;
      if (!d) return;
      setVisible(true);
      setItems((prev) => [...prev.slice(-49), d]);
      requestAnimationFrame(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; });
    };
    window.addEventListener("ai-log", onLog);
    return () => window.removeEventListener("ai-log", onLog);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 right-4 z-40 w-[min(560px,calc(100vw-2rem))] rounded-t-2xl border border-white/10 bg-[#0E2236]/95 backdrop-blur shadow-2xl text-slate-100 text-xs">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="flex items-center gap-2 font-bold">
          <Bot className="w-4 h-4 text-emerald-400" />
          <span>Диалог с ИИ ProTalk</span>
          <span className="text-slate-400 font-normal">({items.length})</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setOpen((v) => !v)} className="p-1 hover:text-emerald-300" title={open ? "Свернуть" : "Развернуть"}>
            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
          <button onClick={() => { setItems([]); setVisible(false); }} className="p-1 hover:text-rose-300" title="Закрыть">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      {open && (
        <div ref={bodyRef} className="max-h-[40vh] overflow-y-auto p-2 space-y-1.5 font-mono">
          {items.map((it) => (
            <div key={it.id} className={`rounded-lg px-2 py-1.5 border ${
              it.direction === "request" ? "border-sky-500/30 bg-sky-500/5" :
              it.direction === "error" ? "border-rose-500/40 bg-rose-500/10" :
              "border-emerald-500/30 bg-emerald-500/5"
            }`}>
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>{it.direction === "request" ? "→" : it.direction === "error" ? "✗" : "←"} {it.channel}</span>
                <span>{it.at}</span>
              </div>
              <pre className="whitespace-pre-wrap break-words text-[11px] leading-snug">{it.text}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}