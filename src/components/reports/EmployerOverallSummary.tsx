/**
 * Employer "Общая оценка" — Apple Liquid Glass summary aggregating the three
 * interview stages (resume, checklist, situations) from data already present
 * in candidate_scores. Presentation-only: no AI calls, no mutations.
 *
 * Design: light frosted glass on the modal's blue background — no dark
 * surfaces. Green (strengths / green flags), amber (weak sides), rose
 * (red flags). Fully tolerant to missing feedback payloads.
 */
import React, { useMemo } from "react";
import { FileText, ClipboardCheck, MessageSquare, Sparkles, AlertTriangle, ShieldAlert, TrendingUp } from "lucide-react";

type AnyObj = Record<string, any>;

function asArr(v: unknown): any[] { return Array.isArray(v) ? v : []; }
function asStr(v: unknown): string { return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim(); }
function asStrArr(v: unknown): string[] { return asArr(v).map(asStr).filter(Boolean); }

/**
 * Some backends return gaps/strengths as plain strings, others as structured
 * objects (e.g. resume v2: {criterion, finding, impact}). This picks the most
 * human-readable text out of either shape so the UI never renders
 * "[object Object]".
 */
function textFromItem(v: unknown, keys: string[] = ["finding", "text", "title", "name", "criterion", "explanation", "detail", "description"]): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    const o = v as Record<string, any>;
    // Prefer a rich "finding — impact" phrasing when available.
    const finding = asStr(o.finding);
    const impact = asStr(o.impact);
    if (finding && impact) return `${finding} — ${impact}`;
    for (const k of keys) {
      const s = asStr(o[k]);
      if (s) return s;
    }
  }
  return "";
}
function itemsAsText(v: unknown): string[] {
  return asArr(v).map((x) => textFromItem(x)).filter(Boolean);
}

function pct(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(Number(n))) return null;
  return Math.max(0, Math.min(100, Math.round(Number(n))));
}

function ringColor(p: number | null): string {
  if (p == null) return "rgba(255,255,255,0.35)";
  if (p >= 80) return "#34d399"; // emerald-400
  if (p >= 60) return "#fbbf24"; // amber-400
  return "#fb7185"; // rose-400
}

function verdictFor(p: number | null): { text: string; cls: string } {
  if (p == null) return { text: "нет данных", cls: "text-white/70" };
  if (p >= 80) return { text: "сильный кандидат", cls: "text-emerald-100" };
  if (p >= 60) return { text: "подходит частично", cls: "text-amber-100" };
  return { text: "не рекомендован", cls: "text-rose-100" };
}

