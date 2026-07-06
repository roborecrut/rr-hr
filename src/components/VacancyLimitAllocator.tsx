import { useEffect, useMemo, useState } from "react";
import { Save, RefreshCw, CheckCircle2, AlertTriangle, Minus, Plus, Users2, GraduationCap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { JobProject } from "../types";

type Props = {
  projects: JobProject[];
  interviewPool: number;
  trainingPool: number;
  onSaved: () => void | Promise<void>;
};

type Row = {
  id: string;
  label: string;
  companyName: string;
  interview: number;
  training: number;
  interviewSaved: number;
  trainingSaved: number;
  interviewUsed: number;
  trainingUsed: number;
  saving: boolean;
  savedFlash: boolean;
  error: string | null;
};

function buildRows(projects: JobProject[]): Row[] {
  return (projects || []).map((p: any) => ({
    id: p.id,
    label: p.roleName || "(без названия)",
    companyName: p.companyName || "—",
    interview: Number(p.interviewLimit || 0),
    training: Number(p.trainingLimit || 0),
    interviewSaved: Number(p.interviewLimit || 0),
    trainingSaved: Number(p.trainingLimit || 0),
    interviewUsed: Number(p.interviewUsed || 0),
    trainingUsed: Number(p.trainingUsed || 0),
    saving: false,
    savedFlash: false,
    error: null,
  }));
}

export default function VacancyLimitAllocator({ projects, interviewPool, trainingPool, onSaved }: Props) {
  const [rows, setRows] = useState<Row[]>(() => buildRows(projects));

  // Пересобираем строки при смене входного списка вакансий, но без затирания
  // локальных правок, если id совпадает.
  useEffect(() => {
    setRows(prev => {
      const map = new Map(prev.map(r => [r.id, r] as const));
      return buildRows(projects).map(r => {
        const old = map.get(r.id);
        if (!old) return r;
        // сохранённые значения обновляем из БД, но live-edit сохраняем
        return {
          ...r,
          interview: old.interview === old.interviewSaved ? r.interview : old.interview,
          training:  old.training  === old.trainingSaved  ? r.training  : old.training,
          savedFlash: old.savedFlash,
          error: old.error,
        };
      });
    });
  }, [projects]);

  // Локальный предпросмотр остатков пула: пул − сумма приростов по всем строкам.
  const { previewInterview, previewTraining } = useMemo(() => {
    let dI = 0, dT = 0;
    for (const r of rows) {
      dI += (r.interview - r.interviewSaved);
      dT += (r.training  - r.trainingSaved);
    }
    return {
      previewInterview: Math.max(0, interviewPool - dI),
      previewTraining:  Math.max(0, trainingPool  - dT),
    };
  }, [rows, interviewPool, trainingPool]);

  const overdrawI = interviewPool - rows.reduce((a, r) => a + (r.interview - r.interviewSaved), 0) < 0;
  const overdrawT = trainingPool  - rows.reduce((a, r) => a + (r.training  - r.trainingSaved), 0) < 0;

  const setRow = (id: string, patch: Partial<Row>) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  };

  const clampI = (r: Row, v: number) => Math.max(r.interviewUsed, Math.min(100000, Math.floor(v)));
  const clampT = (r: Row, v: number) => Math.max(r.trainingUsed,  Math.min(100000, Math.floor(v)));

  const save = async (r: Row) => {
    if (r.interview === r.interviewSaved && r.training === r.trainingSaved) return;
    setRow(r.id, { saving: true, error: null });
    try {
      const { data, error } = await (supabase as any).rpc("reallocate_project_limits", {
        _project: r.id,
        _new_interview_limit: r.interview,
        _new_training_limit: r.training,
      });
      if (error) throw error;
      const res = (data || {}) as { ok?: boolean };
      if (!res.ok) throw new Error("save_failed");
      setRow(r.id, {
        interviewSaved: r.interview,
        trainingSaved: r.training,
        saving: false, savedFlash: true,
      });
      setTimeout(() => setRow(r.id, { savedFlash: false }), 2000);
      await onSaved();
    } catch (e: any) {
      const msg = String(e?.message || e || "save_failed");
      let human = msg;
      if (/interview_limit_below_used/.test(msg)) human = "Лимит интервью нельзя опустить ниже использованного";
      else if (/training_limit_below_used/.test(msg)) human = "Лимит обучений нельзя опустить ниже использованного";
      else if (/not_enough_interview_pool/.test(msg)) human = "На общем балансе не хватает интервью";
      else if (/not_enough_training_pool/.test(msg)) human = "На общем балансе не хватает обучений";
      else if (/forbidden/.test(msg)) human = "Нет доступа";
      setRow(r.id, { saving: false, error: human });
    }
  };

  return (
    <div className="bg-[#1E4468]/85 border border-white/15 rounded-3xl p-6 shadow-xl space-y-5">
      <div>
        <h3 className="font-bold text-sm text-[#E7C768] flex items-center gap-1.5">
          🎛 Распределение лимитов по вакансиям
        </h3>
        <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
          Увеличение лимита по вакансии списывается с общего пакета работодателя, уменьшение — возвращается обратно в пакет.
          Изменения применяются по кнопке «Сохранить». Ниже — предпросмотр остатков пакета в реальном времени.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className={`rounded-2xl border p-3 ${overdrawI ? "bg-rose-500/15 border-rose-400/50" : "bg-black/25 border-white/10"}`}>
          <div className="flex items-center gap-2 text-slate-300">
            <Users2 className="w-4 h-4 text-[#E7C768]"/>
            <span className="uppercase tracking-wider font-bold text-[10px]">Пакет интервью (осталось)</span>
          </div>
          <div className="text-2xl font-mono font-extrabold text-white mt-1">
            {previewInterview}
            <span className="text-xs font-normal text-slate-400 ml-1">/ {interviewPool}</span>
          </div>
          {overdrawI && <div className="text-[11px] text-rose-200 font-bold mt-1">Не хватает: понизьте лимит</div>}
        </div>
        <div className={`rounded-2xl border p-3 ${overdrawT ? "bg-rose-500/15 border-rose-400/50" : "bg-black/25 border-white/10"}`}>
          <div className="flex items-center gap-2 text-slate-300">
            <GraduationCap className="w-4 h-4 text-[#E7C768]"/>
            <span className="uppercase tracking-wider font-bold text-[10px]">Пакет обучений (осталось)</span>
          </div>
          <div className="text-2xl font-mono font-extrabold text-white mt-1">
            {previewTraining}
            <span className="text-xs font-normal text-slate-400 ml-1">/ {trainingPool}</span>
          </div>
          {overdrawT && <div className="text-[11px] text-rose-200 font-bold mt-1">Не хватает: понизьте лимит</div>}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="text-center text-xs text-slate-400 py-8">Нет вакансий</div>
      ) : (
        <div className="space-y-3">
          {rows.map(r => {
            const dirty = r.interview !== r.interviewSaved || r.training !== r.trainingSaved;
            return (
              <div key={r.id} className="bg-black/25 border border-white/10 rounded-2xl p-4 space-y-3">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <div className="text-sm font-bold text-white">{r.label}</div>
                  <div className="text-[11px] text-slate-400">🏢 {r.companyName}</div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <LimitField
                    label="Интервью" icon={<Users2 className="w-4 h-4 text-[#E7C768]"/>}
                    value={r.interview} used={r.interviewUsed}
                    onChange={(v) => setRow(r.id, { interview: clampI(r, v) })}
                  />
                  <LimitField
                    label="Обучение" icon={<GraduationCap className="w-4 h-4 text-[#E7C768]"/>}
                    value={r.training} used={r.trainingUsed}
                    onChange={(v) => setRow(r.id, { training: clampT(r, v) })}
                  />
                </div>
                {r.error && (
                  <div className="text-[11px] bg-rose-500/15 border border-rose-400/40 text-rose-200 rounded-lg px-2 py-1.5 inline-flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3"/> {r.error}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => save(r)}
                    disabled={!dirty || r.saving || overdrawI || overdrawT}
                    className="bg-[#E7C768] hover:brightness-110 text-[#17344F] font-extrabold text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed shadow"
                  >
                    {r.saving
                      ? <><RefreshCw className="w-3.5 h-3.5 animate-spin"/> Сохраняем…</>
                      : <><Save className="w-3.5 h-3.5"/> Сохранить лимиты</>}
                  </button>
                  {r.savedFlash && (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-300">
                      <CheckCircle2 className="w-3 h-3"/> Сохранено в БД
                    </span>
                  )}
                  <div className="ml-auto text-[10px] text-slate-400">
                    Использовано: <b className="text-slate-200">интервью {r.interviewUsed}</b>, <b className="text-slate-200">обучений {r.trainingUsed}</b>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LimitField({ label, icon, value, used, onChange }: {
  label: string; icon: React.ReactNode; value: number; used: number; onChange: (v: number) => void;
}) {
  return (
    <div className="bg-black/40 border border-white/10 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2">
        {icon}
        <div className="text-xs font-bold text-white">{label}</div>
        <div className="ml-auto text-[10px] text-slate-400">Использовано <b className="text-slate-200">{used}</b></div>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onChange(value - 1)} disabled={value <= used}
          className="w-8 h-9 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white disabled:opacity-30 inline-flex items-center justify-center">
          <Minus className="w-3.5 h-3.5"/>
        </button>
        <input
          type="number" min={used} max={100000} value={value}
          onChange={e => onChange(Number(e.target.value) || 0)}
          className="flex-1 bg-black/40 text-white border border-white/10 rounded-lg px-2 py-2 text-sm font-bold text-center"
        />
        <button type="button" onClick={() => onChange(value + 1)}
          className="w-8 h-9 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white inline-flex items-center justify-center">
          <Plus className="w-3.5 h-3.5"/>
        </button>
        {[5, 10].map(n => (
          <button key={n} type="button" onClick={() => onChange(value + n)}
            className="text-[10px] font-bold px-2 py-1.5 rounded-lg bg-[#E7C768]/10 hover:bg-[#E7C768]/20 border border-[#E7C768]/30 text-[#E7C768]">
            +{n}
          </button>
        ))}
      </div>
    </div>
  );
}