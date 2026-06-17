/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import RRImage from "@/components/RRImage";
import { useRouter } from "../components/RouterContext";
import Mascot from "../components/Mascot";
import Markdown from "react-markdown";
import { JobProject, Message } from "../types";
import { supabase } from "@/integrations/supabase/client";
import { buildCandidateUrl } from "@/lib/links";
import CandidateAuthModal from "../components/CandidateAuthModal";
import CompanySections from "../components/CompanySections";
import SitePreview from "../components/SitePreview";
import VacancyAIAssistant from "@/components/VacancyAIAssistant";
import VacancyCard from "@/components/VacancyCard";
import Reveal from "@/components/Reveal";
import { useSeo, SITE_URL } from "@/lib/seo";

/** Map a Supabase `projects` row + parent company into the UI's JobProject shape. */
function mapDbProjectToUi(company: any) {
  return (p: any): JobProject => {
    // Auto-derive short summary lines from detailed text fields when the
    // employer filled in only the long-form description. This keeps the
    // landing's header pills and vacancy cards populated even if the
    // employer never typed a separate "salary_terms"/"schedule_terms".
    const firstNonEmptyLine = (s?: string | null) => {
      if (!s) return undefined;
      const line = String(s)
        .split("\n")
        .map((l) => l.replace(/^[•\s\-*]+/, "").trim())
        .find((l) => l.length > 0);
      return line || undefined;
    };
    const salaryFallback =
      p.salary_terms || firstNonEmptyLine(p.payouts_text) || undefined;
    const scheduleFallback =
      p.schedule_terms || firstNonEmptyLine(p.schedule_text) || undefined;
    return ({
    id: p.id,
    companyName: company?.name || "",
    companySlug: company?.slug || undefined,
    employerId: p.employer_id,
    roleName: p.role_name,
    salaryTerms: salaryFallback,
    scheduleTerms: scheduleFallback,
    motivationText: p.motivation_text || undefined,
    customWiki: p.custom_wiki || undefined,
    checklistQuestions: [],
    roleplayQuestions: [],
    vacancyText: p.vacancy_text || undefined,
    tasksActivityText: p.tasks_activity_text || undefined,
    motivationTextDetail: p.motivation_text_detail || undefined,
    companyText: p.company_text || undefined,
    onboardingText: p.onboarding_text || undefined,
    payoutsText: p.payouts_text || undefined,
    scheduleText: p.schedule_text || undefined,
    teamText: p.team_text || undefined,
    systemText: p.system_text || undefined,
    logoUrl: p.logo_url || company?.logo_url || undefined,
    missionText: p.mission_text || undefined,
    // expose slug so URL builders can use it
    ...({ slug: p.slug } as any),
  });
  };
}
import {
  Briefcase,
  DollarSign,
  Clock,
  BookOpen,
  MessageSquare,
  ArrowRight,
  Send,
  Loader,
  X,
  User,
  Mail,
  HelpCircle,
  Menu,
  ChevronRight,
  Globe,
  Users,
  Building,
  CheckCircle,
  AlertCircle,
  Sparkles
} from "lucide-react";
import {
  VacancyView,
  MotivationView,
  CompanyView,
  OnboardingView,
  PayoutsView,
  ScheduleView,
  TeamView,
  SystemView
} from "../components/VacancySections";

