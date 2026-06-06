/**
 * Лендинг работодателя — Google-only регистрация, бонус 1000 RR (10 ед.),
 * три карточки услуг и калькулятор Робот vs HR.
 */
import { useState, useEffect } from "react";
import { useRouter } from "../components/RouterContext";
import Mascot from "../components/Mascot";
import AuthModal from "../components/AuthModal";
import HiringCalculator from "../components/HiringCalculator";
import EmployerAIAssistant from "../components/EmployerAIAssistant";
import { supabase } from "@/integrations/supabase/client";
import { resolveProfilePathForUser } from "@/lib/links";
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
            <img src="https://i.ibb.co/WWRbtPq0/RR-Logo.png" alt="RR Logo" className="w-10 h-10 object-contain" referrerPolicy="no-referrer" />
            <div className="flex flex-col text-left">
              <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-[#F4EE8E] to-[#E7C768] bg-clip-text text-transparent">Робот Рекрутер</span>
              <span className="text-[10px] font-mono tracking-wider uppercase text-slate-300">Автоматизация найма</span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-2 text-sm font-semibold">
            <button onClick={() => navigate("/")} className="px-3 py-2 rounded-xl text-[#E7C768] bg-white/10 border border-[#E7C768]/20">Главная</button>
            <button onClick={() => navigate("/vacancy")} className="px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10">Каталог</button>
            <button onClick={handleOpenCabinet} className="px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10">Кабинет</button>
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
            <button onClick={() => { navigate("/vacancy"); setMobileMenuOpen(false); }} className="text-left px-3 py-2 rounded-xl text-slate-200 hover:bg-white/10">Каталог</button>
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
      <section className="px-4 md:px-8 py-16 md:py-24 max-w-7xl mx-auto w-full">
        <div className="grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7 space-y-6">
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
                onClick={() => navigate("/vacancy")}
                className="cursor-pointer flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-sm px-6 py-4 rounded-xl transition"
              >
                Открыть каталог должностей <ArrowRight className="w-4 h-4 text-[#E7C768]" />
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 flex justify-center">
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
          </div>
        </div>
      </section>

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
            <span className="bg-[#E7C768]/15 text-[#E7C768] font-bold text-xs uppercase tracking-wider px-3.5 py-1.5 rounded-full border border-[#E7C768]/20">
              Сравнение с HR
            </span>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight">ИИ дешевле и быстрее живого HR</h2>
            <p className="text-gray-300 text-sm md:text-base max-w-2xl mx-auto">
              Выберите количество готовых сотрудников — мы покажем стоимость и время для двух сценариев.
            </p>
          </div>
          <HiringCalculator />
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 md:px-8 py-16 max-w-4xl mx-auto text-center space-y-6">
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
              <img src="https://i.ibb.co/WWRbtPq0/RR-Logo.png" alt="RR Logo" className="w-10 h-10 object-contain" referrerPolicy="no-referrer" />
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
      </footer>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} intent="employer" />
      <EmployerAIAssistant />
    </div>
  );
}