/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Admin panel — manages job_titles.field_templates.
 * Access: only users with role 'admin'.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { aiEnhanceSingle } from "@/lib/aiClient";
import { Search, Trash2, Save, Sparkles, PlusCircle, ShieldCheck, LogOut, Loader2, RefreshCw, Star } from "lucide-react";

type JobTitleRow = {
  id: string;
  title: string;
  title_norm: string;
  usage_count: number;
  is_basic: boolean;
  field_templates: Record<string, string>;
  created_at: string;
};

const FIELDS: { key: string; label: string; group: "Вакансия" | "Обучение" }[] = [
  { key: "vacancy_text",            label: "Требования / описание вакансии",  group: "Вакансия" },
  { key: "tasks_activity_text",     label: "Задачи и активности",             group: "Вакансия" },
  { key: "schedule_text",           label: "График работы",                    group: "Вакансия" },
  { key: "motivation_text",         label: "Мотивация (кратко)",               group: "Вакансия" },
  { key: "payouts_text",            label: "Оплата и выплаты",                 group: "Вакансия" },
  { key: "team_text_vac",           label: "Команда",                          group: "Вакансия" },
  { key: "system_text_vac",         label: "Системы и инструменты",            group: "Вакансия" },
  { key: "training_intro_text",     label: "Введение в обучение",              group: "Обучение" },
  { key: "training_professional_text", label: "Профессиональный блок",         group: "Обучение" },
  { key: "training_product_text",   label: "Продуктовый блок",                 group: "Обучение" },
  { key: "training_systems_text",   label: "Системы и инструменты (обучение)", group: "Обучение" },
  { key: "training_wiki_text",      label: "База знаний / Wiki",               group: "Обучение" },
  { key: "training_regulations_text", label: "Регламенты",                     group: "Обучение" },
];