/** Circular progress ring for the stage score. */
function ScoreRing({ score }: { score: number | null }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const p = score ?? 0;
  const dash = (p / 100) * c;
  const color = ringColor(score);
  return (
    <div className="relative w-[68px] h-[68px] shrink-0">
      <svg viewBox="0 0 68 68" className="w-full h-full -rotate-90">
        <circle cx="34" cy="34" r={r} stroke="rgba(255,255,255,0.18)" strokeWidth="6" fill="none" />
        <circle
          cx="34" cy="34" r={r}
          stroke={color} strokeWidth="6" fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          style={{ transition: "stroke-dasharray .6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="text-[15px] font-black tracking-tight text-white">
          {score != null ? score : "—"}
        </span>
      </div>
    </div>
  );
}

function StageCard({ icon, title, score, headline }: {
  icon: React.ReactNode; title: string; score: number | null; headline: string;
}) {
  const v = verdictFor(score);
  return (
    <div
      className="rounded-2xl p-4 flex items-center gap-3 min-w-0 border border-white/25 shadow-[0_10px_40px_-15px_rgba(255,255,255,0.15)]"
      style={{
        background: "linear-gradient(135deg, rgba(255,255,255,0.16), rgba(255,255,255,0.06))",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
      }}
    >
      <ScoreRing score={score} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-white/90 text-[11px] font-bold uppercase tracking-wider">
          <span className="opacity-80">{icon}</span>{title}
        </div>
        <div className={`text-[13px] font-extrabold mt-0.5 ${v.cls}`}>{v.text}</div>
        {headline && (
          <div className="text-[12px] text-white/80 mt-1 line-clamp-2 leading-snug">{headline}</div>
        )}
      </div>
    </div>
  );
}

type TagItem = { text: string; source: string };

function Panel({
  icon, title, accent, items, empty, testId,
}: {
  icon: React.ReactNode; title: string;
  accent: "emerald" | "amber" | "rose" | "sky";
  items: TagItem[]; empty: string; testId?: string;
}) {
  const tint = {
    emerald: { bg: "rgba(52,211,153,0.14)", brd: "rgba(110,231,183,0.45)", head: "text-emerald-100", dot: "bg-emerald-300" },
    amber:   { bg: "rgba(251,191,36,0.14)", brd: "rgba(252,211,77,0.45)",  head: "text-amber-100",   dot: "bg-amber-300" },
    rose:    { bg: "rgba(251,113,133,0.14)", brd: "rgba(253,164,175,0.5)", head: "text-rose-100",    dot: "bg-rose-300" },
    sky:     { bg: "rgba(125,211,252,0.14)", brd: "rgba(186,230,253,0.45)", head: "text-sky-100",    dot: "bg-sky-300" },
  }[accent];

  return (
    <div
      data-testid={testId}
      className="rounded-2xl p-4 border"
      style={{
        background: `linear-gradient(135deg, ${tint.bg}, rgba(255,255,255,0.05))`,
        borderColor: tint.brd,
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
      }}
    >
      <div className={`flex items-center gap-2 text-[11px] font-black uppercase tracking-wider ${tint.head} mb-3`}>
        <span className="grid place-items-center w-6 h-6 rounded-full bg-white/15 border border-white/25">
          {icon}
        </span>
        {title}
        <span className="ml-auto text-white/60 text-[10px] font-bold">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="text-[12px] text-white/60 italic">{empty}</div>
      ) : (
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li key={i} className="flex gap-2 text-[13px] text-white leading-snug">
              <span className={`mt-[7px] w-1.5 h-1.5 shrink-0 rounded-full ${tint.dot}`} />
              <div className="min-w-0">
                <div>{it.text}</div>
                <div className="text-[10px] uppercase tracking-wider text-white/50 font-bold mt-0.5">{it.source}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function dedupe(list: TagItem[], limit = 6): TagItem[] {
  const seen = new Set<string>();
  const out: TagItem[] = [];
  for (const it of list) {
    const key = it.text.toLowerCase().replace(/[«»"'.,;: ]+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
    if (out.length >= limit) break;
  }
  return out;
}

export default function EmployerOverallSummary({
  resumeScore, resumeFeedback,
  checklistScore, checklistFeedback,
  situationsScore, situationsFeedback,
  overallScore,
}: {
  resumeScore: number | null | undefined;
  resumeFeedback: AnyObj | string | null | undefined;
  checklistScore: number | null | undefined;
  checklistFeedback: AnyObj | string | null | undefined;
  situationsScore: number | null | undefined;
  situationsFeedback: AnyObj | string | null | undefined;
  overallScore: number | null | undefined;
}) {
  const view = useMemo(() => {
    const rf = (resumeFeedback && typeof resumeFeedback === "object") ? resumeFeedback as AnyObj : {};
    const cf = (checklistFeedback && typeof checklistFeedback === "object") ? checklistFeedback as AnyObj : {};
    const sf = (situationsFeedback && typeof situationsFeedback === "object") ? situationsFeedback as AnyObj : {};

    const strengths: TagItem[] = [];
    const weak: TagItem[] = [];
    const greenFlags: TagItem[] = [];
    const redFlags: TagItem[] = [];

    // ---- Resume ----
    itemsAsText(rf.strengths).forEach(t => strengths.push({ text: t, source: "Резюме" }));
    itemsAsText(rf.gaps).forEach(t => weak.push({ text: t, source: "Резюме" }));
    asArr(rf.risks).forEach((r: any) => {
      const title = asStr(r?.title) || textFromItem(r);
      if (!title) return;
      const sev = asStr(r?.severity).toLowerCase();
      if (sev.includes("высок") || sev.includes("critical") || sev.includes("high")) {
        redFlags.push({ text: title, source: "Резюме" });
      } else {
        weak.push({ text: title, source: "Резюме" });
      }
    });
    asArr(rf.red_flags).forEach((r: any) => {
      const t = asStr(r?.title) || textFromItem(r);
      if (t) redFlags.push({ text: t, source: "Резюме" });
    });
    // Resume "matches" with degree "полностью" — treat as green flags.
    asArr(rf.matches).forEach((m: any) => {
      const degree = asStr(m?.degree).toLowerCase();
      if (!degree.includes("полност")) return;
      const t = asStr(m?.criterion) || asStr(m?.evidence);
      if (t) greenFlags.push({ text: t, source: "Резюме" });
    });

    // ---- Checklist ----
    itemsAsText(cf.strengths).forEach(t => strengths.push({ text: t, source: "Анкета" }));
    itemsAsText(cf.gaps).forEach(t => weak.push({ text: t, source: "Анкета" }));
    asArr(cf.risks).forEach((r: any) => {
      const title = asStr(r?.title) || textFromItem(r);
      const sev = asStr(r?.severity).toLowerCase();
      if (!title) return;
      if (sev.includes("высок") || sev.includes("critical") || sev.includes("high")) {
        redFlags.push({ text: title, source: "Анкета" });
      } else {
        weak.push({ text: title, source: "Анкета" });
      }
    });
    asArr(cf.red_flags).forEach((r: any) => {
      const t = asStr(r?.title) || textFromItem(r);
      if (t) redFlags.push({ text: t, source: "Анкета" });
    });

    // ---- Situations ----
    itemsAsText(sf.strengths).forEach(t => strengths.push({ text: t, source: "Ситуации" }));
    itemsAsText(sf.competencies_demonstrated).forEach(t => strengths.push({ text: t, source: "Ситуации" }));
    itemsAsText(sf.areas_to_improve).forEach(t => weak.push({ text: t, source: "Ситуации" }));
    itemsAsText(sf.competencies_weak).forEach(t => weak.push({ text: t, source: "Ситуации" }));
    asArr(sf.risks).forEach((r: any) => {
      const title = asStr(r?.title) || textFromItem(r);
      const sev = asStr(r?.severity).toLowerCase();
      if (!title) return;
      if (sev.includes("высок") || sev.includes("critical") || sev.includes("high")) {
        redFlags.push({ text: title, source: "Ситуации" });
      } else {
        weak.push({ text: title, source: "Ситуации" });
      }
    });
    asArr(sf.red_flags).forEach((r: any) => {
      const t = asStr(r?.title) || textFromItem(r);
      if (t) redFlags.push({ text: t, source: "Ситуации" });
    });

    // ---- Green flags — derive from top-scoring items across stages ----
    // Situations items scored ≥85/100
    asArr(sf.items).forEach((it: any) => {
      const sc = Number(it?.score);
      if (Number.isFinite(sc) && sc >= 85) {
        const t = asStr(it?.title || it?.feedback);
        if (t) greenFlags.push({ text: t, source: "Ситуации" });
      }
    });
    // Checklist items with full score (score === max, both defined)
    asArr(cf.items).forEach((it: any) => {
      const sc = Number(it?.score);
      const mx = Number(it?.max);
      if (Number.isFinite(sc) && Number.isFinite(mx) && mx > 0 && sc >= mx) {
        const t = asStr(it?.question);
        if (t) greenFlags.push({ text: t, source: "Анкета" });
      }
    });

    return {
      strengths: dedupe(strengths, 6),
      weak: dedupe(weak, 6),
      greenFlags: dedupe(greenFlags, 5),
      redFlags: dedupe(redFlags, 5),
      resumeHead: asStr(rf.summary),
      checklistHead: asStr(cf.summary),
      situationsHead: asStr(sf.summary) || asStr(sf.advice),
    };
  }, [resumeFeedback, checklistFeedback, situationsFeedback]);

  const rs = pct(resumeScore);
  const cs = pct(checklistScore);
  const ss = pct(situationsScore);
  const os = pct(overallScore);
  const overallV = verdictFor(os);

  const hasAny =
    rs != null || cs != null || ss != null ||
    view.strengths.length + view.weak.length + view.greenFlags.length + view.redFlags.length > 0;

  if (!hasAny) {
    return (
      <div
        data-testid="overall-summary-empty"
        className="rounded-2xl p-6 text-center border border-white/25 text-white/85"
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.14), rgba(255,255,255,0.05))",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
        }}
      >
        <Sparkles className="w-6 h-6 mx-auto mb-2 opacity-80" />
        <div className="text-sm font-bold">Данных для общей оценки пока нет</div>
        <div className="text-xs text-white/70 mt-1">
          Как только кандидат завершит этапы интервью, здесь появится сводный AI-разбор.
        </div>
      </div>
    );
  }

  return (
    <div data-testid="overall-summary" className="space-y-4">
      {/* Overall verdict headline */}
      <div
        className="rounded-2xl p-5 border border-white/25 flex items-center gap-4"
        style={{
          background: "linear-gradient(135deg, rgba(231,199,104,0.18), rgba(255,255,255,0.06))",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
        }}
      >
        <div className="grid place-items-center w-14 h-14 rounded-2xl border border-white/30 bg-white/10">
          <TrendingUp className="w-7 h-7 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-black uppercase tracking-wider text-white/70">
            Средний балл по интервью
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">{os != null ? os : "—"}</span>
            <span className="text-white/70 text-sm">/ 100</span>
            <span className={`ml-2 text-[13px] font-extrabold ${overallV.cls}`}>· {overallV.text}</span>
          </div>
        </div>
      </div>

      {/* Per-stage score cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StageCard icon={<FileText className="w-3.5 h-3.5" />} title="Резюме" score={rs} headline={view.resumeHead} />
        <StageCard icon={<ClipboardCheck className="w-3.5 h-3.5" />} title="Анкета" score={cs} headline={view.checklistHead} />
        <StageCard icon={<MessageSquare className="w-3.5 h-3.5" />} title="Ситуации" score={ss} headline={view.situationsHead} />
      </div>

      {/* Strengths / Weaknesses grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Panel
          testId="overall-strengths"
          icon={<Sparkles className="w-3.5 h-3.5 text-emerald-100" />}
          title="Сильные стороны"
          accent="emerald"
          items={view.strengths}
          empty="ИИ не выделил явных сильных сторон."
        />
        <Panel
          testId="overall-weak"
          icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-100" />}
          title="Слабые стороны"
          accent="amber"
          items={view.weak}
          empty="Слабых сторон по этапам не выявлено."
        />
      </div>

      {/* Flags grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Panel
          testId="overall-green-flags"
          icon={<Sparkles className="w-3.5 h-3.5 text-sky-100" />}
          title="Green flags"
          accent="sky"
          items={view.greenFlags}
          empty="Ярких зелёных флагов пока нет."
        />
        <Panel
          testId="overall-red-flags"
          icon={<ShieldAlert className="w-3.5 h-3.5 text-rose-100" />}
          title="Red flags"
          accent="rose"
          items={view.redFlags}
          empty="Красных флагов не обнаружено."
        />
      </div>
    </div>
  );
}