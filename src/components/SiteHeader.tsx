/**
 * Единый хеддер сайта (главная, вакансии, блог, вики, демо).
 * Полная копия шапки из LandingPage — логотип, навигация, кнопка авторизации,
 * мобильное меню. Активный пункт подсвечивается по `useLocation().pathname`.
 */
import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import RRImage from "@/components/RRImage";
import AuthModal from "@/components/AuthModal";
import { useRouter } from "@/components/RouterContext";
import { supabase } from "@/integrations/supabase/client";
import { resolveProfilePathForUser } from "@/lib/links";
import {
  Chrome,
  Sparkles,
  Menu,
  X,
  LogOut,
  LayoutDashboard,
  Briefcase,
  BookOpen,
  Home,
  Video,
} from "lucide-react";

type Props = {
  /** Текущая активная страница для подсветки навигации. Если не передано — определяется по pathname. */
  active?: "home" | "vacancy" | "blog" | "faq" | "demo";
};

export default function SiteHeader({ active }: Props) {
  const { navigate } = useRouter();
  const { pathname } = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
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

  const current: NonNullable<Props["active"]> =
    active ??
    (pathname === "/" ? "home"
      : pathname.startsWith("/vacancy") ? "vacancy"
      : pathname.startsWith("/blog") ? "blog"
      : pathname.startsWith("/faq") ? "faq"
      : pathname.startsWith("/demo") ? "demo"
      : "home");

  const navBtn = (key: NonNullable<Props["active"]>, label: React.ReactNode, to: string) => {
    const isActive = current === key;
    return (
      <button
        onClick={() => navigate(to)}
        aria-current={isActive ? "page" : undefined}
        className={
          isActive
            ? "relative px-2.5 lg:px-3 py-2 rounded-xl text-[#F4EE8E] bg-white/15 border border-[#E7C768]/60 ring-1 ring-[#E7C768]/40 shadow-md shadow-[#E7C768]/10 inline-flex items-center gap-1.5 font-bold after:content-[''] after:absolute after:left-3 after:right-3 after:-bottom-1 after:h-0.5 after:rounded-full after:bg-gradient-to-r after:from-[#F4D679] after:to-[#E7C768]"
            : "px-2.5 lg:px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 border border-transparent inline-flex items-center gap-1.5 transition"
        }
      >
        {label}
      </button>
    );
  };

  return (
    <>
      <header className="sticky top-0 z-50 bg-[#17344F]/95 backdrop-blur-md border-b border-white/10 px-4 md:px-8 py-4">
        <div className="flex items-center justify-between gap-4 w-full max-w-7xl mx-auto">
          <div
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => navigate("/")}
            role="link"
            tabIndex={0}
            aria-label="На главную — Робот Рекрутер"
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigate("/"); }}
          >
            <RRImage
              src="https://rjhtauzookkvlipvqpvr.supabase.co/storage/v1/object/public/Logos/RR-Logo.png"
              w={40}
              alt="Логотип Робот Рекрутер"
              className="w-10 h-10 object-contain"
              referrerPolicy="no-referrer"
            />
            <div className="flex flex-col text-left">
              <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-[#F4EE8E] to-[#E7C768] bg-clip-text text-transparent">Робот Рекрутер</span>
              <span className="text-[10px] font-mono tracking-wider uppercase text-slate-300">Автоматизация найма</span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-1 lg:gap-2 text-sm font-semibold">
            {navBtn("home",    (<><Home      className="w-4 h-4 text-[#E7C768]" /><span className="hidden lg:inline">Главная</span></>), "/")}
            {navBtn("vacancy", (<><Briefcase className="w-4 h-4 text-[#E7C768]" /><span className="hidden lg:inline">Вакансии</span></>), "/vacancy")}
            {navBtn("blog",    (<><BookOpen  className="w-4 h-4 text-[#E7C768]" /><span className="hidden lg:inline">Блог</span></>), "/blog")}
            {navBtn("faq",     (<><Sparkles  className="w-4 h-4 text-[#E7C768]" /><span className="hidden lg:inline">Вики</span></>), "/faq")}
            {navBtn("demo",    (<><Video     className="w-4 h-4 text-[#E7C768]" /><span className="hidden lg:inline">Демо-интервью</span></>), "/demo")}
          </nav>

          {isAuthed ? (
            <div className="hidden md:flex items-center gap-2">
              <button onClick={() => navigate(profilePath)} aria-label="Кабинет" className="inline-flex items-center gap-2 bg-[#E7C768] text-[#17344F] font-bold text-sm px-3 lg:px-4 py-2 rounded-xl shadow-lg hover:-translate-y-0.5 transition">
                <LayoutDashboard className="w-4 h-4" /> <span className="hidden lg:inline">Кабинет</span>
              </button>
              <button onClick={handleLogout} aria-label="Выйти" className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-sm px-3 lg:px-4 py-2 rounded-xl transition">
                <LogOut className="w-4 h-4" /> <span className="hidden lg:inline">Выйти</span>
              </button>
            </div>
          ) : (
            <button onClick={() => setIsAuthModalOpen(true)} aria-label="Войти через Google" className="hidden md:inline-flex items-center gap-2 bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-white font-bold text-sm px-3 lg:px-4 py-2 rounded-xl shadow-lg hover:-translate-y-0.5 transition">
              <Chrome className="w-4 h-4" /> <span className="hidden lg:inline">Войти через Google</span>
            </button>
          )}

          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2" aria-label={mobileMenuOpen ? "Закрыть меню" : "Открыть меню"} aria-expanded={mobileMenuOpen}>
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden mt-4 flex flex-col gap-2 border-t border-white/10 pt-4 max-w-7xl mx-auto">
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

      {isAuthModalOpen && (
        <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} intent="employer" />
      )}
    </>
  );
}