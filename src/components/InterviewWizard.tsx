import React, { useEffect, useMemo, useState } from "react";
import { MessageSquare, RefreshCw, Save, Plus, Trash2, Wand2, FileText, ArrowLeft, CheckCircle2, Info, PlayCircle, Wallet, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { packTierPrice, formatRR } from "@/lib/rr";
import { LoadingPhrase } from "@/components/LoadingPhrase";
import { useAIWait } from "@/components/AIWaitProvider";
import FullscreenTextarea from "@/components/FullscreenTextarea";
import FieldHelp from "@/components/FieldHelp";
import type { JobProject } from "../types";
import { diagLog, tail } from "@/lib/diagLog";
import { pollEmployerJobUntilTerminal, isSuccess } from "@/lib/aiJobs";

type Kind = "resume" | "checklist" | "situations";
type AuditFn = (level: "success" | "warning" | "info", title: string, msg: string) => void;

type ChecklistQ = {
  id: string; kind: "choice" | "text"; question: string;
  options?: string[] | null; correct?: string | null; expected_answer?: string | null; explanation?: string;
};
type Situation = { id: string; title: string; brief: string; criteria: string };

interface Props {
  projects: JobProject[];
  refreshProjects: () => Promise<void> | void;
  addAuditEvent: AuditFn;
  /** When set, opens the editor for this vacancy and locks the picker. */
  initialProjectId?: string;
  /** When set, opens in "create new" mode — user must pick a vacancy. */
  createMode?: boolean;
  /** Back-to-list callback. */
  onBack?: () => void;
}

const KINDS: { key: Kind; title: string; hint: string }[] = [
  { key: "resume",     title: "1. Резюме",    hint: "Важные критерии для скрининга" },
  { key: "checklist",  title: "2. Чек-лист",  hint: "20 вопросов: 10 выбор + 10 текст" },
  { key: "situations", title: "3. Ситуации",  hint: "3 ролевые ситуации" },
];

const WISH_PLACEHOLDER: Record<Kind, string> = {
  resume:     "Например: «Обязательно опыт от 2 лет в B2B-продажах», «Кандидаты только из РФ», «Игнорировать резюме без релевантного опыта в FMCG».",
  checklist:  "Например: «Больше вопросов про CRM Bitrix24», «Добавь 3 каверзных вопроса с НЕ», «Включи проверку знания скриптов холодных звонков».",
  situations: "Например: «Ситуация со сложным клиентом, требующим скидку 30%», «Ситуация эскалации жалобы», «Кейс срыва сделки в последний момент».",
};
const WISH_EXAMPLE: Record<Kind, string> = {
  resume:     "Что писать: 1) обязательные/желательные навыки и опыт; 2) красные флаги (что отсеивает кандидата сразу); 3) на что обратить особое внимание в этой конкретной вакансии (отрасль, продукт, локация).",
  checklist:  "Что писать: 1) акцент на конкретные технологии/продукты, которые надо проверить; 2) формат вопросов (каверзные, кейсы, термины); 3) что НЕ должно быть в вопросах (исключаемые темы).",
  situations: "Что писать: 1) тип конфликтных ситуаций, характерных для вашей компании; 2) стиль поведения «контрагента» (агрессивный/мягкий клиент); 3) на какие компетенции делать упор (эмпатия, аргументация, навыки переговоров).",
};

const PROMPT_TITLE: Record<Kind, string> = {
  resume:     "Промт для ИИ — что учитывать при оценке резюме",
  checklist:  "Промт для ИИ — какие навыки и темы проверять",
  situations: "Промт для ИИ — какие сценарии генерировать",
};
const RESULT_TITLE: Record<Kind, string> = {
  resume:     "Результат ИИ — критерии, по которым ИИ оценит резюме кандидата",
  checklist:  "Результат ИИ — чек-лист, который проходит кандидат (ИИ оценивает каждый пункт)",
  situations: "Результат ИИ — ситуации, на которые отвечает кандидат (ИИ оценивает соответствие критериям)",
};

import { FN as FN_URL } from "@/config";

export default function InterviewWizard({ projects, refreshProjects, addAuditEvent, initialProjectId, createMode, onBack }: Props) {
  const { run: aiWaitRun } = useAIWait();
  const [projectId, setProjectId] = useState(initialProjectId || "");
  const lockedProject = !!initialProjectId;
  const [kind, setKind] = useState<Kind>("resume");
  const [resumeMd, setResumeMd] = useState("");
  const [checklist, setChecklist] = useState<ChecklistQ[]>([]);
  const [checklistShuffle, setChecklistShuffle] = useState(true);
  const [situations, setSituations] = useState<Situation[]>([]);
  const [passScore, setPassScore] = useState(75);
  // Лимиты RR §4: сколько кандидатов могут пройти интервью/обучение по этой
  // вакансии. Списываются из общего баланса работодателя по факту первого
  // успешного скрининга резюме (интервью) и проверки профтеста (обучение).
  const [interviewLimit, setInterviewLimit] = useState<number>(0);
  const [trainingLimit,  setTrainingLimit]  = useState<number>(0);
  const [interviewUsed,  setInterviewUsed]  = useState<number>(0);
  const [trainingUsed,   setTrainingUsed]   = useState<number>(0);
  const [savingLimits,   setSavingLimits]   = useState(false);
  const [savedLimits,    setSavedLimits]    = useState(false);
  // §4: live RR calculator — кошелёк работодателя для расчёта стоимости лимитов.
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [showNoBalanceModal, setShowNoBalanceModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState<null | Kind | "pass">(null);
  const [savedFlash, setSavedFlash] = useState<null | Kind | "pass">(null);
  const [wishes, setWishes] = useState<Record<Kind, string>>({ resume: "", checklist: "", situations: "" });
  const [showExample, setShowExample] = useState<Record<Kind, boolean>>({ resume: false, checklist: false, situations: false });
  const [existingSystems, setExistingSystems] = useState<Set<string>>(new Set());
  const [employerPublicId, setEmployerPublicId] = useState<string>("");

  // Pilot RR Pro Max: surface the fallback button in the AI error overlay
  // only for employer #100006. Server still enforces the same gate.
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await (supabase as any)
        .from("employers").select("public_id, wallets(units_balance)").eq("user_id", user.id).maybeSingle();
      setEmployerPublicId(String((data as any)?.public_id || ""));
      const w = (data as any)?.wallets;
      const bal = Number((Array.isArray(w) ? w[0]?.units_balance : w?.units_balance) ?? 0);
      setWalletBalance(bal);
    })();
  }, []);

  const project = useMemo(() => projects.find(p => p.id === projectId) || null, [projects, projectId]);

  // Don't auto-pick a project in list/create flow — the user must choose explicitly
  // when creating, and the picker is locked when editing.
  useEffect(() => {
    if (initialProjectId) setProjectId(initialProjectId);
  }, [initialProjectId]);

  useEffect(() => {
    if (!createMode) return;
    (async () => {
      const ids = projects.map(p => p.id);
      if (!ids.length) return;
      const { data } = await (supabase as any).from("interview_blocks").select("project_id").in("project_id", ids);
      const set = new Set<string>();
      (data || []).forEach((r: any) => set.add(r.project_id));
      setExistingSystems(set);
    })();
  }, [createMode, projects]);

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      const [{ data: blocks }, { data: pr }] = await Promise.all([
        (supabase as any).from("interview_blocks").select("*").eq("project_id", projectId),
        (supabase as any).from("projects").select("interview_pass_score,role_name,interview_limit,training_limit,interview_used,training_used").eq("id", projectId).maybeSingle(),
      ]);
      setPassScore(((pr as any)?.interview_pass_score) ?? 75);
      setInterviewLimit(Number((pr as any)?.interview_limit ?? 0));
      setTrainingLimit(Number((pr as any)?.training_limit  ?? 0));
      setInterviewUsed(Number((pr as any)?.interview_used  ?? 0));
      setTrainingUsed(Number((pr as any)?.training_used   ?? 0));
      const map: any = {};
      (blocks || []).forEach((b: any) => map[b.kind] = b.payload || {});
      setResumeMd(String(map.resume?.criteria_md || ""));
      setChecklist(Array.isArray(map.checklist?.questions) ? map.checklist.questions : []);
      setChecklistShuffle(map.checklist?.shuffle !== false);
      setSituations(Array.isArray(map.situations?.situations) ? map.situations.situations : []);
    })();
  }, [projectId]);

  const getFreshAccessToken = async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    const expiresSoon = !session?.expires_at || (session.expires_at * 1000 - Date.now()) < 60_000;
    if (!expiresSoon && session?.access_token) return session.access_token;

    const { data: refreshed } = await supabase.auth.refreshSession();
    return refreshed.session?.access_token || session?.access_token || null;
  };

  const callEdge = async (fn: string, body: any) => {
    const request = async (accessToken: string | null) => fetch(FN_URL(fn), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
    });

    let accessToken = await getFreshAccessToken();
    let res = await request(accessToken);
    if (res.status === 401) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      accessToken = refreshed.session?.access_token || null;
      if (accessToken) res = await request(accessToken);
    }
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) {
      const e: any = new Error(j?.error || `HTTP ${res.status}`);
      e.jobId = j?.job_id || null;
      e.fallbackAvailable = !!j?.fallback_available;
      throw e;
    }
    return j;
  };

  const flash = (key: Kind | "pass") => {
    setSavedFlash(key);
    setTimeout(() => setSavedFlash(s => (s === key ? null : s)), 2200);
  };

  const saveBlock = async (k: Kind, payload: any) => {
    if (!projectId) return;
    setSaving(k);
    try {
      const { data: existing } = await (supabase as any).from("interview_blocks").select("id").eq("project_id", projectId).eq("kind", k).maybeSingle();
      if (existing?.id) {
        await (supabase as any).from("interview_blocks").update({ payload }).eq("id", existing.id);
      } else {
        await (supabase as any).from("interview_blocks").insert({ project_id: projectId, kind: k, payload });
      }
      addAuditEvent("success", "Сохранено в БД", `Блок интервью (${k}) сохранён`);
      flash(k);
    } catch (e: any) {
      addAuditEvent("warning", "Ошибка", e?.message || "save failed");
    } finally { setSaving(null); }
  };

  const savePassScore = async () => {
    if (!projectId) return;
    setSaving("pass");
    try {
      await (supabase as any).from("projects").update({ interview_pass_score: passScore }).eq("id", projectId);
      addAuditEvent("success", "Сохранено в БД", `Проходной балл интервью: ${passScore}`);
      flash("pass");
    } finally { setSaving(null); }
  };

  const saveLimits = async () => {
    if (!projectId) return;
    if (interviewLimit < interviewUsed || trainingLimit < trainingUsed) {
      addAuditEvent("warning", "Ошибка", "Лимит не может быть меньше уже использованного");
      return;
    }
    // §4: проверка по балансу — нельзя «забронировать» больше, чем есть RR.
    const interviewExtra = Math.max(0, interviewLimit - interviewUsed);
    const trainingExtra  = Math.max(0, trainingLimit  - trainingUsed);
    const totalReserve   = interviewExtra * packTierPrice(Math.max(1, interviewExtra)) +
                           trainingExtra  * packTierPrice(Math.max(1, trainingExtra));
    if (walletBalance <= 0 && (interviewExtra > 0 || trainingExtra > 0)) {
      setShowNoBalanceModal(true);
      return;
    }
    if (totalReserve > walletBalance) {
      addAuditEvent("warning", "Недостаточно RR",
        `Для брони нужно ${formatRR(totalReserve)}, на балансе ${formatRR(walletBalance)}. Пополните баланс или уменьшите лимиты.`);
      return;
    }
    setSavingLimits(true);
    try {
      await (supabase as any).from("projects").update({
        interview_limit: Math.max(0, Math.floor(interviewLimit)),
        training_limit:  Math.max(0, Math.floor(trainingLimit)),
      }).eq("id", projectId);
      addAuditEvent("success", "Сохранено в БД", `Лимиты по вакансии: интервью ${interviewLimit}, обучение ${trainingLimit}`);
      setSavedLimits(true);
      setTimeout(() => setSavedLimits(false), 2200);
    } catch (e: any) {
      addAuditEvent("warning", "Ошибка", e?.message || "save_failed");
    } finally { setSavingLimits(false); }
  };

  const generate = async () => {
    if (!projectId) return;
    setBusy(true);
    try {
      if (kind === "resume") {
        const requestId =
          (typeof crypto !== "undefined" && (crypto as any).randomUUID)
            ? (crypto as any).randomUUID()
            : `rq-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        diagLog("resume_criteria_generate", "click_started", {
          request_id: requestId,
          candidate_id_tail: tail(projectId),
        });
        const r = await aiWaitRun({
          title: "Формируем критерии…",
          task: async () => {
            const started = Date.now();
            const resp = await callEdge("ai-generate-interview-resume-criteria", {
              project_id: projectId,
              request_id: requestId,
              wishes: wishes.resume || undefined,
            });
            diagLog("resume_criteria_generate", "invoke_success", {
              request_id: requestId,
              job_id: resp?.job_id || null,
              first_status: resp?.status || null,
              ms: Date.now() - started,
            });
            // New async contract: edge returns immediately with job_id.
            // If already terminal (reused success), skip polling.
            let finalStatus: string = resp?.status || "";
            if (resp?.job_id && !resp?.terminal) {
              const row = await pollEmployerJobUntilTerminal({
                jobId: resp.job_id,
                maxMs: 6 * 60_000,
              });
              finalStatus = row.status;
              diagLog("resume_criteria_generate", "response_parsed", {
                request_id: requestId,
                job_id: resp.job_id,
                terminal_status: finalStatus,
              });
            }
            if (!isSuccess(finalStatus)) {
              const err: any = new Error(finalStatus || "ai_failed");
              err.safeCode = finalStatus || "ai_failed";
              throw err;
            }
            // Read the saved criteria back from the block (single source of truth).
            const { data: blk } = await (supabase as any)
              .from("interview_blocks")
              .select("payload")
              .eq("project_id", projectId)
              .eq("kind", "resume")
              .maybeSingle();
            return { criteria_md: String((blk as any)?.payload?.criteria_md || "") };
          },
        });
        if (!r) return;
        if (r.criteria_md) {
          setResumeMd(r.criteria_md);
          diagLog("resume_criteria_generate", "result_rendered", {
            request_id: requestId,
          });
        } else {
          diagLog("resume_criteria_generate", "invoke_error", {
            request_id: requestId,
            code: "empty_criteria",
          });
          addAuditEvent("warning", "Не удалось сформировать критерии", "Попробуйте ещё раз. Код: empty_criteria");
          return;
        }
      } else if (kind === "checklist") {
        const r = await aiWaitRun({
          title: "Генерация чек-листа интервью",
          task: () => callEdge("ai-generate-interview-checklist", { project_id: projectId, wishes: wishes.checklist || undefined }),
          fallback: {
            // Пилот резерва завершён — кнопка доступна всем работодателям
            // при технических сбоях основной нейросети.
            viewerAllowed: true,
            onSuccess: async () => {
              const { data } = await (supabase as any).from("interview_blocks").select("payload").eq("project_id", projectId).eq("kind","checklist").maybeSingle();
              setChecklist((data as any)?.payload?.questions || []);
              addAuditEvent("success", "RR Pro Max", "Чек-лист сгенерирован резервной моделью");
            },
          },
        });
        if (!r) return;
        const { data } = await (supabase as any).from("interview_blocks").select("payload").eq("project_id", projectId).eq("kind","checklist").maybeSingle();
        setChecklist((data as any)?.payload?.questions || []);
      } else {
        const r = await aiWaitRun({
          title: "Генерация ролевых ситуаций",
          task: () => callEdge("ai-generate-interview-situations", { project_id: projectId, wishes: wishes.situations || undefined }),
        });
        if (!r) return;
        const { data } = await (supabase as any).from("interview_blocks").select("payload").eq("project_id", projectId).eq("kind","situations").maybeSingle();
        setSituations((data as any)?.payload?.situations || []);
      }
      addAuditEvent("success", "ИИ сгенерировал", `${kind}`);
    } catch (e: any) {
      const code = e?.safeCode || e?.message || "failed";
      if (kind === "resume") {
        diagLog("resume_criteria_generate", "invoke_error", { code: String(code).slice(0, 64) });
        addAuditEvent("warning", "Не удалось сформировать критерии", `Попробуйте ещё раз. Код: ${String(code).slice(0, 48)}`);
      } else {
        addAuditEvent("warning", "Ошибка ИИ", e?.message || "failed");
      }
    } finally { setBusy(false); }
  };

  const fillFromTemplate = async () => {
    if (!project?.roleName) return;
    const { data } = await supabase.rpc("job_title_get_interview_template" as any, { _title: project.roleName });
    const tpl: any = data || {};
    const rc = typeof tpl.resume_criteria === "string"
      ? tpl.resume_criteria
      : (typeof tpl.resume_criteria?.criteria_md === "string" ? tpl.resume_criteria.criteria_md : "");
    const chk = Array.isArray(tpl.checklist) ? tpl.checklist
      : Array.isArray(tpl.checklist?.questions) ? tpl.checklist.questions : null;
    const sit = Array.isArray(tpl.situations) ? tpl.situations
      : Array.isArray(tpl.situations?.situations) ? tpl.situations.situations : null;
    if (rc) { setResumeMd(rc); await saveBlock("resume", { criteria_md: rc }); }
    if (chk) { setChecklist(chk); await saveBlock("checklist", { questions: chk }); }
    if (sit) { setSituations(sit); await saveBlock("situations", { situations: sit }); }
    addAuditEvent("success", "Шаблон применён", `${project.roleName}`);
  };

  return (
    <div className="space-y-5">
      {onBack && (
        <button type="button" onClick={onBack}
          className="text-xs text-slate-300 hover:text-white flex items-center gap-1.5">
          <ArrowLeft className="w-3.5 h-3.5" /> К списку систем интервью
        </button>
      )}
      <div className="bg-[#1E4468]/80 border border-white/10 rounded-3xl p-5 shadow-xl">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#E7C768]/20 flex items-center justify-center text-[#E7C768]">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <h2 className="text-lg font-bold text-white">
              {createMode ? "Создание системы интервью" : "Редактор системы интервью"}
            </h2>
            <p className="text-xs text-slate-300">3 этапа: Резюме → Чек-лист → Ситуации. ИИ генерирует, вы редактируете.</p>
          </div>
          <div className="w-full md:w-auto">
            {lockedProject ? (
              <div
                data-testid="iw-locked-vacancy-card"
                className="bg-black/30 border border-[#E7C768]/40 rounded-xl px-4 py-3 min-w-[260px] text-left"
              >
                <div className="text-[10px] font-bold text-slate-300 uppercase mb-1">
                  Система оценки для вакансии
                </div>
                <div className="text-sm font-extrabold text-white leading-tight">
                  {project?.roleName || "(без названия)"}
                </div>
                {project?.companyName && (
                  <div className="text-[11px] text-slate-300 mt-0.5">{project.companyName}</div>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#E7C768]/15 text-[#E7C768] border border-[#E7C768]/40">
                    Вакансия закреплена
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Система редактируется только для этой вакансии.
                  </span>
                </div>
              </div>
            ) : (
              <>
                <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1 inline-flex items-center">
                  Вакансия{createMode ? " (обязательно)" : ""}
                  <FieldHelp
                    section="interviews"
                    fieldKey="project_select"
                    fallbackTitle="Выбор вакансии"
                    fallbackBody="Сценарий интервью всегда привязан к вакансии. ИИ берёт описание вакансии и компании как контекст для блоков «Резюме», «Чек-лист» и «Ситуации»."
                  />
                </label>
                <select
                  data-testid="iw-vacancy-select"
                  value={projectId}
                  onChange={e => setProjectId(e.target.value)}
                  className="bg-black/30 text-white border border-white/10 rounded-lg px-3 py-2 text-sm min-w-[260px]"
                >
                  <option value="">— выберите вакансию —</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.roleName || "(без названия)"} · {p.companyName || ""}
                      {createMode && existingSystems.has(p.id) ? " · уже есть система" : ""}
                    </option>
                  ))}
                </select>
                {createMode && projectId && existingSystems.has(projectId) && (
                  <p className="text-[11px] text-amber-300 mt-1.5">
                    ⚠️ Для этой вакансии уже создана система интервью. Сохранение перезапишет существующие блоки.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {projectId && (
        <>
          <div className="bg-[#17344F]/60 border border-white/10 rounded-2xl p-4 flex flex-wrap items-center gap-3">
            <div>
              <div className="text-[10px] uppercase text-slate-400 font-bold inline-flex items-center">
                Проходной средний балл (по 3 этапам)
                <FieldHelp
                  section="interviews"
                  fieldKey="pass_score"
                  fallbackTitle="Проходной средний балл"
                  fallbackBody="ИИ ставит балл по каждому из 3 блоков (Резюме, Чек-лист, Ситуации). Если средний ≥ этого порога — кандидат успешно прошёл интервью и попадает в финальную колонку CRM. Рекомендуем 70–80."
                />
              </div>
              <div className="flex items-center gap-2 mt-1">
                <input type="number" min={1} max={100} value={passScore} onChange={e => setPassScore(Math.max(1, Math.min(100, Number(e.target.value) || 75)))} className="bg-black/30 text-white border border-white/10 rounded-lg px-3 py-2 text-sm w-24" />
                <button onClick={savePassScore} disabled={saving === "pass"} className="bg-[#E7C768]/20 hover:bg-[#E7C768]/30 border border-[#E7C768]/40 text-[#E7C768] font-bold text-xs px-3 py-2 rounded-lg flex items-center gap-1 disabled:opacity-60">
                  {saving === "pass"
                    ? <><RefreshCw className="w-3.5 h-3.5 animate-spin"/> Сохраняем…</>
                    : <><Save className="w-3.5 h-3.5"/> Сохранить</>}
                </button>
                {savedFlash === "pass" && saving !== "pass" && (
                  <span className="flex items-center gap-1 text-[11px] text-emerald-300 animate-fade-in">
                    <CheckCircle2 className="w-3 h-3" /> Сохранено в БД
                  </span>
                )}
              </div>
            </div>
            <div className="ml-auto">
              <button onClick={fillFromTemplate} className="bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/40 text-indigo-200 font-bold text-xs px-3 py-2 rounded-lg flex items-center gap-1">
                <FileText className="w-3.5 h-3.5"/>Заполнить из шаблона должности
              </button>
            </div>
          </div>

          <div className="bg-[#17344F]/60 border border-[#E7C768]/40 rounded-2xl p-4 space-y-3">
            <div className="flex items-start gap-2">
              <div className="text-[10px] uppercase tracking-wider font-bold text-[#E7C768]">
                Лимиты RR по вакансии
              </div>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Укажите, сколько кандидатов могут пройти <b>интервью</b> и <b>обучение</b> по этой вакансии.
              Один лимит интервью списывается после успешного скрининга резюме у кандидата, один лимит обучения — после
              проверки профессионального теста. Повторные прохождения уже не списываются.
              Если на балансе работодателя нет лимитов — кандидат увидит окно «Услуга не подключена» с вашими контактами.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[11px] text-slate-300 font-bold">Интервью (доступно: {Math.max(0, interviewLimit - interviewUsed)} из {interviewLimit}, использовано {interviewUsed})</span>
                <input
                  type="number" min={interviewUsed} max={100000} value={interviewLimit}
                  onChange={e => setInterviewLimit(Math.max(interviewUsed, Math.min(100000, Number(e.target.value) || 0)))}
                  className="mt-1 w-full bg-black/30 text-white border border-white/10 rounded-lg px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-[11px] text-slate-300 font-bold">Обучение (доступно: {Math.max(0, trainingLimit - trainingUsed)} из {trainingLimit}, использовано {trainingUsed})</span>
                <input
                  type="number" min={trainingUsed} max={100000} value={trainingLimit}
                  onChange={e => setTrainingLimit(Math.max(trainingUsed, Math.min(100000, Number(e.target.value) || 0)))}
                  className="mt-1 w-full bg-black/30 text-white border border-white/10 rounded-lg px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={saveLimits} disabled={savingLimits}
                className="bg-[#E7C768]/20 hover:bg-[#E7C768]/30 border border-[#E7C768]/40 text-[#E7C768] font-bold text-xs px-3 py-2 rounded-lg flex items-center gap-1 disabled:opacity-60">
                {savingLimits
                  ? <><RefreshCw className="w-3.5 h-3.5 animate-spin"/> Сохраняем…</>
                  : <><Save className="w-3.5 h-3.5"/> Сохранить лимиты</>}
              </button>
              {savedLimits && (
                <span className="flex items-center gap-1 text-[11px] text-emerald-300 animate-fade-in">
                  <CheckCircle2 className="w-3 h-3" /> Сохранено в БД
                </span>
              )}
              <a href="#/account/billing"
                 className="ml-auto text-[11px] text-[#E7C768] underline hover:text-amber-200">
                Пополнить баланс RR →
              </a>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            {KINDS.map(k => (
              <button key={k.key} onClick={() => setKind(k.key)} className={`px-4 py-2 rounded-xl text-sm font-bold border ${kind === k.key ? "bg-[#E7C768] text-[#17344F] border-[#E7C768]" : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10"}`}>
                {k.title} <span className="opacity-70 font-normal text-[10px] block">{k.hint}</span>
              </button>
            ))}
          </div>

          <div className="bg-[#1E4468]/60 border border-white/10 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#E7C768]">{KINDS.find(k => k.key === kind)?.title}</h3>
              <button onClick={generate} disabled={busy} className="bg-[#E7C768]/15 hover:bg-[#E7C768]/25 border border-[#E7C768]/40 text-[#E7C768] font-bold text-xs px-3 py-2 rounded-lg flex items-center gap-1 disabled:opacity-60">
                {busy ? <RefreshCw className="w-3.5 h-3.5 animate-spin"/> : <Wand2 className="w-3.5 h-3.5"/>} Сгенерировать ИИ
              </button>
            </div>

            {/* Wishes textarea + example tip — same for every block, content varies */}
            <div className="bg-[#17344F]/60 border-l-4 border-l-sky-400/60 border border-white/10 rounded-xl p-3 space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-sky-300 font-bold flex items-center gap-1">
                <Wand2 className="w-3 h-3" /> Вход для ИИ
              </div>
              <h4 className="text-sm font-bold text-white leading-snug">{PROMPT_TITLE[kind]}</h4>
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-slate-200 font-bold inline-flex items-center">
                  Пожелания к блоку «{KINDS.find(k => k.key === kind)?.title.replace(/^\d+\.\s*/, "")}» (передаются ИИ)
                  <FieldHelp
                    section="interviews"
                    fieldKey={`wishes_${kind}`}
                    fallbackTitle="Пожелания к блоку"
                    fallbackBody="Свободный текст для ИИ: на что обратить внимание, какие компетенции проверить, какой тон выдержать. Чем подробнее — тем точнее ИИ сформирует вопросы и кейсы."
                  />
                </label>
                <button type="button" onClick={() => setShowExample(s => ({ ...s, [kind]: !s[kind] }))}
                  className="text-[10px] text-[#E7C768] hover:underline flex items-center gap-1">
                  <Info className="w-3 h-3" /> {showExample[kind] ? "Скрыть пример" : "Показать пример"}
                </button>
              </div>
              {showExample[kind] && (
                <div className="text-[11px] text-slate-300 bg-black/30 border border-[#E7C768]/30 rounded-lg p-2 leading-relaxed">
                  {WISH_EXAMPLE[kind]}
                </div>
              )}
              <textarea rows={3} maxLength={1000}
                value={wishes[kind]}
                onChange={e => setWishes(w => ({ ...w, [kind]: e.target.value }))}
                placeholder={WISH_PLACEHOLDER[kind]}
                className="w-full bg-[#17344F]/60 text-xs p-2.5 rounded-lg border border-white/10 text-white focus:outline-[#E7C768]" />
              <div className="text-[10px] text-slate-500 text-right">{wishes[kind].length}/1000 — учитывается при «Сгенерировать ИИ»</div>
            </div>

            {busy && <LoadingPhrase entity="interview" />}

            {kind === "resume" && (
              <div className="space-y-2">
                <div className="border-l-4 border-l-emerald-400/60 bg-emerald-500/5 rounded-xl px-3 py-2 space-y-0.5">
                  <div className="text-[10px] uppercase tracking-wider text-emerald-300 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Результат ИИ
                  </div>
                  <h4 className="text-sm font-bold text-white leading-snug">{RESULT_TITLE.resume}</h4>
                </div>
                <FullscreenTextarea
                  label="Критерии оценки резюме"
                  value={resumeMd}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setResumeMd(e.target.value)}
                  rows={14}
                  maxLength={10000}
                  placeholder="Markdown: важные критерии для оценки резюме..."
                  className="w-full bg-black/30 text-white border border-white/10 rounded-xl px-3 py-2 text-sm font-mono"
                />
                <div className="flex justify-end items-center gap-2">
                  {savedFlash === "resume" && saving !== "resume" && (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-300 animate-fade-in">
                      <CheckCircle2 className="w-3 h-3" /> Сохранено в БД
                    </span>
                  )}
                  <button onClick={() => saveBlock("resume", { criteria_md: resumeMd })} disabled={saving === "resume"}
                    className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:opacity-90 text-white font-bold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 disabled:opacity-60">
                    {saving === "resume"
                      ? <><RefreshCw className="w-3.5 h-3.5 animate-spin"/> Сохраняем в БД…</>
                      : <><Save className="w-3.5 h-3.5"/> Сохранить в БД</>}
                  </button>
                </div>
              </div>
            )}

            {kind === "checklist" && (
              <div className="space-y-3">
                <div className="border-l-4 border-l-emerald-400/60 bg-emerald-500/5 rounded-xl px-3 py-2 space-y-0.5">
                  <div className="text-[10px] uppercase tracking-wider text-emerald-300 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Результат ИИ
                  </div>
                  <h4 className="text-sm font-bold text-white leading-snug">{RESULT_TITLE.checklist}</h4>
                </div>
                <div className="text-[10px] text-slate-400 font-bold">Вопросов: {checklist.length}/30</div>
                <label className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-lg px-3 py-2 cursor-pointer">
                  <input type="checkbox" checked={checklistShuffle}
                    onChange={e => setChecklistShuffle(e.target.checked)}
                    className="accent-[#E7C768] w-4 h-4" />
                  <span className="text-[11px] text-slate-200 font-bold">Случайный порядок вопросов и вариантов ответа</span>
                  <span className="text-[10px] text-slate-500 ml-auto">При повторной сдаче — новый порядок.</span>
                </label>
                {checklist.length === 0 && <p className="text-xs text-slate-400">Нет вопросов. Нажмите «Сгенерировать ИИ» или добавьте вручную.</p>}
                {checklist.map((q, i) => (
                  <div key={q.id || i} className="bg-black/30 border border-white/10 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between text-[10px] uppercase text-slate-400 font-bold">
                      <span>#{i+1} · {q.kind === "choice" ? "Выбор" : "Текст"}</span>
                      <button onClick={() => setChecklist(checklist.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300"><Trash2 className="w-3 h-3"/></button>
                    </div>
                    <textarea value={q.question} onChange={e => { const c = [...checklist]; c[i] = { ...q, question: e.target.value }; setChecklist(c); }} rows={2} className="w-full bg-black/30 text-white border border-white/10 rounded px-2 py-1 text-sm" />
                    {q.kind === "choice" && (
                      <div className="space-y-1">
                        {(q.options || []).map((opt, oi) => (
                          <div key={oi} className="flex items-center gap-2">
                            <input type="radio" checked={q.correct === opt} onChange={() => { const c = [...checklist]; c[i] = { ...q, correct: opt }; setChecklist(c); }} />
                            <input value={opt} onChange={e => { const c = [...checklist]; const opts = [...(q.options || [])]; opts[oi] = e.target.value; c[i] = { ...q, options: opts, correct: q.correct === opt ? e.target.value : q.correct }; setChecklist(c); }} className="flex-1 bg-black/30 text-white border border-white/10 rounded px-2 py-1 text-xs"/>
                          </div>
                        ))}
                      </div>
                    )}
                    {q.kind === "text" && (
                      <textarea value={q.expected_answer || ""} onChange={e => { const c = [...checklist]; c[i] = { ...q, expected_answer: e.target.value }; setChecklist(c); }} rows={2} placeholder="Эталонный ответ" className="w-full bg-black/30 text-white border border-white/10 rounded px-2 py-1 text-xs"/>
                    )}
                  </div>
                ))}
                <div className="flex gap-2">
                  <button disabled={checklist.length >= 30} onClick={() => setChecklist([...checklist, { id: `q${Date.now()}`, kind: "choice", question: "", options: ["","","",""], correct: "" }])} className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 flex items-center gap-1 disabled:opacity-40"><Plus className="w-3 h-3"/>С вариантами</button>
                  <button disabled={checklist.length >= 30} onClick={() => setChecklist([...checklist, { id: `q${Date.now()}`, kind: "text", question: "", expected_answer: "" }])} className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 flex items-center gap-1 disabled:opacity-40"><Plus className="w-3 h-3"/>Текстовый</button>
                  <div className="ml-auto flex items-center gap-2">
                    {savedFlash === "checklist" && saving !== "checklist" && (
                      <span className="flex items-center gap-1 text-[11px] text-emerald-300 animate-fade-in">
                        <CheckCircle2 className="w-3 h-3" /> Сохранено в БД
                      </span>
                    )}
                    <button onClick={() => saveBlock("checklist", { questions: checklist, shuffle: checklistShuffle })} disabled={saving === "checklist"}
                      className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:opacity-90 text-white font-bold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 disabled:opacity-60">
                      {saving === "checklist"
                        ? <><RefreshCw className="w-3.5 h-3.5 animate-spin"/> Сохраняем в БД…</>
                        : <><Save className="w-3.5 h-3.5"/> Сохранить в БД</>}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {kind === "situations" && (
              <div className="space-y-3">
                <div className="border-l-4 border-l-emerald-400/60 bg-emerald-500/5 rounded-xl px-3 py-2 space-y-0.5">
                  <div className="text-[10px] uppercase tracking-wider text-emerald-300 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Результат ИИ
                  </div>
                  <h4 className="text-sm font-bold text-white leading-snug">{RESULT_TITLE.situations}</h4>
                </div>
                {situations.length === 0 && <p className="text-xs text-slate-400">Нет ситуаций. Сгенерируйте или добавьте.</p>}
                {situations.map((s, i) => (
                  <div key={s.id || i} className="bg-black/30 border border-white/10 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between text-[10px] uppercase text-slate-400 font-bold">
                      <span>Ситуация #{i+1}</span>
                      <button onClick={() => setSituations(situations.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300"><Trash2 className="w-3 h-3"/></button>
                    </div>
                    <input value={s.title} placeholder="Тема" onChange={e => { const c = [...situations]; c[i] = { ...s, title: e.target.value }; setSituations(c); }} className="w-full bg-black/30 text-white border border-white/10 rounded px-2 py-1 text-sm font-bold"/>
                    <textarea value={s.brief} placeholder="Описание ситуации для кандидата" rows={3} onChange={e => { const c = [...situations]; c[i] = { ...s, brief: e.target.value }; setSituations(c); }} className="w-full bg-black/30 text-white border border-white/10 rounded px-2 py-1 text-xs"/>
                    <textarea value={s.criteria} placeholder="Критерии хорошего ответа (для ИИ)" rows={2} onChange={e => { const c = [...situations]; c[i] = { ...s, criteria: e.target.value }; setSituations(c); }} className="w-full bg-black/30 text-white border border-white/10 rounded px-2 py-1 text-xs"/>
                  </div>
                ))}
                <div className="flex gap-2">
                  {situations.length < 3 && <button onClick={() => setSituations([...situations, { id: `s${situations.length+1}`, title: "", brief: "", criteria: "" }])} className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 flex items-center gap-1"><Plus className="w-3 h-3"/>Ситуация</button>}
                  <div className="ml-auto flex items-center gap-2">
                    {savedFlash === "situations" && saving !== "situations" && (
                      <span className="flex items-center gap-1 text-[11px] text-emerald-300 animate-fade-in">
                        <CheckCircle2 className="w-3 h-3" /> Сохранено в БД
                      </span>
                    )}
                    <button onClick={() => saveBlock("situations", { situations })} disabled={saving === "situations"}
                      className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:opacity-90 text-white font-bold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 disabled:opacity-60">
                      {saving === "situations"
                        ? <><RefreshCw className="w-3.5 h-3.5 animate-spin"/> Сохраняем в БД…</>
                        : <><Save className="w-3.5 h-3.5"/> Сохранить в БД</>}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}