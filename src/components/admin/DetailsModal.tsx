import React from "react";
import { X } from "lucide-react";

/**
 * Universal admin details modal: shows all fields of a row as a labeled list.
 * Renders JSON / dates / strings cleanly. Read-only.
 */
export default function DetailsModal({
  title, data, onClose, extra,
}: { title: string; data: any | null; onClose: () => void; extra?: React.ReactNode }) {
  if (!data) return null;
  const entries = Object.entries(data);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="brand-editor max-w-3xl w-full max-h-[85vh] overflow-auto rounded-3xl border border-white/15 shadow-2xl"
        style={{ background: "linear-gradient(135deg, #17344F 0%, #265582 100%)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-3 border-b border-white/10 bg-[#17344F]/85 backdrop-blur">
          <h3 className="text-base font-bold text-[#E7C768] truncate">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          {extra}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {entries.map(([k, v]) => {
              const isObj = v !== null && typeof v === "object";
              const str = v === null || v === undefined
                ? "—"
                : isObj
                  ? JSON.stringify(v, null, 2)
                  : String(v);
              const isDate = typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v);
              const display = isDate ? new Date(v as string).toLocaleString() : str;
              return (
                <div key={k} className="rounded-xl bg-[#17344F]/55 border border-white/10 p-2.5">
                  <div className="text-[10px] uppercase tracking-wider font-mono text-[#E7C768]/80">{k}</div>
                  <div className={`mt-0.5 text-xs ${isObj ? "font-mono whitespace-pre-wrap break-all" : "break-words"} text-white/90`}>
                    {display || "—"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}