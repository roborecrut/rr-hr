/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Admin CRM. Sections: Clients (employers), Candidates, Companies, Vacancies,
 * Interviews, Trainings, Mailings, Roles, Accounts, AI.
 * Access: only users with role 'admin'.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import CandidateDetailsModal from "@/components/CandidateDetailsModal";
import {
  Search, ShieldCheck, LogOut, Loader2, RefreshCw, Users, Building2, Briefcase,
  MessageSquare, GraduationCap, Mail, KeyRound, Wallet, Sparkles, ArrowLeft,
  Plus, Minus, X,
} from "lucide-react";

type JobTitleRow = {
  id: string;
  title: string;
  title_norm: string;
  usage_count: number;
  is_basic: boolean;
  field_templates: Record<string, string>;
  created_at: string;
};

type SectionKey =
  | "clients" | "candidates" | "companies" | "vacancies"
  | "interviews" | "trainings" | "mailings" | "roles"
  | "accounts" | "ai";

const SECTIONS: { key: SectionKey; label: string; icon: any }[] = [
  { key: "clients",    label: "Клиенты",   icon: Users },
  { key: "candidates", label: "Кандидаты", icon: Users },
  { key: "companies",  label: "Компании",  icon: Building2 },
  { key: "vacancies",  label: "Вакансии",  icon: Briefcase },
  { key: "interviews", label: "Интервью",  icon: MessageSquare },
  { key: "trainings",  label: "Обучения",  icon: GraduationCap },
  { key: "mailings",   label: "Рассылки",  icon: Mail },
  { key: "roles",      label: "Роли",      icon: KeyRound },
  { key: "accounts",   label: "Счета",     icon: Wallet },
  { key: "ai",         label: "ИИ",        icon: Sparkles },
];

function classifyClient(c: any): { key: string; label: string; color: string } {
  if (c.has_topup && c.balance > 0) return { key: "paying",  label: "Платящий", color: "emerald" };
  if ((c.candidates_count || 0) > 0) return { key: "active",  label: "Активный", color: "sky" };
  if ((c.projects_count || 0) > 0)   return { key: "trial",   label: "В работе", color: "amber" };
  return { key: "new", label: "Новый", color: "slate" };
}

export default function AdminPanel() {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [section, setSection] = useState<SectionKey>("clients");
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Access gate
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setAuthChecked(true);
        setIsAdmin(false);
        return;
      }
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      setIsAdmin(!!data);
      setAuthChecked(true);
    })();
  }, []);

  // Auto-clear toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[#17344F] text-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#17344F] to-[#265582] text-white flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-[#1D3E5E]/85 border border-white/15 rounded-3xl p-8 text-center space-y-4 shadow-2xl">
          <ShieldCheck className="w-12 h-12 text-rose-400 mx-auto" />
          <h1 className="text-2xl font-bold text-[#E7C768]">Доступ запрещён</h1>
          <p className="text-sm text-slate-300">
            Эта страница доступна только администраторам. Войдите под административным аккаунтом.
          </p>
          <button
            onClick={() => navigate("/")}
            className="w-full py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 font-semibold transition"
          >
            На главную
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-b from-[#17344F] to-[#265582] min-h-screen text-white font-sans antialiased">
      <header className="sticky top-0 z-40 bg-[#17344F]/95 backdrop-blur-md border-b border-white/10 px-4 md:px-8 py-3">
        <div className="flex items-center justify-between gap-4 max-w-[1500px] mx-auto">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate("/")}>
            <img src="https://i.ibb.co/WWRbtPq0/RR-Logo.png" alt="RR" className="w-9 h-9 object-contain" referrerPolicy="no-referrer" />
            <div className="flex flex-col leading-tight">
              <span className="text-base font-bold text-[#E7C768]">Админ-панель</span>
              <span className="text-[10px] uppercase tracking-wider text-slate-300">CRM администратора</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/employer")}
              className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5 flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Кабинет
            </button>
            <button
              onClick={async () => { await supabase.auth.signOut(); navigate("/"); }}
              className="px-3 py-2 rounded-xl text-xs font-semibold text-rose-300 hover:text-rose-100 bg-white/5 border border-white/10 flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" /> Выйти
            </button>
          </div>
        </div>
      </header>

      {toast && (
        <div className={`fixed top-20 right-4 z-50 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-2xl border ${
          toast.kind === "ok"
            ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-100"
            : "bg-rose-500/20 border-rose-500/50 text-rose-100"
        }`}>
          {toast.text}
        </div>
      )}

      <main className="max-w-[1500px] mx-auto py-6 px-4 md:px-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <aside className="lg:col-span-2">
          <div className="bg-[#1D3E5E]/80 border border-white/10 rounded-3xl p-3 space-y-1 sticky top-20">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const active = section === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => setSection(s.key)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition ${
                    active ? "bg-[#E7C768]/15 text-[#E7C768] border border-[#E7C768]/40" : "text-slate-300 hover:bg-white/5"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" /> {s.label}
                </button>
              );
            })}
          </div>
        </aside>

        <section className="lg:col-span-10 space-y-4">
          {section === "clients"    && <ClientsSection setToast={setToast} />}
          {section === "candidates" && <CandidatesSection />}
          {section === "companies"  && <SimpleTable table="companies"   title="Компании" />}
          {section === "vacancies"  && <SimpleTable table="projects"    title="Вакансии" />}
          {section === "interviews" && <SimpleTable table="interviews"  title="Интервью" />}
          {section === "trainings"  && <SimpleTable table="candidate_training_progress" title="Прогресс обучения" />}
          {section === "mailings"   && <MailingsSection />}
          {section === "roles"      && <RolesSection setToast={setToast} />}
          {section === "accounts"   && <AccountsSection setToast={setToast} />}
          {section === "ai"         && <AISection />}
        </section>
      </main>
    </div>
  );
}

