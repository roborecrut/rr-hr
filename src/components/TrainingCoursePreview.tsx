/**
 * Read-only preview of a training course shown to candidates when the
 * AI training plan has not been generated yet. Pulls the raw text fields
 * saved by the employer in the Training Wizard.
 */
import { BookOpen, GraduationCap, Settings2, FileText, BadgeCheck } from "lucide-react";

interface Props {
  projectFull: any | null;
  trainingSubTab: string;
}

export default function TrainingCoursePreview({ projectFull, trainingSubTab }: Props) {
  if (!projectFull) {
    return (
      <div className="p-12 text-center text-gray-400">
        <p className="text-xs">Курс ещё не настроен работодателем. Дождитесь публикации.</p>
      </div>
    );
  }

  const blocks: { key: string; icon: any; title: string; body: string }[] = [
    { key: "professional", icon: GraduationCap, title: "Профессиональное обучение", body: projectFull.training_prof_text || "Работодатель ещё не заполнил этот раздел." },
    { key: "product",      icon: BookOpen,      title: "Обучение продукту / компании", body: projectFull.training_product_text || "Работодатель ещё не заполнил этот раздел." },
    { key: "system",       icon: Settings2,     title: "Процессы и регламенты", body: projectFull.training_system_text || "Работодатель ещё не заполнил этот раздел." },
  ];
  const active = blocks.find(b => b.key === trainingSubTab) || blocks[0];

  return (
    <div className="p-6 md:p-8 space-y-6 text-left">
      <div className="border-b border-white/10 pb-4">
        <span className="text-[10px] uppercase font-mono font-bold text-[#E7C768] tracking-wider block bg-[#1E4468]/80 w-max px-2.5 py-0.5 rounded border border-white/10">
          Курс прикреплён к вакансии
        </span>
        <h2 className="text-xl font-bold text-white mt-2 flex items-center gap-2">
          <active.icon className="w-5 h-5 text-[#E7C768]" /> {active.title}
        </h2>
        {projectFull.training_intro_text && (
          <p className="text-xs text-slate-300 mt-2 whitespace-pre-wrap leading-relaxed">{projectFull.training_intro_text}</p>
        )}
      </div>

      <div className="bg-black/25 border border-white/10 rounded-2xl p-4 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
        {active.body}
      </div>

      {(projectFull.training_wiki_text || projectFull.training_regulations_text) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {projectFull.training_wiki_text && (
            <div className="bg-[#17344F]/70 border border-white/10 rounded-2xl p-4 text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 text-[#E7C768] font-bold"><FileText className="w-3.5 h-3.5" /> База Wiki</div>
              <p className="text-slate-300 whitespace-pre-wrap leading-relaxed">{projectFull.training_wiki_text}</p>
            </div>
          )}
          {projectFull.training_regulations_text && (
            <div className="bg-[#17344F]/70 border border-white/10 rounded-2xl p-4 text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 text-[#E7C768] font-bold"><BadgeCheck className="w-3.5 h-3.5" /> Регламенты</div>
              <p className="text-slate-300 whitespace-pre-wrap leading-relaxed">{projectFull.training_regulations_text}</p>
            </div>
          )}
        </div>
      )}

      <div className="bg-amber-950/30 border border-amber-500/30 rounded-2xl p-3 text-[11px] text-amber-100">
        ℹ️ Это материалы курса от работодателя. Персональный план с тестами и аттестацией ИИ сгенерирует автоматически.
      </div>
    </div>
  );
}