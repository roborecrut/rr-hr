/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "../components/RouterContext";
import Mascot from "../components/Mascot";
import Markdown from "react-markdown";
import { JobProject, Message } from "../types";
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
  
  // Parse companySlug and vacancyId from path segments
  const segments = path.split("/").filter(Boolean);
  const companySlug = segments[0] || "ooo-roborekrut-inzhiniring";
  const vacancyId = segments[1] || "";
  const subTab = segments[2] || "company";

  // States
  const [company, setCompany] = useState<any>(null);
  const [vacancies, setVacancies] = useState<JobProject[]>([]);
  const [selectedVacancy, setSelectedVacancy] = useState<JobProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  const allTabs = [
    { key: "company", label: "🏢 Компания", textVal: selectedVacancy?.companyText },
    { key: "vacancy", label: "💼 Вакансия", textVal: selectedVacancy?.vacancyText },
    { key: "schedule", label: "📅 График", textVal: selectedVacancy?.scheduleText || selectedVacancy?.scheduleTerms },
    { key: "motivation", label: "🔥 Мотивация", textVal: selectedVacancy?.motivationTextDetail || selectedVacancy?.motivationText },
    { key: "payouts", label: "💵 Выплаты", textVal: selectedVacancy?.payoutsText },
    { key: "onboarding", label: "🚀 Оформление", textVal: selectedVacancy?.onboardingText },
    { key: "team", label: "👥 Команда", textVal: selectedVacancy?.teamText },
    { key: "system", label: "⚙️ ИИ-Система", textVal: selectedVacancy?.systemText }
  ];

  const visibleTabs = allTabs.filter(t => t.textVal && t.textVal.trim() !== "");

  useEffect(() => {
    if (selectedVacancy && visibleTabs.length > 0) {
      const isCurrentTabVisible = visibleTabs.some(t => t.key === subTab);
      if (!isCurrentTabVisible) {
        navigate(`/${companySlug}/${selectedVacancy.id}/${visibleTabs[0].key}`);
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
  const [isLoginOnly, setIsLoginOnly] = useState(false);
  const [candName, setCandName] = useState("");
  const [candEmail, setCandEmail] = useState("");
  const [candTg, setCandTg] = useState("");
  const [authMethod, setAuthMethod] = useState<"google" | "telegram" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);

  // Fetch company & projects from server
  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Fetch companies
      const compRes = await fetch("/api/companies");
      let activeCompany = null;
      if (compRes.ok) {
        const compList = await compRes.json();
        const foundComp = compList.find((c: any) => c.slug === companySlug);
        activeCompany = foundComp || compList[0];
        setCompany(activeCompany);
      }

      // 2. Fetch projects (vacancies)
      const projRes = await fetch("/api/projects");
      if (projRes.ok) {
        const projList = await projRes.json();
        // Filter vacancies by this company name or slug
        const filtered = projList.filter((p: any) => {
          return p.companySlug === companySlug || (activeCompany && p.companyName?.toLowerCase() === activeCompany.name?.toLowerCase());
        });
        setVacancies(filtered);

        // If vacancyId requested, find it, otherwise take first as active for chatbot
        if (vacancyId) {
          const foundVac = projList.find((p: any) => p.id === vacancyId);
          setSelectedVacancy(foundVac || filtered[0] || projList[0]);
        } else {
          setSelectedVacancy(filtered[0] || projList[0]);
        }
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
      const res = await fetch("/api/vacancy-consultant-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedVacancy.id,
          messages: messages,
          userQuestion: questionText
        })
      });

      if (res.ok) {
        const data = await res.json();
        const aiMsg: Message = {
          sender: "recruiter",
          text: data.reply,
          timestamp: new Date().toLocaleTimeString()
        };
        setMessages(prev => [...prev, aiMsg]);
      }
    } catch (err) {
      console.error("Failed to fetch response:", err);
    } finally {
      setIsAiTyping(false);
    }
  };

  // Immediate 1-Click candidate registration and login, with NO FORM.
  const triggerOneClickRegister = async (method: "google" | "telegram") => {
    if (submitting) return;
    setAuthMethod(method);
    setSubmitting(true);

    const randId = Math.floor(1000 + Math.random() * 9000);
    const mockName = method === "google" ? `Алексей Иванов (${randId})` : `Кандидат #${randId}`;
    const mockEmail = `candidate_${randId}@candidate-pool.ru`;
    const mockTg = method === "telegram" ? `tg_candidate_${randId}` : "";

    const activeProject = selectedVacancy || vacancies[0] || { id: "sales-prod-1", roleName: "Менеджер по продажам", companySlug: "ooo-roborekrut-inzhiniring" };

    const payload: any = {
      name: mockName,
      email: mockEmail,
      telegramUsername: mockTg,
      projectId: activeProject.id,
      roleName: activeProject.roleName,
      registeredVia: method,
    };

    if (method === "google") {
      payload.googleName = `Алексей Иванов (${randId})`;
      payload.googleEmail = mockEmail;
      payload.googleAvatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=alexey_${randId}`;
    } else {
      payload.telegramId = `123${randId}90`;
      payload.telegramFirstName = "Алексей";
      payload.telegramLastName = "Иванов";
      payload.telegramAvatar = `https://api.dicebear.com/7.x/identicon/svg?seed=tg_${randId}`;
      payload.telegramUsername = `tg_alex_${randId}`;
    }

    try {
      const res = await fetch("/api/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const candidateInfo = await res.json();
        localStorage.setItem("cand_session_id", candidateInfo.id);
        localStorage.setItem("cand_role", "candidate");

        setRegistrationSuccess(true);
        setTimeout(() => {
          setRegistrationSuccess(false);
          setShowApplyModal(false);
          setSubmitting(false);
          
          // As requested, always land candidate on /{companySlug}/{id}/candidateXXXXXX/profile
          navigate(`/${activeProject.companySlug || "ooo-roborekrut-inzhiniring"}/${activeProject.id}/${candidateInfo.id}/profile`);
        }, 1500);
      } else {
        setSubmitting(false);
      }
    } catch (err) {
      console.error("Error creating candidate in one click:", err);
      setSubmitting(false);
    }
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
    sites: "https://hr-rr.ru",
    logoUrl: ""
  };

  return (
    <div className="bg-gradient-to-b from-[#112335] to-[#1C3A56] min-h-screen text-white font-sans antialiased flex flex-col justify-between">
      
      {/* Dynamic Header */}
      <header className="sticky top-0 z-40 bg-[#112335]/95 backdrop-blur-md border-b border-[#204569]/40 py-2">
        <div className="max-w-7xl mx-auto w-full px-4 md:px-8">
          <div className="flex items-center justify-between gap-4 py-2">
            {/* Logo field */}
            <div className="flex items-center gap-3 cursor-pointer shrink-0" onClick={() => navigate(selectedVacancy ? `/${companySlug}/${selectedVacancy.id}` : "/")}>
              <img
                src={selectedVacancy?.logoUrl || "https://i.ibb.co/WWRbtPq0/RR-Logo.png"}
                alt="Logo"
                className="w-10 h-10 object-contain rounded-xl border border-white/10 p-0.5 bg-black/10"
                referrerPolicy="no-referrer"
              />
            </div>

            {/* Desktop Tabs menu centered */}
            {selectedVacancy && (
              <div className="hidden md:flex items-center gap-1.5 overflow-x-auto select-none py-1">
                {visibleTabs.map((tb) => {
                  const isActive = subTab === tb.key;
                  return (
                    <button
                      key={tb.key}
                      onClick={() => navigate(`/${companySlug}/${selectedVacancy.id}/${tb.key}`)}
                      className={`transition px-3 py-1.5 text-xs font-bold rounded-lg border cursor-pointer whitespace-nowrap ${
                        isActive
                          ? "bg-[#E7C768] text-[#112335] border-[#E7C768] shadow"
                          : "bg-black/25 text-slate-300 border-white/5 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      {tb.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Right block: login button on desktop, hamburger on mobile */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  setIsLoginOnly(true);
                  setShowApplyModal(true);
                }}
                className="hidden md:block cursor-pointer bg-[#E7C768] text-[#112335] text-xs font-black px-4 py-2 rounded-xl hover:bg-[#F4EE8E] transition shadow-md whitespace-nowrap"
              >
                Войти 🔑
              </button>

              {/* Hamburger Toggle icon */}
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="md:hidden text-slate-300 hover:text-white p-2 border border-white/10 rounded-xl bg-black/25 focus:outline-none transition shrink-0"
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
                        navigate(`/${companySlug}/${selectedVacancy.id}/${tb.key}`);
                      }}
                      className={`w-full text-left transition px-3.5 py-2.5 text-xs font-bold rounded-xl border flex items-center justify-between ${
                        isActive
                          ? "bg-[#E7C768] text-[#112335] border-[#E7C768]"
                          : "bg-black/25 text-slate-300 border-white/5 hover:bg-white/5"
                      }`}
                    >
                      <span>{tb.label}</span>
                      {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[#112335]" />}
                    </button>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-white/5 font-sans">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setIsLoginOnly(true);
                    setShowApplyModal(true);
                  }}
                  className="w-full cursor-pointer bg-[#E7C768] text-[#112335] text-xs font-black py-2.5 rounded-xl hover:bg-[#F4EE8E] transition shadow-md text-center block"
                >
                  Войти 🔑
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto py-8 px-4 md:px-8 w-full flex-1 space-y-8 text-left">
        
        {/* Centered Content Area */}
        <section className="space-y-6 text-left">
          
          {/* Company branding card */}
          {subTab === "company" && (
            <div className="bg-[#1D3E5E]/85 border border-white/15 rounded-3xl p-6 md:p-8 shadow-xl space-y-6">
              
              <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center">
                <div className="w-16 h-16 bg-gradient-to-tr from-[#E7C768] to-amber-300 rounded-2xl flex items-center justify-center text-teal-950 font-black text-2xl shadow-md border-2 border-white/20">
                  {displayCompany.name.includes('"') ? displayCompany.name.split('"')[1]?.[0] || "C" : displayCompany.name[0]}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#E7C768] bg-[#E7C768]/15 px-2.5 py-0.5 rounded-full border border-[#E7C768]/20">
                      Верифицированный бренд
                    </span>
                    <Sparkles className="w-4 h-4 text-[#E7C768]" />
                  </div>
                  <h1 className="text-3xl font-extrabold text-white leading-tight">
                    {displayCompany.name}
                  </h1>
                  <p className="text-sm text-slate-300 flex items-center gap-1.5 pt-1">
                    <Building className="w-4 h-4 text-[#E7C768]/70" /> {displayCompany.industry || "Услуги / Производство"}
                  </p>
                </div>
              </div>

              <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-line">
                {displayCompany.description || "Компания осуществляет подбор перспективных кадров для масштабирования внутренних бизнес-процессов с использованием передовых нейросетевых технологий."}
              </p>

              {/* Quick stats grid */}
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="bg-[#12283C] p-3 rounded-2xl border border-white/5 space-y-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Численность</span>
                  <span className="text-sm font-bold text-[#E7C768] flex items-center gap-1">
                    <Users className="w-4 h-4" /> {displayCompany.staff || "10-25 человек"}
                  </span>
                </div>
                <div className="bg-[#12283C] p-3 rounded-2xl border border-white/5 space-y-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Сайт компании</span>
                  {displayCompany.sites ? (
                    <a href={displayCompany.sites} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-sky-400 hover:underline flex items-center gap-1">
                      <Globe className="w-4 h-4" /> {displayCompany.sites.replace("https://", "")}
                    </a>
                  ) : (
                    <span className="text-sm font-bold text-slate-400 flex items-center gap-1">
                      <Globe className="w-4 h-4" /> не указан
                    </span>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* Active Job Vacancy presentation banner */}
          {selectedVacancy ? (
            <div className="bg-gradient-to-r from-[#204569] to-[#1D3E5E] border border-white/10 rounded-3xl p-6 md:p-8 shadow-lg space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-[#E7C768] uppercase tracking-widest block">Подробно о вакансии</span>
                  <h2 className="text-2xl font-black text-white">{selectedVacancy.roleName}</h2>
                </div>
                <div className="flex flex-col items-start sm:items-end gap-1.5 shrink-0">
                  <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap">
                    Идет ИИ-набор!
                  </span>
                  <span className="bg-[#112335] text-amber-300 border border-amber-500/25 text-[10px] font-mono font-bold px-2.5 py-1 rounded-lg">
                    ID вакансии: {selectedVacancy.id}
                  </span>
                </div>
              </div>

              {/* Terms boxes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-2">
                <div className="flex items-center gap-2.5 bg-black/20 p-3 rounded-xl border border-white/5">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold block leading-none">Оплата трека</span>
                    <span className="text-xs font-bold text-emerald-300 block mt-1">{selectedVacancy.salaryTerms}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 bg-black/20 p-3 rounded-xl border border-white/5">
                  <Clock className="w-4 h-4 text-sky-400" />
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold block leading-none">Формат & График</span>
                    <span className="text-xs font-bold text-sky-300 block mt-1">{selectedVacancy.scheduleTerms}</span>
                  </div>
                </div>
              </div>

              {/* Tab render details */}
              <div className="space-y-3.5 text-left pt-2 border-t border-white/5">
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
                  <span className="text-[10px] bg-white/5 text-slate-300 font-bold px-2 py-0.5 rounded-md uppercase font-mono tracking-wider border border-white/15">
                    {subTab}
                  </span>
                </div>

                <div className="bg-black/20 p-4 sm:p-5 rounded-2xl border border-white/5 shadow-inner">
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
                </div>
              </div>

              <button
                onClick={() => {
                  triggerOneClickRegister("telegram");
                  setShowApplyModal(true);
                }}
                className="w-full bg-[#E7C768] text-[#112335] font-extrabold text-sm py-3.5 rounded-2xl hover:bg-[#F4EE8E] transition shadow-lg flex items-center justify-center gap-2 cursor-pointer"
              >
                Начать отбор в компанию <ChevronRight className="w-4 h-4" />
              </button>

            </div>
          ) : (
            <div className="bg-[#1D3E5E]/40 border border-white/5 p-8 rounded-3xl text-center space-y-2">
              <AlertCircle className="w-8 h-8 mx-auto text-amber-400/80" />
              <h3 className="font-bold text-white">Список вакансий пуст</h3>
              <p className="text-xs text-slate-400">Наш робот подбирает новые должности. Пожалуйста, загляните позже.</p>
            </div>
          )}

          {/* List of all vacancies for this company */}
          {vacancies.length > 0 && (
            <div className="space-y-3 pt-5 border-t border-white/10 mt-6">
              <div className="flex items-center gap-2">
                <span className="text-sm">🎯</span>
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest">
                  Все открытые вакансии компании ({vacancies.length}):
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {vacancies.map((v) => (
                  <div
                    key={v.id}
                    onClick={() => navigate(`/${companySlug}/${v.id}`)}
                    className={`cursor-pointer border p-4 rounded-2xl text-left transition ${
                      selectedVacancy?.id === v.id
                        ? "bg-[#E7C768]/15 border-[#E7C768]/70 ring-1 ring-[#E7C768]/50"
                        : "bg-[#1D3E5E]/45 border-white/5 hover:border-white/20 hover:bg-[#1D3E5E]/60"
                    }`}
                  >
                    <div className="flex justify-between items-start gap-1">
                      <h4 className="font-extrabold text-sm text-white line-clamp-1">{v.roleName}</h4>
                      {selectedVacancy?.id === v.id && (
                        <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[8px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0">Выбрана</span>
                      )}
                    </div>
                    <span className="text-[11px] font-bold text-[#E7C768] block mt-1">{v.salaryTerms}</span>
                    <span className="text-[10px] text-slate-350 block mt-0.5 font-sans">{v.scheduleTerms}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </section>

      </main>

      {/* Candidate registration modal with 1-click & Reminder note constraint */}
      {showApplyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#1D3E5E] border-2 border-[#E7C768]/50 text-white rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl relative text-left">
            
            <button
              onClick={() => setShowApplyModal(false)}
              className="absolute top-4 right-4 hover:bg-white/10 p-1.5 rounded-full text-slate-300 hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {registrationSuccess ? (
              <div className="text-center py-6 space-y-4">
                <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto text-emerald-400 border border-emerald-500/30">
                  <CheckCircle className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-emerald-300">Успешно зарегистрировано!</h3>
                <p className="text-sm text-slate-200 font-semibold">
                  Перенаправляем в кабинет ИИ-собеседований...
                </p>
              </div>
            ) : (
              <>
                <div className="text-center space-y-1">
                  <h3 className="text-xl font-black text-[#E7C768]">
                    {isLoginOnly ? "Вход в Кабинет Кандидата" : "Начать Блиц-Собеседование"}
                  </h3>
                  <p className="text-xs text-slate-300">
                    {isLoginOnly 
                      ? "Авторизуйтесь в 1 клик для входа в свой персональный кабинет соискателя."
                      : "Выберите удобный сервис в 1 клик для авторизации и мгновенной связи с работодателем."}
                  </p>
                </div>

                {/* 1-Click Action triggers as requested by user! */}
                {submitting ? (
                  <div className="flex flex-col items-center justify-center py-10 space-y-3">
                    <Loader className="w-8 h-8 text-[#E7C768] animate-spin animate-infinite" />
                    <span className="text-xs text-slate-300 font-medium">Связываемся с базой ИИ-собеседований...</span>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => triggerOneClickRegister("telegram")}
                        className="cursor-pointer border py-3.5 px-2 bg-black/35 border-white/5 hover:border-[#E7C768] rounded-2xl flex flex-col items-center justify-center gap-1.5 transition hover:bg-slate-900"
                      >
                        <svg className="w-6 h-6 text-sky-400 fill-current" viewBox="0 0 24 24">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03-.01-.14-.07-.19s-.16-.03-.22-.01c-.1.02-1.63 1.03-4.6 3.04-.44.3-.83.45-1.18.44-.39-.01-1.13-.22-1.68-.4-.68-.22-1.22-.34-1.17-.72.03-.2.3-.41.81-.62 3.17-1.38 5.28-2.29 6.34-2.73 3.01-1.26 3.63-1.48 4.04-1.48.09 0 .29.02.42.13.11.08.14.21.15.3l-.01.12z" />
                        </svg>
                        <span className="text-[11px] font-bold">Войти в 1 клик через Tg</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => triggerOneClickRegister("google")}
                        className="cursor-pointer border py-3.5 px-2 bg-black/35 border-white/5 hover:border-[#E7C768] rounded-2xl flex flex-col items-center justify-center gap-1.5 transition hover:bg-slate-900"
                      >
                        <svg className="w-5 h-5 text-red-400 fill-current" viewBox="0 0 24 24">
                          <path d="M12.24 10.285V13.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.866-3.577-7.866-8s3.536-8 7.866-8c2.46 0 4.105 1.025 5.047 1.926l2.427-2.334C17.955 1.514 15.34 0 12.24 0 5.58 0 0 5.37 0 12s5.58 12 12.24 12c6.96 0 11.57-4.89 11.57-11.79 0-.795-.085-1.4-.195-1.925H12.24z" />
                        </svg>
                        <span className="text-[11px] font-bold">Войти в 1 клик через Google</span>
                      </button>
                    </div>

                    {/* Reminder note strictly matching user prompt requirements */}
                    <div className="bg-sky-500/10 border border-sky-500/25 p-3 rounded-2xl space-y-1.5 text-xs text-sky-200">
                      <div className="flex items-center gap-1.5 font-bold">
                        <AlertCircle className="w-4 h-4 text-sky-400" />
                        <span>Автоматические напоминания</span>
                      </div>
                      <p className="text-[11px] leading-relaxed">
                        🎓 <strong>Обратите внимание!</strong> При регистрации через <strong>Telegram</strong> мы будем присылать вам напоминания в чат-бота, чтобы вы не забывали проходить этапы онбординга или лекции с пользой!
                      </p>
                    </div>
                  </>
                )}
              </>
            )}

          </div>
        </div>
      )}

      {/* Floating Career Consultant Chat Pop-up / Widget */}
      {isChatOpen ? (
        <div className="fixed bottom-6 right-6 z-50 w-[380px] sm:w-[420px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[85vh] flex flex-col bg-[#1D3E5E] border-2 border-[#E7C768] rounded-3xl shadow-2xl overflow-hidden transition-all duration-300 ease-out transform translate-y-0 scale-100">
          
          {/* Header */}
          <div className="bg-[#112335] px-4 py-3.5 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-3 text-left">
              <Mascot state={isAiTyping ? "serious" : "chat"} size="sm" />
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#E7C768]">Карьерный Консультант</h3>
                <p className="text-[10px] text-slate-300">ИИ чат-ассистент компании</p>
              </div>
            </div>
            <button
              onClick={() => setIsChatOpen(false)}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Chat Messages Flow */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs scrollbar-thin bg-[#17344F]/50">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex flex-col max-w-[85%] ${
                  m.sender === "candidate" ? "ml-auto text-right" : "mr-auto text-left"
                }`}
              >
                <span className="text-[9px] text-slate-400 mb-1 px-1">{m.timestamp}</span>
                <div
                  className={`p-3 rounded-2xl leading-relaxed ${
                    m.sender === "candidate"
                      ? "bg-gradient-to-r from-red-600 to-amber-600 text-white rounded-tr-none"
                      : "bg-[#112335] text-slate-200 rounded-tl-none border border-white/5"
                  }`}
                >
                  <div className="markdown-body">
                    <Markdown>{m.text}</Markdown>
                  </div>
                </div>
              </div>
            ))}
            
            {isAiTyping && (
              <div className="mr-auto text-left max-w-[85%]">
                <div className="bg-[#112335] p-3 rounded-2xl rounded-tl-none border border-white/5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-[#E7C768] rounded-full animate-bounce"></span>
                  <span className="w-1.5 h-1.5 bg-[#E7C768] rounded-full animate-bounce delay-100"></span>
                  <span className="w-1.5 h-1.5 bg-[#E7C768] rounded-full animate-bounce delay-200"></span>
                </div>
              </div>
            )}
            
            <div ref={chatEndRef} />
          </div>

          {/* Quick Questions suggestion pills */}
          <div className="p-3 bg-[#112335]/70 border-t border-white/10 flex flex-wrap gap-1 text-left">
            <button
              onClick={() => handleSendMessage("Каковы точные условия выплаты зарплаты на этой должности?")}
              className="bg-white/5 border border-white/10 hover:border-[#E7C768] text-[9px] font-semibold text-slate-300 px-2 py-1 rounded transition cursor-pointer"
            >
              💵 Какая оплата?
            </button>
            <button
              onClick={() => handleSendMessage("Как проходит рабочий день сотрудника на этой позиции?")}
              className="bg-white/5 border border-white/10 hover:border-[#E7C768] text-[9px] font-semibold text-slate-300 px-2 py-1 rounded transition cursor-pointer"
            >
              📅 Каков рабочий день?
            </button>
            <button
              onClick={() => handleSendMessage("Как устроен тест и обучение на Роботе Рекрутере?")}
              className="bg-white/5 border border-white/10 hover:border-[#E7C768] text-[9px] font-semibold text-slate-300 px-2 py-1 rounded transition cursor-pointer"
            >
              🤖 Как устроен отбор?
            </button>
          </div>

          {/* Message composer input bar */}
          <div className="p-3 bg-[#112335] border-t border-white/10 flex gap-2">
            <input
              type="text"
              className="w-full bg-[#17344F] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#E7C768]"
              placeholder="Задать вопрос..."
              value={userQuestion}
              onChange={(e) => setUserQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={isAiTyping || !userQuestion.trim()}
              className="cursor-pointer bg-gradient-to-r from-red-600 to-amber-600 text-white p-2.5 rounded-xl font-bold transition disabled:opacity-50 flex items-center justify-center shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>

        </div>
      ) : (
        /* Floating Button */
        <button
          onClick={() => setIsChatOpen(true)}
          className="fixed bottom-6 right-6 z-50 bg-gradient-to-r from-red-600 via-amber-600 to-amber-500 text-white px-5 py-4 rounded-full shadow-2xl flex items-center gap-3 hover:scale-105 active:scale-95 transition-all duration-300 border-2 border-[#E7C768]/60 group cursor-pointer"
          title="Задать вопрос Карьерному ИИ-Консультанту"
        >
          <div className="relative">
            <Mascot state="chat" size="sm" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
          </div>
          <span className="text-xs font-black tracking-tight text-white uppercase font-sans">
            Задать вопрос ИИ 💬
          </span>
        </button>
      )}

      {/* Footer */}
      <footer className="border-t border-white/10 py-6 text-center text-xs text-slate-400 mt-8">
        <div className="max-w-7xl mx-auto px-4">
          © {new Date().getFullYear()} {displayCompany.name} • Создано на платформе Робот Рекрутер RR.
        </div>
      </footer>

    </div>
  );
}
