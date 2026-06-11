import React, { useEffect, useState } from "react";
import SectionCard from "./SectionCard";
import { useInView } from "@/hooks/useInView";
import {
  Info,
  Package,
  Sparkles,
  Building,
  Users,
  Wallet,
  CalendarClock,
  Cpu,
  BarChart3,
  Briefcase,
  // Globe icon no longer needed — website now rendered as banner in hero.
} from "lucide-react";
import type { JobProject } from "../types";
import SitePreview from "./SitePreview";
import VacancyCard from "./VacancyCard";

type Props = {
  company: any;
  vacancies: JobProject[];
  onOpenVacancy: (v: JobProject) => void;
  /** Path slug used to build vacancy links */
  companySlug: string;
  /** When inside /vac.../company, hint banner with switcher back */
  currentVacancy?: JobProject | null;
  onBackToVacancy?: () => void;
  /** Hide the in-page sticky tabs (when the parent renders them in the header). */
  hideStickyNav?: boolean;
};

function renderText(raw?: string | null) {
  if (!raw) return null;
  const lines = String(raw).split("\n");
  return (
    <div className="space-y-3 text-[13px] md:text-sm text-slate-200 leading-relaxed">
      {lines.map((line, ix) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={ix} className="h-2" />;
        if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
          return (
            <div key={ix} className="flex items-start gap-2 pl-1">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#E7C768] shrink-0" />
              <span>{trimmed.substring(1).trim()}</span>
            </div>
          );
        }
        if (/^\d+\./.test(trimmed)) {
          const dot = trimmed.indexOf(".");
          return (
            <div key={ix} className="flex items-start gap-2 pl-1">
              <span className="font-mono font-bold text-[#E7C768] shrink-0">
                {trimmed.substring(0, dot + 1)}
              </span>
              <span>{trimmed.substring(dot + 1).trim()}</span>
            </div>
          );
        }
        return (
          <p key={ix} className="whitespace-pre-line">
            {line}
          </p>
        );
      })}
    </div>
  );
}

/** Stat value can be a plain primitive or `{ value, label }` shape. */
function statValue(v: any): { value: string; label?: string } {
  if (v == null) return { value: "" };
  if (typeof v === "object") {
    return {
      value: String(v.value ?? v.amount ?? v.count ?? ""),
      label: v.label ?? v.title ?? undefined,
    };
  }
  return { value: String(v) };
}

const STAT_KEY_LABEL: Record<string, string> = {
  founded_year: "Год основания",
  employees: "Сотрудники",
  turnover: "Оборот",
  clients: "Клиенты",
  dialogs: "Диалогов",
  cities: "Города",
};