/* ============== Sections ============== */

function ClientsSection({ setToast }: { setToast: (t: any) => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_list_employers" as any);
    if (error) setToast({ kind: "err", text: error.message });
    else setRows((data as any[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => !q ||
      (r.name || "").toLowerCase().includes(q) ||
      (r.email || "").toLowerCase().includes(q) ||
      (r.public_id || "").toLowerCase().includes(q));
  }, [rows, search]);

  const COLS = [
    { key: "new", label: "Новые" },
    { key: "trial", label: "В работе" },
    { key: "active", label: "Активные" },
    { key: "paying", label: "Платящие" },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-[#1D3E5E]/80 border border-white/10 rounded-3xl p-4 flex flex-wrap items-center gap-3 justify-between">
        <h2 className="text-base font-bold text-[#E7C768]">Клиенты (работодатели) — {rows.length}</h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск..."
              className="bg-[#17344F]/60 text-xs text-white pl-8 pr-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-[#E7C768]" />
          </div>
          <div className="bg-black/25 p-1 rounded-xl border border-white/10 flex gap-1">
            <button onClick={() => setView("kanban")} className={`px-3 py-1 text-[11px] font-bold rounded-lg ${view === "kanban" ? "bg-[#1E4468] text-[#E7C768]" : "text-slate-300"}`}>Канбан</button>
            <button onClick={() => setView("table")}  className={`px-3 py-1 text-[11px] font-bold rounded-lg ${view === "table"  ? "bg-[#1E4468] text-[#E7C768]" : "text-slate-300"}`}>Таблица</button>
          </div>
          <button onClick={load} className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 border border-white/10 flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Обновить
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400 flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Загрузка...</div>
      ) : view === "kanban" ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {COLS.map((col) => {
            const items = filtered.filter((r) => classifyClient(r).key === col.key);
            return (
              <div key={col.key} className="bg-[#1D3E5E]/40 border border-white/5 rounded-2xl p-3 min-h-[300px]">
                <div className="flex items-center justify-between border-b border-white/5 pb-2 text-xs font-bold text-slate-300">
                  <span>{col.label}</span>
                  <span className="bg-black/30 font-mono px-2 py-0.5 rounded-full text-[10px] text-[#E7C768]">{items.length}</span>
                </div>
                <div className="space-y-2 mt-2">
                  {items.length === 0 ? <div className="text-center py-6 text-slate-500 text-[11px]">Пусто</div> : items.map((r) => (
                    <div key={r.id} className="bg-[#17344F]/85 border border-white/10 hover:border-[#E7C768] p-2.5 rounded-xl">
                      <div className="text-xs font-bold text-[#E7C768] truncate">{r.name || r.email || `Emp #${r.public_id}`}</div>
                      <div className="text-[10px] text-slate-300 truncate">{r.email}</div>
                      <div className="flex justify-between text-[10px] font-mono mt-1">
                        <span className="text-slate-400">Вакансий: {r.projects_count}</span>
                        <span className="text-[#E7C768] font-bold">{r.balance} RR</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-[#1D3E5E]/40 border border-white/10 rounded-3xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#17344F] text-[#E7C768] uppercase tracking-wider text-[10px] font-mono">
                <tr>
                  <th className="p-3">ID</th><th className="p-3">Имя / Email</th><th className="p-3">Контакты</th>
                  <th className="p-3">Вакансий</th><th className="p-3">Кандидатов</th>
                  <th className="p-3">Баланс RR</th><th className="p-3">Статус</th><th className="p-3">Создан</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((r) => {
                  const cls = classifyClient(r);
                  return (
                    <tr key={r.id} className="hover:bg-white/5">
                      <td className="p-3 font-mono text-slate-400">{r.public_id}</td>
                      <td className="p-3"><div className="font-bold">{r.name || "—"}</div><div className="text-[10px] text-slate-400">{r.email}</div></td>
                      <td className="p-3 text-[10px]">{r.contact_phone || "—"} {r.contact_telegram && `· ${r.contact_telegram}`}</td>
                      <td className="p-3 text-center">{r.projects_count}</td>
                      <td className="p-3 text-center">{r.candidates_count}</td>
                      <td className="p-3 text-center font-mono text-[#E7C768] font-bold">{r.balance}</td>
                      <td className="p-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded bg-${cls.color}-500/20 text-${cls.color}-300`}>{cls.label}</span></td>
                      <td className="p-3 text-[10px] text-slate-400">{r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function CandidatesSection() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<string>("all");
  const [selected, setSelected] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.rpc("admin_list_candidates" as any);
    setRows((data as any[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) =>
      (stage === "all" || r.crm_stage === stage) &&
      (!q || (r.email || "").toLowerCase().includes(q) || (r.role_name || "").toLowerCase().includes(q) || (r.company_name || "").toLowerCase().includes(q))
    );
  }, [rows, search, stage]);

  const STAGES = ["all", "registration", "screening", "checklist", "situations", "professional", "product", "systems", "certified"];

  return (
    <div className="space-y-4">
      <div className="bg-[#1D3E5E]/80 border border-white/10 rounded-3xl p-4 flex flex-wrap items-center gap-3 justify-between">
        <h2 className="text-base font-bold text-[#E7C768]">Кандидаты — {rows.length}</h2>
        <div className="flex items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск..."
            className="bg-[#17344F]/60 text-xs text-white px-3 py-2 rounded-xl border border-white/10" />
          <select value={stage} onChange={(e) => setStage(e.target.value)}
            className="bg-[#17344F]/60 text-xs text-white px-3 py-2 rounded-xl border border-white/10">
            {STAGES.map((s) => <option key={s} value={s} className="bg-slate-900">{s === "all" ? "Все этапы" : s}</option>)}
          </select>
        </div>
      </div>
      {loading ? (
        <div className="text-center py-12 text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline" /> Загрузка...</div>
      ) : (
        <div className="bg-[#1D3E5E]/40 border border-white/10 rounded-3xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#17344F] text-[#E7C768] uppercase tracking-wider text-[10px] font-mono">
                <tr><th className="p-3">ID</th><th className="p-3">Email</th><th className="p-3">Роль</th><th className="p-3">Компания</th><th className="p-3">Этап</th><th className="p-3">Балл</th><th className="p-3">Создан</th></tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-white/5 cursor-pointer" onClick={() => setSelected(r.id)}>
                    <td className="p-3 font-mono text-slate-400">{r.public_id}</td>
                    <td className="p-3">{r.email || "—"}</td>
                    <td className="p-3">{r.role_name || r.project_role || "—"}</td>
                    <td className="p-3">{r.company_name || "—"}</td>
                    <td className="p-3"><span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#E7C768]/15 text-[#E7C768]">{r.crm_stage}</span></td>
                    <td className="p-3 font-mono text-[#E7C768]">{r.overall_score ? Math.round(Number(r.overall_score)) : "—"}</td>
                    <td className="p-3 text-[10px] text-slate-400">{r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <CandidateDetailsModal candidateId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function SimpleTable({ table, title }: { table: string; title: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any).from(table).select("*").limit(500).order("created_at", { ascending: false });
      setRows(((data as any[]) || []));
      setLoading(false);
    })();
  }, [table]);
  const cols = rows[0] ? Object.keys(rows[0]).slice(0, 8) : [];
  return (
    <div className="space-y-3">
      <div className="bg-[#1D3E5E]/80 border border-white/10 rounded-3xl p-4 flex items-center justify-between">
        <h2 className="text-base font-bold text-[#E7C768]">{title} — {rows.length}</h2>
      </div>
      {loading ? (
        <div className="text-center py-12 text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline" /> Загрузка...</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-slate-400 bg-[#1D3E5E]/40 border border-white/10 rounded-3xl">Нет данных</div>
      ) : (
        <div className="bg-[#1D3E5E]/40 border border-white/10 rounded-3xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-[#17344F] text-[#E7C768] uppercase tracking-wider text-[10px] font-mono">
                <tr>{cols.map((c) => <th key={c} className="p-2.5">{c}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((r, i) => (
                  <tr key={r.id || i} className="hover:bg-white/5">
                    {cols.map((c) => {
                      const v = (r as any)[c];
                      const str = v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v).slice(0, 60) : String(v).slice(0, 80);
                      return <td key={c} className="p-2.5 align-top">{str}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function MailingsSection() {
  return (
    <div className="bg-[#1D3E5E]/80 border border-white/10 rounded-3xl p-8 text-center space-y-3">
      <Mail className="w-10 h-10 mx-auto text-[#E7C768]" />
      <h2 className="text-base font-bold text-[#E7C768]">Рассылки</h2>
      <p className="text-xs text-slate-300 max-w-md mx-auto">
        Конструктор массовых рассылок будет здесь. Отправка работает в кабинете работодателя (CRM → Рассылка). В следующих итерациях добавим централизованные шаблоны и кампании.
      </p>
    </div>
  );
}

function RolesSection({ setToast }: { setToast: (t: any) => void }) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_list_users" as any);
    if (error) setToast({ kind: "err", text: error.message });
    else setUsers((data as any[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggle = async (uid: string, role: string, enabled: boolean) => {
    const { error } = await supabase.rpc("admin_set_role" as any, { _user: uid, _role: role, _enabled: enabled });
    if (error) setToast({ kind: "err", text: error.message });
    else { setToast({ kind: "ok", text: "Роль обновлена" }); load(); }
  };

  const ROLES = ["admin", "moderator", "employer", "candidate"];
  const filtered = users.filter((u) => !search || (u.email || "").toLowerCase().includes(search.toLowerCase()) || (u.display_name || "").toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="bg-[#1D3E5E]/80 border border-white/10 rounded-3xl p-4 flex items-center justify-between">
        <h2 className="text-base font-bold text-[#E7C768]">Роли — {users.length} пользователей</h2>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск..."
          className="bg-[#17344F]/60 text-xs text-white px-3 py-2 rounded-xl border border-white/10" />
      </div>
      {loading ? <div className="text-center py-12 text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline" /></div> : (
        <div className="bg-[#1D3E5E]/40 border border-white/10 rounded-3xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#17344F] text-[#E7C768] uppercase tracking-wider text-[10px] font-mono">
                <tr><th className="p-3">Пользователь</th>{ROLES.map((r) => <th key={r} className="p-3 text-center">{r}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((u) => {
                  const userRoles: string[] = u.roles || [];
                  return (
                    <tr key={u.user_id} className="hover:bg-white/5">
                      <td className="p-3"><div className="font-bold">{u.display_name || "—"}</div><div className="text-[10px] text-slate-400">{u.email}</div></td>
                      {ROLES.map((r) => {
                        const has = userRoles.includes(r);
                        return (
                          <td key={r} className="p-3 text-center">
                            <button onClick={() => toggle(u.user_id, r, !has)}
                              className={`w-6 h-6 rounded border text-xs font-bold ${has ? "bg-emerald-500/30 border-emerald-400 text-emerald-100" : "bg-white/5 border-white/10 text-slate-500 hover:bg-white/10"}`}>
                              {has ? "✓" : ""}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function AccountsSection({ setToast }: { setToast: (t: any) => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [txs, setTxs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const [emp, t] = await Promise.all([
      supabase.rpc("admin_list_employers" as any),
      (supabase as any).from("transactions").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    if ((emp as any).error) setToast({ kind: "err", text: (emp as any).error.message });
    setRows(((emp as any).data as any[]) || []);
    setTxs(((t as any).data as any[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const adjust = async (employerId: string, delta: number) => {
    const note = window.prompt(`Комментарий к ${delta > 0 ? "начислению" : "списанию"} ${Math.abs(delta)} RR:`, "Корректировка администратором");
    if (note === null) return;
    const { error } = await supabase.rpc("admin_wallet_adjust" as any, { _employer: employerId, _delta: delta, _note: note });
    if (error) setToast({ kind: "err", text: error.message });
    else { setToast({ kind: "ok", text: "Баланс обновлён" }); load(); }
  };

  return (
    <div className="space-y-4">
      <div className="bg-[#1D3E5E]/80 border border-white/10 rounded-3xl p-4">
        <h2 className="text-base font-bold text-[#E7C768]">Счета и балансы</h2>
      </div>
      {loading ? <div className="text-center py-12 text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline" /></div> : (
        <>
          <div className="bg-[#1D3E5E]/40 border border-white/10 rounded-3xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#17344F] text-[#E7C768] uppercase tracking-wider text-[10px] font-mono">
                  <tr><th className="p-3">ID</th><th className="p-3">Клиент</th><th className="p-3">Баланс RR</th><th className="p-3">Корректировка</th></tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-white/5">
                      <td className="p-3 font-mono text-slate-400">{r.public_id}</td>
                      <td className="p-3"><div className="font-bold">{r.name || "—"}</div><div className="text-[10px] text-slate-400">{r.email}</div></td>
                      <td className="p-3 font-mono text-[#E7C768] font-bold">{r.balance}</td>
                      <td className="p-3 flex items-center gap-1">
                        {[100, 500, 1000].map((d) => (
                          <React.Fragment key={d}>
                            <button onClick={() => adjust(r.id, d)} className="px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-200 text-[10px] font-bold flex items-center gap-0.5"><Plus className="w-3 h-3" />{d}</button>
                            <button onClick={() => adjust(r.id, -d)} className="px-2 py-1 rounded bg-rose-500/20 hover:bg-rose-500/40 text-rose-200 text-[10px] font-bold flex items-center gap-0.5"><Minus className="w-3 h-3" />{d}</button>
                          </React.Fragment>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-[#1D3E5E]/80 border border-white/10 rounded-3xl p-4">
            <h3 className="text-sm font-bold text-[#E7C768] mb-3">Последние транзакции</h3>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-[#17344F] text-[#E7C768] uppercase tracking-wider text-[10px] font-mono sticky top-0">
                  <tr><th className="p-2.5">Дата</th><th className="p-2.5">Тип</th><th className="p-2.5">Сумма</th><th className="p-2.5">Кошелёк</th><th className="p-2.5">Заметка</th></tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {txs.map((t) => (
                    <tr key={t.id}>
                      <td className="p-2.5 text-slate-400">{t.created_at ? new Date(t.created_at).toLocaleString() : ""}</td>
                      <td className="p-2.5">{t.type}</td>
                      <td className="p-2.5 font-mono font-bold text-[#E7C768]">{t.amount_rr}</td>
                      <td className="p-2.5 font-mono text-[10px] text-slate-400">{(t.wallet_id || "").slice(0, 8)}</td>
                      <td className="p-2.5">{t.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AISection() {
  const fns = [
    "ai-chat","ai-check-stage-answers","ai-check-text-answer","ai-company-analyze",
    "ai-distribute-text","ai-enhance","ai-evaluate","ai-generate-interview-checklist",
    "ai-generate-interview-resume-criteria","ai-generate-interview-situations",
    "ai-generate-onboarding","ai-generate-stage-material","ai-generate-stage-test",
    "ai-generate-training-material","ai-generate-training-quiz","ai-ingest-document",
    "ai-interview-grade-checklist","ai-interview-grade-situations","ai-interview-screen-resume",
    "ai-list-interview-checklist","ai-list-stage-questions","ai-restart",
  ];
  return (
    <div className="space-y-4">
      <div className="bg-[#1D3E5E]/80 border border-white/10 rounded-3xl p-4">
        <h2 className="text-base font-bold text-[#E7C768]">ИИ — функции и настройки</h2>
        <p className="text-xs text-slate-300 mt-1">Список развернутых edge-функций. Редактирование промптов будет добавлено в следующих итерациях (после выноса промптов в БД).</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {fns.map((f) => (
          <a key={f} href={`https://supabase.com/dashboard/project/rjhtauzookkvlipvqpvr/functions/${f}/logs`} target="_blank" rel="noreferrer"
            className="bg-[#1D3E5E]/60 hover:bg-[#1D3E5E]/90 border border-white/10 hover:border-[#E7C768]/50 rounded-xl p-3 text-xs font-mono text-slate-200 transition">
            {f}
          </a>
        ))}
      </div>
    </div>
  );
}
