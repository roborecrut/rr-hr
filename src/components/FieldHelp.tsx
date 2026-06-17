/**
 * Маленький значок «?» рядом с полем/кнопкой. По клику открывает
 * поповер с подробным описанием из таблицы onboarding_content.
 * Использование: <FieldHelp section="profile" fieldKey="email" />
 */
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import Markdown from "react-markdown";
import { getFieldHelp, type OnboardingItem, type OnboardingSection } from "@/lib/onboarding";

interface Props {
  section: OnboardingSection;
  fieldKey: string;
  /** Заголовок-фолбэк, если в БД ещё нет статьи для этого ключа. */
  fallbackTitle?: string;
  /** Описание-фолбэк, если в БД ещё нет статьи для этого ключа. */
  fallbackBody?: string;
  className?: string;
}

export default function FieldHelp({
  section,
  fieldKey,
  fallbackTitle,
  fallbackBody,
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [item, setItem] = useState<OnboardingItem | null>(null);
  const [loaded, setLoaded] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (open && !loaded) {
      getFieldHelp(section, fieldKey).then((it) => {
        if (!cancelled) { setItem(it); setLoaded(true); }
      });
    }
    return () => { cancelled = true; };
  }, [open, loaded, section, fieldKey]);

  const title = item?.title || fallbackTitle || "Подсказка";
  const body = item?.body_md || fallbackBody || "_Подсказка для этого поля скоро появится._";

  // Позиционируем поповер относительно самой иконки «?», а не события мыши.
  const rect = btnRef.current?.getBoundingClientRect();
  const top = rect ? Math.min(rect.bottom + 8, window.innerHeight - 320) : 100;
  const left = rect ? Math.min(Math.max(rect.left - 280, 12), window.innerWidth - 340) : 100;

  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <button
        ref={btnRef}
        type="button"
        aria-label="Подсказка"
        title="Показать подсказку"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        className="w-6 h-6 inline-flex items-center justify-center rounded-full bg-[#E7C768] text-[#17344F] hover:bg-white hover:text-[#17344F] border border-[#E7C768] shadow-[0_2px_8px_rgba(231,199,104,0.5)] transition cursor-pointer ml-1.5 align-middle shrink-0 font-bold text-[13px] leading-none"
        style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
      >
        ?
      </button>
      {open && (
        <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)}>
          <div
            className="absolute z-[9999] max-w-sm w-[320px] bg-[#1E4468] border border-[#E7C768]/60 rounded-2xl shadow-2xl p-4 text-left text-white"
            style={{ top, left }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <h4 className="text-sm font-bold text-[#E7C768] leading-tight">
                {loaded ? title : "Загружаем…"}
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
              {loaded ? <Markdown>{body}</Markdown> : <div className="opacity-60">…</div>}
            </div>
          </div>
        </div>
      )}
    </span>
  );
}