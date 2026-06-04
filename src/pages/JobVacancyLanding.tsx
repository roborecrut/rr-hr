/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "../components/RouterContext";
import Mascot from "../components/Mascot";
import Markdown from "react-markdown";
import { JobProject, Message } from "../types";
import { supabase } from "@/integrations/supabase/client";
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
  FileText,
  User,
  Mail,
  HelpCircle,
  Menu,
  ChevronRight
} from "lucide-react";

export default function JobVacancyLanding() {
  const { navigate, query } = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // States
  const [project, setProject] = useState<JobProject | null>(null);
  const [loading, setLoading] = useState(true);

  // Consultant chatbot conversation state
  const [messages, setMessages] = useState<Message[]>([]);
  const [userQuestion, setUserQuestion] = useState("");
  const [isAiTyping, setIsAiTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Apply candidate signup modal trigger
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [candName, setCandName] = useState("");
  const [candEmail, setCandEmail] = useState("");
  const [candTg, setCandTg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Selected project ID/slug from query (may be empty — then load first published)
  const projectId = query.id || "";

  const fetchProjectDetails = async () => {
    try {
      // Load the requested project directly from Supabase (by uuid or by slug),
      // joining its parent company to get the display name & logo.
      let q = supabase
        .from("projects")
        .select("*, companies(name, slug, logo_url)")
        .eq("is_published", true)
        .limit(1);
      if (projectId) {
        const isUuid = /^[0-9a-f-]{36}$/i.test(projectId);
        q = isUuid
          ? supabase.from("projects").select("*, companies(name, slug, logo_url)").eq("id", projectId).limit(1)
          : supabase.from("projects").select("*, companies(name, slug, logo_url)").eq("slug", projectId).limit(1);
      }
      const { data } = await q;
      const row: any = data && data[0];
      if (row) {
        const found: JobProject = {
          id: row.id,
          companyName: row.companies?.name || "",
          companySlug: row.companies?.slug || undefined,
          employerId: row.employer_id,
          roleName: row.role_name,
          salaryTerms: row.salary_terms || undefined,
          scheduleTerms: row.schedule_terms || undefined,
          motivationText: row.motivation_text || undefined,
          customWiki: row.custom_wiki || undefined,
          checklistQuestions: [],
          roleplayQuestions: [],
          logoUrl: row.logo_url || row.companies?.logo_url || undefined,
        };
        setProject(found);
        setMessages([
          {
            sender: "recruiter",
            text: `Привет! Я — твой интерактивный карьерный консультант. 🤖 Я досконально знаю всё о вакансии "${found.roleName}" в компании "${found.companyName}". Наша оплата составляет: ${found.salaryTerms || "конкурентные бонусы"}. Спроси меня о графике, задачах или обучении, и я подробно отвечу! Также ты можешь нажать кнопку "Начать Отбор", чтобы сразу пройти мгновенный блиц-тест!`,
            timestamp: new Date().toLocaleTimeString(),
          },
        ]);
      }
    } catch (err) {
      console.error("Error loading project description:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectDetails();
  }, [projectId]);

  // Scroll chatbot down
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (customText?: string) => {
    const questionText = customText || userQuestion;
    if (!questionText.trim() || !project) return;

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
      const context = `Вакансия: ${project.roleName}; Компания: ${project.companyName}; Условия: ${project.salaryTerms || ""} / ${project.scheduleTerms || ""}; База: ${project.customWiki || ""}`;
      const reply = await aiChat({
        kind: "vacancy_consultant",
        project_id: project.id,
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
      console.error("Failed to fetch response from consultant:", err);
    } finally {
      setIsAiTyping(false);
    }
  };

  const handleQuickQuestion = (q: string) => {
    handleSendMessage(q);
  };

  const handleApplyOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candName.trim() || !candEmail.trim() || !project) return;

    setSubmitting(true);
    try {
      // Create new candidate in our in-memory backend
      const res = await fetch("/api/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: candName,
          email: candEmail,
          telegramUsername: candTg || "",
          projectId: project.id,
          roleName: project.roleName
        })
      });

      if (res.ok) {
        const candidateInfo = await res.json();
        // Seed candidate session in localStorage so candidate flow pulls this user
        localStorage.setItem("cand_session_id", candidateInfo.id);
        localStorage.setItem("cand_role", "candidate");
        
        setShowApplyModal(false);
        // Navigate applicant directly to CandidateFlow
        navigate("/candidate");
      }
    } catch (err) {
      console.error("Error creating candidate:", err);
      alert("Не удалось зарегистрироваться на вакансию. Повторите попытку.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-[#17344F] min-h-screen text-white flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-2">
          <Loader className="w-8 h-8 animate-spin text-[#E7C768]" />
          <span>Загрузка персональной страницы вакансии...</span>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="bg-[#17344F] min-h-screen text-white flex items-center justify-center font-sans p-6">
        <div className="text-center space-y-4 max-w-md">
          <h2 className="text-2xl font-bold text-red-400">Вакансия не найдена</h2>
          <p className="text-sm text-slate-300">Данный проект был удален администратором системы либо ссылка является недействительной.</p>
          <button onClick={() => navigate("/")} className="bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] px-6 py-2.5 rounded-xl font-bold">
            На главную
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-b from-[#17344F] to-[#265582] min-h-screen text-white font-sans antialiased flex flex-col justify-between">
      
      {/* Top Header Navigation */}
      <header className="sticky top-0 z-50 bg-[#17344F]/95 backdrop-blur-md border-b border-white/10 px-4 md:px-8 py-4">
        <div className="flex items-center justify-between gap-4 w-full">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate("/")}>
            <img 
              src="https://i.ibb.co/WWRbtPq0/RR-Logo.png" 
              alt="RR Робот Рекрутер" 
              className="w-10 h-10 object-contain drop-shadow" 
              referrerPolicy="no-referrer"
            />
            <div className="flex flex-col text-left">
              <span className="text-xl font-bold tracking-tight text-[#E7C768]">
                Робот Рекрутер
              </span>
              <span className="text-[10px] font-mono tracking-wider uppercase text-slate-300">Презентация вакансии</span>
            </div>
          </div>

          <nav className="hidden md:flex items-center justify-center gap-2 md:gap-4 text-xs md:text-sm font-semibold">
            <button onClick={() => navigate("/")} className="transition px-3 py-2 rounded-xl text-slate-300 hover:text-white">
              Главная
            </button>
            <button onClick={() => navigate("/vacancy")} className="transition px-3 py-2 rounded-xl text-slate-300 hover:text-white">
              Каталог Профессий
            </button>
            <button
              onClick={() => setShowApplyModal(true)}
              className="cursor-pointer bg-[#E7C768] text-[#17344F] text-xs font-bold px-4 py-2 rounded-xl hover:bg-[#F4EE8E] transition"
            >
              Пройти собеседование 🎯
            </button>
          </nav>

          {/* Mobile Burger Toggle Button */}
          <button 
            type="button"
            className="md:hidden flex items-center justify-center p-2 rounded-xl hover:bg-white/10 text-white transition-all"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-6 h-6 text-[#E7C768]" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-4 pt-4 border-t border-white/10 flex flex-col gap-3 font-semibold">
            <button onClick={() => { navigate("/"); setMobileMenuOpen(false); }} className="transition text-left w-full px-4 py-3 text-slate-300 hover:text-white">
              Главная
            </button>
            <button onClick={() => { navigate("/vacancy"); setMobileMenuOpen(false); }} className="transition text-left w-full px-4 py-3 text-slate-300 hover:text-white">
              Каталог Профессий
            </button>
            <button 
              onClick={() => { setShowApplyModal(true); setMobileMenuOpen(false); }} 
              className="w-full bg-[#E7C768] text-[#17344F] font-bold py-3 rounded-xl text-center shadow-lg transition"
            >
              Пройти собеседование 🎯
            </button>
          </div>
        )}
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto py-8 px-4 md:px-8 w-full flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Side: Vacancy Details card */}
        <section className="lg:col-span-7 space-y-6 text-left">
          
          <div className="bg-[#1D3E5E]/85 border border-white/15 rounded-3xl p-6 md:p-8 shadow-xl space-y-6">
            
            {/* Vacancy Title and Company */}
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-[#E7C768] bg-[#E7C768]/10 border border-[#E7C768]/20 px-3 py-1 rounded-full">
                Приглашение от работодателя
              </span>
              <h1 className="text-3xl font-extrabold text-white leading-tight mt-3">
                {project.roleName}
              </h1>
              <p className="text-lg text-slate-200 font-semibold">{project.companyName}</p>
            </div>

            {/* Core parameters box */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[#17344F]/50 p-4 rounded-2xl border border-white/10">
              
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400 border border-emerald-500/20">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] block text-slate-400 font-bold uppercase leading-none">Размер оплаты (Мотивация)</span>
                  <span className="text-sm font-bold text-emerald-300 mt-1 block">{project.salaryTerms}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-sky-500/10 rounded-xl flex items-center justify-center text-sky-400 border border-sky-500/20">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] block text-slate-400 font-bold uppercase leading-none">График проекта</span>
                  <span className="text-sm font-bold text-sky-300 mt-1 block">{project.scheduleTerms}</span>
                </div>
              </div>

            </div>

            {/* Description & Wiki */}
            <div className="space-y-3">
              <h3 className="font-bold text-sm uppercase text-[#E7C768] flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-[#D99E41]" /> Условия труда и Сведения о Компании
              </h3>
              <p className="text-xs text-slate-200 leading-relaxed bg-white/5 p-4 rounded-xl border border-white/5">
                {project.motivationText || "Компания предоставляет современное техническое оснащение, регулярную выплату вознаграждения, возможности кратного карьерного роста внутри структуры, а также гибкий график по согласованию."}
              </p>
            </div>

            {/* Custom Wiki Regulations */}
            {project.customWiki && (
              <div className="space-y-3 pt-2">
                <h3 className="font-bold text-sm uppercase text-[#E7C768] flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-[#D99E41]" /> Сводные стандарты и регламенты обучения
                </h3>
                <div className="text-xs text-slate-300 leading-relaxed bg-[#17344F]/40 p-4 rounded-xl border border-white/10 max-h-48 overflow-y-auto">
                  {project.customWiki}
                </div>
                <span className="text-[10px] block text-slate-400 font-mono italic">
                  * На основе этих регламентов ИИ Робот Рекрутер разработает индивидуальные лекции и квизы после вашего отбора.
                </span>
              </div>
            )}

            {/* Interview requirements info */}
            <div className="bg-[#E7C768]/10 border border-[#E7C768]/20 p-5 rounded-2xl space-y-3">
              <h4 className="text-xs font-bold text-[#E7C768] uppercase tracking-wider">Что ждет вас на экспресс-отборе?</h4>
              <ul className="text-xs text-slate-200 space-y-2 list-disc list-inside">
                <li>Интерактивное ИИ-интервью в чате с Роботом-Рекрутером.</li>
                <li>Проверка резюме (можно вписать текстом или прицепить файл).</li>
                <li>Имитация реального кейса (прохождение небольшого диалога).</li>
                <li>Мгновенный разбор ошибок и генерация персонального учебника по регламентам.</li>
              </ul>
            </div>

            {/* CTA action button */}
            <div className="pt-2 text-center sm:text-left">
              <button
                onClick={() => setShowApplyModal(true)}
                className="cursor-pointer inline-flex items-center gap-2 bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-white font-bold text-base px-8 py-4 rounded-xl shadow-xl hover:shadow-orange-700/20 hover:-translate-y-0.5 active:translate-y-0 transition duration-150 w-full sm:w-auto text-center justify-center"
              >
                Пройти собеседование & Начать Карьеру! <ArrowRight className="w-5 h-5" />
              </button>
            </div>

          </div>

        </section>

        {/* Right Side: Vacancy AI-Consultant chat widget */}
        <aside className="lg:col-span-5 space-y-4">
          
          <div className="bg-[#1D3E5E]/85 border border-white/15 rounded-3xl p-5 shadow-xl flex flex-col h-[520px]">
            
            {/* Header info */}
            <div className="flex items-center gap-3 border-b border-white/10 pb-3 mb-3 text-left">
              <Mascot state="greeting" size="sm" />
              <div>
                <h3 className="font-bold text-xs text-[#E7C768]">ИИ-Консультант RR</h3>
                <p className="text-[10px] text-slate-300 font-semibold">Отвечает на любые вопросы о вакансии</p>
              </div>
              <span className="ml-auto w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="ИИ на связи"></span>
            </div>

            {/* Chat message body list */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs text-left mb-3">
              {messages.map((m, i) => {
                const isRecruiter = m.sender === "recruiter";
                return (
                  <div
                    key={i}
                    className={`flex flex-col max-w-[85%] ${
                      isRecruiter ? "mr-auto text-left" : "ml-auto text-right"
                    }`}
                  >
                    <div
                      className={`p-3 rounded-2xl leading-normal font-semibold ${
                        isRecruiter
                          ? "bg-white/5 border border-white/10 text-slate-100 rounded-tl-none"
                          : "bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-white rounded-tr-none shadow"
                      }`}
                    >
                      <div className="markdown-body">
                        <Markdown>{m.text}</Markdown>
                      </div>
                    </div>
                    <span className="text-[8px] text-slate-400 font-mono mt-0.5 block px-1">
                      {m.timestamp}
                    </span>
                  </div>
                );
              })}

              {isAiTyping && (
                <div className="flex items-center gap-1 bg-white/5 border border-white/10 p-3 rounded-2xl rounded-tl-none w-max block">
                  <span className="w-1.5 h-1.5 bg-[#E7C768] rounded-full animate-bounce"></span>
                  <span className="w-1.5 h-1.5 bg-[#E7C768] rounded-full animate-bounce delay-100"></span>
                  <span className="w-1.5 h-1.5 bg-[#E7C768] rounded-full animate-bounce delay-200"></span>
                </div>
              )}
              
              <div ref={chatEndRef} />
            </div>

            {/* Preset quick question trigger tags */}
            <div className="bg-[#17344F]/50 p-2.5 rounded-xl border border-white/5 mb-3 flex flex-wrap gap-1.5 quick-questions text-left">
              <span className="text-[9px] block text-slate-400 w-full font-bold uppercase tracking-wider mb-0.5">Частые вопросы:</span>
              <button
                onClick={() => handleQuickQuestion("Какая реальная зарплата на этой позиции?")}
                className="bg-white/5 border border-white/10 hover:border-[#E7C768] text-[9.5px] font-semibold text-slate-200 px-2 py-1 rounded hover:bg-white/10 transition"
              >
                💵 Какая зарплата?
              </button>
              <button
                onClick={() => handleQuickQuestion("Можно ли работать удаленно или гибко?")}
                className="bg-white/5 border border-white/10 hover:border-[#E7C768] text-[9.5px] font-semibold text-slate-200 px-2 py-1 rounded hover:bg-white/10 transition"
              >
                🏠 Формат и график?
              </button>
              <button
                onClick={() => handleQuickQuestion("Что нужно сдавать на ИИ-интервью?")}
                className="bg-white/5 border border-white/10 hover:border-[#E7C768] text-[9.5px] font-semibold text-slate-200 px-2 py-1 rounded hover:bg-white/10 transition"
              >
                🤖 Как пройти отбор?
              </button>
            </div>

            {/* Input action bar */}
            <div className="flex gap-2">
              <input
                type="text"
                className="w-full bg-[#17344F]/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#E7C768] transition"
                placeholder="Запросить подробности у консультанта..."
                value={userQuestion}
                onChange={(e) => setUserQuestion(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={isAiTyping || !userQuestion.trim()}
                className="cursor-pointer bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-white p-2.5 rounded-xl font-bold transition flex items-center justify-center disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>

          </div>

          <div className="bg-[#1D3E5E]/60 border border-white/10 p-4 rounded-3xl text-left space-y-1">
            <h4 className="text-[11px] font-bold text-[#E7C768] uppercase tracking-wide">Нужна помощь ИИ?</h4>
            <p className="text-[10.5px] text-slate-300 leading-normal">
              Напишите вопрос о любых нюансах компании во встроенный ИИ-чат. Робот проверит внутренние Wiki-регламенты и сразу предоставит регламентированный ответ.
            </p>
          </div>

        </aside>

      </main>

      {/* Candidate Registration / Apply Modal Dialog */}
      {showApplyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#1D3E5E] border-2 border-[#E7C768]/40 text-white rounded-3xl max-w-md w-full p-6 md:p-8 space-y-5 shadow-2xl relative text-left">
            
            <button
              onClick={() => setShowApplyModal(false)}
              className="absolute top-4 right-4 hover:bg-white/10 p-1.5 rounded-full text-slate-300 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center space-y-1">
              <h3 className="text-xl font-extrabold text-[#E7C768]">Регистрация на блиц-отбор</h3>
              <p className="text-xs text-slate-300">
                Заполните короткие контакты, чтобы запустить Робота-Рекрутера и войти в кабинет соискателя.
              </p>
            </div>

            <form onSubmit={handleApplyOnboarding} className="space-y-4">
              
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-200 block flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-slate-300" /> Ваше Имя и Фамилия:
                </label>
                <input
                  type="text"
                  required
                  className="w-full bg-[#17344F] text-sm p-2.5 rounded-xl border border-white/10 focus:outline-none focus:border-[#E7C768] text-white font-semibold"
                  placeholder="Иван Петров"
                  value={candName}
                  onChange={(e) => setCandName(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-200 block flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-slate-300" /> Контактный Email:
                </label>
                <input
                  type="email"
                  required
                  className="w-full bg-[#17344F] text-sm p-2.5 rounded-xl border border-white/10 focus:outline-none focus:border-[#E7C768] text-white font-semibold"
                  placeholder="name@gmail.com"
                  value={candEmail}
                  onChange={(e) => setCandEmail(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-200 block flex items-center gap-1">
                  <MessageSquare className="w-3.5 h-3.5 text-slate-300" /> Telegram Username (для оповещений):
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-sm text-slate-400 font-bold">@</span>
                  <input
                    type="text"
                    className="w-full bg-[#17344F] text-sm pl-7 pr-3 py-2.5 rounded-xl border border-white/10 focus:outline-none focus:border-[#E7C768] text-white font-semibold"
                    placeholder="t_username"
                    value={candTg}
                    onChange={(e) => setCandTg(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="cursor-pointer w-full bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-white font-bold py-3 rounded-xl hover:shadow-lg transition flex items-center justify-center gap-1.5 shadow mt-2"
              >
                {submitting ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" /> Авторизация...
                  </>
                ) : (
                  <>
                    Запустить Робота Рекрутера <ChevronRight className="w-4.5 h-4.5" />
                  </>
                )}
              </button>

            </form>

            <span className="text-[10px] block text-center text-slate-400 leading-normal italic">
              * Заполняя данные, вы соглашаетесь с обработкой персональных данных для проведения собеседования.
            </span>

          </div>
        </div>
      )}

      {/* Elegant Footer */}
      <footer className="border-t border-white/10 py-6 text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4">
          © {new Date().getFullYear()} Робот Рекрутер RR. Все права защищены.
        </div>
      </footer>

    </div>
  );
}
