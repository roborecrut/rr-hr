/**
 * Лендинг работодателя — Google-only регистрация, бонус 1000 RR (10 ед.),
 * три карточки услуг и калькулятор Робот vs HR.
 */
import React, { useState, useEffect } from "react";
import RRImage from "@/components/RRImage";
import { useRouter } from "../components/RouterContext";
import Mascot from "../components/Mascot";
import AuthModal from "../components/AuthModal";
import HiringCalculator from "../components/HiringCalculator";
import EmployerAIAssistant from "../components/EmployerAIAssistant";
import ReviewsSection from "../components/ReviewsSection";
import Reveal from "../components/Reveal";
import { supabase } from "@/integrations/supabase/client";
import { resolveProfilePathForUser } from "@/lib/links";
import { MASCOT } from "@/lib/mascotImages";
import {
  Chrome,
  ArrowRight,
  Sparkles,
  Globe,
  MessageSquare,
  GraduationCap,
  Menu,
  X,
  Gift,
  LogOut,
  LayoutDashboard,
  Play,
  Briefcase,
  Search,
  Building2,
  Rocket,
  CheckCircle2,
  Zap,
  BookOpen,
} from "lucide-react";

export default function LandingPage() {
  const { navigate, path } = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(path === "/auth");
  const [authedUserId, setAuthedUserId] = useState<string | null>(null);
  const [profilePath, setProfilePath] = useState<string>("/");

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      setAuthedUserId(user?.id ?? null);
      if (user) {
        const p = await resolveProfilePathForUser(user.id);
        if (!cancelled) setProfilePath(p);
      } else {
        setProfilePath("/");
      }
    };
    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange(() => refresh());
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setAuthedUserId(null);
    setProfilePath("/");
  };
  const isAuthed = !!authedUserId;

  const handleOpenCabinet = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const target = await resolveProfilePathForUser(user.id);
        if (target && target !== "/") { navigate(target); return; }
      }
    } catch { /* ignore */ }
    setIsAuthModalOpen(true);
  };

  return (
    <div className="bg-gradient-to-b from-[#17344F] to-[#265582] min-h-screen text-white font-sans antialiased flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#17344F]/95 backdrop-blur-md border-b border-white/10 px-4 md:px-8 py-4">
        <div className="flex items-center justify-between gap-4 w-full max-w-7xl mx-auto">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate("/")}>
            <RRImage src="https://rjhtauzookkvlipvqpvr.supabase.co/storage/v1/object/public/Logos/RR-Logo.png" w={40} alt="RR Logo" className="w-10 h-10 object-contain" referrerPolicy="no-referrer" />
            <div className="flex flex-col text-left">
              <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-[#F4EE8E] to-[#E7C768] bg-clip-text text-transparent">Робот Рекрутер</span>
              <span className="text-[10px] font-mono tracking-wider uppercase text-slate-300">Автоматизация найма</span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-2 text-sm font-semibold">
            <button onClick={() => navigate("/")} className="px-3 py-2 rounded-xl text-[#E7C768] bg-white/10 border border-[#E7C768]/20">Главная</button>
            <button onClick={() => navigate("/vacancy")} className="px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 inline-flex items-center gap-1.5">
              <Briefcase className="w-4 h-4 text-[#E7C768]" /> Вакансии
            </button>
            <button onClick={() => navigate("/blog")} className="px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 inline-flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-[#E7C768]" /> Блог
            </button>
            <button onClick={() => navigate("/faq")} className="px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 inline-flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[#E7C768]" /> Вики
            </button>
            <button onClick={() => navigate("/demo")} className="px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10">Демо-интервью</button>
          </nav>

          {isAuthed ? (
            <div className="hidden md:flex items-center gap-2">
              <button onClick={() => navigate(profilePath)} className="inline-flex items-center gap-2 bg-[#E7C768] text-[#17344F] font-bold text-sm px-4 py-2 rounded-xl shadow-lg hover:-translate-y-0.5 transition">
                <LayoutDashboard className="w-4 h-4" /> Кабинет
              </button>
              <button onClick={handleLogout} className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-sm px-4 py-2 rounded-xl transition">
                <LogOut className="w-4 h-4" /> Выйти
              </button>
            </div>
          ) : (
            <button onClick={() => setIsAuthModalOpen(true)} className="hidden md:inline-flex items-center gap-2 bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-white font-bold text-sm px-4 py-2 rounded-xl shadow-lg hover:-translate-y-0.5 transition">
              <Chrome className="w-4 h-4" /> Войти через Google
            </button>
          )}

          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2">
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden mt-4 flex flex-col gap-2 border-t border-white/10 pt-4">
            <button onClick={() => { navigate("/"); setMobileMenuOpen(false); }} className="text-left px-3 py-2 rounded-xl text-slate-200 hover:bg-white/10">Главная</button>
            <button onClick={() => { navigate("/vacancy"); setMobileMenuOpen(false); }} className="text-left px-3 py-2 rounded-xl text-slate-200 hover:bg-white/10">Вакансии</button>
            <button onClick={() => { navigate("/blog"); setMobileMenuOpen(false); }} className="text-left px-3 py-2 rounded-xl text-slate-200 hover:bg-white/10">Блог</button>
            <button onClick={() => { navigate("/faq"); setMobileMenuOpen(false); }} className="text-left px-3 py-2 rounded-xl text-slate-200 hover:bg-white/10">Вики</button>
            <button onClick={() => { navigate("/demo"); setMobileMenuOpen(false); }} className="text-left px-3 py-2 rounded-xl text-slate-200 hover:bg-white/10">Демо-интервью</button>
            {isAuthed ? (
              <>
                <button onClick={() => { navigate(profilePath); setMobileMenuOpen(false); }} className="text-left px-3 py-2 rounded-xl bg-[#E7C768] text-[#17344F] font-bold">Кабинет</button>
                <button onClick={() => { handleLogout(); setMobileMenuOpen(false); }} className="text-left px-3 py-2 rounded-xl bg-white/10 border border-white/20 font-semibold">Выйти</button>
              </>
            ) : (
              <button onClick={() => { setIsAuthModalOpen(true); setMobileMenuOpen(false); }} className="text-left px-3 py-2 rounded-xl bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] font-bold">Войти через Google</button>
            )}
          </div>
        )}
      </header>

      {/* Hero */}
      <Reveal as="section" direction="fade" className="px-4 md:px-8 py-16 md:py-24 max-w-7xl mx-auto w-full">
        <div className="grid lg:grid-cols-12 gap-10 items-center">
          <Reveal direction="left" className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 bg-[#E7C768]/15 border border-[#E7C768]/30 rounded-full px-4 py-2">
              <Sparkles className="w-4 h-4 text-[#E7C768]" />
              <span className="text-xs font-semibold text-[#E7C768] uppercase tracking-wider">Сервис ИИ-Найма</span>
            </div>

            <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight">
              Робот Рекрутер заменяет{" "}
              <span className="bg-gradient-to-r from-[#F4EE8E] to-[#D99E41] bg-clip-text text-transparent">весь функционал HR</span>
            </h1>

            <p className="text-gray-200 text-base md:text-lg leading-relaxed max-w-2xl">
              Подключите кандидатов, проведите ИИ-собеседование, оцените и обучите — в пару кликов и без HR-отдела.
            </p>

            <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-2xl p-5 space-y-3 max-w-2xl">
              <div className="flex items-center gap-2 text-emerald-300 font-bold">
                <Gift className="w-5 h-5" />
                <span>+1000 RR в подарок при регистрации через Google</span>
              </div>
              <p className="text-sm text-slate-200 leading-relaxed">
                Этого хватит на полный AI-цикл найма в пару кликов:
              </p>
              <ul className="text-sm text-slate-200 space-y-1.5 pl-2">
                <li>🌐 <strong>ИИ-Лендинг вакансии</strong> — 500 RR (готовый сайт-визитка с умным чат-консультантом)</li>
                <li>⚙️ <strong>ИИ-Система Интервью</strong> — 200 RR (сценарии, скоринг, ситуативные тесты)</li>
                <li>🎓 <strong>ИИ-Система Обучения</strong> — 300 RR (индивидуальный симулятор онбординга)</li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              {isAuthed ? (
                <button
                  onClick={() => navigate(profilePath)}
                  className="cursor-pointer bg-[#E7C768] text-[#17344F] font-bold text-base px-6 py-4 rounded-xl shadow-xl hover:-translate-y-0.5 transition flex items-center justify-center gap-2"
                >
                  <LayoutDashboard className="w-5 h-5" /> Перейти в кабинет
                </button>
              ) : (
                <button
                  onClick={() => setIsAuthModalOpen(true)}
                  className="cursor-pointer bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-white font-bold text-base px-6 py-4 rounded-xl shadow-xl hover:-translate-y-0.5 transition flex items-center justify-center gap-2"
                >
                  <Chrome className="w-5 h-5" /> Войти через Google · +1000 RR
                </button>
              )}
              <button
                onClick={() => navigate("/demo")}
                className="cursor-pointer flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-sm px-6 py-4 rounded-xl transition"
              >
                <Play className="w-4 h-4 text-[#E7C768]" /> Пройти демо-интервью бесплатно
              </button>
            </div>
          </Reveal>

          <Reveal direction="right" delay={150} className="lg:col-span-5 flex justify-center">
            <div className="bg-[#1D3E5E]/80 rounded-3xl p-8 border border-white/15 w-full max-w-md shadow-2xl flex flex-col items-center">
              <Mascot state="greeting" size="lg" speechBubble="Привет! Я — Робот Рекрутер. Помогу нанять и обучить персонал за минуты!" />
              <div className="w-full h-px bg-white/10 my-6" />
              <div className="grid grid-cols-2 gap-4 w-full">
                <div className="bg-white/5 p-3 rounded-xl border border-white/10 text-center">
                  <div className="text-[#E7C768] font-bold text-xl">×{4} дешевле</div>
                  <div className="text-xs text-slate-300">чем живой HR</div>
                </div>
                <div className="bg-white/5 p-3 rounded-xl border border-white/10 text-center">
                  <div className="text-emerald-400 font-bold text-xl">×27 быстрее</div>
                  <div className="text-xs text-slate-300">по времени</div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </Reveal>

      {/* DEMO PROMO — главный CTA для всех посетителей */}
      <Reveal as="section" direction="up" className="px-4 md:px-8 py-16 border-y border-[#E7C768]/30 bg-gradient-to-br from-[#1D3E5E]/80 to-[#17344F]/50">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-10 items-center">
          <Reveal direction="left" className="space-y-5">
            <div className="inline-flex items-center gap-2 bg-emerald-500/15 border border-emerald-400/30 rounded-full px-3 py-1.5">
              <Play className="w-4 h-4 text-emerald-300" />
              <span className="text-[11px] font-bold text-emerald-200 uppercase tracking-wider">Без регистрации · бесплатно</span>
            </div>
            <h2 className="text-3xl md:text-5xl font-bold leading-tight">
              Сначала попробуй сам — <span className="bg-gradient-to-r from-[#F4EE8E] to-[#D99E41] bg-clip-text text-transparent">пройди ИИ-интервью</span>
            </h2>
            <p className="text-base text-slate-200">
              Выбери любую должность из каталога — ИИ за минуту сгенерирует под неё ролевую ситуацию, чек-лист и оценит твоё резюме.
              Так ты увидишь, как Робот Рекрутер работает с твоими будущими кандидатами.
            </p>
            <div className="grid grid-cols-3 gap-3">
              <DemoStepCard mascot={MASCOT.serious}  step="1" label="Ситуация"  hint="Ролевая сцена" />
              <DemoStepCard mascot={MASCOT.question} step="2" label="Чек-лист"  hint="Проверка знаний" />
              <DemoStepCard mascot={MASCOT.clock}    step="3" label="Резюме"    hint="Скрининг ИИ" />
            </div>
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={() => navigate("/demo")}
                className="cursor-pointer bg-gradient-to-r from-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-base px-6 py-4 rounded-xl shadow-xl hover:-translate-y-0.5 transition flex items-center justify-center gap-2"
              >
                <Play className="w-5 h-5" /> Запустить демо-интервью
              </button>
              <button
                onClick={() => document.getElementById("tariffs")?.scrollIntoView({ behavior: "smooth" })}
                className="bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-sm px-5 py-4 rounded-xl flex items-center justify-center gap-2"
              >
                Я работодатель — посмотреть сравнение <ArrowRight className="w-4 h-4 text-[#E7C768]" />
              </button>
            </div>
          </Reveal>
          <Reveal direction="right" delay={120} className="bg-[#17344F]/70 border border-white/10 rounded-3xl p-6 shadow-2xl space-y-3">
            <div className="text-xs uppercase font-mono font-bold text-[#E7C768]/80">Как это выглядит</div>
            <div className="bg-black/30 border border-white/10 rounded-xl p-4 text-sm text-slate-200 italic">
              «Клиент говорит: «У вас слишком дорого, у конкурентов дешевле на 15%». Что вы ответите?»
            </div>
            <div className="bg-black/30 border border-white/10 rounded-xl p-4 text-sm">
              <div className="text-[10px] font-bold text-[#E7C768] uppercase">Оценка ИИ</div>
              <div className="text-2xl font-extrabold text-emerald-300 mt-1">82/100</div>
              <div className="text-xs text-slate-300 mt-1">Чётко выстроен аргумент через ценность, не уходишь в скидку, удерживаешь позицию.</div>
            </div>
            <button onClick={() => navigate("/demo")} className="w-full bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-white font-bold text-sm py-3 rounded-xl shadow inline-flex items-center justify-center gap-2">
              <Play className="w-4 h-4" /> Попробовать с моей должностью
            </button>
          </Reveal>
        </div>
      </Reveal>

      {/* VACANCIES SHOWCASE — для соискателей и работодателей */}
      <Reveal
        as="section"
        direction="up"
        id="vacancies"
        aria-labelledby="vacancies-title"
        className="px-4 md:px-8 py-20 border-t border-white/10 bg-gradient-to-b from-[#17344F] to-[#1D3E5E]/60"
      >
        <div className="max-w-7xl mx-auto">
          <Reveal as="header" direction="down" className="text-center max-w-3xl mx-auto mb-12 space-y-4">
            <div className="inline-flex items-center gap-2 bg-emerald-500/15 border border-emerald-400/30 rounded-full px-3 py-1.5">
              <Sparkles className="w-4 h-4 text-emerald-300" />
              <span className="text-[11px] font-bold text-emerald-200 uppercase tracking-wider">Новое · Каталог вакансий открыт всем</span>
            </div>
            <h2 id="vacancies-title" className="text-3xl md:text-5xl font-bold leading-tight">
              Найти работу через ИИ —{" "}
              <span className="bg-gradient-to-r from-[#F4EE8E] to-[#D99E41] bg-clip-text text-transparent">бесплатно и без HR</span>
            </h2>
            <p className="text-slate-200 text-base md:text-lg">
              Каталог всех активных вакансий со всех компаний платформы. Откликайтесь и проходите ИИ-собеседование напрямую — без рекрутёров,
              без анкет «расскажите о себе» и без многонедельных ожиданий. А работодатели видят, как должна выглядеть современная система найма,
              на живых примерах — и собирают такую же за 5 минут вместе с нейросетью.
            </p>
          </Reveal>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Соискателю */}
            <Reveal as="article" direction="left" className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-900/40 via-[#1D3E5E]/60 to-[#17344F]/40 border border-emerald-400/20 p-7 md:p-9 flex flex-col gap-5 shadow-2xl">
              <div className="flex items-start gap-5">
                <img
                  src={MASCOT.shine}
                  alt="Робот Рекрутер радуется — кандидат нашёл работу через ИИ"
                  width={120}
                  height={120}
                  loading="lazy"
                  decoding="async"
                  className="w-24 h-24 md:w-32 md:h-32 object-contain drop-shadow-2xl flex-shrink-0"
                />
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 bg-emerald-500/20 border border-emerald-400/30 rounded-full px-3 py-1">
                    <Search className="w-3.5 h-3.5 text-emerald-300" />
                    <span className="text-[10px] font-bold text-emerald-200 uppercase tracking-wider">Для соискателей</span>
                  </div>
                  <h3 className="text-2xl md:text-3xl font-bold text-white leading-tight">
                    Откликайся за минуту и проходи интервью с ИИ
                  </h3>
                </div>
              </div>
              <ul className="space-y-2.5 text-sm md:text-base text-slate-100">
                <li className="flex items-start gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-300 flex-shrink-0 mt-0.5" /> Все активные вакансии всех компаний в одном каталоге</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-300 flex-shrink-0 mt-0.5" /> Умный поиск по должности, отрасли, окладу и графику</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-300 flex-shrink-0 mt-0.5" /> ИИ оценивает резюме, диалог и ситуативные кейсы — без живого HR</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-300 flex-shrink-0 mt-0.5" /> Ответ от работодателя — в тот же день, не через две недели</li>
              </ul>
              <div className="flex flex-col sm:flex-row gap-3 mt-auto pt-2">
                <button
                  onClick={() => navigate("/vacancy")}
                  className="cursor-pointer inline-flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-400 to-emerald-500 text-[#0a2018] font-bold text-base px-6 py-4 rounded-xl shadow-xl hover:-translate-y-0.5 transition"
                >
                  <Briefcase className="w-5 h-5" /> Каталог вакансий
                </button>
                <button
                  onClick={() => navigate("/demo")}
                  className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-sm px-5 py-4 rounded-xl transition"
                >
                  <Play className="w-4 h-4 text-[#E7C768]" /> Сначала демо-интервью
                </button>
              </div>
            </Reveal>

            {/* Работодателю */}
            <Reveal as="article" direction="right" delay={120} className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#E7C768]/15 via-[#1D3E5E]/60 to-[#17344F]/40 border border-[#E7C768]/30 p-7 md:p-9 flex flex-col gap-5 shadow-2xl">
              <div className="flex items-start gap-5">
                <img
                  src={MASCOT.success}
                  alt="Робот Рекрутер показывает готовую систему найма для работодателя"
                  width={120}
                  height={120}
                  loading="lazy"
                  decoding="async"
                  className="w-24 h-24 md:w-32 md:h-32 object-contain drop-shadow-2xl flex-shrink-0"
                />
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 bg-[#E7C768]/20 border border-[#E7C768]/40 rounded-full px-3 py-1">
                    <Building2 className="w-3.5 h-3.5 text-[#E7C768]" />
                    <span className="text-[10px] font-bold text-[#E7C768] uppercase tracking-wider">Для работодателей</span>
                  </div>
                  <h3 className="text-2xl md:text-3xl font-bold text-white leading-tight">
                    Посмотри живые примеры — и собери такую же за 5 минут
                  </h3>
                </div>
              </div>
              <ul className="space-y-2.5 text-sm md:text-base text-slate-100">
                <li className="flex items-start gap-2"><CheckCircle2 className="w-5 h-5 text-[#E7C768] flex-shrink-0 mt-0.5" /> Готовые лендинги вакансий: дизайн, чат-консультант, описания, условия</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-5 h-5 text-[#E7C768] flex-shrink-0 mt-0.5" /> Сценарии ИИ-интервью со скорингом и ситуативными кейсами под отрасль</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-5 h-5 text-[#E7C768] flex-shrink-0 mt-0.5" /> Системы онбординга и обучения с тестами и тренажёрами</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-5 h-5 text-[#E7C768] flex-shrink-0 mt-0.5" /> Нет своей вакансии и материалов? RR соберёт всё с нуля — нужна только должность</li>
              </ul>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-white/5 border border-white/10 rounded-xl py-2">
                  <div className="text-[#E7C768] font-extrabold text-lg">5 мин</div>
                  <div className="text-[10px] text-slate-300 uppercase tracking-wider">на запуск</div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl py-2">
                  <div className="text-emerald-300 font-extrabold text-lg">0 ₽</div>
                  <div className="text-[10px] text-slate-300 uppercase tracking-wider">на старт</div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl py-2">
                  <div className="text-white font-extrabold text-lg">+1000 RR</div>
                  <div className="text-[10px] text-slate-300 uppercase tracking-wider">бонус</div>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 mt-auto pt-2">
                <button
                  onClick={() => navigate("/vacancy")}
                  className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-sm px-5 py-4 rounded-xl transition"
                >
                  <Briefcase className="w-4 h-4 text-[#E7C768]" /> Смотреть примеры
                </button>
                <button
                  onClick={isAuthed ? () => navigate(profilePath) : handleOpenCabinet}
                  className="cursor-pointer inline-flex items-center justify-center gap-2 bg-gradient-to-r from-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-base px-6 py-4 rounded-xl shadow-xl hover:-translate-y-0.5 transition"
                >
                  <Rocket className="w-5 h-5" /> Создать свою за 5 минут
                </button>
              </div>
              <p className="text-[11px] text-slate-300/80 flex items-center gap-1.5">
                <Zap className="w-3 h-3 text-[#E7C768]" /> Нейросеть сама напишет вакансию, чек-листы и материалы обучения
              </p>
            </Reveal>
          </div>
        </div>
      </Reveal>

      {/* 3 product cards */}
      <section className="px-4 md:px-8 py-16 max-w-7xl mx-auto w-full border-t border-white/10">
        <div className="text-center mb-12 space-y-2">
          <h2 className="text-3xl md:text-4xl font-bold">Полный AI-цикл найма</h2>
          <p className="text-slate-300 text-sm md:text-base">Три блока — настраиваются в пару кликов под вашу вакансию</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: Globe, title: "ИИ-Лендинг вакансии", price: "500 RR", desc: "Готовый сайт-визитка с умным чат-консультантом по вашей базе знаний. Поможет соискателю узнать всё о компании и принять решение." },
            { icon: MessageSquare, title: "ИИ-Система Интервью", price: "200 RR", desc: "Сценарии диалога с кандидатом, детальный скоринг и ситуативные тесты под вашу сферу." },
            { icon: GraduationCap, title: "ИИ-Система Обучения", price: "300 RR", desc: "Индивидуальный симулятор онбординга: профессиональное дообучение, обучение продукту и процессам." },
          ].map(({ icon: Icon, title, price, desc }) => (
            <div key={title} className="bg-[#1D3E5E]/60 rounded-2xl p-6 border border-white/10 hover:border-[#E7C768] transition flex flex-col gap-4">
              <div className="flex items-start justify-between">
                <div className="w-12 h-12 rounded-xl bg-[#E7C768]/15 flex items-center justify-center text-[#E7C768]">
                  <Icon className="w-6 h-6" />
                </div>
                <span className="bg-emerald-900/40 border border-emerald-500/30 text-emerald-300 text-xs font-mono font-bold px-2.5 py-1 rounded-full">{price}</span>
              </div>
              <h3 className="text-lg font-bold text-[#E7C768]">{title}</h3>
              <p className="text-sm text-slate-200 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Calculator */}
      <section className="px-4 md:px-8 py-16 bg-[#1D3E5E]/40 border-t border-b border-white/10" id="tariffs">
        <div className="max-w-5xl mx-auto space-y-8">
          <div className="text-center space-y-3">
            <p className="text-gray-300 text-sm md:text-base max-w-2xl mx-auto">
              Выберите количество готовых сотрудников — мы покажем стоимость и время для двух сценариев.
            </p>
          </div>
          <HiringCalculator />
        </div>
      </section>

      {/* Reviews */}
      <ReviewsSection />

      {/* CTA */}
      <section className="px-4 md:px-8 py-16 max-w-4xl mx-auto text-center space-y-6">
        <img
          src={MASCOT.megaphone} alt="Робот Рекрутер с рупором"
          width={160} height={160} loading="lazy" decoding="async"
          className="w-32 h-32 md:w-40 md:h-40 object-contain mx-auto drop-shadow-2xl"
        />
        <h2 className="text-3xl md:text-4xl font-bold">Готовы автоматизировать найм?</h2>
        {isAuthed ? (
          <>
            <p className="text-slate-300">Ваш кабинет открыт и готов к работе.</p>
            <button
              onClick={() => navigate(profilePath)}
              className="cursor-pointer inline-flex items-center gap-2 bg-[#E7C768] text-[#17344F] font-bold text-base px-8 py-4 rounded-xl shadow-xl hover:-translate-y-0.5 transition"
            >
              <LayoutDashboard className="w-5 h-5" /> Перейти в кабинет
            </button>
          </>
        ) : (
          <>
            <p className="text-slate-300">Регистрация через Google — 1 клик. Бонус +1000 RR уже на счёте.</p>
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="cursor-pointer inline-flex items-center gap-2 bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-white font-bold text-base px-8 py-4 rounded-xl shadow-xl hover:-translate-y-0.5 transition"
            >
              <Chrome className="w-5 h-5" /> Войти через Google
            </button>
          </>
        )}
      </section>

      {/* Footer */}
      <footer className="bg-[#17344F] text-white py-12 px-4 md:px-8 border-t-2 border-[#E7C768]">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 text-left">
          {/* Бренд */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <RRImage src="https://rjhtauzookkvlipvqpvr.supabase.co/storage/v1/object/public/Logos/RR-Logo.png" w={40} alt="RR Logo" className="w-10 h-10 object-contain" referrerPolicy="no-referrer" />
              <div className="font-bold text-sm text-[#E7C768]">
                © 2026 Робот Рекрутер RR
                <span className="text-xs text-slate-300 block font-normal">Безоговорочная роботизация подбора персонала</span>
              </div>
            </div>
          </div>

          {/* Реквизиты */}
          <div className="space-y-2 text-[11px] text-slate-300 leading-relaxed md:col-span-2">
            <h3 className="text-[10px] uppercase tracking-widest text-[#E7C768] font-mono font-black">Реквизиты</h3>
            <p className="font-bold text-white">ООО «РентРоп»</p>
            <p>Юридический адрес: 115191, г. Москва, пер. Духовской, д. 17, стр. 15, помещ. 11Н/2</p>
            <p>ОГРН: 1217700234157 · ИНН: 7726477438</p>
            <p>
              E-mail: <a href="mailto:info@arenda-ropa.com" className="text-[#E7C768] hover:underline">info@arenda-ropa.com</a> ·{" "}
              <a href="/offer" className="text-[#E7C768] hover:underline">Публичная оферта</a>
            </p>
            <p className="text-[10px] text-slate-400 pt-1">Принимаем к оплате: МИР · Visa · Mastercard · через Робокассу</p>
          </div>

          {/* Продукт компании РентРОП */}
          <div className="space-y-3">
            <h3 className="text-[10px] uppercase tracking-widest text-[#E7C768] font-mono font-black">Продукт компании</h3>
            <a
              href="https://rent-rop.com/?utm_source=hr-rr&utm_medium=footer&utm_campaign=hr-rr"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-gradient-to-r from-[#E7C768] to-[#D99E41] text-[#17344F] font-black text-xs px-5 py-3 rounded-xl shadow hover:brightness-110 transition"
            >
              Продукт компании РентРОП
            </a>
            <a
              href="https://rent-rop.com/?utm_source=hr-rr&utm_medium=footer&utm_campaign=hr-rr"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-[11px] text-slate-300 hover:text-[#E7C768] underline underline-offset-2 break-all"
            >
              rent-rop.com
            </a>
          </div>
        </div>

        <div className="mt-8 flex justify-center">
          <a
            href="https://t.me/+Qr9hu55w7tEwNjZi"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#229ED9] hover:bg-[#1C8BC2] text-white font-bold text-sm px-5 py-3 rounded-xl shadow transition"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0Zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.062 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.831-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635Z" />
            </svg>
            Чат техподдержки
          </a>
        </div>
      </footer>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} intent="employer" />
      <EmployerAIAssistant />
    </div>
  );
}

function DemoStepCard({ mascot, step, label, hint }: { mascot: string; step: string; label: string; hint?: string }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center flex flex-col items-center gap-1">
      <img
        src={mascot} alt={label}
        width={80} height={80} loading="lazy" decoding="async"
        className="w-16 h-16 md:w-20 md:h-20 object-contain drop-shadow"
      />
      <div className="text-[10px] uppercase font-bold text-slate-400 mt-1">Шаг {step}</div>
      <div className="text-xs font-bold text-white">{label}</div>
      {hint && <div className="text-[10px] text-slate-400">{hint}</div>}
    </div>
  );
}
