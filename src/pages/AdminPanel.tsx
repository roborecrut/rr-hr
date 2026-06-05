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
