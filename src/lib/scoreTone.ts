// =============================================================================
// Shared score → color tone helper. Applies the agreed thresholds:
//   max=100: 0–39 red, 40–69 amber, 70–100 emerald
//   max=5:   0–1 red, 2–3 amber, 4–5 emerald
//   any other max: same percentage rule as max=100 (<40 / <70 / ≥70)
// Returns ready-to-use Tailwind class fragments so renderers stay consistent.
// =============================================================================

export type ToneLabel = "good" | "mid" | "bad" | "none";

export type Tone = {
  label: ToneLabel;
  text: string;       // colored text (badge / number)
  bg: string;         // colored background+border for the row/badge
  border: string;     // left-border accent for accordion summaries
  badge: string;      // small inline badge (bg + text + border)
};

const TONES: Record<ToneLabel, Omit<Tone, "label">> = {
  good: {
    text: "text-emerald-300",
    bg: "bg-emerald-500/15 border-emerald-400/40",
    border: "border-l-emerald-400",
    badge: "bg-emerald-500/20 text-emerald-200 border border-emerald-400/40",
  },
  mid: {
    text: "text-amber-300",
    bg: "bg-amber-500/15 border-amber-400/40",
    border: "border-l-amber-400",
    badge: "bg-amber-500/20 text-amber-200 border border-amber-400/40",
  },
  bad: {
    text: "text-rose-300",
    bg: "bg-rose-500/15 border-rose-400/40",
    border: "border-l-rose-400",
    badge: "bg-rose-500/20 text-rose-200 border border-rose-400/40",
  },
  none: {
    text: "text-slate-400",
    bg: "bg-black/30 border-white/10",
    border: "border-l-white/15",
    badge: "bg-white/10 text-slate-300 border border-white/15",
  },
};

export function scoreTone(value: unknown, max: number = 100): Tone {
  const n = value === null || value === undefined ? NaN : Number(value);
  if (!Number.isFinite(n)) return { label: "none", ...TONES.none };

  // Hand-coded 0–5 buckets so 3/5 stays amber instead of green.
  if (max === 5) {
    const r = Math.max(0, Math.min(5, n));
    const label: ToneLabel = r <= 1 ? "bad" : r <= 3 ? "mid" : "good";
    return { label, ...TONES[label] };
  }

  const pct = max === 100 ? n : (n / max) * 100;
  const label: ToneLabel = pct >= 70 ? "good" : pct >= 40 ? "mid" : "bad";
  return { label, ...TONES[label] };
}

/** Format the score for a small badge. Returns "—" when value is missing. */
export function formatScore(value: unknown, max: number = 100): string {
  const n = value === null || value === undefined ? NaN : Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n)}/${max}`;
}
