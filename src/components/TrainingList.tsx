import { useEffect, useMemo, useRef, useState } from "react";
import { GraduationCap, Plus, Pencil, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { JobProject } from "../types";

type Props = {
  projects: JobProject[];
  onOpen: (projectId: string) => void;
  onCreate: () => void;
};

type SystemSummary = {
  project_id: string;
  stages: Record<string, { material: boolean; test: boolean }>;
};

export default function TrainingList({ projects, onOpen, onCreate }: Props) {
  const [summaries, setSummaries] = useState<Record<string, SystemSummary>>({});
  const [loading, setLoading] = useState(true);
  // Stable key so we only re-fetch when the actual set of project IDs changes,
  // not on every parent re-render (EmployerPanel refetches every 4s).
  const idsKey = useMemo(() => projects.map(p => p.id).slice().sort().join(","), [projects]);
  const firstLoad = useRef(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Only show the loading state on the very first fetch — silent refresh
      // afterwards prevents the list from flashing every few seconds.
      if (firstLoad.current) setLoading(true);
      const ids = idsKey ? idsKey.split(",").filter(Boolean) : [];
      if (!ids.length) { setSummaries({}); setLoading(false); firstLoad.current = false; return; }
      const [{ data: blocks }, { data: tests }] = await Promise.all([
        supabase.from("training_blocks").select("project_id,stage,materials_md").in("project_id", ids),
        supabase.from("training_stage_tests").select("project_id,stage,questions").in("project_id", ids),
      ]);
      if (cancelled) return;
      const map: Record<string, SystemSummary> = {};
      (blocks || []).forEach((b: any) => {
        if (!b.materials_md || !String(b.materials_md).trim()) return;
        const s = map[b.project_id] ||= { project_id: b.project_id, stages: {} };
        s.stages[b.stage] = { ...(s.stages[b.stage] || { material: false, test: false }), material: true };
      });
      (tests || []).forEach((t: any) => {
        const qs = Array.isArray(t.questions) ? t.questions : [];
        if (!qs.length) return;
        const s = map[t.project_id] ||= { project_id: t.project_id, stages: {} };
        s.stages[t.stage] = { ...(s.stages[t.stage] || { material: false, test: false }), test: true };
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
          <GraduationCap className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-white">Системы обучения</h2>
          <p className="text-xs text-slate-300">Одна система на одну вакансию. 3 этапа: профессиональный, продуктовый, системный.</p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="btn-brand-primary px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Создать систему обучения
        </button>
      </div>

      {loading ? (
        <div className="text-center text-xs text-slate-400 py-8">Загружаем системы…</div>
      ) : existing.length === 0 ? (
        <div className="bg-[#17344F]/40 border border-white/10 rounded-3xl p-10 text-center text-sm text-slate-300">
          Пока не создано ни одной системы обучения. Нажмите «Создать систему обучения», выберите вакансию и сгенерируйте материалы и тест.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {existing.map(p => {
            const s = summaries[p.id];
            const stages = ["professional", "product", "system"] as const;
            const stageLabels: Record<string, string> = {
              professional: "Проф.", product: "Прод.", system: "Сист.",
            };
            return (
              <div key={p.id} className="bg-[#1E4468]/60 border border-white/10 rounded-2xl p-4 space-y-3 hover:border-[#E7C768]/40 transition">
                <div>
                  <div className="text-sm font-bold text-white">{p.roleName || "(без названия)"}</div>
                  <div className="text-[11px] text-slate-400">🏢 {p.companyName || "—"}</div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {stages.map(st => {
                    const cell = s.stages[st] || { material: false, test: false };
                    const ok = cell.material && cell.test;
                    return (
                      <span key={st} className={`text-[10px] px-2 py-1 rounded-md border flex items-center gap-1 ${
                        ok ? "bg-emerald-500/15 border-emerald-400/40 text-emerald-200"
                          : cell.material ? "bg-amber-500/15 border-amber-400/40 text-amber-200"
                          : "bg-white/5 border-white/10 text-slate-400"
                      }`}>
                        {ok ? <CheckCircle2 className="w-3 h-3"/> : <AlertCircle className="w-3 h-3"/>}
                        {stageLabels[st]} {cell.material ? "📘" : "—"}{cell.test ? "📝" : "—"}
                      </span>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => onOpen(p.id)}
                  className="w-full btn-brand-secondary py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
                >
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