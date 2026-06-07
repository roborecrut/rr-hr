import React, { useEffect, useMemo, useState } from "react";
import { X, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Universal admin details modal.
 * - Read-only when `table` is not provided.
 * - Editable when `table` is provided: every field becomes an input/textarea,
 *   and a Save button patches the row in the given Supabase table by `idField` (default "id").
 * - Object/array values are edited as JSON text and parsed back on save.
 * - Read-only system fields (`id`, `created_at`, `updated_at`, `public_id`) are shown but not sent.
 */
export default function DetailsModal({
  title, data, onClose, extra, table, idField = "id", onSaved,
}: {
  title: string;
  data: any | null;
  onClose: () => void;
  extra?: React.ReactNode;
  table?: string;
  idField?: string;
  onSaved?: (row: any) => void;
}) {
  const editable = Boolean(table);
  const READONLY_KEYS = useMemo(() => new Set(["id", idField, "created_at", "updated_at", "public_id"]), [idField]);

  const [form, setForm] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    const f: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      f[k] = v !== null && typeof v === "object" ? JSON.stringify(v, null, 2) : v ?? "";
    }
    setForm(f);
    setErrors({});
    setMsg(null);
  }, [data]);

  if (!data) return null;

  const setField = (k: string, val: any) => {
    setForm((s) => ({ ...s, [k]: val }));
    setErrors((e) => ({ ...e, [k]: "" }));
    setMsg(null);
  };

  const save = async () => {
    if (!table) return;
    setSaving(true);
    setMsg(null);
    const patch: Record<string, any> = {};
    const newErrors: Record<string, string> = {};
    for (const [k, v] of Object.entries(form)) {
      if (READONLY_KEYS.has(k)) continue;
      const original = (data as any)[k];
      // Object/array → parse JSON
      if (original !== null && typeof original === "object") {
        const txt = String(v ?? "").trim();
        if (!txt) { patch[k] = null; continue; }
        try { patch[k] = JSON.parse(txt); }
        catch { newErrors[k] = "Невалидный JSON"; continue; }
      } else if (typeof original === "boolean") {
        patch[k] = Boolean(v);
      } else if (typeof original === "number") {
        if (v === "" || v === null) { patch[k] = null; }
        else { const n = Number(v); if (Number.isNaN(n)) { newErrors[k] = "Не число"; continue; } patch[k] = n; }
      } else {
        patch[k] = v === "" ? null : v;
      }
      // Skip values that didn't actually change
      const sameAsOrig =
        original === patch[k] ||
        (original == null && patch[k] == null) ||
        (typeof original === "object" && JSON.stringify(original) === JSON.stringify(patch[k]));
      if (sameAsOrig) delete patch[k];
    }
    if (Object.keys(newErrors).length) { setErrors(newErrors); setSaving(false); return; }
    if (Object.keys(patch).length === 0) {
      setSaving(false);
      setMsg({ kind: "ok", text: "Нет изменений" });
      return;
    }
    const idVal = (data as any)[idField];
    const { data: updated, error } = await (supabase as any)
      .from(table).update(patch).eq(idField, idVal).select("*").maybeSingle();
    setSaving(false);
    if (error) {
      setMsg({ kind: "err", text: error.message });
      return;
    }
    setMsg({ kind: "ok", text: "Сохранено" });
    onSaved?.(updated || { ...data, ...patch });
  };

  const entries = Object.entries(form);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="brand-editor max-w-4xl w-full max-h-[88vh] overflow-auto rounded-3xl border border-white/15 shadow-2xl"
        style={{ background: "linear-gradient(135deg, #17344F 0%, #265582 100%)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-3 border-b border-white/10 bg-[#17344F]/90 backdrop-blur">
          <h3 className="text-base font-bold text-[#E7C768] truncate">{title}</h3>
          <div className="flex items-center gap-2">
            {editable && (
              <button onClick={save} disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#E7C768] to-[#D99E41] text-[#17344F] text-xs font-bold disabled:opacity-60">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Сохранить
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-200"><X className="w-4 h-4" /></button>
          </div>
        </div>
        {msg && (
          <div className={`px-5 py-2 text-xs font-semibold ${msg.kind === "ok" ? "text-emerald-200 bg-emerald-500/10" : "text-rose-200 bg-rose-500/10"}`}>
            {msg.text}
          </div>
        )}
        <div className="p-5 space-y-3">
          {extra}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {entries.map(([k, v]) => {
              const original = (data as any)[k];
              const isObj = original !== null && typeof original === "object";
              const isBool = typeof original === "boolean";
              const isNum = typeof original === "number";
              const isDateStr = typeof original === "string" && /^\d{4}-\d{2}-\d{2}T/.test(original);
              const readonly = !editable || READONLY_KEYS.has(k);
              const err = errors[k];
              return (
                <div key={k} className={`rounded-xl bg-[#17344F]/55 border ${err ? "border-rose-500/60" : "border-white/10"} p-2.5`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] uppercase tracking-wider font-mono text-[#E7C768]/80">{k}</div>
                    {readonly && <span className="text-[9px] text-slate-400">readonly</span>}
                  </div>
                  {readonly ? (
                    <div className={`mt-0.5 text-xs ${isObj ? "font-mono whitespace-pre-wrap break-all" : "break-words"} text-white/90`}>
                      {v === "" || v == null
                        ? "—"
                        : isDateStr
                          ? new Date(String(v)).toLocaleString()
                          : isObj
                            ? String(v)
                            : String(v)}
                    </div>
                  ) : isBool ? (
                    <label className="mt-1 inline-flex items-center gap-2 text-xs text-white/90">
                      <input type="checkbox" checked={Boolean(v)} onChange={(e) => setField(k, e.target.checked)} className="w-4 h-4 accent-[#E7C768]" />
                      {v ? "true" : "false"}
                    </label>
                  ) : isObj ? (
                    <textarea value={String(v ?? "")} onChange={(e) => setField(k, e.target.value)} rows={4}
                      className="mt-1 w-full bg-[#0F2336]/70 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] font-mono text-white/90 focus:outline-[#E7C768]" />
                  ) : (typeof v === "string" && v.length > 80) ? (
                    <textarea value={String(v ?? "")} onChange={(e) => setField(k, e.target.value)} rows={3}
                      className="mt-1 w-full bg-[#0F2336]/70 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white/90 focus:outline-[#E7C768]" />
                  ) : (
                    <input
                      type={isNum ? "number" : "text"}
                      value={v ?? ""}
                      onChange={(e) => setField(k, isNum ? e.target.value : e.target.value)}
                      className="mt-1 w-full bg-[#0F2336]/70 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white/90 focus:outline-[#E7C768]"
                    />
                  )}
                  {err && <div className="mt-1 text-[10px] text-rose-300">{err}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}