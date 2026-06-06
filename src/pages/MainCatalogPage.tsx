/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import RRImage from "@/components/RRImage";
import { useRouter } from "../components/RouterContext";
import Mascot from "../components/Mascot";
import { fetchJobTitles, upsertJobTitle } from "@/lib/jobTitles";
import AuthModal from "../components/AuthModal";
import { 
  Search, 
  Briefcase, 
  Plus, 
  ArrowRight, 
  Cpu, 
  Settings, 
  CheckCircle,
  Sparkles,
  ChevronRight,
  BookOpen,
  Award,
  Menu,
  X
} from "lucide-react";

export default function MainCatalogPage() {
  const { navigate, path } = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [customPosition, setCustomPosition] = useState("");
  const [allPositions, setAllPositions] = useState<string[]>([]);
  const [customSet, setCustomSet] = useState<Set<string>>(new Set());
  const [selectedSpecialty, setSelectedSpecialty] = useState("Менеджер по продажам");
  const [successMsg, setSuccessMsg] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Load shared catalog from the database (seeded with basic specialties).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await fetchJobTitles(true);
      if (cancelled) return;
      setAllPositions(rows.map((r) => r.title));
      const cs = new Set<string>();
      rows.forEach((r) => { if (!r.is_basic) cs.add(r.title); });
      setCustomSet(cs);
    })();
    return () => { cancelled = true; };
  }, []);

  // Filter based on search term
  const filteredPositions = allPositions.filter(pos =>
    pos.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddCustomPosition = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = customPosition.trim();
    if (!title) return;

    if (allPositions.some(p => p.toLowerCase() === title.toLowerCase())) {
      setSuccessMsg("Эта должность уже существует в каталоге!");
      setTimeout(() => setSuccessMsg(""), 3000);
      return;
    }

    const row = await upsertJobTitle(title);
    const canonical = row?.title || title;
    setAllPositions(prev => [canonical, ...prev.filter(p => p.toLowerCase() !== canonical.toLowerCase())]);
    setCustomSet(prev => new Set(prev).add(canonical));
    setSelectedSpecialty(canonical);
    setSuccessMsg(`🚀 Должность "${canonical}" успешно добавлена в каталог!`);
    setCustomPosition("");
    setTimeout(() => setSuccessMsg(""), 4000);
  };

  const handleConfigureRole = (roleName: string) => {
    // Fill into localStorage for setup form pre-fill in EmployerPanel
    localStorage.setItem("employer_setup_role_prefill", roleName);
    // Switch to employer panel active tab setup page directly!
    localStorage.setItem("employer_active_tab_intent", "setup");
    navigate("/employer");
  };

  return (
    <div className="bg-gradient-to-b from-[#17344F] to-[#265582] min-h-screen text-white font-sans antialiased selection:bg-[#E7C768] selection:text-[#1A1A1A] flex flex-col justify-between">
      
      {/* Top Header Navigation with Direct Access Bypasses */}
      <header className="sticky top-0 z-50 bg-[#17344F]/95 backdrop-blur-md border-b border-white/10 px-4 md:px-8 py-4">
        <div className="flex items-center justify-between gap-4 w-full">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate("/")}>
            <RRImage 
              src="https://rjhtauzookkvlipvqpvr.supabase.co/storage/v1/object/public/Logos/RR-Logo.png" 
              w={40}
              alt="RR Робот Рекрутер" 
              className="w-10 h-10 object-contain drop-shadow" 
              referrerPolicy="no-referrer"
            />
            <div className="flex flex-col text-left">
              <span className="text-xl font-bold tracking-tight text-[#E7C768]">
                Робот Рекрутер
              </span>
              <span className="text-[10px] font-mono tracking-wider uppercase text-slate-300">Каталог Профессий</span>
            </div>
          </div>

          {/* Global Multi-Page Quick Access Controls */}
          <nav className="hidden md:flex items-center justify-center gap-2 md:gap-4 text-xs md:text-sm font-semibold">
            <button 
              id="nav_landing"
              onClick={() => navigate("/main")} 
              className="transition px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10"
            >
              Главная
            </button>
            <button 
              id="nav_catalog"
              onClick={() => navigate("/vacancy")} 
              className="transition px-3 py-2 rounded-xl text-[#E7C768] bg-white/10 border border-[#E7C768]/20"
            >
              Каталог Профессий
            </button>
          </nav>

          <div className="hidden md:block">
            <button 
              onClick={() => setIsAuthModalOpen(true)}
              className="cursor-pointer bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-white text-xs md:text-sm font-bold px-4 py-2 rounded-xl hover:shadow-lg transition-transform active:scale-95 duration-100"
            >
              Войти / Регистрация 🔑
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
              className="transition text-left w-full px-4 py-3 rounded-xl text-slate-300 hover:text-white hover:bg-white/5"
            >
              Главная
            </button>
            <button 
              id="mobile_nav_catalog"
              onClick={() => {
                navigate("/vacancy");
                setMobileMenuOpen(false);
              }} 
              className="transition text-left w-full px-4 py-3 rounded-xl text-[#E7C768] bg-white/10 border border-[#E7C768]/20"
            >
              Каталог Профессий
            </button>
            <div className="h-px bg-white/10 my-1"></div>
            <button 
              id="mobile_btn_login"
              onClick={() => {
                setIsAuthModalOpen(true);
                setMobileMenuOpen(false);
              }}
              className="w-full bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-white font-bold py-3 rounded-xl text-center shadow-lg transition"
            >
              Войти / Регистрация 🔑
            </button>
          </div>
        )}
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto py-10 px-4 md:px-8 w-full flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Side: Dynamic Info & Add Position Form */}
        <aside className="lg:col-span-4 space-y-6">
          <div className="bg-[#1D3E5E]/85 border border-white/15 rounded-3xl p-6 shadow-xl space-y-4">
            <Mascot state="recruitment" size="md" className="mx-auto" />
            <div className="text-center">
              <h2 className="text-xl font-bold text-[#E7C768]">Спецификации Робота</h2>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                Робот Рекрутер мгновенно адаптируется под требования любого бизнеса. Выберите роль из каталога или добавьте абсолютно любую профессию!
              </p>
            </div>

            <div className="bg-white/5 rounded-2xl p-4 border border-white/10 text-xs text-slate-200 leading-normal space-y-1.5">
              <div className="flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span>ИИ строит ролевую игру кандидата</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span>Оценка резюме и ответов за 1 минуту</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span>3 учебных блока с тестированием</span>
              </div>
            </div>
          </div>

          {/* Form to add ANY custom position to system */}
          <div className="bg-gradient-to-br from-[#1E4468]/60 to-[#17344F]/60 border border-white/20 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-[#E7C768]">
              <Sparkles className="w-5 h-5" />
              <h3 className="font-bold text-sm">Указать свою должность</h3>
            </div>
            
            <p className="text-xs text-slate-300">
              Если нужной вам квалификации нет в списке, напишите её ниже. ИИ мгновенно подготовит индивидуальный скрипт оценки.
            </p>

            <form onSubmit={handleAddCustomPosition} className="space-y-3">
              <input
                type="text"
                placeholder="Например: HR-директор, Трафик-менеджер..."
                className="w-full bg-[#17344F]/50 text-white text-xs px-3 py-2.5 rounded-xl border border-white/10 focus:outline-none focus:border-[#E7C768] transition placeholder:text-gray-400"
                value={customPosition}
                onChange={(e) => setCustomPosition(e.target.value)}
              />
              <button
                type="submit"
                className="cursor-pointer w-full bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] hover:opacity-95 text-white font-bold py-2 px-4 rounded-xl text-xs flex items-center justify-center gap-1 transition"
              >
                <Plus className="w-3.5 h-3.5" /> Внедрить должность в ИИ
              </button>
            </form>

            {successMsg && (
              <div className="bg-emerald-500/25 border border-emerald-500/40 p-2.5 rounded-xl text-[11px] text-emerald-100 font-bold transition duration-300">
                {successMsg}
              </div>
            )}
          </div>

          {/* Current Selection Information Summary card */}
          <div className="bg-[#1D3E5E]/50 border border-white/10 rounded-2xl p-5 space-y-2">
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Текущий выбор:</div>
            <div className="font-bold text-base text-[#E7C768] flex items-center gap-2">
              <Briefcase className="w-4 h-4" />
              {selectedSpecialty}
            </div>
            <p className="text-xs text-slate-300 leading-normal">
              Благодаря встроенному умному движку, Робот сгенерирует план обучения, ролевые сценарии и оценочные листы для соискателя на должность <strong className="text-white">"{selectedSpecialty}"</strong>.
            </p>
            <button
              onClick={() => handleConfigureRole(selectedSpecialty)}
              className="mt-3 cursor-pointer w-full bg-white hover:bg-slate-100 text-[#17344F] font-bold py-2 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 transition shadow"
            >
              <Settings className="w-3.5 h-3.5 text-[#E54C00]" />
              Перейти к настройке вакансии ⚙️
            </button>
          </div>
        </aside>

        {/* Right Side: Comprehensive Specialties Directory */}
        <section className="lg:col-span-8 bg-[#1D3E5E]/40 border border-white/10 rounded-3xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-[#E7C768] flex items-center gap-2">
                <Briefcase className="w-6 h-6 text-[#E7C768]" />
                Полноценные Профессиональные Модели
              </h1>
              <p className="text-xs text-slate-300 mt-1">
                Все {allPositions.length} доступных специальностей с возможностью немедленной настройки и интеграции.
              </p>
            </div>
            
            <div className="bg-[#17344F] border border-white/10 px-3 py-1.5 rounded-full text-xs font-mono font-bold text-[#E7C768]">
              {filteredPositions.length} из {allPositions.length} ролей
            </div>
          </div>

          {/* Search bar inside positions */}
          <div className="relative">
            <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Введите название специальности (например: Бухгалтер, Директор, Разработчик, SMM...)"
              className="w-full bg-[#17344F]/60 text-sm text-white pl-10 pr-4 py-3 rounded-2xl border border-white/15 focus:outline-none focus:border-[#E7C768] transition"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <p className="text-xs text-slate-300">
            💡 Нажмите на любую специальность в каталоге, чтобы выбрать её, а затем кликните крупную кнопку <strong>"Настроить адаптацию"</strong> для немедленной корректировки скриптов в панели руководителя!
          </p>

          {/* Complete scrollable directory grid showing ALL items */}
          <div className="bg-[#17344F]/30 border border-white/5 rounded-2xl p-4">
            {filteredPositions.length === 0 ? (
              <div className="text-center py-10 space-y-2">
                <p className="text-sm text-slate-400">Специальность не найдена.</p>
                <button
                  type="button"
                  onClick={() => {
                    setCustomPosition(searchTerm);
                    setSearchTerm("");
                  }}
                  className="bg-white/10 hover:bg-white/20 text-[#E7C768] border border-[#E7C768]/30 px-4 py-1.5 rounded-xl text-xs font-semibold"
                >
                  Создать для "{searchTerm}"?
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-[460px] overflow-y-auto pr-2 custom-scrollbar">
                {filteredPositions.map((spec) => {
                  const isSelected = selectedSpecialty === spec;
                  const isCustom = customSet.has(spec);
                  return (
                    <div
                      key={spec}
                      onClick={() => setSelectedSpecialty(spec)}
                      className={`cursor-pointer p-3 rounded-xl transition duration-150 flex items-center justify-between text-left ${
                        isSelected
                          ? "bg-[#265582] border-2 border-[#E7C768] shadow-md shadow-[#E7C768]/5"
                          : "bg-[#1D3E5E]/60 hover:bg-[#1D3E5E]/80 border border-white/5"
                      }`}
                    >
                      <div className="truncate pr-1">
                        <span className="text-xs font-bold block truncate text-slate-100">{spec}</span>
                        <span className="text-[9px] block text-slate-400 font-mono mt-0.5">
                          {isCustom ? "✨ пользовательская" : "базовая модель"}
                        </span>
                      </div>
                      
                      {isSelected ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleConfigureRole(spec);
                          }}
                          title="Создать и настроить систему адаптации для этой должности"
                          className="bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-white p-1.5 rounded-lg hover:opacity-90 active:scale-90 transition"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white/5 p-4 rounded-2xl border border-white/10">
            <div className="text-left">
              <span className="text-xs font-bold text-[#E7C768] block">Вы выбрали специальность: "{selectedSpecialty}"</span>
              <span className="text-[11px] text-slate-300">Вы можете моментально смоделировать кабинет соискателя или отрегулировать вопросы в СРМ!</span>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => handleConfigureRole(selectedSpecialty)}
                className="cursor-pointer bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center gap-1 shadow-lg hover:scale-102 transition"
              >
                Начать найм {selectedSpecialty} <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer using requested gradient styling, no black */}
      <footer className="bg-[#17344F] border-t-2 border-[#E7C768] py-8 text-white text-center mt-12">
        <div className="max-w-7xl mx-auto px-4 md:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <RRImage 
              src="https://rjhtauzookkvlipvqpvr.supabase.co/storage/v1/object/public/Logos/RR-Logo.png" 
              w={32}
              alt="RR Logo" 
              className="w-8 h-8 object-contain" 
              referrerPolicy="no-referrer"
            />
            <span className="text-xs text-slate-300 font-bold">© 2026 Робот Рекрутер RR</span>
          </div>

          <div className="flex gap-4 text-xs text-slate-400">
            <span className="text-xs text-slate-400">Безоговорочная роботизация подбора персонала</span>
          </div>
        </div>
      </footer>
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} intent="candidate" />
    </div>
  );
}
