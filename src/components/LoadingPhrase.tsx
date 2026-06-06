import { useEffect, useState } from "react";
import { LOADING_PHRASES, type LoadingEntity } from "@/lib/loadingPhrases";
import { cn } from "@/lib/utils";

// Animated rotating loading phrase. Use during AI calls so the user gets feedback.
export function LoadingPhrase({
  entity,
  intervalMs = 2000,
  className,
}: {
  entity: LoadingEntity;
  intervalMs?: number;
  className?: string;
}) {
  const arr = LOADING_PHRASES[entity] || LOADING_PHRASES.generic;
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % arr.length), intervalMs);
    return () => clearInterval(t);
  }, [arr.length, intervalMs]);
  return (
    <div className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}>
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
      <span key={idx} className="animate-fade-in">{arr[idx]}</span>
    </div>
  );
}