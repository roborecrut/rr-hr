import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildPhraseQueue,
  resolveContext,
  type LoadingEntity,
  type MascotContext,
} from "@/lib/loadingPhrases";
import { cn } from "@/lib/utils";

// Animated rotating loading phrase. Uses one shuffled queue per mount: no
// consecutive repeats, no re-pick on every render.
export function LoadingPhrase({
  entity,
  intervalMs,
  className,
}: {
  entity: LoadingEntity;
  /** Legacy prop — игнорируется: длительность теперь зависит от длины фразы. */
  intervalMs?: number;
  className?: string;
}) {
  const ctx: MascotContext = useMemo(() => {
    if (entity === "company" || entity === "vacancy") return "field_improve";
    if (entity === "training") return "gen_material";
    if (entity === "interview") return "checklist_grade";
    return resolveContext(String(entity));
  }, [entity]);
  const queueRef = useRef<string[]>(buildPhraseQueue(ctx));
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    queueRef.current = buildPhraseQueue(ctx);
    setIdx(0);
  }, [ctx]);

  useEffect(() => {
    const phrase = queueRef.current[idx % queueRef.current.length] || "";
    // 80–100 симв/сек + пауза 1400 мс после полного появления
    const typeMs = Math.ceil((phrase.length * 1000) / 90);
    const total = typeMs + 1400;
    const t = setTimeout(() => {
      setIdx((i) => {
        const n = i + 1;
        if (n >= queueRef.current.length) {
          queueRef.current = buildPhraseQueue(ctx);
          return 0;
        }
        return n;
      });
    }, total);
    return () => clearTimeout(t);
  }, [idx, ctx]);

  const phrase = queueRef.current[idx % queueRef.current.length] || "";
  return (
    <div className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}>
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
      <span key={idx} className="animate-fade-in">{phrase}</span>
    </div>
  );
}