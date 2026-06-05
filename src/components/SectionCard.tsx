import React from "react";
import { useInView } from "@/hooks/useInView";

type Props = {
  id?: string;
  icon?: React.ReactNode;
  eyebrow?: string;
  title: string;
  children: React.ReactNode;
  className?: string;
  delay?: number; // ms
};

/**
 * Glassy section card with gold gradient title, soft inner glow,
 * and on-scroll reveal animation. All colors/animations come from
 * the existing Tailwind tokens (#1D3E5E / #E7C768 brand palette).
 */
export default function SectionCard({
  id,
  icon,
  eyebrow,
  title,
  children,
  className = "",
  delay = 0,
}: Props) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <section
      id={id}
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={[
        "relative overflow-hidden rounded-3xl",
        "bg-[#1D3E5E]/70 backdrop-blur-xl",
        "border border-white/10 ring-1 ring-inset ring-[#E7C768]/10",
        "shadow-[0_20px_60px_-30px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.05)]",
        "p-5 md:p-8 transition-all duration-700 ease-out",
        inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6",
        className,
      ].join(" ")}
    >
      {/* Decorative gold sheen */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-24 w-64 h-64 rounded-full bg-[#E7C768]/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-16 w-72 h-72 rounded-full bg-[#265582]/40 blur-3xl"
      />

      <header className="relative flex items-center gap-3 mb-4 md:mb-5">
        {icon && (
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-2xl flex items-center justify-center bg-gradient-to-br from-[#E7C768]/25 to-[#D99E41]/10 border border-[#E7C768]/30 text-[#E7C768] shrink-0">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <span className="block text-[10px] font-bold tracking-[0.2em] uppercase text-[#E7C768]/70">
              {eyebrow}
            </span>
          )}
          <h2 className="text-lg md:text-2xl font-black leading-tight bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
            {title}
          </h2>
        </div>
      </header>

      <div className="relative">{children}</div>
    </section>
  );
}