function countFilled(t: Record<string, string> | null | undefined) {
  if (!t) return 0;
  let n = 0;
  for (const f of FIELDS) if ((t[f.key] || "").trim()) n++;
  return n;
}

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
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [rows, setRows] = useState<JobTitleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "basic" | "custom" | "empty">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [editTitle, setEditTitle] = useState("");
  const [editIsBasic, setEditIsBasic] = useState(false);
  const [editTpl, setEditTpl] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [enhancing, setEnhancing] = useState<Record<string, boolean>>({});
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

  const loadRows = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("admin_list_job_titles" as any);
      if (error) throw error;
      const list = (data || []) as JobTitleRow[];
      setRows(list);
      if (!selectedId && list.length) selectRow(list[0]);
    } catch (err: any) {
      setToast({ kind: "err", text: err?.message || "Не удалось загрузить должности" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const selectRow = (r: JobTitleRow) => {
    setSelectedId(r.id);
    setEditTitle(r.title);
    setEditIsBasic(!!r.is_basic);
    const tpl: Record<string, string> = {};
    for (const f of FIELDS) tpl[f.key] = (r.field_templates as any)?.[f.key] || "";
    setEditTpl(tpl);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.title.toLowerCase().includes(q)) return false;
      const filled = countFilled(r.field_templates);
      if (filter === "basic" && !r.is_basic) return false;
      if (filter === "custom" && r.is_basic) return false;
      if (filter === "empty" && filled > 0) return false;
      return true;
    });
  }, [rows, search, filter]);

  const handleSave = async () => {
    if (!editTitle.trim()) {
      setToast({ kind: "err", text: "Укажите название должности" });
      return;
    }
    setSaving(true);
    try {
      const patch: Record<string, string> = {};
      for (const f of FIELDS) patch[f.key] = (editTpl[f.key] || "").trim();
      const { error } = await supabase.rpc("admin_job_title_upsert_templates" as any, {
        _title: editTitle.trim(),
        _patch: patch,
        _overwrite: true,
        _is_basic: editIsBasic,
      });
      if (error) throw error;
      setToast({ kind: "ok", text: "Сохранено" });
      await loadRows();
    } catch (err: any) {
      setToast({ kind: "err", text: err?.message || "Ошибка сохранения" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    if (!window.confirm(`Удалить должность «${editTitle}»? Действие необратимо.`)) return;
    try {
      const { error } = await supabase.rpc("admin_delete_job_title" as any, { _id: selectedId });
      if (error) throw error;
      setSelectedId(null);
      setEditTitle("");
      setEditTpl({});
      await loadRows();
      setToast({ kind: "ok", text: "Должность удалена" });
    } catch (err: any) {
      setToast({ kind: "err", text: err?.message || "Ошибка удаления" });
    }
  };

  const handleAddNew = () => {
    const name = window.prompt("Название новой должности:");
    if (!name || !name.trim()) return;
    setSelectedId(null);
    setEditTitle(name.trim());
    setEditIsBasic(true);
    const tpl: Record<string, string> = {};
    for (const f of FIELDS) tpl[f.key] = "";
    setEditTpl(tpl);
  };

  const handleEnhance = async (key: string) => {
    setEnhancing((p) => ({ ...p, [key]: true }));
    try {
      const value = await aiEnhanceSingle({
        field: key,
        value: editTpl[key] || "",
        role_name: editTitle,
        hint: "Сделай эталонный шаблон для этой должности: живой язык, 3–6 предложений или маркированных пунктов, конкретика (цифры, инструменты, примеры).",
      });
      if (value) setEditTpl((p) => ({ ...p, [key]: value }));
    } catch (err: any) {
      setToast({ kind: "err", text: err?.message || "AI ошибка" });
    } finally {
      setEnhancing((p) => ({ ...p, [key]: false }));
    }
  };

  const handleClearField = (key: string) => {
    setEditTpl((p) => ({ ...p, [key]: "" }));
  };

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

  const selectedFilled = countFilled(editTpl);

  return (
    <div className="bg-gradient-to-b from-[#17344F] to-[#265582] min-h-screen text-white font-sans antialiased">
      <header className="sticky top-0 z-40 bg-[#17344F]/95 backdrop-blur-md border-b border-white/10 px-4 md:px-8 py-3">
        <div className="flex items-center justify-between gap-4 max-w-[1500px] mx-auto">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate("/")}>
            <img src="https://i.ibb.co/WWRbtPq0/RR-Logo.png" alt="RR" className="w-9 h-9 object-contain" referrerPolicy="no-referrer" />
            <div className="flex flex-col leading-tight">
              <span className="text-base font-bold text-[#E7C768]">Админ-панель</span>
              <span className="text-[10px] uppercase tracking-wider text-slate-300">Шаблоны должностей</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadRows}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 border border-white/10 flex items-center gap-1.5"
              title="Обновить"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Обновить
            </button>
            <button
              onClick={() => navigate("/employer")}
              className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5"
            >
              Кабинет
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
        {/* Left: list */}
        <aside className="lg:col-span-4 space-y-3">
          <div className="bg-[#1D3E5E]/80 border border-white/10 rounded-3xl p-4 shadow-xl space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  className="w-full bg-[#17344F]/60 text-xs text-white pl-8 pr-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-[#E7C768]"
                  placeholder="Поиск должности..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <button
                onClick={handleAddNew}
                className="p-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-200"
                title="Добавить новую"
              >
                <PlusCircle className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-1.5 text-[10px] font-bold uppercase tracking-wider">
              {([
                ["all", "Все"],
                ["basic", "Базовые"],
                ["custom", "Польз."],
                ["empty", "Пустые"],
              ] as const).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  className={`px-2 py-1 rounded-lg border transition ${
                    filter === k
                      ? "bg-[#E7C768]/20 border-[#E7C768]/50 text-[#E7C768]"
                      : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            <div className="text-[10px] text-slate-400 font-mono">
              Всего: {rows.length} • Показано: {filtered.length}
            </div>
          </div>

          <div className="bg-[#1D3E5E]/60 border border-white/10 rounded-3xl p-2 max-h-[70vh] overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Загрузка...
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs">Ничего не найдено</div>
            ) : (
              <ul className="space-y-1">
                {filtered.map((r) => {
                  const filled = countFilled(r.field_templates);
                  const pct = Math.round((filled / FIELDS.length) * 100);
                  return (
                    <li key={r.id}>
                      <button
                        onClick={() => selectRow(r)}
                        className={`w-full text-left p-2.5 rounded-2xl transition border ${
                          selectedId === r.id
                            ? "bg-[#E7C768]/15 border-[#E7C768]/50"
                            : "bg-white/5 hover:bg-white/10 border-transparent"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {r.is_basic && <Star className="w-3 h-3 text-[#E7C768] flex-shrink-0" />}
                            <span className="text-sm font-semibold truncate">{r.title}</span>
                          </div>
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                            filled === FIELDS.length ? "bg-emerald-500/20 text-emerald-300" :
                            filled === 0 ? "bg-rose-500/20 text-rose-300" : "bg-amber-500/20 text-amber-300"
                          }`}>
                            {filled}/{FIELDS.length}
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-slate-400 font-mono">
                          <span>Исп.: {r.usage_count || 0}</span>
                          <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-[#E7C768]/60" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Right: editor */}
        <section className="lg:col-span-8 space-y-4">
          {!editTitle && !selectedId ? (
            <div className="bg-[#1D3E5E]/80 border border-white/10 rounded-3xl p-12 text-center text-slate-400">
              Выберите должность слева или добавьте новую
            </div>
          ) : (
            <>
              <div className="bg-[#1D3E5E]/85 border border-white/10 rounded-3xl p-5 shadow-xl space-y-4">
                <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
                  <div className="flex-1 space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-300 block">
                      Название должности
                    </label>
                    <input
                      type="text"
                      className="w-full bg-[#17344F]/60 text-base font-semibold text-white px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-[#E7C768]"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-300 select-none cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editIsBasic}
                      onChange={(e) => setEditIsBasic(e.target.checked)}
                      className="w-4 h-4 accent-[#E7C768]"
                    />
                    <Star className="w-3.5 h-3.5 text-[#E7C768]" /> Базовая должность
                  </label>
                </div>

                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="text-xs text-slate-300">
                    Заполнено полей: <strong className="text-[#E7C768]">{selectedFilled}/{FIELDS.length}</strong>
                  </div>
                  <div className="flex gap-2">
                    {selectedId && (
                      <button
                        onClick={handleDelete}
                        className="px-3 py-2 rounded-xl text-xs font-bold bg-rose-500/20 hover:bg-rose-500/40 border border-rose-500/30 text-rose-200 flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Удалить
                      </button>
                    )}
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-500 to-teal-600 hover:shadow-lg flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      Сохранить
                    </button>
                  </div>
                </div>
              </div>

              {(["Вакансия", "Обучение"] as const).map((group) => (
                <div key={group} className="bg-[#1D3E5E]/70 border border-white/10 rounded-3xl p-5 shadow-xl space-y-4">
                  <h3 className="text-sm font-bold text-[#E7C768] uppercase tracking-wide">
                    {group}
                  </h3>
                  {FIELDS.filter((f) => f.group === group).map((f) => (
                    <div key={f.key} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-xs font-semibold text-slate-200">{f.label}</label>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleEnhance(f.key)}
                            disabled={!!enhancing[f.key]}
                            className="px-2 py-1 rounded-lg text-[10px] font-bold bg-[#E7C768]/15 hover:bg-[#E7C768]/30 border border-[#E7C768]/30 text-[#E7C768] flex items-center gap-1 disabled:opacity-50"
                          >
                            {enhancing[f.key] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                            AI
                          </button>
                          <button
                            onClick={() => handleClearField(f.key)}
                            className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300"
                          >
                            Очистить
                          </button>
                        </div>
                      </div>
                      <textarea
                        rows={Math.max(3, Math.min(8, ((editTpl[f.key] || "").match(/\n/g)?.length || 0) + 3))}
                        className="w-full bg-[#17344F]/60 text-xs text-white p-3 rounded-xl border border-white/10 focus:outline-none focus:border-[#E7C768] resize-y leading-relaxed"
                        value={editTpl[f.key] || ""}
                        onChange={(e) => setEditTpl((p) => ({ ...p, [f.key]: e.target.value }))}
                        placeholder="Эталонное содержание этого поля для должности..."
                      />
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
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
