/**
 * OnboardingHost — велком-тур работодателя.
 *
 * При смене активного раздела (`section`) проверяет статус тура для пользователя.
 * Если `pending` — запускает driver.js: подсвечивает целевые элементы
 * (атрибут `data-tour="<section>.<key>"`), показывает welcome-окно раздела
 * и подсказки полей. По завершении/пропуску ставит статус.
 *
 * Дополнительно — выпадающий блок «Справочник раздела» со всеми
 * field_help-описаниями текущего раздела и кнопка «Запустить тур заново».
 */
import { useEffect, useState, useCallback } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { BookOpen, Play, ChevronDown, X } from "lucide-react";
import Markdown from "react-markdown";
import {
  type OnboardingSection,
  type OnboardingItem,
  getSectionWelcome,
  getSectionFields,
  getTourStatus,
  setTourStatus,
} from "@/lib/onboarding";

interface Props {
  section: OnboardingSection;
}

/** Преобразует список field_help в шаги driver.js, оставляя только те,
 *  для которых элемент действительно есть в DOM. */
function buildSteps(welcome: OnboardingItem | null, fields: OnboardingItem[]) {
  const steps: Array<{ element?: Element | string; popover: { title: string; description: string } }> = [];
  if (welcome) {
    steps.push({
      popover: {
        title: welcome.title,
        description: welcome.body_md,
      },
    });
  }
  for (const f of fields) {
    const sel = f.selector || `[data-tour="${f.section}.${f.field_key}"]`;
    if (document.querySelector(sel)) {
      steps.push({
        element: sel,
        popover: { title: f.title, description: f.body_md },
      });
    }
  }
  return steps;
}

export default function OnboardingHost({ section }: Props) {
  const [welcome, setWelcome] = useState<OnboardingItem | null>(null);
  const [fields, setFields] = useState<OnboardingItem[]>([]);
  const [showRef, setShowRef] = useState(false);
  const [openFieldId, setOpenFieldId] = useState<string | null>(null);

  /* Load content for the section */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [w, f] = await Promise.all([getSectionWelcome(section), getSectionFields(section)]);
      if (cancelled) return;
      setWelcome(w);
      setFields(f);
    })();
    return () => { cancelled = true; };
  }, [section]);

  const startTour = useCallback(async (force = false) => {
    if (!force) {
      const status = await getTourStatus(section);
      if (status !== "pending") return;
    }
    // Ждём, пока DOM раздела отрендерится
    await new Promise((r) => setTimeout(r, 500));
    const [w, f] = await Promise.all([getSectionWelcome(section), getSectionFields(section)]);
    const steps = buildSteps(w, f);
    if (steps.length === 0) {
      await setTourStatus(section, "completed");
      return;
    }
    const d = driver({
      showProgress: true,
      animate: true,
      allowClose: true,
      overlayOpacity: 0.7,
      stagePadding: 6,
      stageRadius: 12,
      nextBtnText: "Дальше →",
      prevBtnText: "← Назад",
      doneBtnText: "Готово ✓",
      progressText: "{{current}} из {{total}}",
      steps,
      onDestroyStarted: () => {
        // close button
        setTourStatus(section, "dismissed").catch(() => {});
        d.destroy();
      },
      onDestroyed: () => {
        setTourStatus(section, "completed").catch(() => {});
      },
    });
    d.drive();
  }, [section]);

  /* Auto-start on section change (only if pending) */
  useEffect(() => {
    startTour(false);
  }, [startTour]);

  return (
    <>
      {/* Compact action bar — справочник + перезапуск тура */}
      <div className="flex items-center justify-end gap-2 mb-3">
        <button
          type="button"
          onClick={() => setShowRef((v) => !v)}
          className="text-[11px] font-bold inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/15 text-slate-200 hover:bg-white/10 hover:border-[#E7C768]/60 transition"
        >
          <BookOpen className="w-3.5 h-3.5 text-[#E7C768]" />
          Справочник раздела
          <ChevronDown className={`w-3 h-3 transition-transform ${showRef ? "rotate-180" : ""}`} />
        </button>
        <button
          type="button"
          onClick={() => startTour(true)}
          className="text-[11px] font-bold inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#E7C768]/15 border border-[#E7C768]/60 text-[#E7C768] hover:bg-[#E7C768]/25 transition"
        >
          <Play className="w-3.5 h-3.5" />
          Запустить тур заново
        </button>
      </div>

      {showRef && (
        <div className="mb-4 bg-[#1D3E5E]/85 border border-[#E7C768]/30 rounded-2xl p-4 shadow-xl">
          {welcome && (
            <div className="mb-4 pb-4 border-b border-white/10">
              <h3 className="text-base font-bold text-[#E7C768] mb-2">{welcome.title}</h3>
              <div className="text-xs text-slate-200 leading-relaxed markdown-body">
                <Markdown>{welcome.body_md}</Markdown>
              </div>
            </div>
          )}
          <div className="text-[11px] uppercase tracking-wider text-[#E7C768] font-bold mb-2">
            Поля и кнопки раздела
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
            {fields.map((f) => {
              const open = openFieldId === f.id;
              return (
                <div key={f.id}>
                  <button
                    onClick={() => setOpenFieldId(open ? null : f.id)}
                    className={`w-full text-left text-xs px-3 py-2 rounded-lg border transition flex items-center justify-between ${
                      open
                        ? "bg-[#E7C768]/15 border-[#E7C768]/60 text-white"
                        : "bg-white/5 border-white/10 text-slate-200 hover:bg-white/10"
                    }`}
                  >
                    <span className="font-semibold">{f.title}</span>
                    <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
                  </button>
                  {open && (
                    <div className="text-[11px] text-slate-200 leading-relaxed px-3 py-2 markdown-body">
                      <Markdown>{f.body_md}</Markdown>
                    </div>
                  )}
                </div>
              );
            })}
            {fields.length === 0 && (
              <p className="text-[11px] text-slate-400 col-span-2">Для этого раздела ещё нет подсказок.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}