export default function CompanyLanding() {
  const { path, navigate, query } = useRouter();
  
  // Parse companySlug and vacancyId from path segments. Empty when route is "/".
  // New URLs: /com{publicId}/vac{publicId}/...  Legacy: /{slug}/{slug}/...
  const segments = path.split("/").filter(Boolean);
  const rawCompany = segments[0] || "";
  const rawVacancy = segments[1] || "";
  const companySlug = rawCompany.replace(/^com/i, "");
  const vacancyId = rawVacancy.replace(/^vac/i, "");
  const subTab = segments[2] || "company";

  // States
  const [company, setCompany] = useState<any>(null);
  const [vacancies, setVacancies] = useState<JobProject[]>([]);
  const [selectedVacancy, setSelectedVacancy] = useState<JobProject | null>(null);
  const [selectedRaw, setSelectedRaw] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  const _pageTitle = selectedVacancy?.roleName
    ? `${selectedVacancy.roleName} — ${company?.name || "Вакансия"} | Робот Рекрутер`
    : company?.name
      ? `${company.name} — карьера и вакансии | Робот Рекрутер`
      : "Компания — Робот Рекрутер";
  const _pageDesc = selectedVacancy?.vacancyText
    ? String(selectedVacancy.vacancyText).replace(/\s+/g, " ").trim().slice(0, 155)
    : company?.description_text
      ? String(company.description_text).replace(/\s+/g, " ").trim().slice(0, 155)
      : `${company?.name || "Компания"}: открытые вакансии, условия и информация о работодателе на платформе Робот Рекрутер.`;
  useSeo({
    title: _pageTitle,
    description: _pageDesc,
    canonical: `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`,
    ogUrl: `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`,
    ogType: selectedVacancy ? "article" : "website",
  });

  // Company-level fallbacks let the landing render meaningful sections
  // even when no vacancy is published yet (or fields are blank on a vacancy).
  const companyAbout = [company?.description_text, company?.products_text, company?.about_text]
    .filter((v) => v && String(v).trim() !== "")
    .join("\n\n");
  const allTabs = [
    { key: "company",     label: "🏢 Компания",   textVal: selectedVacancy?.companyText || companyAbout },
    { key: "vacancy",     label: "💼 Вакансия",   textVal: selectedVacancy?.vacancyText },
    { key: "schedule",    label: "📅 График",     textVal: selectedVacancy?.scheduleText || selectedVacancy?.scheduleTerms || company?.schedule_text },
    { key: "motivation",  label: "🔥 Мотивация",  textVal: selectedVacancy?.motivationTextDetail || selectedVacancy?.motivationText || company?.mission_text },
    { key: "payouts",     label: "💵 Выплаты",    textVal: selectedVacancy?.payoutsText || company?.payouts_text },
    { key: "onboarding",  label: "🚀 Оформление", textVal: selectedVacancy?.onboardingText },
    { key: "team",        label: "👥 Команда",    textVal: selectedVacancy?.teamText || company?.team_text },
    { key: "system",      label: "⚙️ ИИ-Система", textVal: selectedVacancy?.systemText || company?.system_text },
  ];

  const visibleTabs = allTabs.filter(t => t.textVal && t.textVal.trim() !== "");

  // Tabs for the company landing view (when no vacancy is open).
  // Mirrors the section order used inside <CompanySections />.
  const companyNavItems = React.useMemo(() => {
    if (!company) return [] as { id: string; label: string }[];
    const order = [
      { key: "description_text", label: "О компании" },
      { key: "products_text",    label: "Продукты" },
      { key: "mission_text",     label: "Миссия" },
      { key: "about_text",       label: "О нас" },
      { key: "team_text",        label: "Команда" },
      { key: "payouts_text",     label: "Выплаты" },
      { key: "schedule_text",    label: "График" },
      { key: "system_text",      label: "ИИ-Система" },
    ];
    const items = order
      .filter((o) => company[o.key] && String(company[o.key]).trim() !== "")
      .map((o) => ({ id: `sec-${o.key}`, label: o.label }));
    const stats = company.stats && typeof company.stats === "object" ? company.stats : null;
    const statEntries = stats ? Object.entries(stats).filter(([k]) => k !== "labels") : [];
    if (statEntries.length) items.push({ id: "sec-stats", label: "Показатели" });
    if (vacancies.length)   items.push({ id: "sec-vacancies", label: "Вакансии" });
    return items;
  }, [company, vacancies.length]);

  const showCompanyTabs = (!vacancyId || subTab === "company") && companyNavItems.length > 1;
  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    if (selectedVacancy && visibleTabs.length > 0) {
      const isCurrentTabVisible = visibleTabs.some(t => t.key === subTab);
      if (!isCurrentTabVisible) {
        navigate(`/com${companySlug}/vac${(selectedVacancy as any).slug || selectedVacancy.id}/${visibleTabs[0].key}`);
      }
    }
  }, [subTab, selectedVacancy?.id, visibleTabs.length, companySlug]);

  // Consultant chatbot conversation state
  const [messages, setMessages] = useState<Message[]>([]);
  const [userQuestion, setUserQuestion] = useState("");
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Candidate signup modal
  const [showApplyModal, setShowApplyModal] = useState(false);

  // Fetch company & projects from server
  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Fetch company by slug (or first published if no slug)
      let compQuery = supabase.from("companies").select("*").eq("is_published", true).limit(1);
      if (companySlug) compQuery = supabase.from("companies").select("*").eq("slug", companySlug).limit(1);
      const { data: compRows } = await compQuery;
      const activeCompany = (compRows && compRows[0]) || null;
      if (activeCompany) {
        setCompany({ ...activeCompany, slug: activeCompany.slug });
      }

      // 2. Fetch projects (vacancies) for this company
      if (activeCompany?.id) {
        const { data: projRows } = await supabase
          .from("projects")
          .select("*")
          .eq("company_id", activeCompany.id)
          .eq("is_published", true)
          .neq("status", "deleted");
        const mapped: JobProject[] = (projRows || []).map(mapDbProjectToUi(activeCompany));
        // Hide archived from the public list of "active" vacancies.
        const publicList = mapped.filter((_, i) => (projRows![i] as any).status !== "archived");
        setVacancies(publicList);

        // Only pick an "active" vacancy when the URL points to one — otherwise
        // the company-only view should not show vacancy-specific UI (tabs etc).
        if (vacancyId) {
          // Always load the exact vacancy from URL regardless of publish/status,
          // so we can render a clear "inactive" notice instead of silently
          // falling back to a different vacancy.
          const { data: exactRows } = await supabase
            .from("projects")
            .select("*")
            .eq("company_id", activeCompany.id)
            .or(`public_id.eq.${vacancyId},slug.eq.${vacancyId}`)
            .limit(1);
          const exact = (exactRows && exactRows[0]) || null;
          setSelectedRaw(exact);
          setSelectedVacancy(exact ? mapDbProjectToUi(activeCompany)(exact) : null);
        } else {
          setSelectedVacancy(null);
          setSelectedRaw(null);
        }
      } else {
        setVacancies([]);
        setSelectedVacancy(null);
        setSelectedRaw(null);
      }
    } catch (err) {
      console.error("Error loading company landing details:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [path, companySlug, vacancyId]);

  // Initiate chatbot message when active vacancy loads
  useEffect(() => {
    if (selectedVacancy) {
      setMessages([
        {
          sender: "recruiter",
          text: `Привет! Я — твой интерактивный карьерный ИИ-консультант в компании "${company?.name || selectedVacancy.companyName}". 🤖 Я досконально знаю всё о вакансии "${selectedVacancy.roleName}". Оплата составляет: ${selectedVacancy.salaryTerms || "договорная"}. Спроси меня о графике, задачах или возможностях роста, и я тотчас отвечу! После беседы жми "Пройти собеседование", чтобы начать интерактивный блиц-тест.`,
          timestamp: new Date().toLocaleTimeString()
        }
      ]);
    }
  }, [selectedVacancy, company]);

  // Scroll chatbot down
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (customText?: string) => {
    const questionText = customText || userQuestion;
    if (!questionText.trim() || !selectedVacancy) return;

    // Add user message
    const userMsg: Message = {
      sender: "candidate",
      text: questionText,
      timestamp: new Date().toLocaleTimeString()
    };

    setMessages(prev => [...prev, userMsg]);
    if (!customText) setUserQuestion("");
    setIsAiTyping(true);

    try {
      const { aiChat } = await import("@/lib/aiClient");
      const history = messages.map(m => ({
        role: (m.sender === "candidate" ? "user" : "assistant") as "user" | "assistant",
        content: m.text,
      }));
      const context = `Вакансия: ${selectedVacancy.roleName}; Компания: ${selectedVacancy.companyName}; Условия: ${selectedVacancy.salaryTerms || ""} / ${selectedVacancy.scheduleTerms || ""}; База: ${selectedVacancy.customWiki || ""}`;
      const reply = await aiChat({
        kind: "vacancy_consultant",
        project_id: selectedVacancy.id,
        context,
        messages: [...history, { role: "user", content: questionText }],
      });
      const aiMsg: Message = {
        sender: "recruiter",
        text: reply || "Извините, ИИ-консультант временно недоступен.",
        timestamp: new Date().toLocaleTimeString()
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (err) {
      console.error("Failed to fetch response:", err);
    } finally {
      setIsAiTyping(false);
    }
  };

  // Candidate auth success → navigate to candidate profile bound to this vacancy.
  const handleCandidateAuthSuccess = (
    publicId: string,
    info?: { candidatePub?: string; projectPub?: string; companyPub?: string },
  ) => {
    const activeProject = selectedVacancy || vacancies[0];
    setShowApplyModal(false);
    if (!activeProject) return;
    // Prefer canonical public IDs returned by the auth RPC. They build a
    // stable URL of the form `/com{X}/vac{Y}/cand{Z}/profile` that survives
    // page reloads — UUID-only fallbacks are NOT recognised by the dispatcher.
    const companyPub = info?.companyPub
      || (activeProject as any).companySlug
      || companySlug
      || (activeProject as any).company_public_id
      || null;
    const projectPub = info?.projectPub
      || (activeProject as any).slug
      || (activeProject as any).public_id
      || null;
    const candPub = info?.candidatePub || publicId;
    if (!companyPub || !projectPub || !candPub) {
      navigate(`/cand${candPub}/profile`);
      return;
    }
    navigate(`/com${companyPub}/vac${projectPub}/cand${candPub}/profile`);
  };

  const handleApplyOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
  };

  // Format dynamic raw content helper
  const renderFormattedText = (rawText: string) => {
    if (!rawText) return null;
    const lines = rawText.split("\n");
    return (
      <div className="space-y-3.5 text-xs text-slate-200 leading-relaxed text-left font-sans">
        {lines.map((line, ix) => {
          const trimmed = line.trim();
          if (!trimmed) return <div key={ix} className="h-2.5" />;
          
          if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
            const content = trimmed.substring(1).trim();
            return (
              <div key={ix} className="flex items-start gap-2 pl-2">
                <span className="text-[#E7C768] font-bold select-none">•</span>
                <span>{content}</span>
              </div>
            );
          }
          
          if (/^\d+\./.test(trimmed)) {
            const firstDot = trimmed.indexOf(".");
            const num = trimmed.substring(0, firstDot + 1);
            const content = trimmed.substring(firstDot + 1).trim();
            return (
              <div key={ix} className="flex items-start gap-2 pl-2">
                <span className="text-[#E7C768] font-bold font-mono select-none">{num}</span>
                <span>{content}</span>
              </div>
            );
          }
          
          return <p key={ix} className="whitespace-pre-line">{line}</p>;
        })}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="bg-[#17344F] min-h-screen text-white flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-2">
          <Loader className="w-8 h-8 animate-spin text-[#E7C768]" />
          <span>Загрузка фирменного лендинга компании...</span>
        </div>
      </div>
    );
  }

  // Fallback default company if not loaded
  const displayCompany = company || {
    name: 'ООО "Рога и Копыта"',
    industry: "Торговля и дистрибьюция",
    staff: "15-50 человек",
    description: "Ведущее предприятие в сфере поставок сырья и заготовок.",
    sites: "https://hr-rr.online",
    logoUrl: ""
  };

  return (
    <div className="bg-gradient-to-b from-[#17344F] to-[#1E4468] min-h-screen text-white font-sans antialiased flex flex-col justify-between">
      <h1 className="sr-only">
        {selectedVacancy?.roleName
          ? `${selectedVacancy.roleName} — ${displayCompany.name}`
          : displayCompany.name}
      </h1>

      {/* Dynamic Header */}
      <header className="sticky top-0 z-40 bg-[#17344F]/95 backdrop-blur-md border-b border-[#265582]/40 py-2">
        <div className="max-w-7xl mx-auto w-full px-4 md:px-8">
          <div className="flex items-center justify-between gap-4 py-2">
            {/* Logo field */}
            <div
              className="flex items-center gap-3 cursor-pointer shrink-0"
              onClick={() => navigate(companySlug ? `/com${companySlug}` : "/")}
              title="На страницу компании"
            >
              <RRImage
                src={company?.logo_url || selectedVacancy?.logoUrl || "https://rjhtauzookkvlipvqpvr.supabase.co/storage/v1/object/public/Logos/RR-Logo.png"}
                w={40}
                alt={company?.name || "Logo"}
                className="w-10 h-10 object-contain rounded-xl border border-white/10 p-0.5 bg-black/10"
                referrerPolicy="no-referrer"
                fallback={
                  <div className="w-10 h-10 rounded-xl border border-white/10 p-0.5 bg-gradient-to-br from-[#E7C768]/30 to-[#C9933A]/30 flex items-center justify-center">
                    <Building className="w-5 h-5 text-[#F5D67A]" />
                  </div>
                }
              />
              {company?.name && (
                <span className="hidden sm:block text-sm font-extrabold text-white truncate max-w-[220px]">{company.name}</span>
              )}
            </div>

            {/* Desktop Tabs menu centered */}
            {selectedVacancy && (
              <div className="hidden md:flex items-center gap-1.5 overflow-x-auto select-none py-1">
                {visibleTabs.map((tb) => {
                  const isActive = subTab === tb.key;
                  return (
                    <button
                      key={tb.key}
                      onClick={() => navigate(`/com${companySlug}/vac${(selectedVacancy as any).slug || selectedVacancy.id}/${tb.key}`)}
                      className={`transition px-3 py-1.5 text-xs font-bold rounded-lg border cursor-pointer whitespace-nowrap ${
                        isActive
                          ? "bg-[#E7C768] text-[#17344F] border-[#E7C768] shadow"
                          : "bg-black/25 text-slate-300 border-white/5 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      {tb.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Desktop Tabs for company landing (no vacancy selected) */}
            {!selectedVacancy && showCompanyTabs && (
              <div className="hidden md:flex items-center gap-1.5 overflow-x-auto select-none py-1">
                {companyNavItems.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => scrollToSection(it.id)}
                    className="transition px-3 py-1.5 text-xs font-bold rounded-lg border cursor-pointer whitespace-nowrap bg-black/25 text-slate-300 border-white/5 hover:bg-white/5 hover:text-white"
                  >
                    {it.label}
                  </button>
                ))}
              </div>
            )}

            {/* Right block: hamburger on mobile only — login is available only on a vacancy page */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className={`${(selectedVacancy || showCompanyTabs) ? "md:hidden" : "hidden"} text-slate-300 hover:text-white p-2 border border-white/10 rounded-xl bg-black/25 focus:outline-none transition shrink-0`}
              >
                {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5 animate-pulse" />}
              </button>
            </div>
          </div>

          {/* Mobile expandable hamburger menu drawer */}
          {menuOpen && selectedVacancy && (
            <div className="md:hidden py-3 border-t border-white/5 space-y-3 animate-fadeIn">
              <div className="flex flex-col gap-1.5">
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider px-2 block mb-0.5">Разделы страницы:</span>
                {visibleTabs.map((tb) => {
                  const isActive = subTab === tb.key;
                  return (
                    <button
                      key={tb.key}
                      onClick={() => {
                        setMenuOpen(false);
                        navigate(`/com${companySlug}/vac${(selectedVacancy as any).slug || selectedVacancy.id}/${tb.key}`);
                      }}
                      className={`w-full text-left transition px-3.5 py-2.5 text-xs font-bold rounded-xl border flex items-center justify-between ${
                        isActive
                          ? "bg-[#E7C768] text-[#17344F] border-[#E7C768]"
                          : "bg-black/25 text-slate-300 border-white/5 hover:bg-white/5"
                      }`}
                    >
                      <span>{tb.label}</span>
                      {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[#17344F]" />}
                    </button>
                  );
                })}
              </div>

              {selectedVacancy && (
                <div className="pt-2 border-t border-white/5 font-sans">
                  <button
                    onClick={() => { setMenuOpen(false); setShowApplyModal(true); }}
                    className="w-full cursor-pointer bg-[#E7C768] text-[#17344F] text-xs font-black py-2.5 rounded-xl hover:bg-[#F4EE8E] transition shadow-md text-center block"
                  >
                    Войти / Регистрация 🔑
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Mobile expandable hamburger menu drawer — company landing view */}
          {menuOpen && !selectedVacancy && showCompanyTabs && (
            <div className="md:hidden py-3 border-t border-white/5 space-y-2 animate-fadeIn">
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider px-2 block mb-0.5">Разделы страницы:</span>
              {companyNavItems.map((it) => (
                <button
                  key={it.id}
                  onClick={() => { setMenuOpen(false); scrollToSection(it.id); }}
                  className="w-full text-left transition px-3.5 py-2.5 text-xs font-bold rounded-xl border bg-black/25 text-slate-300 border-white/5 hover:bg-white/5"
                >
                  {it.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-5xl mx-auto py-8 md:py-12 px-4 md:px-8 w-full flex-1 space-y-10 text-left overflow-x-hidden">
        
        {/* Centered Content Area */}
        <section className="space-y-6 text-left">
          
          {/* Unified company sections: shown on /com{slug} (no vacancy),
              and also on /com{slug}/vac{slug}/company so both routes look identical. */}
          {(!vacancyId || subTab === "company") && company && (
            <CompanySections
              company={company}
              vacancies={vacancies}
              companySlug={companySlug}
              hideStickyNav
              currentVacancy={vacancyId ? selectedVacancy : null}
              onOpenVacancy={(v) =>
                navigate(`/com${companySlug}/vac${(v as any).slug || v.id}/vacancy`)
              }
              onBackToVacancy={
                vacancyId && selectedVacancy
                  ? () =>
                      navigate(
                        `/com${companySlug}/vac${(selectedVacancy as any).slug || selectedVacancy.id}/vacancy`,
                      )
                  : undefined
              }
            />
          )}

          {/* Active Job Vacancy presentation banner — only when a vacancy is in the URL
              AND we are NOT on the /company sub-tab (company view is handled above). */}
          {vacancyId && subTab !== "company" && selectedVacancy && (selectedRaw?.is_published && (selectedRaw?.status ?? "active") === "active") ? (
            <div className="rounded-3xl overflow-hidden border border-white/10 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.7)] bg-gradient-to-br from-[#1E4468] via-[#265582] to-[#17344F]">
              {/* Hero — фирменный, без внешних скриншотов */}
              <div className="relative px-6 md:px-10 pt-8 md:pt-10 pb-6 md:pb-8 overflow-hidden">
                <div aria-hidden className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-[#E7C768]/15 blur-3xl pointer-events-none" />
                <div aria-hidden className="absolute -bottom-32 -left-20 w-80 h-80 rounded-full bg-[#265582]/40 blur-3xl pointer-events-none" />
                <div className="relative flex items-start gap-4 md:gap-6">
                  <RRImage
                    src={company?.logo_url || selectedVacancy.logoUrl || ""}
                    w={96}
                    alt={company?.name || selectedVacancy.companyName || "Логотип"}
                    className="w-16 h-16 md:w-20 md:h-20 rounded-2xl object-contain bg-white/10 border border-white/15 p-2 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                        Идёт ИИ-набор
                      </span>
                      {company?.name && (
                        <span className="text-xs text-white/70 font-semibold truncate max-w-[260px]">{company.name}</span>
                      )}
                    </div>
                    <h2 className="text-2xl md:text-4xl font-black text-white leading-tight tracking-tight break-words">
                      {selectedVacancy.roleName}
                    </h2>
                  </div>
                </div>

                {/* Terms */}
                <div className="relative grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
                  {selectedVacancy.salaryTerms && (
                    <div className="flex items-center gap-3 bg-black/25 p-3.5 rounded-2xl border border-white/10 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
                        <DollarSign className="w-4 h-4 text-emerald-300" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Оплата</div>
                        <div className="text-sm font-bold text-emerald-200 break-words">{selectedVacancy.salaryTerms}</div>
                      </div>
                    </div>
                  )}
                  {selectedVacancy.scheduleTerms && (
                    <div className="flex items-center gap-3 bg-black/25 p-3.5 rounded-2xl border border-white/10 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-sky-500/15 flex items-center justify-center shrink-0">
                        <Clock className="w-4 h-4 text-sky-300" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">График</div>
                        <div className="text-sm font-bold text-sky-200 break-words">{selectedVacancy.scheduleTerms}</div>
                      </div>
                    </div>
                  )}
                </div>

                {displayCompany?.website && (
                  <div className="relative mt-4">
                    <SitePreview url={displayCompany.website} variant="compact" />
                  </div>
                )}
              </div>

              <div className="px-6 md:px-10 py-6 md:py-8 bg-black/15 border-t border-white/10 space-y-5">

              {/* Tab render details */}
              <div className="space-y-3.5 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-[#E7C768] uppercase tracking-wider flex items-center gap-1.5 font-mono">
                    {(() => {
                      switch (subTab) {
                        case "motivation": return "🔥 Раздел: Мотивация и преимущества";
                        case "company": return "🏢 Раздел: О компании";
                        case "onboarding": return "🚀 Раздел: Оформление и адаптация";
                        case "payouts": return "💵 Раздел: Схема выплат";
                        case "schedule": return "📅 Раздел: График и тайм-слоты";
                        case "team": return "👥 Раздел: Наша Команда";
                        case "system": return "⚙️ Раздел: ИИ-Система РобоРекрут";
                        case "vacancy":
                        default: return "💼 Раздел: Детали вакансии и требования";
                      }
                    })()}
                  </span>
                  {/* Технический служебный код раздела убран —
                      он не предназначен для кандидата. */}
                </div>

                <Reveal key={subTab} direction="up" className="bg-black/25 p-4 sm:p-6 rounded-2xl border border-white/10 shadow-inner">
                  {(() => {
                    switch (subTab) {
                      case "motivation":
                        return <MotivationView project={selectedVacancy} />;
                      case "company":
                        return <CompanyView project={{ ...selectedVacancy, companyText: selectedVacancy.companyText || displayCompany.description }} />;
                      case "onboarding":
                        return <OnboardingView project={selectedVacancy} />;
                      case "payouts":
                        return <PayoutsView project={selectedVacancy} />;
                      case "schedule":
                        return <ScheduleView project={{ ...selectedVacancy, scheduleText: selectedVacancy.scheduleText || selectedVacancy.scheduleTerms }} />;
                      case "team":
                        return <TeamView project={selectedVacancy} />;
                      case "system":
                        return <SystemView project={selectedVacancy} />;
                      case "vacancy":
                      default:
                        return <VacancyView project={selectedVacancy} />;
                    }
                  })()}
                </Reveal>
              </div>

              <button
                onClick={() => {
                  setShowApplyModal(true);
                }}
                className="w-full bg-gradient-to-r from-[#E7C768] to-[#F4D685] text-[#17344F] font-extrabold text-sm md:text-base py-4 rounded-2xl hover:from-[#F4EE8E] hover:to-[#F8E89A] transition shadow-xl flex items-center justify-center gap-2 cursor-pointer"
              >
                Начать отбор в компанию <ChevronRight className="w-4 h-4" />
              </button>
              </div>

            </div>
          ) : vacancyId && subTab !== "company" && selectedRaw ? (
            <div className="bg-[#1E4468]/40 border border-amber-500/30 p-8 rounded-3xl text-center space-y-3">
              <AlertCircle className="w-10 h-10 mx-auto text-amber-400" />
              <h3 className="font-bold text-white text-lg">
                {(selectedRaw?.status === "deleted")
                  ? "Эта вакансия закрыта"
                  : "Эта вакансия больше не активна"}
              </h3>
              <p className="text-sm text-slate-300">
                Компания временно приостановила набор по этой позиции. Откликнуться на неё нельзя.
              </p>
              <button
                onClick={() => navigate(`/com${companySlug}`)}
                className="inline-flex items-center gap-2 bg-[#E7C768] text-[#17344F] font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-[#F4EE8E] transition"
              >
                Смотреть другие вакансии компании <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          ) : vacancyId && subTab !== "company" ? (
            <div className="bg-[#1E4468]/40 border border-white/5 p-8 rounded-3xl text-center space-y-2">
              <AlertCircle className="w-8 h-8 mx-auto text-amber-400/80" />
              <h3 className="font-bold text-white">Список вакансий пуст</h3>
              <p className="text-xs text-slate-400">Наш робот подбирает новые должности. Пожалуйста, загляните позже.</p>
            </div>
          ) : null}

          {/* Другие активные вакансии этой компании — исключаем текущую. */}
          {(() => {
            if (!vacancyId || subTab === "company") return null;
            const others = vacancies.filter((v) => v.id !== selectedVacancy?.id);
            if (others.length === 0) return null;
            return (
              <div className="space-y-5 pt-8 border-t border-white/10 mt-10">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm">🎯</span>
                  <h3 className="text-sm font-bold text-white/90 uppercase tracking-widest">
                    Другие открытые вакансии компании ({others.length})
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-5 items-stretch">
                  {others.map((v) => (
                    <VacancyCard
                      key={v.id}
                      vacancy={{
                        id: v.id,
                        roleName: v.roleName,
                        companyName: company?.name || null,
                        companyLogo: company?.logo_url || v.logoUrl || null,
                        industry: (company as any)?.industry || null,
                        salaryTerms: v.salaryTerms || null,
                        scheduleTerms: v.scheduleTerms || null,
                        vacancyText: v.vacancyText || null,
                      }}
                      showCompany={false}
                      className="h-full"
                      onOpen={() => navigate(`/com${companySlug}/vac${(v as any).slug || v.id}/vacancy`)}
                    />
                  ))}
                </div>
              </div>
            );
          })()}

        </section>

      </main>

      {/* Candidate email auth modal — only meaningful when a vacancy is selected */}
      {selectedVacancy && selectedRaw?.is_published && (selectedRaw?.status ?? "active") === "active" && (
        <CandidateAuthModal
          isOpen={showApplyModal}
          onClose={() => setShowApplyModal(false)}
          projectId={selectedVacancy.id}
          companyId={company?.id || null}
          roleName={selectedVacancy.roleName}
          companyName={company?.name || selectedVacancy.companyName}
          onSuccess={handleCandidateAuthSuccess}
        />
      )}

      {/* Floating AI Assistant — company-wide knowledge base */}
      {company && (
        <VacancyAIAssistant
          projectId={selectedVacancy?.id}
          roleName={selectedVacancy?.roleName || null}
          companyName={company?.name || null}
          logoUrl={company?.logo_url || null}
          context={(() => {
            const c: any = company || {};
            const parts: string[] = [`Компания: ${c.name || ""}`];
            if (c.industry) parts.push(`Отрасль: ${c.industry}`);
            if (c.website) parts.push(`Сайт: ${c.website}`);
            if (c.staff) parts.push(`Штат: ${c.staff}`);
            if (c.description_text) parts.push(`О компании:\n${c.description_text}`);
            if (c.mission_text) parts.push(`Миссия:\n${c.mission_text}`);
            if (c.products_text) parts.push(`Продукты:\n${c.products_text}`);
            if (c.about_text) parts.push(`Подробнее:\n${c.about_text}`);
            if (c.team_text) parts.push(`Команда:\n${c.team_text}`);
            if (c.payouts_text) parts.push(`Выплаты:\n${c.payouts_text}`);
            if (c.schedule_text) parts.push(`График:\n${c.schedule_text}`);
            if (c.system_text) parts.push(`Система работы:\n${c.system_text}`);
            if (vacancies.length) {
              parts.push(`Открытые вакансии (${vacancies.length}):\n` +
                vacancies.map((v: any) => `• ${v.roleName}${v.salaryTerms ? ` — ${v.salaryTerms}` : ""}${v.scheduleTerms ? `, ${v.scheduleTerms}` : ""}`).join("\n"));
            }
            return `Отвечай ТОЛЬКО на основе этих данных о компании и её вакансиях. Если в данных нет ответа — честно скажи, что уточнишь у работодателя.\n\n${parts.join("\n\n")}`;
          })()}
        />
      )}

    </div>
  );
}
