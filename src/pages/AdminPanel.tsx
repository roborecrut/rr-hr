/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { useRouter } from "../components/RouterContext";
import Mascot from "../components/Mascot";
import TelegramMetrics from "./admin/TelegramMetrics";
import { JobProject, Candidate } from "../types";
import {
  Users,
  Briefcase,
  TrendingUp,
  CreditCard,
  Trash2,
  RefreshCw,
  PlusCircle,
  Cpu,
  Search,
  CheckCircle,
  LogOut,
  Calendar,
  Layers,
  Menu,
  X
} from "lucide-react";

interface PaymentLog {
  id: string;
  companyName: string;
  amount: number;
  itemType: string;
  itemName: string;
  status: string;
  createdAt: string;
}

export default function AdminPanel() {
  const { navigate } = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // States
  const [projects, setProjects] = useState<JobProject[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [payments, setPayments] = useState<PaymentLog[]>([]);
  const [aiStatus, setAiStatus] = useState({ active: true, model: "" });
  const [loading, setLoading] = useState(true);

  // Filters
  const [projectSearch, setProjectSearch] = useState("");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidateStageFilter, setCandidateStageFilter] = useState("all");

  // New Transaction Form State for interactive testing
  const [mockCompanyName, setMockCompanyName] = useState("ООО Рога и Копыта");
  const [mockTariffType, setMockTariffType] = useState<"interview" | "training" | "system_creation">("system_creation");
  const [successAnimation, setSuccessAnimation] = useState(false);

  const fetchAdminData = async () => {
    try {
      const resProj = await fetch("/api/projects");
      const dataProj = await resProj.json();
      setProjects(dataProj);

      const resCand = await fetch("/api/candidates");
      const dataCand = await resCand.json();
      setCandidates(dataCand);

      const resPay = await fetch("/api/admin/payments");
      const dataPay = await resPay.json();
      setPayments(dataPay || []);

      const resAi = await fetch("/api/ai-status");
      const dataAi = await resAi.json();
      setAiStatus(resAi.ok ? dataAi : { active: true, model: "Gemini 1.5 Flash" });
    } catch (err) {
      console.error("Error fetching admin dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
    const interval = setInterval(fetchAdminData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    localStorage.clear();
    navigate("/");
  };

  const handleDeleteCandidate = async (id: string) => {
    if (!window.confirm("Вы уверены, что хотите удалить этого соискателя из системы? Это удалит все связанные ИИ-оценки.")) return;
    try {
      const res = await fetch(`/api/admin/candidates/${id}`, { method: "DELETE" });
      if (res.ok) {
        setCandidates(prev => prev.filter(c => c.id !== id));
      }
    } catch (err) {
      console.error("Failed to delete candidate:", err);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (!window.confirm("Удаление проекта приведёт к каскадному удалению всех привязанных кандидатов в CRM. Продолжить?")) return;
    try {
      const res = await fetch(`/api/admin/projects/${id}`, { method: "DELETE" });
      if (res.ok) {
        setProjects(prev => prev.filter(p => p.id !== id));
        // Refetch to clean associated candidates
        fetchAdminData();
      }
    } catch (err) {
      console.error("Failed to delete project:", err);
    }
  };

  const handleCreateMockPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    let price = 100;
    let description = "1 ИИ-интервью соискателя";
    if (mockTariffType === "training") {
      price = 100;
      description = "1 ИИ-обучение соискателя";
    } else if (mockTariffType === "system_creation") {
      price = 1000;
      description = "Система найма и обучения по новой специальности";
    }

    try {
      const res = await fetch("/api/admin/pay-mock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: mockCompanyName,
          amount: price,
          itemType: mockTariffType,
          itemName: description
        })
      });

      if (res.ok) {
        const newPay = await res.json();
        setPayments(prev => [newPay, ...prev]);
        setSuccessAnimation(true);
        setTimeout(() => setSuccessAnimation(false), 3000);
      }
    } catch (err) {
      console.error("Error mocking transaction:", err);
    }
  };

  // Filtered queries
  const filteredProjects = projects.filter(p =>
    p.companyName.toLowerCase().includes(projectSearch.toLowerCase()) ||
    p.roleName.toLowerCase().includes(projectSearch.toLowerCase())
  );

  const filteredCandidates = candidates.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(candidateSearch.toLowerCase()) ||
                          c.roleName.toLowerCase().includes(candidateSearch.toLowerCase()) ||
                          c.email.toLowerCase().includes(candidateSearch.toLowerCase());
    const matchesStage = candidateStageFilter === "all" || c.currentStage === candidateStageFilter;
    return matchesSearch && matchesStage;
  });

  // Math metrics
  const totalRevenue = payments.reduce((acc, curr) => acc + curr.amount, 0);

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
                Панель Администратора
              </span>
              <span className="text-[10px] font-mono tracking-wider uppercase text-slate-300">Суперпользователь RR</span>
            </div>
          </div>

          <nav className="hidden md:flex items-center justify-center gap-2 md:gap-4 text-xs md:text-sm font-semibold">
            <button 
              id="nav_landing"
              onClick={() => navigate("/")} 
              className="transition px-3 py-2 rounded-xl text-slate-300 hover:text-white"
            >
              Главная
            </button>
            <button 
              id="nav_catalog"
              onClick={() => navigate("/vacancy")} 
              className="transition px-3 py-2 rounded-xl text-slate-300 hover:text-white"
            >
              Каталог
            </button>
            <button 
              id="nav_employer"
              onClick={() => navigate("/employer")} 
              className="transition px-3 py-2 rounded-xl text-slate-300 hover:text-white"
            >
              Работодатель 💼
            </button>
            <button 
              onClick={handleLogout}
              className="transition px-3 py-2 rounded-xl text-rose-300 hover:text-rose-100 flex items-center gap-1 bg-white/5 border border-white/10"
            >
              <LogOut className="w-3.5 h-3.5" /> Выйти
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
            <button 
              onClick={() => { navigate("/"); setMobileMenuOpen(false); }} 
              className="transition text-left w-full px-4 py-3 rounded-xl text-slate-300 hover:text-white hover:bg-white/5"
            >
              Главная
            </button>
            <button 
              onClick={() => { navigate("/vacancy"); setMobileMenuOpen(false); }} 
              className="transition text-left w-full px-4 py-3 rounded-xl text-slate-300 hover:text-white hover:bg-white/5"
            >
              Каталог
            </button>
            <button 
              onClick={() => { navigate("/employer"); setMobileMenuOpen(false); }} 
              className="transition text-left w-full px-4 py-3 rounded-xl text-slate-300 hover:text-white hover:bg-white/5"
            >
              Работодатель 💼
            </button>
            <button 
              onClick={() => { handleLogout(); setMobileMenuOpen(false); }} 
              className="transition text-left w-full px-4 py-3 rounded-xl text-rose-300 hover:text-rose-100 bg-white/5"
            >
              Выйти
            </button>
          </div>
        )}
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto py-8 px-4 md:px-8 w-full flex-1 space-y-8">
        
        {/* Statistics Widgets */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          <div className="bg-[#1D3E5E]/85 border border-white/15 rounded-2xl p-5 shadow-xl flex items-center justify-between">
            <div className="text-left space-y-1">
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wide">Работодатели (Проекты)</span>
              <h2 className="text-3xl font-extrabold text-[#E7C768] font-mono">{projects.length}</h2>
              <span className="text-[10px] block text-slate-400">Активных воронок найма</span>
            </div>
            <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400 border border-indigo-500/20">
              <Briefcase className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-[#1D3E5E]/85 border border-white/15 rounded-2xl p-5 shadow-xl flex items-center justify-between">
            <div className="text-left space-y-1">
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wide">Зарегистрировано соискателей</span>
              <h2 className="text-3xl font-extrabold text-sky-400 font-mono">{candidates.length}</h2>
              <span className="text-[10px] block text-slate-400">Проходят отбор / тесты</span>
            </div>
            <div className="w-12 h-12 bg-sky-500/10 rounded-xl flex items-center justify-center text-sky-400 border border-sky-500/20">
              <Users className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-[#1D3E5E]/85 border border-white/15 rounded-2xl p-5 shadow-xl flex items-center justify-between">
            <div className="text-left space-y-1">
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wide">Выручка системы (RUR)</span>
              <h2 className="text-3xl font-extrabold text-emerald-400 font-mono">{totalRevenue.toLocaleString()} ₽</h2>
              <span className="text-[10px] block text-slate-400">Собрано с тарифов на платформе</span>
            </div>
            <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400 border border-emerald-500/20">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-[#1D3E5E]/85 border border-white/15 rounded-2xl p-5 shadow-xl flex items-center justify-between">
            <div className="text-left space-y-1">
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wide">Статус серверов ИИ</span>
              <h2 className="text-sm font-bold text-emerald-300 flex items-center gap-1.5 mt-2">
                <Cpu className="w-4 h-4 text-[#E7C768]" /> Google Gemini
              </h2>
              <span className="text-[10px] block text-slate-400">Модель: 3.5 Flash (Активна)</span>
            </div>
            <div className="w-12 h-12 bg-[#E7C768]/10 rounded-xl flex items-center justify-center text-[#E7C768] border border-[#E7C768]/20">
              <CheckCircle className="w-6 h-6" />
            </div>
          </div>

        </div>

        {/* Dynamic Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Column A: Employers (Jobs) AND Candidates */}
          <div className="lg:col-span-8 space-y-8">
            
            {/* Project List */}
            <div className="bg-[#1D3E5E]/80 border border-white/15 rounded-3xl p-6 shadow-xl text-left space-y-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
                <div>
                  <h3 className="text-base font-bold text-[#E7C768] flex items-center gap-2">
                    <Layers className="w-5 h-5 text-indigo-400" /> Управление Работодателями и Проектами
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Управление вакансиями и реферальными лендингами компаний.
                  </p>
                </div>
                {/* Search */}
                <div className="relative flex items-center bg-[#17344F]/50 border border-white/15 px-3 py-1.5 rounded-xl">
                  <Search className="w-3.5 h-3.5 text-slate-400 mr-2" />
                  <input
                    type="text"
                    className="bg-transparent text-xs text-white focus:outline-none w-full sm:w-44"
                    placeholder="Поиск вакансий..."
                    value={projectSearch}
                    onChange={(e) => setProjectSearch(e.target.value)}
                  />
                </div>
              </div>

              {filteredProjects.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center font-bold">Активных проектов не найдено.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-slate-300 font-bold">
                        <th className="py-2.5 px-3">Компания</th>
                        <th className="py-2.5 px-3">Специальность (Роль)</th>
                        <th className="py-2.5 px-3">Условия / Оплата</th>
                        <th className="py-2.5 px-3 text-right">Действия</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-semibold text-slate-100">
                      {filteredProjects.map((p) => (
                        <tr key={p.id} className="hover:bg-white/5 transition">
                          <td className="py-3 px-3 text-white font-bold">{p.companyName}</td>
                          <td className="py-3 px-3">
                            <span className="text-[#E7C768]">{p.roleName}</span>
                            <span className="block text-[10px] text-slate-400 font-mono">ID: {p.id}</span>
                          </td>
                          <td className="py-3 px-3 text-slate-300 font-mono text-[11px]">{p.salaryTerms}</td>
                          <td className="py-3 px-3 text-right">
                            <button
                              onClick={() => handleDeleteProject(p.id)}
                              className="bg-rose-500/20 hover:bg-rose-500 border border-rose-500/30 text-rose-200 hover:text-white p-1.5 rounded-lg transition"
                              title="Удалить воронку"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Candidates Onboarding Grid */}
            <div className="bg-[#1D3E5E]/80 border border-white/15 rounded-3xl p-6 shadow-xl text-left space-y-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
                <div>
                  <h3 className="text-base font-bold text-[#E7C768] flex items-center gap-2">
                    <Users className="w-5 h-5 text-sky-400" /> База Соискателей на Платформе
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Мониторинг прохождения воронки, баллов и планов обучения.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex items-center bg-[#17344F]/50 border border-white/15 px-3 py-1 rounded-xl">
                    <Search className="w-3.5 h-3.5 text-slate-400 mr-2" />
                    <input
                      type="text"
                      className="bg-transparent text-xs text-white focus:outline-none w-32"
                      placeholder="Фильтр по ФИО..."
                      value={candidateSearch}
                      onChange={(e) => setCandidateSearch(e.target.value)}
                    />
                  </div>

                  <select
                    className="bg-[#17344F] text-xs text-white border border-white/15 px-2 py-1 rounded-xl"
                    value={candidateStageFilter}
                    onChange={(e) => setCandidateStageFilter(e.target.value)}
                  >
                    <option value="all">Все стадии</option>
                    <option value="terms">Ознакомление</option>
                    <option value="interview">Чат-Интервью</option>
                    <option value="scoring">Оценка баллов</option>
                    <option value="training">Обучение</option>
                    <option value="certified">Сдал 🎓</option>
                  </select>
                </div>
              </div>

              {filteredCandidates.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center font-bold">Соискатели не зарегистрированы.</p>
              ) : (
                <div className="space-y-3">
                  {filteredCandidates.map((c) => {
                    let badgeStyles = "bg-slate-700/50 text-slate-300";
                    if (c.currentStage === "terms") badgeStyles = "bg-blue-500/20 text-blue-300 border border-blue-500/30";
                    else if (c.currentStage === "interview") badgeStyles = "bg-amber-500/20 text-[#E7C768] border border-amber-500/30";
                    else if (c.currentStage === "scoring") badgeStyles = "bg-purple-500/20 text-purple-200 border border-purple-500/30";
                    else if (c.currentStage === "training") badgeStyles = "bg-indigo-500/20 text-indigo-200 border border-indigo-500/30";
                    else if (c.currentStage === "certified") badgeStyles = "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";

                    return (
                      <div key={c.id} className="bg-[#17344F]/40 border border-white/10 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-white/20 transition">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-sm">{c.name}</span>
                            <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-lg ${badgeStyles}`}>
                              {c.currentStage === "certified" ? "Сертифицирован 🎓" : c.currentStage}
                            </span>
                          </div>
                          <div className="text-xs text-slate-300">
                            Email: <strong className="text-white">{c.email}</strong> • Вакансия: <strong className="text-[#E7C768]">{c.roleName}</strong>
                          </div>
                          {c.scores && (
                            <div className="text-[11px] text-emerald-300 font-mono">
                              ИИ Балл: {c.scores.overallScore}/100 ({c.scores.assessmentSummary.substring(0, 80)}...)
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleDeleteCandidate(c.id)}
                            className="bg-rose-500/20 hover:bg-rose-500 border border-rose-500/30 text-rose-200 hover:text-white p-2 rounded-xl transition"
                            title="Удалить соискателя"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

          {/* Column B: Interactive Payments & Tariffs Simulator */}
          <div className="lg:col-span-4 space-y-8 text-left">
            
            {/* Interactive Tariff simulator */}
            <div className="bg-[#1D3E5E]/85 border border-white/15 rounded-3xl p-6 shadow-xl space-y-4">
              <div>
                <h3 className="text-[#E7C768] font-bold text-sm flex items-center gap-1.5">
                  <CreditCard className="w-4.5 h-4.5 text-emerald-400" /> Имитация Оплат & Спецификация Тарифов
                </h3>
                <p className="text-xs text-slate-200 mt-1">
                  Платформа взимает плату за использование ИИ-ресурсов по простой тарифной сетке:
                </p>
              </div>

              {/* Grid of basic rates */}
              <div className="grid grid-cols-1 gap-2.5 text-xs">
                <div className="p-2.5 bg-[#17344F]/60 rounded-xl border border-white/5 flex items-center justify-between">
                  <div className="text-left font-semibold">
                    <span className="text-[#E7C768] block">🔥 1 Собеседование</span>
                    <span className="text-[10px] text-slate-300">Полный ИИ чек-листа опрос</span>
                  </div>
                  <span className="text-emerald-400 font-bold font-mono text-sm">100 ₽</span>
                </div>

                <div className="p-2.5 bg-[#17344F]/60 rounded-xl border border-white/5 flex items-center justify-between">
                  <div className="text-left font-semibold">
                    <span className="text-[#E7C768] block">🎓 1 Курс Обучения</span>
                    <span className="text-[10px] text-slate-300">Индивидуальный план + квизы</span>
                  </div>
                  <span className="text-emerald-400 font-bold font-mono text-sm">100 ₽</span>
                </div>

                <div className="p-2.5 bg-[#17344F]/60 rounded-xl border border-white/5 flex items-center justify-between">
                  <div className="text-left font-semibold">
                    <span className="text-[#E7C768] block">🚀 Создание Системы</span>
                    <span className="text-[10px] text-slate-300">Генерация уроков для специальности</span>
                  </div>
                  <span className="text-emerald-400 font-bold font-mono text-sm">1,000 ₽</span>
                </div>
              </div>

              <div className="h-px bg-white/10 my-2"></div>

              {/* Form to submit mock payment */}
              <form onSubmit={handleCreateMockPayment} className="space-y-3 pt-1">
                <span className="text-[11px] font-bold uppercase text-slate-400 tracking-wider block">Тестовый Конфигуратор Заказа:</span>
                
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-300 block">Название компании заказчика:</label>
                  <input
                    type="text"
                    required
                    className="w-full bg-[#17344F]/60 text-xs text-white p-2 rounded-xl focus:outline-none focus:border-[#E7C768] border border-white/10"
                    value={mockCompanyName}
                    onChange={(e) => setMockCompanyName(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-300 block">Выбор услуги для симуляции:</label>
                  <select
                    className="w-full bg-[#17344F]/80 text-xs text-white p-2 rounded-xl focus:outline-none border border-white/10"
                    value={mockTariffType}
                    onChange={(e) => setMockTariffType(e.target.value as any)}
                  >
                    <option value="system_creation">Регламентированный робот (одна проф.) — 1000 руб</option>
                    <option value="interview">Проведение 1 интервью с соискателем — 100 руб</option>
                    <option value="training">Проведение 1 обучения & тестирования — 100 руб</option>
                  </select>
                </div>

                <button
                  type="submit"
                  className="w-full font-bold text-xs py-2 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl hover:shadow-lg transition flex items-center justify-center gap-1.5 shadow"
                >
                  <PlusCircle className="w-4 h-4 text-[#E7C768]" /> Сымитировать оплату
                </button>
              </form>

              {successAnimation && (
                <div className="text-xs bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 p-2.5 rounded-xl text-center font-bold transition">
                  ✅ Имитация платежа успешно отправлена! Статистика и доходы обновлены!
                </div>
              )}
            </div>

            {/* Payments list history */}
            <div className="bg-[#1D3E5E]/85 border border-white/15 rounded-3xl p-6 shadow-xl space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">Субсидии и транзакции</h4>
              
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {payments.length === 0 ? (
                  <p className="text-[10px] text-slate-400 py-4 font-semibold text-center">Истории транзакций нет.</p>
                ) : (
                  payments.map((p) => (
                    <div key={p.id} className="p-3 bg-[#17344F]/50 border border-white/10 rounded-xl space-y-1 hover:border-white/25 transition">
                      <div className="flex items-center justify-between text-xs">
                        <strong className="text-slate-200 block truncate max-w-[170px]">{p.companyName}</strong>
                        <span className="text-emerald-400 font-mono font-bold leading-none">{p.amount} ₽</span>
                      </div>
                      <p className="text-[10px] text-slate-300 font-medium leading-tight">{p.itemName}</p>
                      <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono mt-1 pt-1 border-t border-white/5">
                        <span>{new Date(p.createdAt).toLocaleDateString()} в {new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="text-emerald-300 font-bold bg-emerald-500/10 px-1 py-0.2 rounded">ОПЛАЧЕНО</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

        </div>

        {/* Telegram OIDC metrics */}
        <div className="max-w-7xl mx-auto px-4 mt-6">
          <TelegramMetrics />
        </div>

      </main>

      {/* Elegant Footer */}
      <footer className="border-t border-white/10 py-6 text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4">
          © {new Date().getFullYear()} Робот Рекрутер RR. Система администрирования тарифов и соискателей.
        </div>
      </footer>

    </div>
  );
}
