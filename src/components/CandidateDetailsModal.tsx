/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Full candidate details modal: profile, resume + screening score, checklist,
 * situations, training results. Used in employer CRM and admin CRM.
 */

import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import RichMarkdown from "@/components/RichMarkdown";
import {
  X, User as UserIcon, Mail, Phone, MessageSquare, FileText,
  CheckSquare, Briefcase, GraduationCap, Loader2, ExternalLink, Award,
  Building2, UserCheck, UserX, ChevronDown, ChevronUp
} from "lucide-react";

const STAGE_LABELS: Record<string, string> = {
  registration: "Регистрация",
  screening: "Скрининг",
  checklist: "Чеклист",
  situations: "Ситуации",
  professional: "Профессия",
  product: "Продукт",
  systems: "Система",
  certified: "Сертификат",
};

/** Цветовая разметка ИИ-оценок: green ≥70, yellow 40-69, red <40. */
function scoreTone(value: any, max = 100): { cls: string; label: "good" | "mid" | "bad" | "none" } {
  const n = value === null || value === undefined ? NaN : Number(value);
  if (!Number.isFinite(n)) return { cls: "text-slate-400", label: "none" };
  const pct = max === 100 ? n : (n / max) * 100;
  if (pct >= 70) return { cls: "text-emerald-300", label: "good" };
  if (pct >= 40) return { cls: "text-amber-300", label: "mid" };
  return { cls: "text-rose-300", label: "bad" };
}
function toneBg(label: ReturnType<typeof scoreTone>["label"]): string {
  if (label === "good") return "bg-emerald-500/15 border-emerald-400/40";
  if (label === "mid") return "bg-amber-500/15 border-amber-400/40";
  if (label === "bad") return "bg-rose-500/15 border-rose-400/40";
  return "bg-black/30 border-white/10";
}

