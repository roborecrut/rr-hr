import React from "react";
import { ArrowRight, Building2, Wallet, Clock } from "lucide-react";
import RRImage from "@/components/RRImage";

export type VacancyCardData = {
  id: string;
  roleName?: string | null;
  companyName?: string | null;
  companyLogo?: string | null;
  industry?: string | null;
  salaryTerms?: string | null;
  scheduleTerms?: string | null;
  vacancyText?: string | null;
};

function firstLine(text?: string | null): string | undefined {
  if (!text) return undefined;
  const l = String(text)
    .split("\n")
    .map((s) => s.replace(/^[•\-\s*]+/, "").trim())
    .find((s) => s.length > 0);
  return l || undefined;
}

function summarize(text?: string | null, max = 220): string {
  if (!text) return "";
  const clean = String(text).replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1).trimEnd() + "…" : clean;
}

interface Props {
  vacancy: VacancyCardData;
  onOpen: (v: VacancyCardData) => void;
  active?: boolean;
  showCompany?: boolean;
  className?: string;
  /**
   * Card layout direction. `vertical` (default) keeps the existing tall card.
   * `horizontal` renders a wide row: logo left, title/description center,
   * meta tags + arrow right. Falls back to `vertical` on small screens.
   */
  layout?: "vertical" | "horizontal";
}

/**
 * Универсальная карточка вакансии. Используется в каталоге `/vacancy`,
 * на лендинге компании и в списке вакансий на странице вакансии.
 * Содержит логотип, должность, компанию, теги зарплаты/графика и
 * краткое описание из `vacancyText` (fallback — salary+schedule).
 */