function StickyNav({ items }: { items: { id: string; label: string }[] }) {
  const [active, setActive] = useState<string>(items[0]?.id || "");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observers: IntersectionObserver[] = [];
    items.forEach((it) => {
      const el = document.getElementById(it.id);
      if (!el) return;
      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) setActive(it.id);
          }
        },
        { rootMargin: "-40% 0px -55% 0px", threshold: 0 },
      );
      io.observe(el);
      observers.push(io);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, [items.map((i) => i.id).join(",")]);

  return (
    <nav className="sticky top-[60px] z-20 -mx-4 md:-mx-0 px-4 md:px-0 py-2 mb-2 backdrop-blur-md">
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {items.map((it) => (
          <a
            key={it.id}
            href={`#${it.id}`}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(it.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className={[
              "whitespace-nowrap px-3 py-1.5 rounded-full text-[11px] font-bold border transition",
              active === it.id
                ? "bg-[#E7C768] text-[#112335] border-[#E7C768] shadow"
                : "bg-black/30 text-slate-300 border-white/10 hover:text-white hover:border-white/30",
            ].join(" ")}
          >
            {it.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

export default function CompanySections({
  company,
  vacancies,
  onOpenVacancy,
  companySlug,
  currentVacancy,
  onBackToVacancy,
  hideStickyNav,
}: Props) {
  if (!company) return null;

  const ORDER: { key: string; label: string; icon: React.ReactNode }[] = [
    { key: "description_text", label: "О компании", icon: <Info className="w-5 h-5" /> },
    { key: "products_text", label: "Продукты", icon: <Package className="w-5 h-5" /> },
    { key: "mission_text", label: "Миссия", icon: <Sparkles className="w-5 h-5" /> },
    { key: "about_text", label: "О нас", icon: <Building className="w-5 h-5" /> },
    { key: "team_text", label: "Команда", icon: <Users className="w-5 h-5" /> },
    { key: "payouts_text", label: "Выплаты", icon: <Wallet className="w-5 h-5" /> },
    { key: "schedule_text", label: "График", icon: <CalendarClock className="w-5 h-5" /> },
    { key: "system_text", label: "ИИ-Система", icon: <Cpu className="w-5 h-5" /> },
  ];

  const filled = ORDER.filter(
    (s) => company[s.key] && String(company[s.key]).trim() !== "",
  );

  const stats =
    company.stats && typeof company.stats === "object" ? company.stats : null;
  const statEntries = stats
    ? Object.entries(stats).filter(([k]) => k !== "labels")
    : [];

  // Build sticky-nav items
  const navItems: { id: string; label: string }[] = [
    ...filled.map((s) => ({ id: `sec-${s.key}`, label: s.label })),
    ...(statEntries.length ? [{ id: "sec-stats", label: "Показатели" }] : []),
    ...(vacancies.length ? [{ id: "sec-vacancies", label: "Вакансии" }] : []),
  ];

  // Hero with company logo + name
  const heroRef = useInView<HTMLDivElement>();

  const heroMeta: string[] = [];
  if (company.industry) heroMeta.push(String(company.industry));
  if (company.staff)    heroMeta.push(`${company.staff}`);

  return (
    <div className="space-y-5 md:space-y-7">
      {/* HERO */}
      <div
        ref={heroRef.ref}
        className={[
          "relative overflow-hidden rounded-3xl p-6 md:p-10",
          "bg-gradient-to-br from-[#1D3E5E]/85 via-[#17344F]/85 to-[#0E2235]/85 backdrop-blur-xl",
          "border border-white/10 ring-1 ring-inset ring-[#E7C768]/15",
          "shadow-[0_30px_80px_-40px_rgba(0,0,0,0.7)]",
          "transition-all duration-700",
          heroRef.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
        ].join(" ")}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -right-32 w-96 h-96 rounded-full bg-[#E7C768]/15 blur-3xl"
        />
        {company.website && (
          <div className="relative mb-5">
            <SitePreview url={company.website} variant="banner" />
          </div>
        )}
        <div className="relative flex flex-col md:flex-row items-start md:items-center gap-5">
          {company.logo_url ? (
            <img
              src={company.logo_url}
              alt={company.name || "logo"}
              referrerPolicy="no-referrer"
              className="w-20 h-20 md:w-24 md:h-24 rounded-2xl object-contain p-2 bg-white/10 border border-white/15 shrink-0"
            />
          ) : (
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl flex items-center justify-center bg-gradient-to-br from-[#E7C768] to-[#D99E41] text-[#112335] text-3xl font-black shrink-0">
              {(company.name || "C")[0]}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <span className="inline-block text-[10px] font-bold tracking-[0.2em] uppercase text-[#E7C768] bg-[#E7C768]/10 border border-[#E7C768]/30 px-2 py-0.5 rounded-full mb-2">
              Верифицированный бренд
            </span>
            <h1 className="text-2xl md:text-4xl font-black text-white leading-tight">
              {company.name || "Без названия"}
            </h1>
            {heroMeta.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {heroMeta.map((m, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 text-[11px] font-semibold text-slate-200 px-2.5 py-1 rounded-full"
                  >
                    {m}
                  </span>
                ))}
              </div>
            )}
            {/* Описание компании показывается ниже — в блоке «О компании», */}
            {/* чтобы не дублировать его в hero-секции (#2). */}
            <div className="mt-4 flex flex-wrap gap-2">
              {vacancies.length > 0 && (
                <a
                  href="#sec-vacancies"
                  onClick={(e) => {
                    e.preventDefault();
                    document
                      .getElementById("sec-vacancies")
                      ?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="bg-[#E7C768] text-[#112335] text-xs font-black px-4 py-2 rounded-xl hover:bg-[#F4EE8E] transition shadow"
                >
                  Смотреть вакансии ({vacancies.length})
                </a>
              )}
              {currentVacancy && onBackToVacancy && (
                <button
                  onClick={onBackToVacancy}
                  className="bg-white/10 hover:bg-white/15 text-white text-xs font-bold px-4 py-2 rounded-xl border border-white/15 transition flex items-center gap-1.5"
                >
                  ← Назад к вакансии «{currentVacancy.roleName}»
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sticky in-page nav */}
      {!hideStickyNav && navItems.length > 1 && <StickyNav items={navItems} />}

      {/* Two-column section layout on desktop; one column on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 md:gap-6">
        {filled.map((s, i) => (
          <SectionCard
            key={s.key}
            id={`sec-${s.key}`}
            icon={s.icon}
            title={s.label}
            delay={i * 60}
            className={
              // Promote the very first section to full-width for visual rhythm
              i === 0 ? "lg:col-span-2" : ""
            }
          >
            {renderText(company[s.key])}
          </SectionCard>
        ))}
      </div>

      {/* Stats */}
      {statEntries.length > 0 && (
        <SectionCard
          id="sec-stats"
          icon={<BarChart3 className="w-5 h-5" />}
          title="Показатели"
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {statEntries.map(([k, v]) => {
              const { value, label } = statValue(v);
              if (!value) return null;
              const lbl =
                label ||
                (stats as any)?.labels?.[k] ||
                STAT_KEY_LABEL[k] ||
                k;
              return (
                <div
                  key={k}
                  className="rounded-2xl bg-black/30 border border-white/10 p-4 hover:border-[#E7C768]/40 transition hover-scale"
                >
                  <div className="text-2xl md:text-3xl font-black text-white">
                    {value}
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-wider font-bold text-slate-400">
                    {lbl}
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* Vacancies */}
      {vacancies.length > 0 && (
        <SectionCard
          id="sec-vacancies"
          icon={<Briefcase className="w-5 h-5" />}
          eyebrow="Открытые позиции"
          title={`Вакансии · ${vacancies.length}`}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {vacancies.map((v) => (
              <VacancyCard
                key={v.id}
                vacancy={{
                  id: v.id,
                  roleName: v.roleName,
                  companyName: company?.name || null,
                  companyLogo: company?.logo_url || (v as any).logoUrl || null,
                  industry: company?.industry || null,
                  salaryTerms: v.salaryTerms || null,
                  scheduleTerms: v.scheduleTerms || null,
                  vacancyText: (v as any).vacancyText || null,
                }}
                active={currentVacancy?.id === v.id}
                showCompany={false}
                onOpen={() => onOpenVacancy(v)}
              />
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}