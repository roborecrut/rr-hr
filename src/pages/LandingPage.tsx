/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { useRouter } from "../components/RouterContext";
import Mascot from "../components/Mascot";
import { BASIC_SPECIALTIES } from "../types";
import AuthModal from "../components/AuthModal";
import EmployerAIAssistant from "../components/EmployerAIAssistant";
import { supabase } from "@/integrations/supabase/client";
import { resolveProfilePathForUser } from "@/lib/links";
import { 
  Users, 
  Award, 
  Cpu, 
  MessageSquare, 
  BookOpen, 
  TrendingUp, 
  Briefcase, 
  Search, 
  ArrowRight,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Layers,
  Heart,
  Menu,
  X,
  Send,
  Chrome
} from "lucide-react";

export default function LandingPage() {
  const { navigate, path } = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // "Личный кабинет RR" — если юзер уже залогинен, ведём в его реальный кабинет.
  const handleOpenCabinet = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const target = await resolveProfilePathForUser(user.id);
        if (target && target !== "/") {
          navigate(target);
          return;
        }
      }
    } catch {/* fall through to modal */}
    setIsAuthModalOpen(true);
  };

  // States for Interactive Tariff Calculator
  const [interviewsCount, setInterviewsCount] = useState(5);
  const [trainingsCount, setTrainingsCount] = useState(5);
  const [landingsCount, setLandingsCount] = useState(1);
  const [interviewSystemsCount, setInterviewSystemsCount] = useState(1);
  const [trainingSystemsCount, setTrainingSystemsCount] = useState(1);
  const [showOrderSuccess, setShowOrderSuccess] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(path === "/auth");

  return (
    <div className="bg-gradient-to-b from-[#17344F] to-[#265582] min-h-screen text-white font-sans antialiased selection:bg-[#E7C768] selection:text-[#1A1A1A] flex flex-col justify-between">
      
      {/* Top Header Navigation with Direct Access Bypasses */}
      <header className="sticky top-0 z-50 bg-[#17344F]/95 backdrop-blur-md border-b border-white/10 px-4 md:px-8 py-4">
        <div className="flex items-center justify-between gap-4 w-full">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate("/")}>
            <img 
              src="https://i.ibb.co/WWRbtPq0/RR-Logo.png" 
              alt="RR Робот Рекрутер Logo" 
              className="w-10 h-10 object-contain drop-shadow" 
              referrerPolicy="no-referrer"
            />
            <div className="flex flex-col text-left">
              <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-[#F4EE8E] to-[#E7C768] bg-clip-text text-transparent">
                Робот Рекрутер
              </span>
              <span className="text-[10px] font-mono tracking-wider uppercase text-slate-300">Автоматизация найма</span>
            </div>
          </div>

          {/* Global Multi-Page Navigation accessible without login */}
          <nav className="hidden md:flex items-center justify-center gap-2 md:gap-4 text-xs md:text-sm font-semibold">
            <button 
              id="nav_landing"
              onClick={() => navigate("/main")} 
              className="transition px-3 py-2 rounded-xl text-[#E7C768] bg-white/10 border border-[#E7C768]/20"
            >
              Главная
            </button>
            <button 
              id="nav_catalog"
              onClick={() => navigate("/vacancy")} 
              className="transition px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10"
            >
              Каталог Профессий
            </button>
          </nav>

          <div className="hidden md:block">
            <button 
              id="btn_login"
              onClick={handleOpenCabinet}
              className="cursor-pointer bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-white text-xs md:text-sm font-bold px-4 py-2.5 rounded-xl hover:shadow-lg transition-transform active:scale-95 duration-100"
            >
              Личный кабинет RR
            </button>
          </div>

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
            <button 
              id="mobile_nav_landing"
              onClick={() => {
                navigate("/main");
                setMobileMenuOpen(false);
              }} 
              className="transition text-left w-full px-4 py-3 rounded-xl text-[#E7C768] bg-white/10 border border-[#E7C768]/20"
            >
              Главная
            </button>
            <button 
              id="mobile_nav_catalog"
              onClick={() => {
                navigate("/vacancy");
                setMobileMenuOpen(false);
              }} 
              className="transition text-left w-full px-4 py-3 rounded-xl text-slate-300 hover:text-white hover:bg-white/5"
            >
              Каталог Профессий
            </button>
            <div className="h-px bg-white/10 my-1"></div>
            <button 
              id="mobile_btn_login"
              onClick={() => {
                setMobileMenuOpen(false);
                handleOpenCabinet();
              }}
              className="w-full bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-white font-bold py-3 rounded-xl text-center shadow-lg transition"
            >
              Личный кабинет RR
            </button>
          </div>
        )}
      </header>

      {/* Hero Visual Banner Section */}
      <section className="relative py-16 px-4 md:px-8 overflow-hidden border-b border-white/10">
        <div className="absolute top-1/2 left-0 w-96 h-96 bg-[#E7C768]/10 blur-3xl rounded-full translate-y-[-50%] pointer-events-none"></div>
        <div className="absolute top-10 right-0 w-[500px] h-[500px] bg-sky-500/5 blur-3xl rounded-full pointer-events-none"></div>

        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative z-10">
          
          <div className="lg:col-span-7 flex flex-col gap-6 text-left">
            <div className="inline-flex items-center gap-2 bg-[#E7C768]/10 border border-[#E7C768]/20 px-3 py-1.5 rounded-full w-max">
              <Cpu className="w-4 h-4 text-[#E7C768]" />
              <span className="text-xs font-semibold text-[#E7C768] uppercase tracking-wider">
                Сервис ИИ Найма
              </span>
            </div>

            <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight">
              Робот Рекрутер заменяет{" "}
              <span className="bg-gradient-to-r from-[#F4EE8E] to-[#D99E41] bg-clip-text text-transparent">
                весь функционал HR
              </span>
            </h1>

            <p className="text-gray-200 text-base md:text-lg leading-relaxed max-w-2xl">
              Интеллектуальная RPA платформа, которая мгновенно подключает кандидатов, презентует условия вашей компании, проводит жесткий чек-лист опрос и интерактивную ролевую игру. В конце ИИ составляет персональный план быстрого обучения, тестирует знания и выдает сертификат готовности к работе.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 mt-2">
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="cursor-pointer bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-white font-bold text-base px-6 py-4 rounded-xl text-center shadow-xl hover:shadow-orange-700/20 hover:-translate-y-0.5 active:translate-y-0 transition duration-150"
              >
                Создать систему онбординга бесплатно
              </button>
              
              <button
                onClick={() => navigate("/vacancy")}
                className="cursor-pointer flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-sm px-6 py-4 rounded-xl transition duration-150"
              >
                Открыть каталог должностей <ArrowRight className="w-4 h-4 text-[#E7C768]" />
              </button>
            </div>
          </div>

          {/* Right side: Mascot visual box formatted in new theme */}
          <div className="lg:col-span-5 flex justify-center">
            <div className="bg-[#1D3E5E]/80 rounded-3xl p-8 border border-white/15 w-full max-w-md shadow-2xl flex flex-col items-center text-white">
              <Mascot state="greeting" size="lg" speechBubble="Привет! Я Робот Рекрутер. Помогу нанять и обучить персонал за 15 минут!" />
              <div className="w-full h-px bg-white/10 my-6"></div>
              
              <div className="grid grid-cols-2 gap-4 w-full">
                <div className="bg-white/5 p-3 rounded-xl border border-white/10 text-center">
                  <div className="text-[#E7C768] font-bold text-lg md:text-xl">94%</div>
                  <div className="text-xs text-slate-300">Автоматизация рутины</div>
                </div>
                <div className="bg-white/5 p-3 rounded-xl border border-white/10 text-center">
                  <div className="text-emerald-400 font-bold text-lg md:text-xl">0 руб</div>
                  <div className="text-xs text-slate-300">Стоимость за резюме</div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* Core HR Replacement Sequence Section */}
      <section id="features" className="py-20 px-4 md:px-8 max-w-7xl mx-auto border-b border-white/10">
        <div className="text-center mb-16 flex flex-col items-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white">
            Как RR полностью замещает традиционный HR-отдел
          </h2>
          <div className="w-16 h-1.5 bg-[#E7C768] rounded-full mt-4"></div>
          <p className="text-slate-300 mt-4 max-w-2xl text-sm md:text-base">
            Робот автоматически ведет соискателя шаг за шагом: от первого знакомства до получения диплома о квалификации.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          
          {/* Step 1 */}
          <div className="bg-[#1D3E5E]/60 rounded-2xl p-6 shadow-md border border-white/10 hover:border-[#E7C768] transition flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-[#E7C768] mb-4 border border-white/10">
              <TrendingUp className="w-6 h-6" />
            </div>
            <Mascot state="narrator" size="sm" />
            <h3 className="font-bold text-sm text-[#E7C768] mt-3">1. Продажа вакансии</h3>
            <p className="text-slate-200 text-xs mt-2 leading-relaxed">
              Детализирует KPI, график и мотивацию компании. Вызывает интерес и отсекает нецелевых.
            </p>
          </div>

          {/* Step 2 */}
          <div className="bg-[#1D3E5E]/60 rounded-2xl p-6 shadow-md border border-white/10 hover:border-[#E7C768] transition flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-[#E7C768] mb-4 border border-white/10">
              <MessageSquare className="w-6 h-6" />
            </div>
            <Mascot state="recruitment" size="sm" />
            <h3 className="font-bold text-sm text-[#E7C768] mt-3">2. Чек-лист и диалог</h3>
            <p className="text-slate-200 text-xs mt-2 leading-relaxed">
              Проводит опрос о квалификации по вашему регламенту и принимает на разбор резюме в PDF.
            </p>
          </div>

          {/* Step 3 */}
          <div className="bg-[#1D3E5E]/60 rounded-2xl p-6 shadow-md border border-white/10 hover:border-[#E7C768] transition flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-[#E7C768] mb-4 border border-white/10">
              <Cpu className="w-6 h-6" />
            </div>
            <Mascot state="chat" size="sm" />
            <h3 className="font-bold text-sm text-[#E7C768] mt-3">3. Ролевая игра</h3>
            <p className="text-slate-200 text-xs mt-2 leading-relaxed">
              Моделирует стрессовые и профессиональные кейсы для оценки поведения в реальном времени.
            </p>
          </div>

          {/* Step 4 */}
          <div className="bg-[#1D3E5E]/60 rounded-2xl p-6 shadow-md border border-white/10 hover:border-[#E7C768] transition flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-[#E7C768] mb-4 border border-white/10">
              <Users className="w-6 h-6" />
            </div>
            <Mascot state="serious" size="sm" />
            <h3 className="font-bold text-sm text-[#E7C768] mt-3">4. Оценка ИИ</h3>
            <p className="text-slate-200 text-xs mt-2 leading-relaxed">
              Ставит баллы соискателю, анализирует пробелы в знаниях и формирует учебную траекторию.
            </p>
          </div>

          {/* Step 5 */}
          <div className="bg-[#1D3E5E]/60 rounded-2xl p-6 shadow-md border border-white/10 hover:border-[#E7C768] transition flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-[#E7C768] mb-4 border border-white/10">
              <Award className="w-6 h-6" />
            </div>
            <img src="https://i.ibb.co/WWRbtPq0/RR-Logo.png" alt="Diploma logo" className="w-10 h-10 object-contain my-3" />
            <h3 className="font-bold text-sm text-[#E7C768] mt-3">5. Индивидуальный Курс</h3>
            <p className="text-slate-200 text-xs mt-2 leading-relaxed">
              3 обучающих блока: Проф, Продукт, Процессы. По итогу — Диплом RR.
            </p>
          </div>

        </div>
      </section>

      {/* Specialties Cloud Promotion Section pointing to /main */}
      <section className="bg-[#1D3E5E]/40 py-20 px-4 md:px-8 border-b border-white/10 text-white">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          <div className="lg:col-span-7 text-left space-y-6">
            <div className="inline-flex items-center gap-2 bg-[#E7C768]/15 border border-[#E7C768]/30 px-3.5 py-1.5 rounded-full">
              <Sparkles className="w-4 h-4 text-[#E7C768]" />
              <span className="text-xs font-bold text-[#E7C768] uppercase tracking-wider">Глобальный ИИ Каталог</span>
            </div>

            <h2 className="text-3xl md:text-5xl font-bold leading-tight tracking-tight text-white">
              Готовые спецификации для абсолютно любой профессии
            </h2>

            <p className="text-slate-200 text-sm md:text-base leading-relaxed">
              Наш Робот Рекрутер уже обладает предустановленными базами знаний по всем ключевым должностям (продажи, разработка, логистика, маркетинг, бухгалтерия, менеджмент и юриспруденция). 
            </p>

            <div className="bg-[#17344F]/60 border border-white/10 p-5 rounded-3xl space-y-3">
              <div className="flex items-start gap-3">
                <span className="bg-[#E7C768] text-slate-900 rounded-full p-1 text-[10px] font-bold">✨</span>
                <div>
                  <h4 className="font-bold text-xs text-[#E7C768]">Укажите любую должность</h4>
                  <p className="text-[11px] text-slate-300 mt-0.5">В нашей системе ИИ генерирует персональный регламент тестирования и учебные блоки индивидуально под любой ваш поисковый запрос!</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 items-stretch">
              <button
                onClick={() => navigate("/vacancy")}
                className="cursor-pointer bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-white font-bold py-4 px-6 rounded-xl hover:opacity-95 active:scale-98 transition flex items-center justify-center gap-2 shadow-lg"
              >
                Открыть каталог должностей (all 70+) <ArrowRight className="w-5 h-5 text-[#E7C768]" />
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 bg-[#1D3E5E]/60 border border-white/10 rounded-3xl p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-sm text-[#E7C768]">Популярные Профессии в системе:</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white/5 border border-white/5 p-2 rounded-xl text-center">Менеджер по продажам</div>
              <div className="bg-white/5 border border-white/5 p-2 rounded-xl text-center">SMM-специалист</div>
              <div className="bg-white/5 border border-white/5 p-2 rounded-xl text-center">Технический писатель</div>
              <div className="bg-white/5 border border-white/5 p-2 rounded-xl text-center">Аналитик данных</div>
              <div className="bg-white/5 border border-white/5 p-2 rounded-xl text-center">Директор по маркетингу</div>
              <div className="bg-white/5 border border-white/5 p-2 rounded-xl text-center">Инженер ПТО</div>
            </div>
            <div className="text-center pt-2">
              <button 
                onClick={() => navigate("/vacancy")}
                className="text-xs text-[#E7C768] hover:underline flex items-center gap-1 mx-auto"
              >
                Посмотреть всю базу ролей <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

        </div>
      </section>

      {/* Welcome Bonus Packs Section */}
      <section id="welcome-bonus" className="py-20 px-4 md:px-8 max-w-7xl mx-auto">
        <div className="bg-[#1D3E5E]/40 border-2 border-white/10 rounded-3xl p-8 md:p-12 text-white relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#E7C768]/10 blur-3xl rounded-full pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/5 blur-3xl rounded-full pointer-events-none"></div>

          <div className="space-y-4 text-center max-w-3xl mx-auto mb-12 relative z-10">
            <span className="bg-gradient-to-r from-amber-400 to-[#E7C768] text-slate-950 font-black text-xs uppercase tracking-widest px-4 py-1.5 rounded-full border border-amber-300/30 inline-block shadow-md">
              🔥 Спецпредложение: Стартовый Капитал
            </span>
            <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
              Дарим <span className="bg-gradient-to-r from-[#F4EE8E] to-[#D99E41] bg-clip-text text-transparent">1000 RR</span> на счёт при регистрации!
            </h2>
            <p className="text-slate-200 text-sm md:text-base leading-relaxed">
              Мы верим в пользу автоматизации, поэтому даём каждому новому работодателю приветственный баланс. Начните нанимать лучших сотрудников моментально с готовыми роботизированными решениями от RR.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10 items-stretch">
            
            {/* Card 1: Telegram Register Bonus */}
            <div className="bg-[#17344F]/80 p-6 rounded-3xl border-2 border-[#E7C768]/40 hover:border-[#E7C768]/80 transition-all duration-300 flex flex-col justify-between shadow-lg relative overflow-hidden group">
              <div className="absolute top-0 right-0 bg-[#E7C768] text-[#17344F] text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider font-mono">
                Рекомендуем
              </div>
              
              <div className="space-y-5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-[#E7C768]/15 border border-[#E7C768]/30 text-[#E7C768] rounded-2xl flex items-center justify-center">
                    <Send className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base text-[#E7C768]">Регистрация через Telegram</h3>
                    <p className="text-[10px] text-slate-300">С моментальными уведомлениями о кандидатах</p>
                  </div>
                </div>

                <div className="bg-emerald-950/40 border border-emerald-500/20 rounded-2xl p-4 text-center">
                  <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">Прибавка к балансу</span>
                  <div className="text-3xl font-black text-emerald-300 font-mono mt-1">+1,000 RR на счёт</div>
                </div>

                <div className="space-y-2 text-xs text-slate-200 text-left">
                  <p className="font-semibold leading-relaxed">
                    Этого <strong className="text-[#E7C768]">полностью хватит</strong> на создание комплексной ИИ структуры найма в пару кликов:
                  </p>
                  <ul className="space-y-1.5 pl-1 text-[11px] list-disc list-inside text-slate-300 font-normal">
                    <li><strong className="text-white">ИИ Лендинг созданной вакансии (500 RR)</strong> — готовый сайт-визитка для соискателей с умным чат-консультантом.</li>
                    <li><strong className="text-white">ИИ Система Интервью (300 RR)</strong> — сценарии соискателя, детальный скоринг и ситуативные тесты под вашу сферу.</li>
                    <li><strong className="text-white">ИИ Система Обучения (200 RR)</strong> — индивидуальный симулятор онбординга.</li>
                  </ul>
                  <p className="text-[10.5px] text-slate-400 pt-2 border-t border-white/5 font-normal leading-relaxed">
                    * Регистрация через Телеграм активирует оповещения в личку для моментальной отправки отчетов по кандидам на ваш смартфон.
                  </p>
                </div>
              </div>

              <div className="pt-6">
                <button
                  type="button"
                  onClick={() => setIsAuthModalOpen(true)}
                  className="w-full bg-gradient-to-r from-amber-400 to-[#E7C768] group-hover:from-amber-300 group-hover:to-amber-400 text-slate-950 font-extrabold py-3.5 px-4 rounded-xl text-center text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md"
                >
                  Зарегистрироваться по Telegram
                </button>
              </div>

            </div>

            {/* Card 2: Google Register Bonus */}
            <div className="bg-[#17344F]/50 p-6 rounded-3xl border border-white/10 hover:border-white/25 transition-all duration-300 flex flex-col justify-between shadow-lg relative">
              
              <div className="space-y-5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/5 border border-white/10 text-white rounded-2xl flex items-center justify-center">
                    <Chrome className="w-6 h-6 text-[#D99E41]" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base text-white">Регистрация через Google</h3>
                    <p className="text-[10px] text-slate-300">Классический быстрый и безопасный вход</p>
                  </div>
                </div>

                <div className="bg-emerald-950/20 border border-emerald-500/10 rounded-2xl p-4 text-center">
                  <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">Прибавка к балансу</span>
                  <div className="text-3xl font-black text-emerald-300/80 font-mono mt-1">+1,000 RR на счёт</div>
                </div>

                <div className="space-y-2 text-xs text-slate-200 text-left">
                  <p className="font-semibold leading-relaxed">
                    Этого приветственного капитала <strong className="text-emerald-400">хватит для полноценной работы</strong> с кандидатами:
                  </p>
                  <ul className="space-y-1.5 pl-1 text-[11px] list-disc list-inside text-slate-300 font-normal">
                    <li><strong className="text-white">5 ИИ Собеседований (500 RR)</strong> с глубоким скорингом резюме, чек-листом навыков и ролевыми симуляциями на 3 ситуации.</li>
                    <li><strong className="text-white">5 ИИ Интерактивных Обучений (500 RR)</strong> кандидатов по вашим Wiki-регламентам с тестированием.</li>
                  </ul>
                  <p className="text-[10.5px] text-slate-400 pt-2 border-t border-white/5 font-normal leading-relaxed">
                    * Универсальный запуск без привязки к мессенджерам. Идеально подходит для мгновенного старта малого и среднего бизнеса.
                  </p>
                </div>
              </div>

              <div className="pt-6">
                <button
                  type="button"
                  onClick={() => setIsAuthModalOpen(true)}
                  className="w-full bg-white/5 hover:bg-white/10 text-white border border-white/15 font-bold py-3.5 px-4 rounded-xl text-center text-xs uppercase tracking-wider transition-all cursor-pointer"
                >
                  Зарегистрироваться по Google
                </button>
              </div>

            </div>

          </div>

        </div>
      </section>

      {/* Interactive Tariff Calculator & Interactive Order (Интерактивный заказ) Section */}
      <section className="py-20 px-4 md:px-8 bg-[#1D3E5E]/40 border-t border-b border-white/10 relative overflow-hidden" id="tariffs">
        <div className="absolute top-1/2 left-1/2 w-[600px] h-[600px] bg-sky-500/5 blur-3xl rounded-full translate-x-[-50%] translate-y-[-50%] pointer-events-none"></div>

        <div className="max-w-4xl mx-auto text-center space-y-12 relative z-10">
          
          <div className="space-y-3">
            <span className="bg-[#E7C768]/15 text-[#E7C768] font-bold text-xs uppercase tracking-wider px-3.5 py-1.5 rounded-full border border-[#E7C768]/20">
              Гибкие Тарифы Платформы
            </span>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-white">
              Интерактивный Расчёт Стоимости
            </h2>
            <p className="text-gray-300 text-sm md:text-base max-w-2xl mx-auto leading-relaxed">
              Платите только за реальные действия ИИ Робота-Рекрутера во внутренней валюте <strong className="text-[#E7C768]">RR</strong> без абонентской платы (расчетный курс: <strong className="text-emerald-400">1 RR = 1 рубль</strong>). Настройте и сымитируйте параметры вашего бюджета.
            </p>
          </div>

          {/* Pricing Configurator Box */}
          <div className="bg-[#1D3E5E]/85 border-2 border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl text-left grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
            
            {/* Left side: Range selectors & clickers */}
            <div className="md:col-span-7 space-y-6">
              
              {/* 1. ИИ Собеседование соискателя */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-200 flex items-center gap-1.5">
                    <span className="text-amber-400">🎙️</span> 1. ИИ Собеседование соискателя (100 RR / шт):
                  </span>
                  <span className="bg-[#E7C768]/10 text-[#E7C768] font-bold px-2 py-0.5 rounded-lg text-xs font-mono">{interviewsCount} шт</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  className="w-full accent-[#E7C768] cursor-pointer bg-white/10 h-1.5 rounded-lg appearance-none"
                  value={interviewsCount}
                  onChange={(e) => setInterviewsCount(Number(e.target.value))}
                />
                <span className="text-[10.5px] block text-slate-350 leading-relaxed">
                  <strong className="text-amber-400 font-semibold font-mono">Включает:</strong> ИИ Скрининг резюме + ИИ чек-лист по опыту и навыкам + ИИ ролевая игра с 3 ситуациями.
                </span>
              </div>

              {/* 2. Интерактивное ИИ Обучение соискателя */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs text-left">
                  <span className="font-bold text-slate-200 flex items-center gap-1.5">
                    <span className="text-[#E7C768]">🎓</span> 2. Интерактивное ИИ Обучение соискателя (100 RR / шт):
                  </span>
                  <span className="bg-[#E7C768]/10 text-[#E7C768] font-bold px-2 py-0.5 rounded-lg text-xs font-mono">{trainingsCount} шт</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  className="w-full accent-[#E7C768] cursor-pointer bg-white/10 h-1.5 rounded-lg appearance-none"
                  value={trainingsCount}
                  onChange={(e) => setTrainingsCount(Number(e.target.value))}
                />
                <span className="text-[10.5px] block text-slate-350 leading-relaxed font-normal">
                  <strong className="text-amber-400 font-semibold font-mono">Включает:</strong> Профессиональное ИИ дообучение после интервью + ИИ обучение продукту + ИИ обучение системе работы и условиям.
                </span>
              </div>

              {/* 3. ИИ Лендинг созданной вакансии */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-200 flex items-center gap-1.5">
                    <span className="text-amber-400">🌐</span> 3. ИИ Лендинг созданной вакансии (500 RR / шт):
                  </span>
                  <span className="bg-[#E7C768]/10 text-[#E7C768] font-bold px-2 py-0.5 rounded-lg text-xs font-mono">{landingsCount} шт</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setLandingsCount(Math.max(0, landingsCount - 1))}
                    className="w-9 h-9 bg-white/5 border border-white/15 hover:bg-white/10 rounded-xl font-bold flex items-center justify-center text-slate-200 transition"
                  >
                    -
                  </button>
                  <span className="text-base font-bold text-white w-12 text-center font-mono">{landingsCount}</span>
                  <button
                    type="button"
                    onClick={() => setLandingsCount(Math.min(20, landingsCount + 1))}
                    className="w-9 h-9 bg-white/5 border border-white/15 hover:bg-white/10 rounded-xl font-bold flex items-center justify-center text-slate-200 transition"
                  >
                    +
                  </button>
                </div>
                <span className="text-[10.5px] block text-slate-350 leading-relaxed font-normal">
                  <strong className="text-amber-400 font-semibold font-mono">Описание:</strong> Создание стильного внешнего мини-сайта для регистрации кандидатов с ИИ консультантом по базе знаний.
                </span>
              </div>

              {/* 4. ИИ Система Интервью */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-200 flex items-center gap-1.5">
                    <span className="text-amber-400">⚙️</span> 4. ИИ Система Интервью (300 RR / шт):
                  </span>
                  <span className="bg-[#E7C768]/10 text-[#E7C768] font-bold px-2 py-0.5 rounded-lg text-xs font-mono">{interviewSystemsCount} шт</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setInterviewSystemsCount(Math.max(0, interviewSystemsCount - 1))}
                    className="w-9 h-9 bg-white/5 border border-white/15 hover:bg-white/10 rounded-xl font-bold flex items-center justify-center text-slate-200 transition"
                  >
                    -
                  </button>
                  <span className="text-base font-bold text-white w-12 text-center font-mono">{interviewSystemsCount}</span>
                  <button
                    type="button"
                    onClick={() => setInterviewSystemsCount(Math.min(10, interviewSystemsCount + 1))}
                    className="w-9 h-9 bg-white/5 border border-white/15 hover:bg-white/10 rounded-xl font-bold flex items-center justify-center text-slate-200 transition"
                  >
                    +
                  </button>
                </div>
                <span className="text-[10.5px] block text-slate-350 leading-relaxed font-normal">
                  <strong className="text-amber-400 font-semibold font-mono">Описание:</strong> Генератор сценариев с тестами под вашу специальность и вакансию.
                </span>
              </div>

              {/* 5. ИИ Система Обучения */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-200 flex items-center gap-1.5">
                    <span className="text-amber-400">👁️‍🗨️</span> 5. ИИ Система Обучения (200 RR / шт):
                  </span>
                  <span className="bg-[#E7C768]/10 text-[#E7C768] font-bold px-2 py-0.5 rounded-lg text-xs font-mono">{trainingSystemsCount} шт</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setTrainingSystemsCount(Math.max(0, trainingSystemsCount - 1))}
                    className="w-9 h-9 bg-white/5 border border-white/15 hover:bg-white/10 rounded-xl font-bold flex items-center justify-center text-slate-200 transition"
                  >
                    -
                  </button>
                  <span className="text-base font-bold text-white w-12 text-center font-mono">{trainingSystemsCount}</span>
                  <button
                    type="button"
                    onClick={() => setTrainingSystemsCount(Math.min(10, trainingSystemsCount + 1))}
                    className="w-9 h-9 bg-white/5 border border-white/15 hover:bg-white/10 rounded-xl font-bold flex items-center justify-center text-slate-200 transition"
                  >
                    +
                  </button>
                </div>
                <span className="text-[10.5px] block text-slate-350 leading-relaxed font-normal">
                  <strong className="text-amber-400 font-semibold font-mono">Описание:</strong> ИИ создает Продвинутую тренажерную симуляцию для аттестаций новых сотрудников, переаттестаций текущих и быстрого онбординга.
                </span>
              </div>

            </div>

            {/* Right side: Live Receipt breakdown */}
            <div className="md:col-span-5 bg-[#17344F]/60 border border-white/10 p-6 rounded-2xl flex flex-col justify-between h-full space-y-4">
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wide text-[#E7C768] pb-2 border-b border-white/10">
                  Ваша ИИ-конфигурация
                </h4>
                
                <div className="space-y-2.5 text-xs text-slate-200 font-semibold">
                  <div className="flex justify-between items-center">
                    <span>Собеседования:</span>
                    <span className="font-mono text-white font-bold">{(interviewsCount * 100).toLocaleString()} RR</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Курсы Обучения:</span>
                    <span className="font-mono text-white font-bold">{(trainingsCount * 100).toLocaleString()} RR</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>ИИ Лендинги:</span>
                    <span className="font-mono text-white font-bold">{(landingsCount * 500).toLocaleString()} RR</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Системы Интервью:</span>
                    <span className="font-mono text-white font-bold">{(interviewSystemsCount * 300).toLocaleString()} RR</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Системы Обучения:</span>
                    <span className="font-mono text-white font-bold">{(trainingSystemsCount * 200).toLocaleString()} RR</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-white/10 text-left space-y-3">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold leading-none">Итоговая Стоимость:</span>
                <div className="text-3xl font-extrabold text-emerald-400 font-mono">
                  {(
                    interviewsCount * 100 + 
                    trainingsCount * 100 + 
                    landingsCount * 500 + 
                    interviewSystemsCount * 300 + 
                    trainingSystemsCount * 200
                  ).toLocaleString()} RR
                </div>

                <button
                  type="button"
                  onClick={() => setShowOrderSuccess(true)}
                  className="w-full bg-[#E7C768] hover:bg-[#F4EE8E] text-[#17344F] font-bold py-3.5 px-4 rounded-xl text-center text-sm shadow-xl transition-all hover:scale-102 flex items-center justify-center gap-2 cursor-pointer"
                >
                  🚀 Оформить Интерактивный Заказ
                </button>
              </div>

            </div>

          </div>

        </div>
      </section>

      {/* Success Order Trigger Dialog */}
      {showOrderSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-[#1D3E5E] border-2 border-[#E7C768]/40 text-white rounded-3xl max-w-md w-full p-6 md:p-8 space-y-4 shadow-2xl relative text-left">
            
            <button
              onClick={() => setShowOrderSuccess(false)}
              className="absolute top-4 right-4 hover:bg-white/10 p-1.5 rounded-full text-slate-300 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center flex flex-col items-center gap-3">
              <Mascot state="recruitment" size="md" />
              <h3 className="text-lg font-extrabold text-[#E7C768]">Заявка успешно имитирована!</h3>
              <p className="text-xs text-slate-200">
                Робот Рекрутер RR сформировал предварительные ИИ-выделения под ваш бюджет.
              </p>
            </div>

            <div className="bg-[#17344F]/60 p-4 rounded-xl border border-white/5 space-y-2 text-xs text-slate-300">
              <div className="flex justify-between font-bold text-white border-b border-white/10 pb-1.5 mb-1.5">
                <span>Услуга</span>
                <span>Насчитано</span>
              </div>
              <div className="flex justify-between">
                <span>ИИ Собеседования ({interviewsCount} шт.):</span>
                <span className="font-mono text-white font-bold">{interviewsCount * 100} RR</span>
              </div>
              <div className="flex justify-between">
                <span>ИИ Обучения ({trainingsCount} шт.):</span>
                <span className="font-mono text-white font-bold">{trainingsCount * 100} RR</span>
              </div>
              <div className="flex justify-between">
                <span>ИИ Лендинги ({landingsCount} шт.):</span>
                <span className="font-mono text-white font-bold">{landingsCount * 500} RR</span>
              </div>
              <div className="flex justify-between">
                <span>ИИ Системы Интервью ({interviewSystemsCount} шт.):</span>
                <span className="font-mono text-white font-bold">{interviewSystemsCount * 300} RR</span>
              </div>
              <div className="flex justify-between pb-1.5 mb-1.5 border-b border-white/5">
                <span>ИИ Системы Обучения ({trainingSystemsCount} шт.):</span>
                <span className="font-mono text-white font-bold">{trainingSystemsCount * 200} RR</span>
              </div>
              <div className="flex justify-between font-extrabold text-sm text-emerald-400">
                <span>Общая калькуляция:</span>
                <span className="font-mono">
                  {(
                    interviewsCount * 100 + 
                    trainingsCount * 100 + 
                    landingsCount * 500 + 
                    interviewSystemsCount * 300 + 
                    trainingSystemsCount * 200
                  ).toLocaleString()} RR
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowOrderSuccess(false);
                  navigate("/employer");
                }}
                className="w-full bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-white font-bold py-3 rounded-xl text-center text-sm shadow-md transition"
              >
                Создать онбординг прямо сейчас
              </button>
              <button
                type="button"
                onClick={() => setShowOrderSuccess(false)}
                className="w-full bg-white/5 border border-white/10 text-slate-300 py-3 rounded-xl text-center text-xs font-semibold hover:bg-white/10 hover:text-white"
              >
                Закрыть калькулятор
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Minimal footer — desktop only; mobile uses its own bottom navs in cabinets */}
      <footer className="hidden md:block bg-[#17344F] text-white py-10 px-4 md:px-8 border-t-2 border-[#E7C768]">
        <div className="max-w-7xl mx-auto flex items-center justify-center gap-3">
          <img
            src="https://i.ibb.co/WWRbtPq0/RR-Logo.png"
            alt="RR Logo"
            className="w-10 h-10 object-contain"
            referrerPolicy="no-referrer"
          />
          <div className="text-left font-bold text-sm text-[#E7C768]">
            © 2026 Робот Рекрутер RR
            <span className="text-xs text-slate-300 block font-normal">Безоговорочная роботизация подбора персонала</span>
          </div>
        </div>
      </footer>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      <EmployerAIAssistant />
    </div>
  );
}
