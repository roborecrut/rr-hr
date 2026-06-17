/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Admin CRM. Sections: Clients (employers), Candidates, Companies, Vacancies,
 * Interviews, Trainings, Mailings, Roles, Accounts, AI.
 * Access: only users with role 'admin'.
 */

import React, { useEffect, useMemo, useState } from "react";
import RRImage from "@/components/RRImage";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import CandidateDetailsModal from "@/components/CandidateDetailsModal";
import BlogAdmin from "@/components/admin/BlogAdmin";
import DetailsModal from "@/components/admin/DetailsModal";
import {
  Search, ShieldCheck, LogOut, Loader2, RefreshCw, Users, Building2, Briefcase,
  MessageSquare, GraduationCap, Mail, KeyRound, Wallet, Sparkles, ArrowLeft,
  Plus, Minus, X, BookOpen, FileText,
} from "lucide-react";

type SectionKey =
  | "clients" | "candidates" | "companies" | "vacancies"
  | "interviews" | "trainings" | "blog" | "mailings" | "roles"
  | "accounts" | "ai" | "logs" | "reviews";

const SECTIONS: { key: SectionKey; label: string; icon: any }[] = [
  { key: "clients",    label: "Клиенты",   icon: Users },
  { key: "candidates", label: "Кандидаты", icon: Users },
  { key: "companies",  label: "Компании",  icon: Building2 },
  { key: "vacancies",  label: "Вакансии",  icon: Briefcase },
  { key: "interviews", label: "Интервью",  icon: MessageSquare },
  { key: "trainings",  label: "Обучения",  icon: GraduationCap },
  { key: "blog",       label: "Блог",      icon: BookOpen },
  { key: "reviews",    label: "Отзывы",    icon: MessageSquare },
  { key: "mailings",   label: "Рассылки",  icon: Mail },
  { key: "roles",      label: "Роли",      icon: KeyRound },
  { key: "accounts",   label: "Счета",     icon: Wallet },
  { key: "logs",       label: "Логи ИИ",   icon: FileText },
  { key: "ai",         label: "ИИ",        icon: Sparkles },
];

function classifyClient(c: any): { key: string; label: string; color: string } {
  if (c.has_topup && c.balance > 0) return { key: "paying",  label: "Платящий", color: "emerald" };
  if ((c.candidates_count || 0) > 0) return { key: "active",  label: "Активный", color: "sky" };
  if ((c.projects_count || 0) > 0)   return { key: "trial",   label: "В работе", color: "amber" };
  return { key: "new", label: "Новый", color: "slate" };
}

/* ===== Русские названия колонок и какие поля нельзя редактировать ===== */
const RU_LABELS: Record<string, Record<string, string>> = {
  employers: {
    id: "ID", public_id: "Публичный ID", user_id: "User ID", email: "Email",
    name: "Имя", company_name: "Компания", contact_name: "Контактное лицо",
    contact_email: "Контактный email", contact_phone: "Телефон", contact_telegram: "Telegram",
    plan: "Тариф", status: "Статус", ref_by: "Кто пригласил",
    bonus_granted: "Бонус начислен", offer_accepted: "Оферта принята",
    offer_accepted_at: "Дата оферты", offer_version: "Версия оферты",
    landing_credits: "Лимит вакансий", interview_setup_credits: "Лимит систем найма",
    training_setup_credits: "Лимит систем обучения", interview_credits: "Лимит интервью",
    training_credits: "Лимит обучений",
    balance: "Баланс RR (вычисляется)",
    projects_count: "Вакансий, шт", candidates_count: "Кандидатов, шт",
    has_topup: "Делал пополнения", created_at: "Создан", updated_at: "Обновлён",
  },
  companies: {
    name: "Название", slug: "URL-слаг", logo_url: "Логотип (URL)", industry: "Отрасль",
    website: "Сайт", staff: "Штат", description_text: "Описание", products_text: "Продукты",
    mission_text: "Миссия", about_text: "О компании", team_text: "Команда",
    payouts_text: "Выплаты", schedule_text: "График", system_text: "Система работы",
    stats: "Статистика (JSON)", status: "Статус", is_published: "Опубликована",
    owner_employer_id: "Владелец (employer)", created_at: "Создана", updated_at: "Обновлена",
    archived_at: "Архив с", deleted_at: "Удалена",
  },
  projects: {
    role_name: "Должность", salary_terms: "Зарплата", schedule_terms: "График",
    motivation_text: "Мотивация", custom_wiki: "Вики", logo_url: "Логотип (URL)",
    company_id: "Компания", employer_id: "Работодатель", is_published: "Опубликована",
    status: "Статус", slug: "URL-слаг", vacancy_text: "Описание вакансии",
    max_interviews: "Лимит интервью на вакансию", max_trainings: "Лимит обучений на вакансию",
    created_at: "Создана", updated_at: "Обновлена",
  },
  candidate_scores: {
    candidate_id: "Кандидат", interview_score: "Балл за интервью",
    resume_score: "Балл за резюме", checklist_points: "Чек-лист (баллы)",
    roleplay_points: "Кейсы (баллы)", overall_score: "Итоговый балл",
    checklist_score: "Чек-лист %", checklist_sys_score: "Системный чек-лист %",
    situations_score: "Кейсы %", assessment_summary: "Резюме оценки",
    resume_feedback: "Фидбек по резюме", checklist_feedback: "Фидбек чек-листа",
    situations_feedback: "Фидбек кейсов", updated_at: "Обновлено",
  },
  candidate_stage_progress: {
    candidate_id: "Кандидат", stage: "Этап", attempts: "Попыток",
    best_score: "Лучший балл", last_score: "Последний балл",
    last_answers: "Последние ответы", last_feedback: "Последний фидбек",
    passed_at: "Пройдено", created_at: "Создано", updated_at: "Обновлено",
  },
  transactions: {
    wallet_id: "Кошелёк", type: "Тип", amount_rr: "Сумма RR",
    ref_table: "Источник (таблица)", ref_id: "Источник (id)",
    note: "Комментарий", idem_key: "Ключ идемпотентности", created_at: "Дата",
  },
  logs: {
    channel_id: "ID канала", channel_name: "Канал", bot_id: "Бот", llm: "Модель",
    user_message: "Сообщение пользователя", bot_reply: "Ответ нейросети",
    user_social_id: "Соц.ID пользователя", api_key: "API-ключ",
    tokens_total: "Токенов всего", tokens_in_source: "Токены вход",
    tokens_out_source: "Токены выход", tokens_user: "Токены пользователя",
    function_error: "Ошибка функции", function_call_params: "Параметры вызова",
    server_name: "Сервер", created_at: "Дата",
  },
  reviews: {
    first_name: "Имя", last_name: "Фамилия", content: "Текст отзыва",
    ai_reply: "Ответ ИИ", admin_reply: "Ответ администратора",
    is_published: "Опубликован", created_at: "Создан", updated_at: "Обновлён",
  },
};

/** Computed/virtual fields that come from RPCs and aren't real columns. */
const OMIT_KEYS: Record<string, string[]> = {
  employers: [
    "balance","has_topup","projects_count","candidates_count","email","name",
    // limits are edited via admin RPC (logs to transactions), не через прямой UPDATE:
    "landing_credits","interview_setup_credits","training_setup_credits",
    "interview_credits","training_credits",
  ],
};