function Score({ label, value }: { label: string; value: any }) {
  const n = value === null || value === undefined ? null : Number(value);
  const tone = scoreTone(value);
  return (
    <div className={`rounded-xl border px-3 py-2.5 flex items-center justify-between ${toneBg(tone.label)}`}>
      <span className="text-[12px] text-slate-200 font-semibold">{label}</span>
      <span className={`text-base font-mono font-black ${tone.cls}`}>
        {n === null || Number.isNaN(n) ? "—" : `${Math.round(n)}/100`}
      </span>
    </div>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  const empty = value === null || value === undefined || value === "";
  if (empty) return null;
  return (
    <div className="bg-black/25 border border-white/10 rounded-xl px-3 py-2.5">
      <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-[14px] mt-1 break-words text-white font-semibold">
        {String(value)}
      </div>
    </div>
  );
}

export default function CandidateDetailsModal({
  candidateId,
  onClose,
}: {
  candidateId: string | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [decisionOpen, setDecisionOpen] = useState<null | "invited" | "rejected">(null);
  const [decisionMsg, setDecisionMsg] = useState("");
  const [decisionSaving, setDecisionSaving] = useState(false);
  const [decisionErr, setDecisionErr] = useState<string | null>(null);

  useEffect(() => {
    if (!candidateId) return;
    let cancelled = false;
    setLoading(true); setErr(null);
    (async () => {
      const { data, error } = await supabase.rpc("candidate_full_details" as any, { _candidate: candidateId });
      if (cancelled) return;
      if (error) setErr(error.message);
      else setData(data);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [candidateId]);

  if (!candidateId) return null;

  const submitDecision = async () => {
    if (!candidateId || !decisionOpen) return;
    setDecisionSaving(true); setDecisionErr(null);
    try {
      const { error } = await (supabase as any).rpc("candidate_invite_decision", {
        _candidate: candidateId,
        _decision: decisionOpen,
        _message: decisionMsg.trim() || null,
      });
      if (error) throw error;
      // refresh
      const { data: fresh } = await supabase.rpc("candidate_full_details" as any, { _candidate: candidateId });
      setData(fresh);
      setDecisionOpen(null);
      setDecisionMsg("");
    } catch (e: any) {
      setDecisionErr(e?.message || "Не удалось сохранить решение");
    } finally {
      setDecisionSaving(false);
    }
  };

  const c = data?.candidate || {};
  const p = data?.profile || {};
  const s = data?.scores || {};
  const co = data?.company || {};
  const pr = data?.project || {};
  const answers: any[] = data?.answers || [];
  const stageProgress: any[] = data?.stage_progress || [];
  const trainingProgress: any[] = data?.training_progress || [];
  const interviews: any[] = data?.interviews || [];

  // Split answers by question category. The DB enum question_category has
  // values: checklist_prof, checklist_sys, train_prof, train_product,
  // train_sys, roleplay. Match by prefix so retakes / legacy free-form
  // categories ("чек-лист", "ситуация") are also captured.
  const catOf = (a: any) => String(a.question_category || a.category || "").toLowerCase();
  const checklistAnswers = answers.filter((a: any) => {
    const k = catOf(a);
    return k.startsWith("checklist") || k.includes("чек");
  });
  const situationAnswers = answers.filter((a: any) => {
    const k = catOf(a);
    return k === "roleplay" || k.includes("situation") || k.includes("ситуац") || k.includes("кейс");
  });
  const otherAnswers = answers.filter((a: any) => !checklistAnswers.includes(a) && !situationAnswers.includes(a));

  // Новый поток интервью хранит детальные ответы внутри candidate_scores.*_feedback.items,
  // а не в таблице candidate_answers. Достаём их оттуда, если основная коллекция пуста.
  const chkFbItems: any[] = Array.isArray((s as any)?.checklist_feedback?.items)
    ? (s as any).checklist_feedback.items
    : [];
  const sitFbItems: any[] = Array.isArray((s as any)?.situations_feedback?.items)
    ? (s as any).situations_feedback.items
    : [];
  const checklistAnswersView = checklistAnswers.length > 0
    ? checklistAnswers.map((a: any) => ({
        id: a.id,
        question_text: a.question_text,
        answer_text: a.answer_text,
        feedback: a.feedback,
        score: a.score,
        is_correct: a.is_correct,
        max: undefined,
      }))
    : chkFbItems.map((it: any, i: number) => ({
        id: it.id || `chk_${i}`,
        question_text: it.question || it.id,
        answer_text: it.answer || "",
        feedback: it.explanation || it.what_was_wrong || "",
        score: it.score,
        max: it.max,
        is_correct: it.verdict === "correct",
      }));
  const situationAnswersView = situationAnswers.length > 0
    ? situationAnswers.map((a: any) => ({
        id: a.id,
        question_text: a.question_text,
        answer_text: a.answer_text,
        feedback: a.feedback,
        score: a.score,
        is_correct: a.is_correct,
      }))
    : sitFbItems.map((it: any, i: number) => ({
        id: it.id || `sit_${i}`,
        question_text: it.title || it.id,
        answer_text: it.answer || "",
        feedback: it.feedback || "",
        score: it.score,
        is_correct: undefined,
      }));

  const name = c.full_name || c.resume_name || p.display_name || c.email || `Кандидат #${c.public_id || ""}`;
  const photo = p.avatar_url;
  const initials = (name || "?").split(/\s+/).slice(0, 2).map((x: string) => x[0]).join("").toUpperCase();
  const candidateLink = c.public_id && co.slug && pr.public_id
    ? `/${co.slug}/${pr.public_id}/cand${c.public_id}/profile`
    : null;

  // Итоговый бейдж ИИ-вердикта на основе среднего балла.
  const overallTone = scoreTone(s.overall_score);
  const overallBadge = (() => {
    if (overallTone.label === "good") return { text: "✓ Одобрен ИИ", cls: "bg-emerald-500/20 text-emerald-200 border-emerald-400/40" };
    if (overallTone.label === "mid") return { text: "Подходит частично", cls: "bg-amber-500/20 text-amber-200 border-amber-400/40" };
    if (overallTone.label === "bad") return { text: "Не подходит", cls: "bg-rose-500/20 text-rose-200 border-rose-400/40" };
    return null;
  })();

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-4xl bg-gradient-to-b from-[#1D3E5E] to-[#17344F] border border-[#E7C768]/40 rounded-3xl shadow-2xl my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center text-slate-200 z-10"
        >
          <X className="w-4 h-4" />
        </button>

        {loading ? (
          <div className="p-16 text-center text-slate-300 flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Загрузка карточки...
          </div>
        ) : err ? (
          <div className="p-12 text-center text-rose-300">Ошибка: {err}</div>
        ) : !data ? (
          <div className="p-12 text-center text-slate-300">Нет данных</div>
        ) : (
          <div className="p-6 md:p-8 space-y-6 text-left">
            {/* Header / profile */}
            <div className="flex flex-col md:flex-row gap-5 items-start">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#E7C768]/30 to-[#E7C768]/10 border border-[#E7C768]/40 flex items-center justify-center overflow-hidden flex-shrink-0">
                {photo
                  ? <img src={photo} alt={name} className="w-full h-full object-cover" />
                  : <span className="text-[#E7C768] font-black text-xl">{initials || "?"}</span>}
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold text-white truncate">{name}</h2>
                  <span className="text-[10px] text-slate-400">№ {c.public_id}</span>
                  {c.crm_stage && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E7C768]/15 text-[#E7C768] border border-[#E7C768]/30">
                      {STAGE_LABELS[c.crm_stage] || c.crm_stage}
                    </span>
                  )}
                  {overallBadge && (
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${overallBadge.cls}`}>
                      {overallBadge.text}
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-300">{c.role_name || pr.role_name || "—"} · {co.name || "—"}</div>
                <div className="flex flex-wrap gap-3 text-[11px] text-slate-200">
                  {c.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {c.email}</span>}
                  {p.email && p.email !== c.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {p.email}</span>}
                  {(c.phone || p.phone) && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {c.phone || p.phone}</span>}
                  {p.google_email && <span className="flex items-center gap-1 text-slate-400">Google: {p.google_email}</span>}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {candidateLink && (
                    <a href={candidateLink} target="_blank" rel="noreferrer" className="text-[11px] flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sky-300">
                      <ExternalLink className="w-3 h-3" /> Анкета кандидата
                    </a>
                  )}
                  {pr?.public_id && co?.slug && (
                    <a href={`/${co.slug}/${pr.public_id}`} target="_blank" rel="noreferrer" className="text-[11px] flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sky-300">
                      <ExternalLink className="w-3 h-3" /> Вакансия
                    </a>
                  )}
                  {co?.slug && (
                    <a href={`/${co.slug}`} target="_blank" rel="noreferrer" className="text-[11px] flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sky-300">
                      <ExternalLink className="w-3 h-3" /> Компания
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Scores grid */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <Score label="Резюме" value={s.resume_score} />
              <Score label="Чеклист" value={s.checklist_score} />
              <Score label="Ситуации" value={s.situations_score} />
              <Score label="Интервью" value={s.interview_score} />
              <Score label="Средний" value={s.overall_score} />
            </div>

            {/* Hire decision block */}
            <div className="bg-black/25 border border-[#E7C768]/30 rounded-2xl p-4">
              <h3 className="text-xs font-bold text-[#E7C768] uppercase tracking-wide flex items-center gap-2 mb-3">
                <UserCheck className="w-3.5 h-3.5" /> Решение по кандидату
              </h3>
              {c.hire_decision ? (
                <div className="space-y-2">
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${
                    c.hire_decision === "invited"
                      ? "bg-emerald-500/20 text-emerald-200 border border-emerald-400/40"
                      : "bg-rose-500/20 text-rose-200 border border-rose-400/40"
                  }`}>
                    {c.hire_decision === "invited"
                      ? <><UserCheck className="w-3.5 h-3.5" /> Приглашён на работу</>
                      : <><UserX className="w-3.5 h-3.5" /> Отказано</>}
                  </div>
                  {c.hire_decided_at && (
                    <div className="text-[10px] text-slate-400 font-mono">
                      {new Date(c.hire_decided_at).toLocaleString("ru-RU")}
                    </div>
                  )}
                  {c.hire_message && (
                    <div className="bg-black/30 rounded-xl border border-white/10 p-3 text-[12px] text-white/90 whitespace-pre-wrap">
                      {c.hire_message}
                    </div>
                  )}
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => { setDecisionOpen(c.hire_decision === "invited" ? "rejected" : "invited"); setDecisionMsg(c.hire_message || ""); }}
                      className="text-[11px] px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-white"
                    >
                      Изменить решение
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => { setDecisionOpen("invited"); setDecisionMsg(""); }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold text-sm shadow hover:-translate-y-0.5 transition"
                  >
                    <UserCheck className="w-4 h-4" /> Пригласить на работу
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDecisionOpen("rejected"); setDecisionMsg(""); }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-semibold text-sm transition"
                  >
                    <UserX className="w-4 h-4" /> Отказать
                  </button>
                </div>
              )}
            </div>

            {decisionOpen && (
              <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !decisionSaving && setDecisionOpen(null)}>
                <div className="bg-gradient-to-b from-[#1D3E5E] to-[#17344F] border border-[#E7C768]/40 rounded-3xl shadow-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
                  <h4 className="text-lg font-bold text-white mb-3">
                    {decisionOpen === "invited" ? "Пригласить на работу" : "Отказать кандидату"}
                  </h4>
                  <p className="text-xs text-slate-300 mb-3">
                    Кандидат увидит ваше сообщение в личном кабинете и получит уведомление.
                  </p>
                  <textarea
                    value={decisionMsg}
                    onChange={e => setDecisionMsg(e.target.value)}
                    placeholder={decisionOpen === "invited"
                      ? "Напишите кандидату: когда выйти, как связаться, какие шаги дальше…"
                      : "Кратко объясните причину отказа (по желанию)…"}
                    rows={5}
                    className="w-full bg-black/30 border border-white/15 rounded-xl p-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#E7C768]"
                  />
                  {decisionErr && <div className="text-rose-300 text-xs mt-2">{decisionErr}</div>}
                  <div className="flex gap-2 justify-end mt-4">
                    <button
                      type="button"
                      disabled={decisionSaving}
                      onClick={() => setDecisionOpen(null)}
                      className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-sm font-semibold"
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      disabled={decisionSaving}
                      onClick={submitDecision}
                      className={`px-4 py-2 rounded-xl text-white text-sm font-bold inline-flex items-center gap-2 ${
                        decisionOpen === "invited"
                          ? "bg-gradient-to-r from-emerald-500 to-emerald-600"
                          : "bg-gradient-to-r from-rose-500 to-rose-600"
                      }`}
                    >
                      {decisionSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                      {decisionOpen === "invited" ? "Пригласить" : "Отправить отказ"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Company + vacancy block (names, not only links) */}
            <div className="bg-black/20 border border-white/10 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-start gap-3">
                <Building2 className="w-4 h-4 text-[#E7C768] mt-0.5" />
                <div className="min-w-0">
                  <div className="text-[10px] font-mono uppercase text-slate-400">Компания</div>
                  <div className="text-sm font-bold text-white truncate">{co.name || "—"}</div>
                  <div className="text-[11px] text-slate-400 truncate">{co.slug ? `/${co.slug}` : ""}</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Briefcase className="w-4 h-4 text-[#E7C768] mt-0.5" />
                <div className="min-w-0">
                  <div className="text-[10px] font-mono uppercase text-slate-400">Вакансия</div>
                  <div className="text-sm font-bold text-white truncate">{c.role_name || pr.role_name || "—"}</div>
                  <div className="text-[11px] text-slate-400 truncate">{pr.public_id ? `ID: ${pr.public_id}` : ""}</div>
                </div>
              </div>
            </div>

            {/* Full candidate profile — all fields, even empty */}
            <div className="bg-black/20 border border-white/10 rounded-2xl p-4 space-y-2">
              <h3 className="text-xs font-bold text-[#E7C768] uppercase tracking-wide flex items-center gap-2"><UserIcon className="w-3.5 h-3.5" /> Профиль кандидата</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                <Field label="ФИО" value={c.full_name} />
                <Field label="ФИО из резюме" value={c.resume_name} />
                <Field label="Public ID" value={c.public_id} />
                <Field label="Email" value={c.email} />
                <Field label="Телефон" value={c.phone} />
                <Field label="Должность (роль)" value={c.role_name} />
                <Field label="Этап CRM" value={STAGE_LABELS[c.crm_stage] || c.crm_stage} />
                <Field label="Текущий этап" value={c.current_stage} />
                <Field label="Зарегистрирован через" value={c.registered_via} />
                <Field label="Способ входа" value={c.auth_kind} />
                <Field label="Источник перехода" value={c.ref_source} />
                <Field label="Лендинг" value={c.landing_slug} />
                <Field label="Создан" value={c.created_at ? new Date(c.created_at).toLocaleString() : null} />
                <Field label="Последний вход" value={c.last_login_at ? new Date(c.last_login_at).toLocaleString() : null} />
                <Field label="Резюме (URL)" value={c.resume_url} />
                <Field label="Аватар (URL)" value={c.avatar_url || p.avatar_url} />
                <Field label="Telegram" value={c.social_telegram} />
                <Field label="WhatsApp" value={c.social_whatsapp} />
                <Field label="Instagram" value={c.social_instagram} />
                <Field label="VK" value={c.social_vk} />
                <Field label="MAX" value={c.social_max} />
                <Field label="Setka" value={c.social_setka} />
                <Field label="GitHub" value={c.social_github} />
              </div>
            </div>

            {/* Resume */}
            <div className="bg-black/20 border border-white/10 rounded-2xl p-4 space-y-2">
              <h3 className="text-xs font-bold text-[#E7C768] uppercase tracking-wide flex items-center gap-2"><FileText className="w-3.5 h-3.5" /> Распознанный текст резюме</h3>
              {s.assessment_summary && (
                <div className="text-[11px] text-amber-200 bg-amber-900/20 border border-amber-700/30 rounded-lg p-2">
                  {s.assessment_summary}
                </div>
              )}
              <div className="text-[11px] text-slate-200 leading-relaxed max-h-64 overflow-y-auto">
                {c.resume_text
                  ? <RichMarkdown tone="resume">{c.resume_text}</RichMarkdown>
                  : <span className="italic text-slate-500">Резюме не загружено</span>}
              </div>
            </div>

            {/* Interview transcripts */}
            {interviews.length > 0 && (
              <div className="bg-black/20 border border-white/10 rounded-2xl p-4 space-y-2">
                <h3 className="text-xs font-bold text-[#E7C768] uppercase tracking-wide flex items-center gap-2"><MessageSquare className="w-3.5 h-3.5" /> Интервью</h3>
                {interviews.map((i) => (
                  <div key={i.id} className="text-[11px] text-slate-300">
                    <div className="text-slate-400 font-mono text-[10px]">#{i.public_id} · {i.status} · {i.started_at ? new Date(i.started_at).toLocaleString() : "—"}</div>
                    {i.transcript_text && (
                      <div className="mt-1 max-h-40 overflow-y-auto bg-black/20 p-2 rounded">
                        <RichMarkdown tone="chat">{i.transcript_text}</RichMarkdown>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Answers — Checklist */}
            <div className="bg-black/20 border border-white/10 rounded-2xl p-4 space-y-2">
              <h3 className="text-xs font-bold text-[#E7C768] uppercase tracking-wide flex items-center gap-2"><CheckSquare className="w-3.5 h-3.5" /> Ответы на чек-лист</h3>
              {checklistAnswersView.length === 0 ? (
                <div className="text-[11px] text-slate-500 italic">Кандидат ещё не отвечал на чек-лист.</div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {checklistAnswersView.map((a: any) => (
                    <div key={a.id} className="bg-black/30 rounded-lg p-2 border border-white/5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-[11px] font-semibold text-white">{a.question_text || a.question_id?.slice(0, 8) + "…"}</div>
                        <span className="text-[10px] font-mono text-[#E7C768] shrink-0">
                          {a.score !== null && a.score !== undefined
                            ? `${Math.round(Number(a.score))}/${a.max ?? 10}`
                            : (a.is_correct ? "✓" : "·")}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-200 mt-1">
                        {a.answer_text ? <RichMarkdown tone="chat">{a.answer_text}</RichMarkdown> : <span className="italic text-slate-500">(пусто)</span>}
                      </div>
                      {a.feedback && <div className="text-[10.5px] text-amber-200 mt-1">{a.feedback}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Answers — Situations */}
            <div className="bg-black/20 border border-white/10 rounded-2xl p-4 space-y-2">
              <h3 className="text-xs font-bold text-[#E7C768] uppercase tracking-wide flex items-center gap-2"><MessageSquare className="w-3.5 h-3.5" /> Ответы во время ситуаций</h3>
              {situationAnswersView.length === 0 ? (
                <div className="text-[11px] text-slate-500 italic">Ответы по ситуациям отсутствуют.</div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {situationAnswersView.map((a: any) => (
                    <div key={a.id} className="bg-black/30 rounded-lg p-2 border border-white/5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-[11px] font-semibold text-white">{a.question_text || a.question_id?.slice(0, 8) + "…"}</div>
                        <span className="text-[10px] font-mono text-[#E7C768] shrink-0">
                          {a.score !== null && a.score !== undefined
                            ? `${Math.round(Number(a.score))}/100`
                            : (a.is_correct ? "✓" : "·")}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-200 mt-1">
                        {a.answer_text ? <RichMarkdown tone="chat">{a.answer_text}</RichMarkdown> : <span className="italic text-slate-500">(пусто)</span>}
                      </div>
                      {a.feedback && <div className="text-[10.5px] text-amber-200 mt-1">{a.feedback}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {otherAnswers.length > 0 && (
              <div className="bg-black/20 border border-white/10 rounded-2xl p-4 space-y-2">
                <h3 className="text-xs font-bold text-[#E7C768] uppercase tracking-wide">Прочие ответы</h3>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {otherAnswers.map((a: any) => (
                    <div key={a.id} className="bg-black/30 rounded-lg p-2 border border-white/5">
                      <div className="text-[11px] font-semibold text-white">{a.question_text || a.question_id?.slice(0, 8) + "…"}</div>
                      <div className="text-[11px] text-slate-200 mt-1">
                        {a.answer_text ? <RichMarkdown tone="chat">{a.answer_text}</RichMarkdown> : <span className="italic text-slate-500">(пусто)</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stage progress (training pre-checks) */}
            {stageProgress.length > 0 && (
              <div className="bg-black/20 border border-white/10 rounded-2xl p-4 space-y-2">
                <h3 className="text-xs font-bold text-[#E7C768] uppercase tracking-wide flex items-center gap-2"><Briefcase className="w-3.5 h-3.5" /> Этапы (Профессия/Продукт/Система)</h3>
                <div className="flex flex-col gap-2 w-full">
                  {stageProgress.map((sp) => (
                    <div key={sp.id || sp.stage} className="bg-black/30 rounded-lg p-3 border border-white/5 w-full">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-white capitalize">{sp.stage}</span>
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${sp.passed_at ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}`}>
                          {sp.passed_at ? "Сдан" : "В процессе"}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">Попыток: {sp.attempts || 0} · Лучший: {sp.best_score ?? "—"} · Последний: {sp.last_score ?? "—"}</div>
                      {Array.isArray(sp.last_feedback) && sp.last_feedback.length > 0 && (
                        <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                          {sp.last_feedback.map((pq: any, idx: number) => {
                            const ans = Array.isArray(sp.last_answers) ? sp.last_answers.find((a: any) => a.question_id === pq.id) : null;
                            const ok = pq.score === pq.max;
                            return (
                              <div key={pq.id || idx} className="bg-black/40 border border-white/5 rounded p-1.5">
                                <div className="flex justify-between text-[10px]">
                                  <span className="text-slate-400">Вопрос {idx + 1}</span>
                                  <span className={ok ? "text-emerald-300" : pq.score > 0 ? "text-amber-300" : "text-rose-300"}>{pq.score}/{pq.max}</span>
                                </div>
                                {ans?.value && <div className="text-[10px] text-slate-200 mt-0.5"><b>Ответ:</b> {ans.value}</div>}
                                {pq.comment && <div className="text-[10px] text-slate-400 italic mt-0.5">{pq.comment}</div>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Training quizzes */}
            {trainingProgress.length > 0 && (
              <div className="bg-black/20 border border-white/10 rounded-2xl p-4 space-y-2">
                <h3 className="text-xs font-bold text-[#E7C768] uppercase tracking-wide flex items-center gap-2"><GraduationCap className="w-3.5 h-3.5" /> Обучение / Тесты</h3>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {trainingProgress.map((tp) => (
                    <div key={tp.id} className="bg-black/30 rounded-lg p-2 border border-white/5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-mono text-slate-400">Урок {tp.lesson_id?.slice(0, 8)}…</span>
                        <span className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${tp.passed ? "bg-emerald-500/20 text-emerald-300" : tp.is_completed ? "bg-amber-500/20 text-amber-300" : "bg-white/10 text-slate-300"}`}>
                          {tp.score !== null && tp.score !== undefined ? `${Math.round(Number(tp.score))}/100` : (tp.is_completed ? "завершён" : "в процессе")}
                        </span>
                      </div>
                      {tp.quiz_feedback && <div className="text-[10.5px] text-amber-200 mt-1">{tp.quiz_feedback}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Certification */}
            {c.crm_stage === "certified" && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex items-center gap-3">
                <Award className="w-6 h-6 text-emerald-300" />
                <div>
                  <div className="text-sm font-bold text-emerald-200">Кандидат сертифицирован</div>
                  <div className="text-[11px] text-emerald-100/70">Прошёл все этапы воронки.</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
