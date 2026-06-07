/**
 * Публичный каталог всех активных вакансий со всех компаний.
 * Карточки ведут на действующие лендинги конкретных вакансий
 * (/com{company_slug}/vac{project_slug}/vacancy). Доступ без регистрации.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "../components/RouterContext";
import RRImage from "@/components/RRImage";
import { supabase } from "@/integrations/supabase/client";
import {
  Search, Wallet, Clock, Building2, Filter, X, ArrowRight,
  Sparkles, Zap, Users, CheckCircle2,
} from "lucide-react";

type Vac = {
  id: string;
  public_id: string | null;
  slug: string | null;
  role_name: string | null;
  salary_terms: string | null;
  schedule_terms: string | null;
  vacancy_text: string | null;
  logo_url: string | null;
  created_at: string;
  company_id: string | null;
  company_name: string;
  company_slug: string | null;
  company_logo: string | null;
  industry: string | null;
};

function summarize(text: string | null, max = 240): string {
  if (!text) return "";
  const clean = String(text).replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1).trimEnd() + "…" : clean;
}

function firstLine(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  const l = String(text).split("\n").map((s) => s.replace(/^[•\-\s*]+/, "").trim()).find((s) => s.length > 0);
  return l || undefined;
}

export default function VacancyCatalogPage() {
  const { navigate } = useRouter();
  const [loading, setLoading] = useState(true);
  const [vacs, setVacs] = useState<Vac[]>([]);

  const [q, setQ] = useState("");
  const [companyFilter, setCompanyFilter] = useState<string>("");
  const [industryFilter, setIndustryFilter] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);

  const PAGE_SIZE = 20;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Скролл наверх при заходе на страницу — иначе после перехода с лендинга
  // позиция остаётся внизу.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("projects")
        .select("id, public_id, slug, role_name, salary_terms, schedule_terms, vacancy_text, logo_url, created_at, company_id, companies(name, slug, logo_url, industry)")
        .eq("is_published", true)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(500);
      if (cancel) return;
      const rows = (data || []).map((r: any): Vac => ({
        id: r.id,
        public_id: r.public_id,
        slug: r.slug,
        role_name: r.role_name,
        salary_terms: r.salary_terms,
        schedule_terms: r.schedule_terms,
        vacancy_text: r.vacancy_text,
        logo_url: r.logo_url,
        created_at: r.created_at,
        company_id: r.company_id,
        company_name: r.companies?.name || "Без названия",
        company_slug: r.companies?.slug || null,
        company_logo: r.companies?.logo_url || null,
        industry: r.companies?.industry || null,
      }));
      setVacs(rows);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, []);

  const companies = useMemo(() => {
    const m = new Map<string, string>();
    vacs.forEach((v) => { if (v.company_name) m.set(v.company_name, v.company_name); });
    return Array.from(m.keys()).sort((a, b) => a.localeCompare(b, "ru"));
  }, [vacs]);

  const industries = useMemo(() => {
    const s = new Set<string>();
    vacs.forEach((v) => { if (v.industry) s.add(v.industry); });
    return Array.from(s).sort((a, b) => a.localeCompare(b, "ru"));
  }, [vacs]);

  const roles = useMemo(() => {
    const s = new Set<string>();
    vacs.forEach((v) => { if (v.role_name) s.add(v.role_name); });
    return Array.from(s).sort((a, b) => a.localeCompare(b, "ru"));
  }, [vacs]);

  const filtered = useMemo(() => {
    let list = vacs;
    if (companyFilter) list = list.filter((v) => v.company_name === companyFilter);
    if (industryFilter) list = list.filter((v) => v.industry === industryFilter);
    if (roleFilter) list = list.filter((v) => v.role_name === roleFilter);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter((v) =>
        (v.role_name || "").toLowerCase().includes(needle) ||
        (v.company_name || "").toLowerCase().includes(needle) ||
        (v.vacancy_text || "").toLowerCase().includes(needle) ||
        (v.salary_terms || "").toLowerCase().includes(needle) ||
        (v.schedule_terms || "").toLowerCase().includes(needle)
      );
    }
    return list;
  }, [vacs, q, companyFilter, industryFilter, roleFilter]);

  // Сброс пагинации при смене фильтров/поиска.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [q, companyFilter, industryFilter, roleFilter]);

  // Догрузка следующих 20 при подкручивании к низу списка.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          setVisibleCount((c) => Math.min(c + PAGE_SIZE, filtered.length));
        }
      }
    }, { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [filtered.length]);

  const visible = filtered.slice(0, visibleCount);

  const openVacancy = (v: Vac) => {
    if (v.company_slug && v.slug) {
      navigate(`/com${v.company_slug}/vac${v.slug}/vacancy`);
    } else {
      navigate(`/job?id=${encodeURIComponent(v.slug || v.id)}`);
    }
  };

  return (
    <div className="brand-editor min-h-screen bg-gradient-to-b from-[#17344F] to-[#265582] text-white font-sans">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#17344F]/95 backdrop-blur-md border-b border-white/10 px-4 md:px-8 py-4">
        <div className="flex items-center justify-between gap-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate("/")}>
            <RRImage src="https://rjhtauzookkvlipvqpvr.supabase.co/storage/v1/object/public/Logos/RR-Logo.png" w={40} alt="RR Logo" className="w-10 h-10 object-contain" referrerPolicy="no-referrer" />
            <div className="flex flex-col text-left leading-tight">
              <span className="text-lg font-bold">РобоРекрут</span>
              <span className="text-xs text-white/60">Каталог вакансий</span>
            </div>
          </div>
          <button
            onClick={() => navigate("/")}
            className="text-sm text-white/80 hover:text-white transition"
          >
            На главную
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-8 md:py-12">
        {/* Hero / search */}
        <section className="mb-8">
          <h1 className="text-3xl md:text-5xl font-bold mb-3 bg-gradient-to-r from-[#F5D67A] via-[#E8B84E] to-[#C9933A] bg-clip-text text-transparent">
            Каталог вакансий
          </h1>
          <p className="text-white/70 mb-6 max-w-2xl">
            Все активные вакансии всех компаний платформы. Откройте карточку, чтобы узнать подробности и подать заявку — регистрация не нужна.
          </p>

          <div className="rounded-2xl bg-white/[0.06] border border-white/10 backdrop-blur-xl p-3 md:p-4 shadow-2xl">
            <div className="flex flex-col md:flex-row gap-2 md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Профессия, ключевые слова, компания…"
                  className="w-full bg-white/10 border border-white/15 rounded-xl pl-10 pr-3 py-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#E8B84E]/60"
                />
              </div>
              <button
                onClick={() => setShowFilters((v) => !v)}
                className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white hover:bg-white/15 transition"
              >
                <Filter className="w-4 h-4" />
                Фильтры
              </button>
            </div>

            {showFilters && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3 pt-3 border-t border-white/10">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-white/60">Должность</span>
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="bg-white/10 border border-white/15 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[#E8B84E]/60"
                  >
                    <option value="" className="text-slate-800">Все должности</option>
                    {roles.map((c) => (<option key={c} value={c} className="text-slate-800">{c}</option>))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-white/60">Компания</span>
                  <select
                    value={companyFilter}
                    onChange={(e) => setCompanyFilter(e.target.value)}
                    className="bg-white/10 border border-white/15 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[#E8B84E]/60"
                  >
                    <option value="" className="text-slate-800">Все компании</option>
                    {companies.map((c) => (<option key={c} value={c} className="text-slate-800">{c}</option>))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-white/60">Отрасль</span>
                  <select
                    value={industryFilter}
                    onChange={(e) => setIndustryFilter(e.target.value)}
                    className="bg-white/10 border border-white/15 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[#E8B84E]/60"
                  >
                    <option value="" className="text-slate-800">Все отрасли</option>
                    {industries.map((c) => (<option key={c} value={c} className="text-slate-800">{c}</option>))}
                  </select>
                </label>
                {(companyFilter || industryFilter || roleFilter) && (
                  <button
                    onClick={() => { setCompanyFilter(""); setIndustryFilter(""); setRoleFilter(""); }}
                    className="md:col-span-3 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 transition text-sm"
                  >
                    <X className="w-4 h-4" /> Сбросить фильтры
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="mt-4 text-sm text-white/60">
            {loading ? "Загрузка вакансий…" : `Показано ${Math.min(visibleCount, filtered.length)} из ${filtered.length}`}
          </div>
        </section>

        {/* SEO / продающий блок */}
        <section className="mb-10 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white/[0.06] border border-white/10 p-5 backdrop-blur-xl">
            <div className="flex items-center gap-2 mb-2 text-[#F5D67A] font-semibold">
              <Sparkles className="w-4 h-4" /> Без HR и без ожидания
            </div>
            <p className="text-sm text-white/75 leading-relaxed">
              Откликайтесь на вакансию и проходите интервью с ИИ-рекрутёром прямо сейчас. Никаких очередей, переписок и «мы вам перезвоним».
            </p>
          </div>
          <div className="rounded-2xl bg-white/[0.06] border border-white/10 p-5 backdrop-blur-xl">
            <div className="flex items-center gap-2 mb-2 text-[#F5D67A] font-semibold">
              <Users className="w-4 h-4" /> Бесплатно для соискателей
            </div>
            <p className="text-sm text-white/75 leading-relaxed">
              Откройте любую вакансию без регистрации, изучите условия, задачи и обучение, и подайте заявку в один клик.
            </p>
          </div>
          <div className="rounded-2xl bg-white/[0.06] border border-white/10 p-5 backdrop-blur-xl">
            <div className="flex items-center gap-2 mb-2 text-[#F5D67A] font-semibold">
              <Zap className="w-4 h-4" /> Работодателю — пример вашей будущей вакансии
            </div>
            <p className="text-sm text-white/75 leading-relaxed">
              Смотрите, как может выглядеть страница вашей вакансии, интервью и обучение. Соберите свою за 5 минут вместе с РобоРекрутом — даже без готовых материалов.
            </p>
          </div>
        </section>

        {/* List */}
        {loading ? (
          <div className="grid gap-3">
            {[1,2,3,4].map((i) => (
              <div key={i} className="h-32 rounded-2xl bg-white/5 border border-white/10 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl bg-white/5 border border-white/10 p-8 text-center text-white/70">
            По вашему запросу ничего не найдено.{" "}
            <button onClick={() => { setQ(""); setCompanyFilter(""); setIndustryFilter(""); setRoleFilter(""); }} className="underline hover:text-white">
              Сбросить поиск
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            {visible.map((v) => {
              return (
                <article
                  key={v.id}
                  onClick={() => openVacancy(v)}
                  className="group cursor-pointer rounded-2xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 hover:border-[#E8B84E]/40 p-4 md:p-5 transition-all shadow-lg hover:shadow-[#E8B84E]/10"
                >
                  <div className="flex flex-col md:flex-row md:items-start gap-4">
                    <div className="flex-shrink-0">
                      {v.company_logo ? (
                        <RRImage src={v.company_logo} w={64} alt={v.company_name} className="w-14 h-14 md:w-16 md:h-16 rounded-xl object-contain bg-white/10 p-1" />
                      ) : (
                        <div className="w-14 h-14 md:w-16 md:h-16 rounded-xl bg-gradient-to-br from-[#E8B84E]/30 to-[#C9933A]/30 flex items-center justify-center">
                          <Building2 className="w-7 h-7 text-[#F5D67A]" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h2 className="text-lg md:text-xl font-semibold text-white group-hover:text-[#F5D67A] transition truncate">
                            {v.role_name || "Без названия"}
                          </h2>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-white/70">
                            <span className="inline-flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> {v.company_name}</span>
                            {v.industry && <span className="inline-flex items-center gap-1 text-white/50">• {v.industry}</span>}
                          </div>
                        </div>
                        <ArrowRight className="w-5 h-5 text-white/40 group-hover:text-[#E8B84E] group-hover:translate-x-1 transition" />
                      </div>

                      <div className="flex flex-wrap gap-2 mt-3">
                        {firstLine(v.salary_terms) && (
                          <span className="inline-flex items-center gap-1.5 text-xs md:text-sm px-2.5 py-1 rounded-lg bg-[#E8B84E]/15 text-[#F5D67A] border border-[#E8B84E]/20">
                            <Wallet className="w-3.5 h-3.5" /> {firstLine(v.salary_terms)}
                          </span>
                        )}
                        {firstLine(v.schedule_terms) && (
                          <span className="inline-flex items-center gap-1.5 text-xs md:text-sm px-2.5 py-1 rounded-lg bg-white/10 text-white/80 border border-white/15">
                            <Clock className="w-3.5 h-3.5" /> {firstLine(v.schedule_terms)}
                          </span>
                        )}
                      </div>

                      {v.vacancy_text && (
                        <p className="mt-3 text-sm text-white/70 line-clamp-2">
                          {summarize(v.vacancy_text, 220)}
                        </p>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
            <div ref={sentinelRef} className="h-10" />
            {visibleCount < filtered.length && (
              <div className="text-center text-white/50 text-sm py-4">Загружаем ещё…</div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}