const LIMIT_FIELDS: { key: string; label: string }[] = [
  { key: "landing_credits",         label: "Вакансии (лендинги)" },
  { key: "interview_setup_credits", label: "Системы найма" },
  { key: "training_setup_credits",  label: "Системы обучения" },
  { key: "interview_credits",       label: "Интервью" },
  { key: "training_credits",        label: "Обучения" },
];

/* ============== Entity navigation (cross-links между клиент↔компании↔вакансии) ============== */

type EntityKind = "employer" | "company" | "project";
const EntityNavContext = React.createContext<{ openEntity: (kind: EntityKind, id: string) => void }>({
  openEntity: () => {},
});
const useEntityNav = () => React.useContext(EntityNavContext);

function EntityLink({ kind, id, children }: { kind: EntityKind; id?: string | null; children: React.ReactNode }) {
  const { openEntity } = useEntityNav();
  if (!id) return <span className="text-slate-500">{children || "—"}</span>;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); openEntity(kind, id); }}
      className="text-[#E7C768] hover:underline text-left truncate max-w-full"
    >
      {children}
    </button>
  );
}

function EntityModal({
  entity, setToast, onClose,
}: {
  entity: { kind: EntityKind; id: string };
  setToast: (t: any) => void;
  onClose: () => void;
}) {
  const [row, setRow] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const table = entity.kind === "employer" ? "employers" : entity.kind === "company" ? "companies" : "projects";

  const load = async () => {
    setLoading(true);
    let q: any;
    if (entity.kind === "employer") {
      const { data } = await supabase.rpc("admin_list_employers" as any);
      q = ((data as any[]) || []).find((x: any) => x.id === entity.id) || null;
    } else {
      const { data } = await (supabase as any).from(table).select("*").eq("id", entity.id).maybeSingle();
      q = data;
    }
    setRow(q);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [entity.kind, entity.id]);

  const title =
    entity.kind === "employer" ? `Клиент · ${row?.name || row?.email || ""}` :
    entity.kind === "company"  ? `Компания · ${row?.name || ""}` :
                                 `Вакансия · ${row?.role_name || ""}`;

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#E7C768]" />
      </div>
    );
  }

  return (
    <DetailsModal
      title={title}
      data={row}
      table={table}
      labels={RU_LABELS[table]}
      omitKeys={OMIT_KEYS[table]}
      onClose={onClose}
      onSaved={() => { load(); }}
      extra={
        <>
          {entity.kind === "employer" && row && (
            <ClientLimitsEditor row={row} setToast={setToast} onChanged={load} />
          )}
          {entity.kind === "employer" && row && <ClientLinkedTabs employerId={row.id} />}
          {entity.kind === "company"  && row && <CompanyLinks companyId={row.id} ownerEmployerId={row.owner_employer_id} />}
          {entity.kind === "project"  && row && <ProjectLinks employerId={row.employer_id} companyId={row.company_id} projectId={row.id} />}
        </>
      }
    />
  );
}

/* ============== Linked tabs для карточки клиента (#20) ============== */

