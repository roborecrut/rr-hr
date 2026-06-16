/**
 * Маленький значок «?» рядом с полем/кнопкой. По клику открывает
 * поповер с подробным описанием из таблицы onboarding_content.
 * Использование: <FieldHelp section="profile" fieldKey="email" />
 */
import { useEffect, useState } from "react";
import { HelpCircle, X } from "lucide-react";
import Markdown from "react-markdown";
import { getFieldHelp, type OnboardingItem, type OnboardingSection } from "@/lib/onboarding";

interface Props {
  section: OnboardingSection;
  fieldKey: string;
  className?: string;
}

export default function FieldHelp({ section, fieldKey, className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [item, setItem] = useState<OnboardingItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (open && !item) {
      getFieldHelp(section, fieldKey).then((it) => {
        if (!cancelled) setItem(it);
      });
    }
    return () => { cancelled = true; };
  }, [open, item, section, fieldKey]);

  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        aria-label="Подсказка"
        title="Показать подсказку"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        className="w-4 h-4 inline-flex items-center justify-center rounded-full text-[#E7C768] hover:text-white hover:bg-[#E7C768]/30 transition cursor-pointer ml-1 align-middle"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)}>
          <div
            className="absolute z-[9999] max-w-sm w-[320px] bg-[#1D3E5E] border border-[#E7C768]/60 rounded-2xl shadow-2xl p-4 text-left text-white"
            style={{
              top: Math.min((window.event as MouseEvent)?.clientY ?? 100, window.innerHeight - 300) + 16,
              left: Math.min((window.event as MouseEvent)?.clientX ?? 100, window.innerWidth - 340),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <h4 className="text-sm font-bold text-[#E7C768] leading-tight">
                {item?.title || "Загружаем…"}
              </h4>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-300 hover:text-white"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="text-xs text-slate-200 leading-relaxed markdown-body max-h-[60vh] overflow-y-auto">
              {item ? <Markdown>{item.body_md}</Markdown> : <div className="opacity-60">…</div>}
            </div>
          </div>
        </div>
      )}
    </span>
  );
}