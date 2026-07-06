import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Plus, Pencil, CheckCircle2, AlertCircle, Users2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { JobProject } from "../types";

type Props = {
  projects: JobProject[];
  onOpen: (projectId: string) => void;
  onCreate: () => void;
};

type Summary = { project_id: string; blocks: { resume: boolean; checklist: boolean; situations: boolean } };

export default function InterviewList({ projects, onOpen, onCreate }: Props) {
  // employerPublicId для перехода на страницу тарифов при клике на плашку лимитов.
  const employerPublicId = (projects[0] as any)?.employerPublicId
    || (typeof window !== "undefined" ? (window.location.pathname.match(/\/emp(\w+)/)?.[1] || "") : "");
  const openTariff = () => {
    if (employerPublicId) window.location.href = `/emp${employerPublicId}/tariff`;
  };
  const [summaries, setSummaries] = useState<Record<string, Summary>>({});
  const [loading, setLoading] = useState(true);
  const idsKey = useMemo(() => projects.map(p => p.id).slice().sort().join(","), [projects]);
  const firstLoad = useRef(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (firstLoad.current) setLoading(true);
      const ids = idsKey ? idsKey.split(",").filter(Boolean) : [];
      if (!ids.length) { setSummaries({}); setLoading(false); firstLoad.current = false; return; }
      const { data } = await (supabase as any).from("interview_blocks").select("project_id,kind,payload").in("project_id", ids);
      if (cancelled) return;
      const map: Record<string, Summary> = {};
      (data || []).forEach((b: any) => {
        const s = map[b.project_id] ||= { project_id: b.project_id, blocks: { resume: false, checklist: false, situations: false } };
        const p = b.payload || {};
        if (b.kind === "resume" && String(p.criteria_md || "").trim()) s.blocks.resume = true;
        if (b.kind === "checklist" && Array.isArray(p.questions) && p.questions.length) s.blocks.checklist = true;
        if (b.kind === "situations" && Array.isArray(p.situations) && p.situations.length) s.blocks.situations = true;
      });
      setSummaries(map);
      setLoading(false);
      firstLoad.current = false;
    })();
    return () => { cancelled = true; };
  }, [idsKey]);

  const existing = projects.filter(p => summaries[p.id]);

  return (
    <div className="space-y-5">
      <div className="brand-editor bg-[#1E4468]/80 border border-white/10 rounded-3xl p-6 shadow-xl flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-[#E7C768]/15 flex items-center justify-center text-[#E7C768]">
          <MessageSquare className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-white">Системы интервью</h2>
          <p className="text-xs text-slate-300">Одна система на одну вакансию. 3 блока: критерии резюме, чек-лист, ролевые ситуации.</p>
        </div>
        <button type="button" onClick={onCreate}
          className="btn-brand-primary px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2">
          <Plus className="w-4 h-4" /> Создать систему интервью
        </button>
      </div>

      {loading ? (
        <div className="text-center text-xs text-slate-400 py-8">Загружаем системы…</div>
      ) : existing.length === 0 ? (
        <div className="bg-[#17344F]/40 border border-white/10 rounded-3xl p-10 text-center text-sm text-slate-300">
          Пока не создано ни одной системы интервью. Нажмите «Создать систему интервью», выберите вакансию и сгенерируйте блоки.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {existing.map(p => {
            const s = summaries[p.id];
            const cells: { key: "resume" | "checklist" | "situations"; label: string; icon: string }[] = [
              { key: "resume", label: "Резюме", icon: "📄" },
              { key: "checklist", label: "Чек-лист", icon: "✅" },
              { key: "situations", label: "Ситуации", icon: "🎭" },
            ];
            return (
              <div key={p.id} className="bg-[#1E4468]/60 border border-white/10 rounded-2xl p-4 space-y-3 hover:border-[#E7C768]/40 transition">
                <div>
                  <div className="text-sm font-bold text-white">{p.roleName || "(без названия)"}</div>
                  <div className="text-[11px] text-slate-400">🏢 {p.companyName || "—"}</div>
                </div>
                {(() => {
                  const iLim = Number((p as any).interviewLimit || 0);
                  const iUsed = Number((p as any).interviewUsed || 0);
                  const iLeft = Math.max(0, iLim - iUsed);
                  const empty = iLim === 0;
                  const low = !empty && iLeft === 0;
                  return (
                    <button
                      type="button"
                      onClick={openTariff}
                      title="Перейти к тарифам"
                      className={`w-full text-left text-[11px] px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 transition hover:brightness-110 ${
                        empty || low
                          ? "bg-rose-500/15 border-rose-400/40 text-rose-100"
                          : "bg-emerald-500/15 border-emerald-400/40 text-emerald-100"
                      }`}
                    >
                      <Users2 className="w-3.5 h-3.5"/>
                      Лимит интервью:&nbsp;<b>{iLeft}</b>&nbsp;из&nbsp;<b>{iLim}</b>
                      <span className="ml-auto opacity-70 text-[10px]">использовано {iUsed}</span>
                    </button>
                  );
                })()}
                <div className="flex gap-2 flex-wrap">
                  {cells.map(c => {
                    const ok = s.blocks[c.key];
                    return (
                      <span key={c.key} className={`text-[10px] px-2 py-1 rounded-md border flex items-center gap-1 ${
                        ok ? "bg-emerald-500/15 border-emerald-400/40 text-emerald-200"
                           : "bg-white/5 border-white/10 text-slate-400"
                      }`}>
                        {ok ? <CheckCircle2 className="w-3 h-3"/> : <AlertCircle className="w-3 h-3"/>}
                        {c.icon} {c.label}
                      </span>
                    );
                  })}
                </div>
                <button type="button" onClick={() => onOpen(p.id)}
                  className="w-full btn-brand-secondary py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5">
                  <Pencil className="w-3.5 h-3.5" /> Открыть редактор
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}