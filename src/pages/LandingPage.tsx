/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
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

  // Калькулятор: сколько готовых сотрудников нужно (прошли найм + обучение)
  const [hiresNeeded, setHiresNeeded] = useState(5);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(path === "/auth");

  // Цена за 1 интервью ИЛИ 1 обучение (RR) в зависимости от объёма
  const unitPrice = (qty: number): number => {
    if (qty >= 200) return 50;
    if (qty >= 50) return 100;
    if (qty >= 10) return 150;
    return 200;
  };
  // Воронка RR
  const N = Math.max(1, Math.min(50, hiresNeeded));
  const rrRegistered = N * 10;
  const rrInterviews = N * 6;
  const rrSuccess = +(N * 2.4).toFixed(1);
  const rrTrainings = N * 2;
  const rrPassed = N;
  const priceInterview = unitPrice(rrInterviews);
  const priceTraining = unitPrice(rrTrainings);
  const rrCost = rrInterviews * priceInterview + rrTrainings * priceTraining;
  const rrPerHire = Math.round(rrCost / N);
  const rrMinutes = rrRegistered + rrInterviews + Math.round(rrSuccess) + rrTrainings + rrPassed;
  // Воронка HR (часы)
  const hrInvited = N * 12;        // 3ч на N=5
  const hrInvitedH = +(hrInvited * 0.05).toFixed(1);
  const hrCame = N * 6;            // 30ч на N=5
  const hrCameH = hrCame * 1;
  const hrSuccess = +(N * 2.4).toFixed(1);
  const hrTrainings = N * 2;       // 10ч на N=5
  const hrTrainingsH = hrTrainings * 1;
  const hrPassed = N;              // 5ч на N=5
  const hrPassedH = hrPassed * 1;
  const hrHours = hrInvitedH + hrCameH + hrTrainingsH + hrPassedH;
  const hrSalary = 80000;
  const hrRate = hrSalary / 160;   // ₽/час
  const hrCost = Math.round(hrHours * hrRate);
  const hrPerHire = Math.round(hrCost / N);
  const fmt = (n: number) => n.toLocaleString("ru-RU");
  const costRatio = rrPerHire > 0 ? (hrPerHire / rrPerHire).toFixed(1) : "—";
  const timeRatio = rrMinutes > 0 ? Math.round((hrHours * 60) / rrMinutes) : 0;

  // Если пользователь уже залогинен и у него есть employer-профиль — сразу
  // открываем кабинет вместо показа лендинга с кнопкой "Регистрация".
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const target = await resolveProfilePathForUser(user.id);
        if (!cancelled && target && target.startsWith("/employer")) {
          navigate(target);
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
              🔥 Стартовый капитал — без абонентки
            </span>
            <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
              Дарим <span className="bg-gradient-to-r from-[#F4EE8E] to-[#D99E41] bg-clip-text text-transparent">500 RR</span> при Google-регистрации <br className="hidden md:block" />и ещё <span className="bg-gradient-to-r from-emerald-400 to-emerald-300 bg-clip-text text-transparent">+500 RR</span> за привязку Telegram
            </h2>
            <p className="text-slate-200 text-sm md:text-base leading-relaxed">
              За эти деньги получаете лендинг компании и вакансии с ИИ-продажником без ограничений по сроку, а после привязки Telegram — полную систему ИИ-найма и ИИ-обучения.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10 items-stretch">
            
            {/* Card 1: Google Register Bonus (primary) */}
            <div className="bg-[#17344F]/80 p-6 rounded-3xl border-2 border-[#E7C768]/40 hover:border-[#E7C768]/80 transition-all duration-300 flex flex-col justify-between shadow-lg relative overflow-hidden group">
              <div className="absolute top-0 right-0 bg-[#E7C768] text-[#17344F] text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider font-mono">
                Шаг 1
              </div>
              
              <div className="space-y-5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-[#E7C768]/15 border border-[#E7C768]/30 text-[#E7C768] rounded-2xl flex items-center justify-center">
                    <Chrome className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base text-[#E7C768]">Регистрация через Google</h3>
                    <p className="text-[10px] text-slate-300">Быстрый и безопасный вход в один клик</p>
                  </div>
                </div>

                <div className="bg-emerald-950/40 border border-emerald-500/20 rounded-2xl p-4 text-center">
                  <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">Прибавка к балансу</span>
                  <div className="text-3xl font-black text-emerald-300 font-mono mt-1">+500 RR на счёт</div>
                </div>

                <div className="space-y-2 text-xs text-slate-200 text-left">
                  <p className="font-semibold leading-relaxed">
                    Этого <strong className="text-[#E7C768]">хватит</strong>, чтобы запустить лендинг с ИИ-продавцом:
                  </p>
                  <ul className="space-y-1.5 pl-1 text-[11px] list-disc list-inside text-slate-300 font-normal">
                    <li><strong className="text-white">Лендинг компании и вакансии (500 RR)</strong> — без абонентки, на любой срок, с ИИ-продажником вакансии.</li>
                    <li><strong className="text-white">Заполняет ИИ</strong> — вы только проверяете и сохраняете.</li>
                  </ul>
                </div>
              </div>

              <div className="pt-6">
                <button
                  type="button"
                  onClick={() => setIsAuthModalOpen(true)}
                  className="w-full bg-gradient-to-r from-amber-400 to-[#E7C768] group-hover:from-amber-300 group-hover:to-amber-400 text-slate-950 font-extrabold py-3.5 px-4 rounded-xl text-center text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md"
                >
                  Зарегистрироваться через Google
                </button>
              </div>

            </div>

            {/* Card 2: Telegram link bonus (after registration) */}
            <div className="bg-[#17344F]/50 p-6 rounded-3xl border border-white/10 hover:border-white/25 transition-all duration-300 flex flex-col justify-between shadow-lg relative">
              <div className="absolute top-0 right-0 bg-emerald-500 text-slate-950 text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider font-mono">
                Шаг 2
              </div>

              <div className="space-y-5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/5 border border-white/10 text-white rounded-2xl flex items-center justify-center">
                    <Send className="w-6 h-6 text-[#D99E41]" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base text-white">Привязка Telegram</h3>
                    <p className="text-[10px] text-slate-300">Делается из личного кабинета одной кнопкой</p>
                  </div>
                </div>

                <div className="bg-emerald-950/20 border border-emerald-500/10 rounded-2xl p-4 text-center">
                  <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">Дополнительный бонус</span>
                  <div className="text-3xl font-black text-emerald-300/80 font-mono mt-1">+500 RR на счёт</div>
                </div>

                <div className="space-y-2 text-xs text-slate-200 text-left">
                  <p className="font-semibold leading-relaxed">
                    Хватит, чтобы создать ИИ-найм и ИИ-обучение под вакансию:
                  </p>
                  <ul className="space-y-1.5 pl-1 text-[11px] list-disc list-inside text-slate-300 font-normal">
                    <li><strong className="text-white">Система интервью (200 RR)</strong> — чек-листы, скоринг и ситуативные тесты.</li>
                    <li><strong className="text-white">Система обучения (300 RR)</strong> — индивидуальный симулятор онбординга.</li>
                  </ul>
                  <p className="text-[10.5px] text-slate-400 pt-2 border-t border-white/5 font-normal leading-relaxed">
                    * Telegram даёт мгновенные уведомления о кандидатах прямо в личку. Откройте t.me/RoboRecrutBot/app — авторизация автоматическая.
                  </p>
                </div>
              </div>

              <div className="pt-6">
                <a
                  href="https://t.me/RoboRecrutBot/app"
                  target="_blank"
                  rel="noreferrer"
                  className="block w-full bg-white/5 hover:bg-white/10 text-white border border-white/15 font-bold py-3.5 px-4 rounded-xl text-center text-xs uppercase tracking-wider transition-all cursor-pointer"
                >
                  Открыть RoboRecrut Mini App
                </a>
              </div>

            </div>

          </div>

        </div>
      </section>

      {/* HR vs RR Сравнительный Калькулятор */}
      <section className="py-20 px-4 md:px-8 bg-[#1D3E5E]/40 border-t border-b border-white/10 relative overflow-hidden" id="tariffs">
        <div className="absolute top-1/2 left-1/2 w-[600px] h-[600px] bg-sky-500/5 blur-3xl rounded-full translate-x-[-50%] translate-y-[-50%] pointer-events-none"></div>

        <div className="max-w-5xl mx-auto text-center space-y-10 relative z-10">

          <div className="space-y-3">
            <span className="bg-[#E7C768]/15 text-[#E7C768] font-bold text-xs uppercase tracking-wider px-3.5 py-1.5 rounded-full border border-[#E7C768]/20">
              Сравнительный Калькулятор
            </span>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-white">
              HR-отдел vs Робот&nbsp;Рекрутер
            </h2>
            <p className="text-gray-300 text-sm md:text-base max-w-2xl mx-auto leading-relaxed">
              Внутренняя валюта <strong className="text-[#E7C768]">RR</strong> (1&nbsp;RR&nbsp;=&nbsp;1&nbsp;₽). Сравните полную воронку найма: что делает HR вручную — RR делает за вас.
            </p>
          </div>

          {/* Калькулятор */}
          <div className="bg-[#1D3E5E]/85 border-2 border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl text-left space-y-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm font-bold text-slate-100">
                <span>🎯 Сколько готовых сотрудников нужно (прошли найм и обучение)</span>
                <span className="bg-[#E7C768]/10 text-[#E7C768] px-3 py-1 rounded-lg font-mono text-base">{N}</span>
              </div>
              <input type="range" min={1} max={50} step={1} value={hiresNeeded}
                onChange={(e) => setHiresNeeded(Number(e.target.value))}
                className="w-full accent-[#E7C768] cursor-pointer bg-white/10 h-1.5 rounded-lg appearance-none" />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>1</span><span>25</span><span>50</span>
              </div>
            </div>

            {/* Колонки RR vs HR */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
              {/* RR — слева */}
              <div className="bg-emerald-500/5 border-2 border-emerald-400/40 rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🤖</span>
                  <h3 className="text-lg font-bold text-emerald-200">Робот RR</h3>
                </div>
                <div className="space-y-2 text-xs text-slate-200">
                  <div className="flex justify-between gap-3"><span>Зарегистрировалось:</span>
                    <span className="font-mono text-white">{rrRegistered} <span className="text-slate-400">({rrRegistered} мин)</span></span></div>
                  <div className="flex justify-between gap-3"><span>Прошло интервью:</span>
                    <span className="font-mono text-white">{rrInterviews} = <b className="text-[#E7C768]">{fmt(rrInterviews * priceInterview)} RR</b> <span className="text-slate-400">({rrInterviews} мин)</span></span></div>
                  <div className="flex justify-between gap-3"><span>Успешно:</span>
                    <span className="font-mono text-white">{rrSuccess} <span className="text-slate-400">({Math.round(rrSuccess)} мин)</span></span></div>
                  <div className="flex justify-between gap-3"><span>Вышли на обучение:</span>
                    <span className="font-mono text-white">{rrTrainings} = <b className="text-[#E7C768]">{fmt(rrTrainings * priceTraining)} RR</b> <span className="text-slate-400">({rrTrainings} мин)</span></span></div>
                  <div className="flex justify-between gap-3"><span>Прошли обучение:</span>
                    <span className="font-mono text-white">{rrPassed} <span className="text-slate-400">({rrPassed} мин)</span></span></div>
                </div>
                <div className="pt-3 border-t border-emerald-400/20 space-y-1.5">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-slate-300">Итого:</span>
                    <span className="text-xl font-extrabold text-emerald-300 font-mono">{fmt(rrCost)} RR</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-300">
                    <span>За готового сотрудника:</span>
                    <span className="font-mono text-emerald-200 font-bold">{fmt(rrPerHire)} RR</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-300">
                    <span>Времени затрачено:</span>
                    <span className="font-mono text-emerald-200 font-bold">{rrMinutes} мин</span>
                  </div>
                </div>
              </div>

              {/* HR — справа */}
              <div className="bg-rose-500/5 border-2 border-rose-400/30 rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🧑‍💼</span>
                  <h3 className="text-lg font-bold text-rose-200">Человек HR</h3>
                </div>
                <div className="space-y-2 text-xs text-slate-200">
                  <div className="flex justify-between gap-3"><span>Пригласили на интервью:</span>
                    <span className="font-mono text-white">{hrInvited} <span className="text-slate-400">({hrInvitedH} ч)</span></span></div>
                  <div className="flex justify-between gap-3"><span>Пришло на интервью:</span>
                    <span className="font-mono text-white">{hrCame} <span className="text-slate-400">({hrCameH} ч)</span></span></div>
                  <div className="flex justify-between gap-3"><span>Успешно:</span>
                    <span className="font-mono text-white">{hrSuccess}</span></div>
                  <div className="flex justify-between gap-3"><span>Вышли на обучение:</span>
                    <span className="font-mono text-white">{hrTrainings} <span className="text-slate-400">({hrTrainingsH} ч)</span></span></div>
                  <div className="flex justify-between gap-3"><span>Прошли обучение:</span>
                    <span className="font-mono text-white">{hrPassed} <span className="text-slate-400">({hrPassedH} ч)</span></span></div>
                </div>
                <div className="pt-3 border-t border-rose-400/20 space-y-1.5">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-slate-300">Итого работы HR:</span>
                    <span className="text-xl font-extrabold text-rose-300 font-mono">{hrHours} ч</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-300">
                    <span>При зарплате 80&nbsp;000₽ / 160ч:</span>
                    <span className="font-mono text-rose-200 font-bold">{fmt(hrCost)} ₽</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-300">
                    <span>За готового сотрудника:</span>
                    <span className="font-mono text-rose-200 font-bold">{fmt(hrPerHire)} ₽</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Итог выгоды */}
            <div className="bg-gradient-to-r from-[#E7C768]/15 to-emerald-500/10 border-2 border-[#E7C768]/40 rounded-2xl p-5 text-center space-y-2">
              <div className="text-sm text-slate-200">
                {fmt(hrPerHire)}₽ / {fmt(rrPerHire)}RR = <b className="text-[#E7C768] text-lg">×{costRatio}</b> по деньгам
                <span className="mx-2 text-slate-500">·</span>
                {hrHours}×60 / {rrMinutes} = <b className="text-emerald-300 text-lg">×{timeRatio}</b> по времени
              </div>
              <div className="text-xl md:text-2xl font-extrabold text-white">
                В <span className="text-[#E7C768]">{costRatio}</span> раза дешевле и в <span className="text-emerald-300">{timeRatio}</span> раз производительнее
              </div>
              <button type="button" onClick={handleOpenCabinet}
                className="inline-flex mt-2 bg-[#E7C768] hover:bg-[#F4EE8E] text-[#17344F] font-bold py-3 px-6 rounded-xl text-sm shadow-xl transition-all hover:scale-[1.02]">
                🚀 Начать с +500&nbsp;RR в подарок
              </button>
            </div>

            {/* Тарифы — столбцом */}
            <div className="bg-[#17344F]/60 border border-white/10 rounded-2xl p-5 space-y-3">
              <div className="text-sm font-bold text-[#E7C768] text-center">
                Тарифы — цена за каждое интервью или обучение
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between bg-white/5 px-4 py-2.5 rounded-xl">
                  <span className="text-slate-300">1–9 шт</span>
                  <span className="font-mono font-bold text-white">200 RR</span>
                </div>
                <div className="flex justify-between bg-white/5 px-4 py-2.5 rounded-xl">
                  <span className="text-slate-300">10–49 шт</span>
                  <span className="font-mono font-bold text-white">150 RR</span>
                </div>
                <div className="flex justify-between bg-white/5 px-4 py-2.5 rounded-xl">
                  <span className="text-slate-300">50–199 шт</span>
                  <span className="font-mono font-bold text-white">100 RR</span>
                </div>
                <div className="flex justify-between bg-emerald-500/10 border border-emerald-400/30 px-4 py-2.5 rounded-xl">
                  <span className="text-emerald-200">200+ шт</span>
                  <span className="font-mono font-bold text-emerald-300">50 RR</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 text-center">
                1&nbsp;RR&nbsp;=&nbsp;1&nbsp;₽. Списание происходит при старте интервью или старте обучения. Лимиты задаются в настройках вакансии.
              </p>
            </div>
          </div>

        </div>
      </section>

      
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

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} intent="employer" />
      <EmployerAIAssistant />
    </div>
  );
}
