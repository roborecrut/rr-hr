import React, { useEffect, useRef, useState } from "react";

type Direction = "up" | "down" | "left" | "right" | "scale" | "fade";

interface RevealProps {
  children: React.ReactNode;
  direction?: Direction;
  delay?: number;
  duration?: number;
  className?: string;
  as?: keyof React.JSX.IntrinsicElements;
  /** how much must be visible before triggering (0..1) */
  threshold?: number;
  /** when true (default), re-animates on each enter/exit, including reverse scroll */
  reAnimate?: boolean;
  style?: React.CSSProperties;
}

/**
 * Универсальная обёртка для анимации появления секций при скролле.
 * Работает в обе стороны (вверх/вниз) — снимает класс при уходе во вьюпорт
 * и возвращает при повторном появлении.
 */
export default function Reveal({
  children,
  direction = "up",
  delay = 0,
  duration = 700,
  className = "",
  as = "div",
  threshold = 0.12,
  reAnimate = true,
  style,
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // respect reduced-motion
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setVisible(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setVisible(true);
          else if (reAnimate) setVisible(false);
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, reAnimate]);

  const Tag = as as any;
  const cls = `reveal reveal-${direction} ${visible ? "is-visible" : ""} ${className}`.trim();

  return (
    <Tag
      ref={ref as any}
      className={cls}
      style={{
        transitionDuration: `${duration}ms`,
        transitionDelay: `${delay}ms`,
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}