export const VacancyCard: React.FC<Props> = ({ vacancy: v, onOpen, active, showCompany = true, className = "", layout = "vertical" }) => {
  const salary = firstLine(v.salaryTerms);
  const schedule = firstLine(v.scheduleTerms);
  const desc =
    summarize(v.vacancyText, 220) ||
    [v.salaryTerms, v.scheduleTerms].filter(Boolean).join(" · ");

  if (layout === "horizontal") {
    return (
      <article
        onClick={() => onOpen(v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen(v);
          }
        }}
        className={[
          "group cursor-pointer w-full rounded-2xl border p-4 md:p-5 transition-all shadow-lg box-border",
          "flex flex-col md:flex-row md:items-center gap-4 md:gap-5",
          "min-h-[150px] md:min-h-[170px]",
          active
            ? "bg-[#E7C768]/15 border-[#E7C768]/70 ring-1 ring-[#E7C768]/40"
            : "bg-white/[0.06] hover:bg-white/[0.1] border-white/10 hover:border-[#E8B84E]/40 hover:shadow-[#E8B84E]/10",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E8B84E]/60",
          className,
        ].join(" ")}
      >
        <div className="flex-shrink-0 self-start md:self-center">
          {v.companyLogo ? (
            <RRImage
              src={v.companyLogo}
              w={80}
              alt={v.companyName || ""}
              className="w-16 h-16 md:w-20 md:h-20 rounded-xl object-contain bg-white/10 p-1.5"
              fallback={
                <div className="w-16 h-16 md:w-20 md:h-20 rounded-xl bg-gradient-to-br from-[#E8B84E]/30 to-[#C9933A]/30 flex items-center justify-center">
                  <Building2 className="w-8 h-8 text-[#F5D67A]" />
                </div>
              }
            />
          ) : (
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-xl bg-gradient-to-br from-[#E8B84E]/30 to-[#C9933A]/30 flex items-center justify-center">
              <Building2 className="w-8 h-8 text-[#F5D67A]" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <h3 className="text-base md:text-lg font-semibold text-white group-hover:text-[#F5D67A] transition leading-snug line-clamp-2 break-words">
            {v.roleName || "Без названия"}
          </h3>
          {showCompany && v.companyName && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/70">
              <span className="inline-flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> {v.companyName}</span>
              {v.industry && <span className="text-white/50">• {v.industry}</span>}
            </div>
          )}
          {desc && (
            <p className="text-sm text-white/70 line-clamp-2 break-words">{desc}</p>
          )}
        </div>
        <div className="flex md:flex-col items-center md:items-end gap-2 md:gap-2 md:min-w-[180px] md:max-w-[260px] flex-wrap">
          {salary && (
            <span className="inline-flex items-center gap-1.5 text-xs md:text-sm px-2.5 py-1 rounded-lg bg-[#E8B84E]/15 text-[#F5D67A] border border-[#E8B84E]/20 break-words max-w-full">
              <Wallet className="w-3.5 h-3.5" /> {salary}
            </span>
          )}
          {schedule && (
            <span className="inline-flex items-center gap-1.5 text-xs md:text-sm px-2.5 py-1 rounded-lg bg-white/10 text-white/80 border border-white/15 break-words max-w-full">
              <Clock className="w-3.5 h-3.5" /> {schedule}
            </span>
          )}
          <ArrowRight className="hidden md:block w-5 h-5 text-white/40 group-hover:text-[#E8B84E] group-hover:translate-x-1 transition shrink-0 mt-1" />
        </div>
      </article>
    );
  }

  return (
    <article
      onClick={() => onOpen(v)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(v);
        }
      }}
      className={[
        "group cursor-pointer rounded-2xl border p-4 md:p-5 transition-all shadow-lg box-border flex flex-col h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E8B84E]/60",
        active
          ? "bg-[#E7C768]/15 border-[#E7C768]/70 ring-1 ring-[#E7C768]/40"
          : "bg-white/[0.06] hover:bg-white/[0.1] border-white/10 hover:border-[#E8B84E]/40 hover:shadow-[#E8B84E]/10",
        className,
      ].join(" ")}
    >
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <div className="flex-shrink-0">
          {v.companyLogo ? (
            <RRImage
              src={v.companyLogo}
              w={56}
              alt={v.companyName || ""}
              className="w-12 h-12 md:w-14 md:h-14 rounded-xl object-contain bg-white/10 p-1"
              fallback={
                <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-gradient-to-br from-[#E8B84E]/30 to-[#C9933A]/30 flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-[#F5D67A]" />
                </div>
              }
            />
          ) : (
            <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-gradient-to-br from-[#E8B84E]/30 to-[#C9933A]/30 flex items-center justify-center">
              <Building2 className="w-6 h-6 text-[#F5D67A]" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base md:text-lg font-semibold text-white group-hover:text-[#F5D67A] transition leading-snug line-clamp-2 break-words">
              {v.roleName || "Без названия"}
            </h3>
            <ArrowRight className="w-5 h-5 text-white/40 group-hover:text-[#E8B84E] group-hover:translate-x-1 transition shrink-0 mt-1" />
          </div>
          {showCompany && v.companyName && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-white/70">
              <span className="inline-flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> {v.companyName}</span>
              {v.industry && <span className="text-white/50">• {v.industry}</span>}
            </div>
          )}
          {desc && (
            <p className="mt-3 text-sm text-white/70 line-clamp-3 break-words flex-1">
              {desc}
            </p>
          )}
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/5">
            {salary && (
              <span className="inline-flex items-center gap-1.5 text-xs md:text-sm px-2.5 py-1 rounded-lg bg-[#E8B84E]/15 text-[#F5D67A] border border-[#E8B84E]/20 break-words max-w-full">
                <Wallet className="w-3.5 h-3.5" /> {salary}
              </span>
            )}
            {schedule && (
              <span className="inline-flex items-center gap-1.5 text-xs md:text-sm px-2.5 py-1 rounded-lg bg-white/10 text-white/80 border border-white/15 break-words max-w-full">
                <Clock className="w-3.5 h-3.5" /> {schedule}
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
};

export default VacancyCard;