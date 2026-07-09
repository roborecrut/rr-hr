/**
 * Оверлей журнала прокси-запросов. Открывается/закрывается по Ctrl+[.
 * Показывает список последних запросов к `SUPABASE_PROXY_ORIGIN`, для каждого —
 * curl-команду, тело запроса и ответ прокси. Пункт «Копировать» кладёт curl
 * в буфер обмена. Оверлей рендерится вне обычного дерева — без стилевых
 * зависимостей от `brand-editor`, чтобы работал везде.
 */
import { useEffect, useMemo, useState } from "react";
import {
  clearProxyLog,
  getProxyLog,
  subscribeProxyLog,
  type ProxyLogEntry,
} from "@/lib/proxyLog";

function fmtTs(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour12: false }) +
    "." + String(d.getMilliseconds()).padStart(3, "0");
}

function statusColor(e: ProxyLogEntry): string {
  if (e.error) return "#ff6b6b";
  if (e.status == null) return "#c0c0c0";
  if (e.status >= 500) return "#ff6b6b";
  if (e.status >= 400) return "#ffb020";
  if (e.status >= 300) return "#66c2ff";
  return "#7ee787";
}

export default function ProxyLogViewer() {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => subscribeProxyLog(() => setTick((t) => t + 1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ctrl+[ или Cmd+[ — переключить оверлей. code=BracketLeft устойчив к раскладке.
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.code === "BracketLeft") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const entries = useMemo(() => getProxyLog(), [tick, open]);
  const selected = entries.find((e) => e.id === selectedId) || entries[0] || null;

  if (!open) return null;

  const copy = (text: string) => {
    try { navigator.clipboard?.writeText(text); } catch { /* ignore */ }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 2147483000,
        background: "rgba(6,12,24,0.85)", backdropFilter: "blur(4px)",
        display: "flex", flexDirection: "column", color: "#e6edf3",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: "1px solid #253247", background: "#0d1522" }}>
        <strong style={{ fontSize: 13 }}>Proxy request log</strong>
        <span style={{ opacity: 0.7 }}>{entries.length} записей · Ctrl+[ чтобы закрыть</span>
        <span style={{ flex: 1 }} />
        <button onClick={clearProxyLog} style={btnStyle}>Очистить</button>
        <button onClick={() => setOpen(false)} style={btnStyle}>Закрыть ✕</button>
      </div>
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "minmax(320px, 40%) 1fr", minHeight: 0 }}>
        <div style={{ overflow: "auto", borderRight: "1px solid #253247" }}>
          {entries.length === 0 && (
            <div style={{ padding: 16, opacity: 0.7 }}>Пока пусто — сделайте любое действие в приложении.</div>
          )}
          {entries.map((e) => {
            const path = (() => { try { return new URL(e.url).pathname + new URL(e.url).search; } catch { return e.url; } })();
            const isSel = (selected?.id === e.id);
            return (
              <button
                key={e.id}
                onClick={() => setSelectedId(e.id)}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "8px 12px", background: isSel ? "#17253d" : "transparent",
                  border: 0, borderBottom: "1px solid #182234", color: "#e6edf3",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  <span style={{ color: statusColor(e), fontWeight: 700, minWidth: 40 }}>
                    {e.error ? "ERR" : (e.status ?? "…")}
                  </span>
                  <span style={{ color: "#8ecfff", minWidth: 50 }}>{e.method}</span>
                  <span style={{ opacity: 0.7 }}>{fmtTs(e.ts)}</span>
                  {e.durationMs != null && <span style={{ opacity: 0.6, marginLeft: "auto" }}>{e.durationMs}ms</span>}
                </div>
                <div style={{ marginTop: 2, wordBreak: "break-all", opacity: 0.9 }}>{path}</div>
              </button>
            );
          })}
        </div>
        <div style={{ overflow: "auto", padding: 16 }}>
          {!selected && <div style={{ opacity: 0.7 }}>Выберите запрос слева.</div>}
          {selected && (
            <>
              <div style={{ marginBottom: 8, wordBreak: "break-all" }}>
                <span style={{ color: statusColor(selected), fontWeight: 700 }}>
                  {selected.error ? "ERROR" : selected.status}
                </span>{" "}
                <span style={{ color: "#8ecfff" }}>{selected.method}</span>{" "}
                <span>{selected.url}</span>
              </div>
              <Section title="cURL" onCopy={() => copy(selected.curl)}>
                <pre style={preStyle}>{selected.curl}</pre>
              </Section>
              {selected.requestBody && (
                <Section title="Request body" onCopy={() => copy(selected.requestBody!)}>
                  <pre style={preStyle}>{selected.requestBody}</pre>
                </Section>
              )}
              <Section title="Response headers">
                <pre style={preStyle}>
                  {Object.entries(selected.responseHeaders).map(([k, v]) => `${k}: ${v}`).join("\n") || "(нет)"}
                </pre>
              </Section>
              <Section
                title={`Response body${selected.error ? " (ошибка)" : ""}`}
                onCopy={() => copy(selected.responseBody || selected.error || "")}
              >
                <pre style={preStyle}>{selected.error || selected.responseBody || "(пусто)"}</pre>
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: "#17253d", color: "#e6edf3", border: "1px solid #253247",
  padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12,
};

const preStyle: React.CSSProperties = {
  margin: 0, padding: 10, background: "#0b1220", border: "1px solid #1c2a41",
  borderRadius: 6, whiteSpace: "pre-wrap", wordBreak: "break-all",
  maxHeight: 320, overflow: "auto",
};

function Section({ title, onCopy, children }: { title: string; onCopy?: () => void; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <strong style={{ fontSize: 12, opacity: 0.85 }}>{title}</strong>
        {onCopy && <button onClick={onCopy} style={btnStyle}>Копировать</button>}
      </div>
      {children}
    </div>
  );
}