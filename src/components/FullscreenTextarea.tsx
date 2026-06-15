import React, { forwardRef, useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

type Props = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "ref"> & {
  /** Optional label shown in the fullscreen header. */
  label?: string;
};

/**
 * Drop-in <textarea> wrapper that adds a brand-styled fullscreen toggle.
 * — Esc закрывает полноэкранный режим.
 * — Текст хранится в родительском state (через value/onChange), курсор
 *   и несохранённые изменения не теряются при открытии/закрытии.
 * — Никаких alert/confirm/prompt.
 */
const FullscreenTextarea = forwardRef<HTMLTextAreaElement, Props>(function FullscreenTextarea(
  { label, className, style, rows, ...rest }, externalRef
) {
  const [fullscreen, setFullscreen] = useState(false);
  const innerRef = useRef<HTMLTextAreaElement | null>(null);
  const setRef = (el: HTMLTextAreaElement | null) => {
    innerRef.current = el;
    if (typeof externalRef === "function") externalRef(el);
    else if (externalRef) (externalRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
  };

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); setFullscreen(false); }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // При входе фокус — на textarea, чтобы курсор не терялся.
    requestAnimationFrame(() => innerRef.current?.focus());
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [fullscreen]);

  const baseTextareaClass = `${className || ""} break-words whitespace-pre-wrap`;

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-[9990] bg-gradient-to-br from-[#17344F] to-[#265582] p-4 sm:p-6 overflow-auto">
        <div className="max-w-5xl mx-auto h-full flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-bold text-[#E7C768] uppercase tracking-wider">
              {label || "Полноэкранный режим"} · Esc для выхода
            </span>
            <button type="button" onClick={() => setFullscreen(false)}
              className="px-3 py-1.5 rounded-md text-[11px] font-bold inline-flex items-center gap-1 bg-[#E7C768] text-[#17344F]">
              <Minimize2 className="w-3.5 h-3.5" /> Закрыть полноэкранный режим
            </button>
          </div>
          <textarea
            ref={setRef}
            {...rest}
            className={`${baseTextareaClass} flex-1 min-h-[60vh] text-sm leading-relaxed`}
            style={{ ...(style || {}), resize: "none" }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <textarea
        ref={setRef}
        rows={rows}
        {...rest}
        className={baseTextareaClass}
        style={{ ...(style || {}), resize: "vertical" }}
      />
      <button
        type="button"
        onClick={() => setFullscreen(true)}
        title="Развернуть на весь экран"
        className="absolute top-2 right-2 p-1.5 rounded bg-black/40 hover:bg-black/60 text-slate-200 hover:text-[#E7C768] transition"
      >
        <Maximize2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
});

export default FullscreenTextarea;