function ClientLinkedTabs({ employerId }: { employerId: string }) {
  const [tab, setTab] = useState<"txs" | "companies" | "vacancies">("txs");
  const [txs, setTxs] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [projMap, setProjMap] = useState<Record<string, any>>({});
  const [coMap, setCoMap] = useState<Record<string, any>>({});
  const [candMap, setCandMap] = useState<Record<string, any>>({});

  useEffect(() => {
    (async () => {
      const [w, co, pr] = await Promise.all([
        (supabase as any).from("wallets").select("id, employer_id").eq("employer_id", employerId),
        (supabase as any).from("companies").select("id, name, public_id, status, is_published").eq("owner_employer_id", employerId),
        (supabase as any).from("projects").select("id, role_name, public_id, status, is_published, company_id, created_at").eq("employer_id", employerId).order("created_at", { ascending: false }),
      ]);
      const wallets = ((w as any).data as any[]) || [];
      setCompanies(((co as any).data as any[]) || []);
      const ps = ((pr as any).data as any[]) || [];
      setProjects(ps);
      const pm: Record<string, any> = {}; ps.forEach((p) => { pm[p.id] = p; }); setProjMap(pm);
      const cm: Record<string, any> = {}; (((co as any).data as any[]) || []).forEach((c) => { cm[c.id] = c; }); setCoMap(cm);

      if (wallets.length) {
        const { data: t } = await (supabase as any).from("transactions")
          .select("*").in("wallet_id", wallets.map((x) => x.id))
          .order("created_at", { ascending: false }).limit(200);
        const list = ((t as any[]) || []);
        setTxs(list);
        // Подгружаем имена кандидатов из ref_id, где ref_table = candidates
        const candIds = Array.from(new Set(list.filter((x) => x.ref_table === "candidates" && x.ref_id).map((x) => x.ref_id)));
        if (candIds.length) {
          const { data: cs } = await (supabase as any).from("candidates")
            .select("id, public_id, full_name, email, project_id").in("id", candIds);
          const cmap: Record<string, any> = {};
          (((cs as any[]) || [])).forEach((c) => { cmap[c.id] = c; });
          setCandMap(cmap);
        }
      }
    })();
  }, [employerId]);

  return (
    <div className="mt-4 border-t border-white/10 pt-4">
      <div className="flex gap-1 mb-3">
        {[
          { k: "txs", l: `Транзакции (${txs.length})` },
          { k: "companies", l: `Компании (${companies.length})` },
          { k: "vacancies", l: `Вакансии (${projects.length})` },
        ].map((x) => (
          <button key={x.k} onClick={() => setTab(x.k as any)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold ${tab === x.k ? "bg-[#E7C768]/15 text-[#E7C768] border border-[#E7C768]/40" : "bg-white/5 text-slate-300 border border-white/10"}`}>
            {x.l}
          </button>
        ))}
      </div>
      {tab === "txs" && (
        <div className="max-h-80 overflow-y-auto bg-[#17344F]/40 border border-white/10 rounded-xl">
          <table className="w-full text-[11px]">
            <thead className="bg-[#17344F] text-[#E7C768] text-[10px] uppercase font-mono sticky top-0">
              <tr><th className="p-2 text-left">Дата</th><th className="p-2 text-left">Тип</th><th className="p-2 text-right">RR</th><th className="p-2 text-left">Назначение</th></tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {txs.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-slate-400">Нет транзакций</td></tr>}
              {txs.map((t) => {
                let target: React.ReactNode = t.note || "—";
                if (t.ref_table === "projects" && t.ref_id && projMap[t.ref_id]) {
                  target = <EntityLink kind="project" id={t.ref_id}>Вакансия: {projMap[t.ref_id].role_name || `#${projMap[t.ref_id].public_id}`}</EntityLink>;
                } else if (t.ref_table === "candidates" && t.ref_id && candMap[t.ref_id]) {
                  const c = candMap[t.ref_id];
                  const proj = projMap[c.project_id];
                  target = (
                    <span>
                      {c.full_name || c.email || `#${c.public_id}`}
                      {proj && <> · <EntityLink kind="project" id={proj.id}>{proj.role_name}</EntityLink></>}
                    </span>
                  );
                }
                return (
                  <tr key={t.id} className="hover:bg-white/5">
                    <td className="p-2 text-slate-400">{t.created_at ? new Date(t.created_at).toLocaleString() : ""}</td>
                    <td className="p-2">{t.type}</td>
                    <td className="p-2 text-right font-mono font-bold text-[#E7C768]">{t.amount_rr}</td>
                    <td className="p-2 text-slate-200">
                      <div className="truncate max-w-[300px]" title={t.note || ""}>{target}</div>
                      {t.note && (typeof target === "string" || (target as any)?.type !== EntityLink) && (
                        <div className="text-[10px] text-slate-400 truncate max-w-[300px]">{t.note}</div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {tab === "companies" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {companies.length === 0 && <div className="col-span-full text-center py-6 text-slate-400 text-xs">Нет компаний</div>}
          {companies.map((c) => (
            <div key={c.id} className="bg-[#17344F]/60 border border-white/10 rounded-xl p-3">
              <EntityLink kind="company" id={c.id}><span className="font-bold">{c.name || `Компания #${c.public_id}`}</span></EntityLink>
              <div className="text-[10px] text-slate-400 font-mono">#{c.public_id} · {c.is_published ? "опубл." : c.status}</div>
            </div>
          ))}
        </div>
      )}
      {tab === "vacancies" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {projects.length === 0 && <div className="col-span-full text-center py-6 text-slate-400 text-xs">Нет вакансий</div>}
          {projects.map((p) => (
            <div key={p.id} className="bg-[#17344F]/60 border border-white/10 rounded-xl p-3">
              <EntityLink kind="project" id={p.id}><span className="font-bold">{p.role_name || `Вакансия #${p.public_id}`}</span></EntityLink>
              <div className="text-[10px] text-slate-400">
                #{p.public_id} · {p.is_published ? "опубл." : p.status}
                {coMap[p.company_id] && <> · <EntityLink kind="company" id={p.company_id}>{coMap[p.company_id].name}</EntityLink></>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CompanyLinks({ companyId, ownerEmployerId }: { companyId: string; ownerEmployerId?: string | null }) {
  const [projects, setProjects] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).from("projects").select("id, role_name, public_id, status, is_published").eq("company_id", companyId).order("created_at", { ascending: false });
      setProjects((data as any[]) || []);
    })();
  }, [companyId]);
  return (
    <div className="mt-4 border-t border-white/10 pt-4 space-y-3">
      {ownerEmployerId && (
        <div className="text-xs text-slate-300">Владелец: <EntityLink kind="employer" id={ownerEmployerId}>открыть карточку клиента →</EntityLink></div>
      )}
      <div>
        <div className="text-[11px] font-bold text-[#E7C768] mb-2">Вакансии этой компании ({projects.length})</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {projects.map((p) => (
            <div key={p.id} className="bg-[#17344F]/60 border border-white/10 rounded-xl p-3">
              <EntityLink kind="project" id={p.id}><span className="font-bold">{p.role_name || `#${p.public_id}`}</span></EntityLink>
              <div className="text-[10px] text-slate-400">#{p.public_id} · {p.is_published ? "опубл." : p.status}</div>
            </div>
          ))}
          {projects.length === 0 && <div className="text-xs text-slate-400 col-span-full">Нет вакансий</div>}
        </div>
      </div>
    </div>
  );
}

function ProjectLinks({ employerId, companyId, projectId }: { employerId?: string | null; companyId?: string | null; projectId: string }) {
  const [emp, setEmp] = useState<any | null>(null);
  const [co, setCo] = useState<any | null>(null);
  useEffect(() => {
    (async () => {
      if (employerId) {
        const { data } = await (supabase as any).from("employers").select("id, name, email, public_id").eq("id", employerId).maybeSingle();
        setEmp(data);
      }
      if (companyId) {
        const { data } = await (supabase as any).from("companies").select("id, name, public_id").eq("id", companyId).maybeSingle();
        setCo(data);
      }
    })();
  }, [employerId, companyId]);
  return (
    <div className="mt-4 border-t border-white/10 pt-4 space-y-2 text-xs">
      {emp && <div>Клиент: <EntityLink kind="employer" id={emp.id}>{emp.name || emp.email}</EntityLink></div>}
      {co  && <div>Компания: <EntityLink kind="company" id={co.id}>{co.name}</EntityLink></div>}
    </div>
  );
}

/* ============== Companies list section (#6 — поиск по названию) ============== */

function CompaniesListSection() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const { openEntity } = useEntityNav();

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any).from("companies")
      .select("id, name, public_id, industry, status, is_published, owner_employer_id, created_at")
      .order("created_at", { ascending: false }).limit(500);
    setRows((data as any[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = rows.filter((r) => !search ||
    (r.name || "").toLowerCase().includes(search.toLowerCase()) ||
    (r.public_id || "").toLowerCase().includes(search.toLowerCase()) ||
    (r.industry || "").toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-3">
      <div className="bg-[#1E4468]/80 border border-white/10 rounded-3xl p-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-[#E7C768]">Компании — {rows.length}</h2>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по названию / отрасли / ID…"
          className="bg-[#17344F]/60 text-xs text-white px-3 py-2 rounded-xl border border-white/10 min-w-[260px]" />
      </div>
      {loading ? <div className="text-center py-12 text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline" /></div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((r) => (
            <div key={r.id} onClick={() => openEntity("company", r.id)}
              className="bg-[#1E4468]/60 border border-white/10 rounded-2xl p-4 cursor-pointer hover:border-[#E7C768]/40 transition">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white truncate">{r.name || `Компания #${r.public_id}`}</div>
                  <div className="text-[11px] text-slate-300 truncate">{r.industry || "—"}</div>
                  <div className="text-[10px] text-slate-500 font-mono">#{r.public_id}</div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${r.is_published ? "bg-emerald-500/20 text-emerald-200" : "bg-slate-500/20 text-slate-300"}`}>
                  {r.is_published ? "опубл." : r.status || "draft"}
                </span>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-slate-400 bg-[#1E4468]/40 border border-white/10 rounded-3xl">Ничего не найдено</div>
          )}
        </div>
      )}
    </div>
  );
}

function ClientLimitsEditor({
  row, onChanged, setToast,
}: { row: any; onChanged: () => void; setToast: (t: any) => void }) {
  const [vals, setVals] = useState<Record<string, number>>(() =>
    Object.fromEntries(LIMIT_FIELDS.map((f) => [f.key, Number(row?.[f.key] || 0)])),
  );
  const [bal, setBal] = useState<number>(Number(row?.balance || 0));
  const [delta, setDelta] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setVals(Object.fromEntries(LIMIT_FIELDS.map((f) => [f.key, Number(row?.[f.key] || 0)])));
    setBal(Number(row?.balance || 0));
    setDelta(0);
  }, [row?.id]);

  if (!row) return null;

  const saveLimit = async (field: string) => {
    setBusy(true);
    const note = window.prompt(`Комментарий к изменению лимита «${LIMIT_FIELDS.find((f) => f.key === field)?.label}»:`, "Корректировка администратором");
    if (note === null) { setBusy(false); return; }
    const { error } = await supabase.rpc("admin_employer_set_limit" as any, {
      _employer: row.id, _field: field, _value: vals[field], _note: note,
    });
    setBusy(false);
    if (error) setToast({ kind: "err", text: error.message });
    else { setToast({ kind: "ok", text: "Лимит обновлён" }); onChanged(); }
  };

  const applyBalance = async () => {
    if (!delta) return;
    setBusy(true);
    const note = window.prompt(`Комментарий к ${delta > 0 ? "начислению" : "списанию"} ${Math.abs(delta)} RR:`, "Корректировка администратором");
    if (note === null) { setBusy(false); return; }
    const { error } = await supabase.rpc("admin_wallet_adjust" as any, {
      _employer: row.id, _delta: delta, _note: note,
    });
    setBusy(false);
    if (error) setToast({ kind: "err", text: error.message });
    else { setToast({ kind: "ok", text: "Баланс обновлён" }); onChanged(); }
  };

  return (
    <div className="rounded-2xl border border-[#E7C768]/30 bg-[#17344F]/55 p-3 space-y-3">
      <div className="text-xs font-bold text-[#E7C768]">Лимиты и баланс (с логированием в «Историю операций»)</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {LIMIT_FIELDS.map((f) => (
          <div key={f.key} className="flex items-center gap-2 bg-[#0F2336]/60 rounded-lg p-2">
            <div className="text-[11px] text-slate-200 flex-1">{f.label}</div>
            <input type="number" min={0} value={vals[f.key]}
              onChange={(e) => setVals((s) => ({ ...s, [f.key]: Math.max(0, Number(e.target.value) || 0) }))}
              className="w-20 bg-[#17344F]/70 border border-white/10 rounded-md px-2 py-1 text-xs text-white" />
            <button disabled={busy} onClick={() => saveLimit(f.key)}
              className="px-2 py-1 rounded-md bg-gradient-to-r from-[#E7C768] to-[#D99E41] text-[#17344F] text-[10px] font-bold disabled:opacity-60">
              Сохранить
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 bg-[#0F2336]/60 rounded-lg p-2 border-t border-white/10 pt-3">
        <div className="text-[11px] text-slate-200 flex-1">
          Баланс RR: <span className="font-mono font-bold text-[#E7C768]">{bal}</span>
        </div>
        <input type="number" value={delta} onChange={(e) => setDelta(Number(e.target.value) || 0)}
          placeholder="±RR"
          className="w-24 bg-[#17344F]/70 border border-white/10 rounded-md px-2 py-1 text-xs text-white" />
        <button disabled={busy || !delta} onClick={applyBalance}
          className="px-2 py-1 rounded-md bg-gradient-to-r from-[#E7C768] to-[#D99E41] text-[#17344F] text-[10px] font-bold disabled:opacity-60">
          Применить
        </button>
      </div>
    </div>
  );
}

export default function AdminPanel() {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [section, setSection] = useState<SectionKey>("clients");
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [entityStack, setEntityStack] = useState<{ kind: "employer" | "company" | "project"; id: string }[]>([]);
  const openEntity = (kind: "employer" | "company" | "project", id: string) => {
    setEntityStack((s) => [...s, { kind, id }]);
  };
  const closeEntity = () => setEntityStack((s) => s.slice(0, -1));

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
        <div className="max-w-md w-full bg-[#1E4468]/85 border border-white/15 rounded-3xl p-8 text-center space-y-4 shadow-2xl">
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
            <RRImage src="https://rjhtauzookkvlipvqpvr.supabase.co/storage/v1/object/public/Logos/RR-Logo.png" w={36} alt="RR" className="w-9 h-9 object-contain" referrerPolicy="no-referrer" />
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
          <div className="bg-[#1E4468]/80 border border-white/10 rounded-3xl p-3 space-y-1 sticky top-20">
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
          <EntityNavContext.Provider value={{ openEntity }}>
          {section === "clients"    && <ClientsSection setToast={setToast} />}
          {section === "candidates" && <CandidatesSection />}
          {section === "companies"  && <CompaniesListSection />}
          {section === "vacancies"  && <VacanciesAnalyticsSection />}
          {section === "interviews" && <InterviewsSection />}
          {section === "trainings"  && <TrainingsSection />}
          {section === "blog"       && <BlogAdmin />}
          {section === "mailings"   && <MailingsSection />}
          {section === "roles"      && <RolesSection setToast={setToast} />}
          {section === "accounts"   && <AccountsSection setToast={setToast} />}
          {section === "logs"       && <LogsSection />}
          {section === "ai"         && <AISection />}
          {section === "reviews"    && <ReviewsSection setToast={setToast} />}
          {entityStack.length > 0 && (
            <EntityModal
              entity={entityStack[entityStack.length - 1]}
              setToast={setToast}
              onClose={closeEntity}
            />
          )}
          </EntityNavContext.Provider>
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
  const { openEntity } = useEntityNav();

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
      <div className="bg-[#1E4468]/80 border border-white/10 rounded-3xl p-4 flex flex-wrap items-center gap-3 justify-between">
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
              <div key={col.key} className="bg-[#1E4468]/40 border border-white/5 rounded-2xl p-3 min-h-[300px]">
                <div className="flex items-center justify-between border-b border-white/5 pb-2 text-xs font-bold text-slate-300">
                  <span>{col.label}</span>
                  <span className="bg-black/30 font-mono px-2 py-0.5 rounded-full text-[10px] text-[#E7C768]">{items.length}</span>
                </div>
                <div className="space-y-2 mt-2">
                  {items.length === 0 ? <div className="text-center py-6 text-slate-500 text-[11px]">Пусто</div> : items.map((r) => (
                    <div key={r.id} onClick={() => openEntity("employer", r.id)}
                      className="bg-[#17344F]/85 border border-white/10 hover:border-[#E7C768] p-2.5 rounded-xl cursor-pointer transition">
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
        <div className="bg-[#1E4468]/40 border border-white/10 rounded-3xl overflow-hidden">
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
                    <tr key={r.id} className="hover:bg-white/5 cursor-pointer" onClick={() => openEntity("employer", r.id)}>
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
      (!q || (r.full_name || "").toLowerCase().includes(q) || (r.email || "").toLowerCase().includes(q) || (r.role_name || "").toLowerCase().includes(q) || (r.company_name || "").toLowerCase().includes(q))
    );
  }, [rows, search, stage]);

  const STAGES = ["all", "registration", "screening", "checklist", "situations", "professional", "product", "systems", "certified"];

  return (
    <div className="space-y-4">
      <div className="bg-[#1E4468]/80 border border-white/10 rounded-3xl p-4 flex flex-wrap items-center gap-3 justify-between">
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
        <div className="bg-[#1E4468]/40 border border-white/10 rounded-3xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#17344F] text-[#E7C768] uppercase tracking-wider text-[10px] font-mono">
                <tr><th className="p-3">ID</th><th className="p-3">ФИО</th><th className="p-3">Email</th><th className="p-3">Роль</th><th className="p-3">Компания</th><th className="p-3">Этап</th><th className="p-3">Балл</th><th className="p-3">Создан</th></tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-white/5 cursor-pointer" onClick={() => setSelected(r.id)}>
                    <td className="p-3 font-mono text-slate-400">{r.public_id}</td>
                    <td className="p-3 font-bold text-white">{r.full_name || "—"}</td>
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
  const [selected, setSelected] = useState<any | null>(null);
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any).from(table).select("*").limit(500).order("created_at", { ascending: false });
      setRows(((data as any[]) || []));
      setLoading(false);
    })();
  }, [table]);
  const cols = rows[0] ? Object.keys(rows[0]).slice(0, 8) : [];
  const lbls = RU_LABELS[table] || {};
  return (
    <div className="space-y-3">
      <div className="bg-[#1E4468]/80 border border-white/10 rounded-3xl p-4 flex items-center justify-between">
        <h2 className="text-base font-bold text-[#E7C768]">{title} — {rows.length}</h2>
      </div>
      {loading ? (
        <div className="text-center py-12 text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline" /> Загрузка...</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-slate-400 bg-[#1E4468]/40 border border-white/10 rounded-3xl">Нет данных</div>
      ) : (
        <div className="bg-[#1E4468]/40 border border-white/10 rounded-3xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-[#17344F] text-[#E7C768] uppercase tracking-wider text-[10px] font-mono">
                <tr>{cols.map((c) => <th key={c} className="p-2.5" title={c}>{lbls[c] || c}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((r, i) => (
                  <tr key={r.id || i} className="hover:bg-white/5 cursor-pointer" onClick={() => setSelected(r)}>
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
      <DetailsModal
        title={title}
        data={selected}
        table={table}
        labels={RU_LABELS[table]}
        omitKeys={OMIT_KEYS[table]}
        onClose={() => setSelected(null)}
        onSaved={(row) => {
          setSelected(null);
          setRows((rs) => rs.map((x) => (x.id === row?.id ? { ...x, ...row } : x)));
        }}
      />
    </div>
  );
}

function MailingsSection() {
  return (
    <div className="bg-[#1E4468]/80 border border-white/10 rounded-3xl p-8 text-center space-y-3">
      <Mail className="w-10 h-10 mx-auto text-[#E7C768]" />
      <h2 className="text-base font-bold text-[#E7C768]">Рассылки</h2>
      <p className="text-xs text-slate-300 max-w-md mx-auto">
        Конструктор массовых рассылок будет здесь. Отправка работает в кабинете работодателя (CRM → Рассылка). В следующих итерациях добавим централизованные шаблоны и кампании.
      </p>
    </div>
  );
}

/* ============== Interviews — кандидат-центричный список (#6) ============== */

function InterviewsSection() {
  const [scores, setScores] = useState<any[]>([]);
  const [cands, setCands] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [s, c] = await Promise.all([
      (supabase as any).from("candidate_scores").select("*").order("updated_at", { ascending: false }).limit(500),
      supabase.rpc("admin_list_candidates" as any),
    ]);
    setScores(((s as any).data as any[]) || []);
    setCands(((c as any).data as any[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const candMap = useMemo(() => {
    const m: Record<string, any> = {};
    cands.forEach((c) => { m[c.id] = c; });
    return m;
  }, [cands]);

  const enriched = useMemo(() => scores.map((s) => {
    const c = candMap[s.candidate_id] || {};
    return { ...s, _name: c.full_name || "", _email: c.email || "", _role: c.role_name || c.project_role || "", _company: c.company_name || "", _public_id: c.public_id || "" };
  }), [scores, candMap]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return enriched;
    return enriched.filter((r) =>
      (r._name || "").toLowerCase().includes(q) ||
      (r._email || "").toLowerCase().includes(q) ||
      (r._role || "").toLowerCase().includes(q) ||
      (r._company || "").toLowerCase().includes(q));
  }, [enriched, search]);

  return (
    <div className="space-y-3">
      <div className="bg-[#1E4468]/80 border border-white/10 rounded-3xl p-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-[#E7C768]">Интервью (оценки кандидатов) — {filtered.length}</h2>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по ФИО / email / роли / компании…"
          className="bg-[#17344F]/60 text-xs text-white px-3 py-2 rounded-xl border border-white/10 min-w-[260px]" />
      </div>
      {loading ? (
        <div className="text-center py-12 text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline" /> Загрузка…</div>
      ) : (
        <div className="bg-[#1E4468]/40 border border-white/10 rounded-3xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#17344F] text-[#E7C768] uppercase tracking-wider text-[10px] font-mono">
                <tr>
                  <th className="p-3">Кандидат</th><th className="p-3">Email</th><th className="p-3">Роль</th><th className="p-3">Компания</th>
                  <th className="p-3 text-center">Резюме</th><th className="p-3 text-center">Чек-лист</th><th className="p-3 text-center">Ситуации</th>
                  <th className="p-3 text-center">Общий</th><th className="p-3">Обновлено</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((r) => (
                  <tr key={r.candidate_id} className="hover:bg-white/5 cursor-pointer" onClick={() => setSelected(r.candidate_id)}>
                    <td className="p-3 font-bold text-white">{r._name || "—"}<div className="text-[10px] text-slate-400 font-mono">#{r._public_id}</div></td>
                    <td className="p-3 text-slate-300">{r._email || "—"}</td>
                    <td className="p-3">{r._role || "—"}</td>
                    <td className="p-3">{r._company || "—"}</td>
                    <td className="p-3 text-center font-mono text-cyan-300">{r.resume_score ?? "—"}</td>
                    <td className="p-3 text-center font-mono text-violet-300">{r.checklist_score ?? "—"}</td>
                    <td className="p-3 text-center font-mono text-amber-300">{r.situations_score ?? "—"}</td>
                    <td className="p-3 text-center font-mono font-bold text-[#E7C768]">{r.overall_score ?? "—"}</td>
                    <td className="p-3 text-[10px] text-slate-400">{r.updated_at ? new Date(r.updated_at).toLocaleString() : ""}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="p-6 text-center text-slate-400">Ничего не найдено</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <CandidateDetailsModal candidateId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

/* ============== Trainings — кандидат-центричный список (#6) ============== */

function TrainingsSection() {
  const [progress, setProgress] = useState<any[]>([]);
  const [cands, setCands] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<string>("all");
  const [selected, setSelected] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [p, c] = await Promise.all([
      (supabase as any).from("candidate_stage_progress").select("*").order("updated_at", { ascending: false }).limit(1000),
      supabase.rpc("admin_list_candidates" as any),
    ]);
    setProgress(((p as any).data as any[]) || []);
    setCands(((c as any).data as any[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const candMap = useMemo(() => {
    const m: Record<string, any> = {};
    cands.forEach((c) => { m[c.id] = c; });
    return m;
  }, [cands]);

  const enriched = useMemo(() => progress.map((s) => {
    const c = candMap[s.candidate_id] || {};
    return { ...s, _name: c.full_name || "", _email: c.email || "", _role: c.role_name || c.project_role || "", _company: c.company_name || "", _public_id: c.public_id || "" };
  }), [progress, candMap]);

  const STAGES = Array.from(new Set(progress.map((p) => p.stage).filter(Boolean)));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter((r) =>
      (stage === "all" || r.stage === stage) &&
      (!q ||
        (r._name || "").toLowerCase().includes(q) ||
        (r._email || "").toLowerCase().includes(q) ||
        (r._role || "").toLowerCase().includes(q) ||
        (r._company || "").toLowerCase().includes(q) ||
        (r.stage || "").toLowerCase().includes(q)));
  }, [enriched, search, stage]);

  return (
    <div className="space-y-3">
      <div className="bg-[#1E4468]/80 border border-white/10 rounded-3xl p-4 flex flex-wrap items-center gap-3 justify-between">
        <h2 className="text-base font-bold text-[#E7C768]">Прогресс обучения — {filtered.length}</h2>
        <div className="flex items-center gap-2">
          <select value={stage} onChange={(e) => setStage(e.target.value)}
            className="bg-[#17344F]/60 text-xs text-white px-3 py-2 rounded-xl border border-white/10">
            <option value="all" className="bg-slate-900">Все этапы</option>
            {STAGES.map((s) => <option key={s} value={s} className="bg-slate-900">{s}</option>)}
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по ФИО / email / роли / компании…"
            className="bg-[#17344F]/60 text-xs text-white px-3 py-2 rounded-xl border border-white/10 min-w-[260px]" />
        </div>
      </div>
      {loading ? (
        <div className="text-center py-12 text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline" /> Загрузка…</div>
      ) : (
        <div className="bg-[#1E4468]/40 border border-white/10 rounded-3xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#17344F] text-[#E7C768] uppercase tracking-wider text-[10px] font-mono">
                <tr>
                  <th className="p-3">Кандидат</th><th className="p-3">Email</th><th className="p-3">Роль</th><th className="p-3">Компания</th>
                  <th className="p-3">Этап</th><th className="p-3 text-center">Попыток</th><th className="p-3 text-center">Лучший</th>
                  <th className="p-3 text-center">Последний</th><th className="p-3">Сдан</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((r, i) => (
                  <tr key={`${r.candidate_id}-${r.stage}-${i}`} className="hover:bg-white/5 cursor-pointer" onClick={() => setSelected(r.candidate_id)}>
                    <td className="p-3 font-bold text-white">{r._name || "—"}<div className="text-[10px] text-slate-400 font-mono">#{r._public_id}</div></td>
                    <td className="p-3 text-slate-300">{r._email || "—"}</td>
                    <td className="p-3">{r._role || "—"}</td>
                    <td className="p-3">{r._company || "—"}</td>
                    <td className="p-3"><span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#E7C768]/15 text-[#E7C768]">{r.stage}</span></td>
                    <td className="p-3 text-center font-mono">{r.attempts ?? "—"}</td>
                    <td className="p-3 text-center font-mono text-[#E7C768] font-bold">{r.best_score ?? "—"}</td>
                    <td className="p-3 text-center font-mono text-slate-200">{r.last_score ?? "—"}</td>
                    <td className="p-3 text-[10px] text-slate-400">{r.passed_at ? new Date(r.passed_at).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="p-6 text-center text-slate-400">Ничего не найдено</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <CandidateDetailsModal candidateId={selected} onClose={() => setSelected(null)} />
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
      <div className="bg-[#1E4468]/80 border border-white/10 rounded-3xl p-4 flex items-center justify-between">
        <h2 className="text-base font-bold text-[#E7C768]">Роли — {users.length} пользователей</h2>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск..."
          className="bg-[#17344F]/60 text-xs text-white px-3 py-2 rounded-xl border border-white/10" />
      </div>
      {loading ? <div className="text-center py-12 text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline" /></div> : (
        <div className="bg-[#1E4468]/40 border border-white/10 rounded-3xl overflow-hidden">
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
  const [selectedTx, setSelectedTx] = useState<any | null>(null);
  const [search, setSearch] = useState("");
  const [walletMap, setWalletMap] = useState<Record<string, string>>({});
  const { openEntity } = useEntityNav();

  const load = async () => {
    setLoading(true);
    const [emp, t, w] = await Promise.all([
      supabase.rpc("admin_list_employers" as any),
      (supabase as any).from("transactions").select("*").order("created_at", { ascending: false }).limit(200),
      (supabase as any).from("wallets").select("id, employer_id"),
    ]);
    if ((emp as any).error) setToast({ kind: "err", text: (emp as any).error.message });
    setRows(((emp as any).data as any[]) || []);
    setTxs(((t as any).data as any[]) || []);
    const wmap: Record<string, string> = {};
    (((w as any).data as any[]) || []).forEach((x: any) => { wmap[x.id] = x.employer_id; });
    setWalletMap(wmap);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Realtime: обновляем балансы и транзакции мгновенно
  useEffect(() => {
    const ch = supabase
      .channel("admin-accounts-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "wallets" }, () => { load(); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "transactions" }, (p: any) => {
        setTxs((prev) => [p.new, ...prev].slice(0, 200));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "transactions" }, (p: any) => {
        setTxs((prev) => prev.map((t) => (t.id === p.new.id ? p.new : t)));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "employers" }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const adjust = async (employerId: string, delta: number) => {
    const note = window.prompt(`Комментарий к ${delta > 0 ? "начислению" : "списанию"} ${Math.abs(delta)} RR:`, "Корректировка администратором");
    if (note === null) return;
    const { error } = await supabase.rpc("admin_wallet_adjust" as any, { _employer: employerId, _delta: delta, _note: note });
    if (error) setToast({ kind: "err", text: error.message });
    else { setToast({ kind: "ok", text: "Баланс обновлён" }); load(); }
  };

  const empById = useMemo(() => {
    const m: Record<string, any> = {};
    rows.forEach((r) => { m[r.id] = r; });
    return m;
  }, [rows]);

  const enrichedTxs = useMemo(() => txs.map((t) => {
    const empId = walletMap[t.wallet_id];
    const emp = empId ? empById[empId] : null;
    return { ...t, _emp_id: empId, _emp_name: emp?.name || "", _emp_email: emp?.email || "" };
  }), [txs, walletMap, empById]);

  const filteredTxs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return enrichedTxs;
    return enrichedTxs.filter((t) =>
      (t._emp_name || "").toLowerCase().includes(q) ||
      (t._emp_email || "").toLowerCase().includes(q) ||
      (t.note || "").toLowerCase().includes(q) ||
      (t.type || "").toLowerCase().includes(q));
  }, [enrichedTxs, search]);

  return (
    <div className="space-y-4">
      <div className="bg-[#1E4468]/80 border border-white/10 rounded-3xl p-4">
        <h2 className="text-base font-bold text-[#E7C768]">Счета и балансы <span className="text-[10px] text-emerald-300 ml-2">● live</span></h2>
      </div>
      {loading ? <div className="text-center py-12 text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline" /></div> : (
        <>
          <div className="bg-[#1E4468]/40 border border-white/10 rounded-3xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#17344F] text-[#E7C768] uppercase tracking-wider text-[10px] font-mono">
                  <tr><th className="p-3">ID</th><th className="p-3">Клиент</th><th className="p-3">Баланс RR</th><th className="p-3">Корректировка</th></tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-white/5">
                      <td className="p-3 font-mono text-slate-400 cursor-pointer" onClick={() => openEntity("employer", r.id)}>{r.public_id}</td>
                      <td className="p-3 cursor-pointer" onClick={() => openEntity("employer", r.id)}><div className="font-bold text-[#E7C768]">{r.name || r.email || "—"}</div><div className="text-[10px] text-slate-400">{r.email}</div></td>
                      <td className="p-3 font-mono text-[#E7C768] font-bold cursor-pointer" onClick={() => openEntity("employer", r.id)}>{r.balance}</td>
                      <td className="p-3 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
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

          <div className="bg-[#1E4468]/80 border border-white/10 rounded-3xl p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-sm font-bold text-[#E7C768]">Последние транзакции — {filteredTxs.length}</h3>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по клиенту / email / заметке…"
                className="bg-[#17344F]/60 text-xs text-white px-3 py-2 rounded-xl border border-white/10 min-w-[260px]" />
            </div>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-[#17344F] text-[#E7C768] uppercase tracking-wider text-[10px] font-mono sticky top-0">
                  <tr><th className="p-2.5">Дата</th><th className="p-2.5">Клиент</th><th className="p-2.5">Email</th><th className="p-2.5">Тип</th><th className="p-2.5">Сумма</th><th className="p-2.5">Заметка</th></tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredTxs.map((t) => (
                    <tr key={t.id} className="hover:bg-white/5 cursor-pointer" onClick={() => setSelectedTx(t)}>
                      <td className="p-2.5 text-slate-400">{t.created_at ? new Date(t.created_at).toLocaleString() : ""}</td>
                      <td className="p-2.5" onClick={(e) => e.stopPropagation()}>
                        {t._emp_id ? (
                          <EntityLink kind="employer" id={t._emp_id}>{t._emp_name || t._emp_email || "—"}</EntityLink>
                        ) : <span className="text-slate-500">—</span>}
                      </td>
                      <td className="p-2.5 text-slate-300 text-[10px]">{t._emp_email || "—"}</td>
                      <td className="p-2.5">{t.type}</td>
                      <td className="p-2.5 font-mono font-bold text-[#E7C768]">{t.amount_rr}</td>
                      <td className="p-2.5 max-w-[320px] truncate" title={t.note || ""}>{t.note}</td>
                    </tr>
                  ))}
                  {filteredTxs.length === 0 && (
                    <tr><td colSpan={6} className="p-6 text-center text-slate-400">Нет транзакций</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <DetailsModal
        title="Транзакция"
        data={selectedTx}
        table="transactions"
        labels={RU_LABELS.transactions}
        onClose={() => setSelectedTx(null)}
      />
    </div>
  );
}

function VacanciesAnalyticsSection() {
  const [projects, setProjects] = useState<any[]>([]);
  const [companies, setCompanies] = useState<Record<string, any>>({});
  const [cands, setCands] = useState<any[]>([]);
  const [scores, setScores] = useState<any[]>([]);
  const [progress, setProgress] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const { openEntity } = useEntityNav();

  const load = async () => {
    setLoading(true);
    const [p, co, c, s, pr] = await Promise.all([
      (supabase as any).from("projects").select("id, public_id, role_name, status, is_published, company_id, created_at, max_interviews, max_trainings").order("created_at", { ascending: false }).limit(500),
      (supabase as any).from("companies").select("id, name, public_id").limit(1000),
      (supabase as any).from("candidates").select("id, project_id, current_stage, created_at").limit(5000),
      (supabase as any).from("candidate_scores").select("candidate_id, resume_score, checklist_score, situations_score, overall_score").limit(5000),
      (supabase as any).from("candidate_stage_progress").select("candidate_id, stage, status").limit(5000),
    ]);
    setProjects(((p as any).data as any[]) || []);
    const coMap: Record<string, any> = {};
    (((co as any).data as any[]) || []).forEach((x) => { coMap[x.id] = x; });
    setCompanies(coMap);
    setCands(((c as any).data as any[]) || []);
    setScores(((s as any).data as any[]) || []);
    setProgress(((pr as any).data as any[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Realtime: счётчики обновляются мгновенно
  useEffect(() => {
    const ch = supabase
      .channel("admin-vacancies-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "candidate_scores" }, () => { load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "candidate_stage_progress" }, () => { load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "candidates" }, () => { load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const candById = useMemo(() => {
    const m: Record<string, any> = {};
    cands.forEach((c) => { m[c.id] = c; });
    return m;
  }, [cands]);

  const stats = useMemo(() => {
    const byProj: Record<string, any> = {};
    projects.forEach((p) => {
      byProj[p.id] = { registrations: 0, screening: 0, checklist: 0, situations: 0, training: 0, sumScore: 0, scoreCount: 0 };
    });
    cands.forEach((c) => { if (byProj[c.project_id]) byProj[c.project_id].registrations++; });
    scores.forEach((s) => {
      const c = candById[s.candidate_id];
      const b = c && byProj[c.project_id];
      if (!b) return;
      if (s.resume_score != null) b.screening++;
      if (s.checklist_score != null) b.checklist++;
      if (s.situations_score != null) b.situations++;
      if (s.overall_score != null) { b.sumScore += Number(s.overall_score); b.scoreCount++; }
    });
    progress.forEach((pp) => {
      const c = candById[pp.candidate_id];
      const b = c && byProj[c.project_id];
      if (!b) return;
      if (pp.status === "completed" || pp.status === "done") b.training++;
    });
    return byProj;
  }, [projects, cands, scores, progress, candById]);

  const filtered = projects.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const co = companies[p.company_id];
    return (p.role_name || "").toLowerCase().includes(q)
      || (p.public_id || "").toLowerCase().includes(q)
      || (co?.name || "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-3">
      <div className="bg-[#1E4468]/80 border border-white/10 rounded-3xl p-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-[#E7C768]">Вакансии — {projects.length} <span className="text-[10px] text-emerald-300 ml-2">● live</span></h2>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по роли / компании / ID…"
          className="bg-[#17344F]/60 text-xs text-white px-3 py-2 rounded-xl border border-white/10 min-w-[220px]" />
      </div>
      {loading && projects.length === 0 ? (
        <div className="text-center py-12 text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline" /> Загрузка…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((p) => {
            const co = companies[p.company_id];
            const st = stats[p.id] || { registrations: 0, screening: 0, checklist: 0, situations: 0, training: 0, sumScore: 0, scoreCount: 0 };
            const avg = st.scoreCount > 0 ? Math.round(st.sumScore / st.scoreCount) : null;
            return (
              <div key={p.id} onClick={() => openEntity("project", p.id)}
                className="bg-[#1E4468]/60 border border-white/10 rounded-2xl p-4 cursor-pointer hover:border-[#E7C768]/40 transition">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white truncate">{p.role_name || "—"}</div>
                    <div className="text-[11px] text-slate-300 truncate">{co?.name || "—"}</div>
                    <div className="text-[10px] text-slate-500 font-mono">#{p.public_id}</div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${p.is_published ? "bg-emerald-500/20 text-emerald-200" : "bg-slate-500/20 text-slate-300"}`}>
                    {p.is_published ? "опубл." : p.status || "draft"}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 mt-3 text-center">
                  {[
                    { label: "Регистр.", value: st.registrations, color: "text-sky-300" },
                    { label: "Скрининг", value: st.screening, color: "text-cyan-300" },
                    { label: "Чек-лист", value: st.checklist, color: "text-violet-300" },
                    { label: "Ситуации", value: st.situations, color: "text-amber-300" },
                    { label: "Обучений", value: st.training, color: "text-emerald-300" },
                    { label: "Ср. балл", value: avg ?? "—", color: "text-[#E7C768]" },
                  ].map((k) => (
                    <div key={k.label} className="bg-[#17344F]/60 rounded-lg px-1.5 py-1.5 border border-white/5">
                      <div className={`text-sm font-bold font-mono ${k.color}`}>{k.value}</div>
                      <div className="text-[9px] text-slate-400 uppercase tracking-wider">{k.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-slate-400 bg-[#1E4468]/40 border border-white/10 rounded-3xl">
              Ничего не найдено
            </div>
          )}
        </div>
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
      <div className="bg-[#1E4468]/80 border border-white/10 rounded-3xl p-4">
        <h2 className="text-base font-bold text-[#E7C768]">ИИ — функции и настройки</h2>
        <p className="text-xs text-slate-300 mt-1">Список развернутых edge-функций. Редактирование промптов будет добавлено в следующих итерациях (после выноса промптов в БД).</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {fns.map((f) => (
          <a key={f} href={`https://supabase.com/dashboard/project/rjhtauzookkvlipvqpvr/functions/${f}/logs`} target="_blank" rel="noreferrer"
            className="bg-[#1E4468]/60 hover:bg-[#1E4468]/90 border border-white/10 hover:border-[#E7C768]/50 rounded-xl p-3 text-xs font-mono text-slate-200 transition">
            {f}
          </a>
        ))}
      </div>
    </div>
  );
}

/* ============== Logs (ProTalk usage) ============== */

// 10 000 000 tokens === 300 ₽  →  0.00003 ₽ per token
const RUB_PER_TOKEN = 300 / 10_000_000;

function LogsSection() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    setRows((data as any[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.user_message, r.bot_reply, r.channel_name, r.bot_id, r.llm, r.user_social_id]
        .some((v) => v && String(v).toLowerCase().includes(q))
    );
  }, [rows, search]);

  const totalTokens = useMemo(
    () => filtered.reduce((s, r) => s + (Number(r.tokens_total) || 0), 0),
    [filtered]
  );
  const totalRub = totalTokens * RUB_PER_TOKEN;

  return (
    <div className="space-y-4">
      <div className="bg-[#1E4468]/80 border border-white/10 rounded-3xl p-4 flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h2 className="text-base font-bold text-[#E7C768]">Логи сообщений ProTalk — {rows.length}</h2>
          <p className="text-[11px] text-slate-300 mt-0.5">
            Тариф: 10 000 000 токенов = 300 ₽ (≈ {RUB_PER_TOKEN.toFixed(6)} ₽ за токен)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по сообщению / каналу / боту..."
            className="bg-[#17344F]/60 text-xs text-white px-3 py-2 rounded-xl border border-white/10 w-72" />
          <button onClick={load} className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 border border-white/10 flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Обновить
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-[#1E4468]/70 border border-white/10 rounded-2xl p-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-300">Записей в выборке</div>
          <div className="text-2xl font-bold text-[#E7C768] font-mono mt-1">{filtered.length}</div>
        </div>
        <div className="bg-[#1E4468]/70 border border-white/10 rounded-2xl p-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-300">Сумма токенов (tokens_total)</div>
          <div className="text-2xl font-bold text-[#E7C768] font-mono mt-1">{totalTokens.toLocaleString("ru-RU")}</div>
        </div>
        <div className="bg-gradient-to-br from-[#E7C768]/20 to-[#D99E41]/20 border border-[#E7C768]/40 rounded-2xl p-4">
          <div className="text-[10px] uppercase tracking-wider text-[#E7C768]">Расход ProTalk, ₽</div>
          <div className="text-2xl font-bold text-[#F4EE8E] font-mono mt-1">
            {totalRub.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline" /> Загрузка...</div>
      ) : (
        <div className="bg-[#1E4468]/40 border border-white/10 rounded-3xl overflow-hidden">
          <div className="overflow-x-auto overflow-y-auto max-h-[60vh]" style={{ WebkitOverflowScrolling: "touch" }}>
            <table className="text-left text-[11px]" style={{ minWidth: 1400 }}>
              <thead className="bg-[#17344F] text-[#E7C768] uppercase tracking-wider text-[10px] font-mono sticky top-0">
                <tr>
                  <th className="p-2.5">Дата</th>
                  <th className="p-2.5">Канал</th>
                  <th className="p-2.5">LLM</th>
                  <th className="p-2.5">Сообщение</th>
                  <th className="p-2.5">Ответ RR</th>
                  <th className="p-2.5 text-right">Токенов</th>
                  <th className="p-2.5 text-right">₽</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((r) => {
                  const rub = (Number(r.tokens_total) || 0) * RUB_PER_TOKEN;
                  return (
                    <tr key={r.id} className="hover:bg-white/5 cursor-pointer" onClick={() => setSelected(r)}>
                      <td className="p-2.5 text-slate-400 whitespace-nowrap">{r.created_at ? new Date(r.created_at).toLocaleString() : "—"}</td>
                      <td className="p-2.5 text-slate-200">{r.channel_name || "—"}</td>
                      <td className="p-2.5 text-slate-400">{r.llm || "—"}</td>
                      <td className="p-2.5 text-slate-200 align-top"><div className="max-w-[360px] line-clamp-3">{r.user_message || "—"}</div></td>
                      <td className="p-2.5 text-slate-200 align-top"><div className="max-w-[420px] line-clamp-3">{r.bot_reply || "—"}</div></td>
                      <td className="p-2.5 text-right font-mono text-[#E7C768]">{(r.tokens_total || 0).toLocaleString("ru-RU")}</td>
                      <td className="p-2.5 text-right font-mono text-[#F4EE8E]">
                        {rub.toLocaleString("ru-RU", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="p-6 text-center text-slate-400">Нет записей</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <DetailsModal title="Лог сообщения" data={selected} table="logs" onClose={() => setSelected(null)} />
    </div>
  );
}

/* ============== Reviews moderation ============== */
function ReviewsSection({ setToast }: { setToast: (t: any) => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("reviews").select("*").order("created_at", { ascending: false }).limit(500);
    setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const del = async (id: string) => {
    if (!confirm("Удалить отзыв?")) return;
    const { error } = await supabase.from("reviews").delete().eq("id", id);
    if (error) { setToast({ kind: "err", text: error.message }); return; }
    setToast({ kind: "ok", text: "Отзыв удалён" });
    load();
  };

  const regenAi = async (id: string) => {
    setBusy(id);
    try {
      const { data, error } = await supabase.functions.invoke("reviews-ai-reply", { body: { review_id: id } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error(String((data as any).error));
      setToast({ kind: "ok", text: "Ответ ИИ обновлён" });
      load();
    } catch (e: any) {
      setToast({ kind: "err", text: e?.message || "Ошибка" });
    } finally { setBusy(null); }
  };

  return (
    <div className="bg-[#1E4468]/80 border border-white/10 rounded-3xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-white">Отзывы — модерация</h2>
        <button onClick={load} className="text-slate-300 hover:text-white inline-flex items-center gap-1 text-sm">
          <RefreshCw className="w-4 h-4" /> Обновить
        </button>
      </div>
      {loading ? (
        <div className="p-6 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 1100 }}>
            <thead className="text-xs text-slate-400 border-b border-white/10">
              <tr>
                <th className="text-left p-2">Дата</th>
                <th className="text-left p-2">Автор</th>
                <th className="text-left p-2">Отзыв</th>
                <th className="text-left p-2">Ответ ИИ</th>
                <th className="text-left p-2">Ответ админа</th>
                <th className="text-center p-2">Опубл.</th>
                <th className="text-right p-2">Действия</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-white/5 hover:bg-white/5 cursor-pointer" onClick={() => setSelected(r)}>
                  <td className="p-2 text-slate-300 whitespace-nowrap">{new Date(r.created_at).toLocaleDateString("ru-RU")}</td>
                  <td className="p-2 text-white whitespace-nowrap">{r.first_name} {r.last_name}</td>
                  <td className="p-2 text-slate-200"><div className="max-w-[300px] line-clamp-3">{r.content}</div></td>
                  <td className="p-2 text-slate-300"><div className="max-w-[260px] line-clamp-3">{r.ai_reply || "—"}</div></td>
                  <td className="p-2 text-emerald-200"><div className="max-w-[260px] line-clamp-3">{r.admin_reply || "—"}</div></td>
                  <td className="p-2 text-center">{r.is_published ? "✓" : "—"}</td>
                  <td className="p-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <button disabled={busy === r.id} onClick={() => regenAi(r.id)} className="text-xs px-2 py-1 rounded bg-[#E7C768]/20 text-[#E7C768] hover:bg-[#E7C768]/30 mr-1 disabled:opacity-50">
                      {busy === r.id ? "…" : "ИИ"}
                    </button>
                    <button onClick={() => del(r.id)} className="text-xs px-2 py-1 rounded bg-rose-500/20 text-rose-200 hover:bg-rose-500/30">Удалить</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-400">Нет отзывов</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <DetailsModal title="Отзыв" data={selected} table="reviews" labels={RU_LABELS.reviews} onClose={() => setSelected(null)} onSaved={load} />
    </div>
  );
}
