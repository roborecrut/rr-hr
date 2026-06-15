import React, { useId, useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Универсальный сворачиваемый блок с явной стрелкой-шевроном,
 * клавиатурной доступностью и корректным aria-expanded.
 *
 * Используем вместо «голых» <details>/<summary>, чтобы во всём приложении
 * было одинаковое поведение и понятный визуальный сигнал «можно раскрыть».
 */
interface Props {
  title: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Дополнительный значок слева от заголовка */
  icon?: React.ReactNode;
}

export const DisclosureBlock: React.FC<Props> = ({
  title,
  defaultOpen = false,
  children,
  className,
  bodyClassName,
  icon,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const panelId = `disclosure-${id}`;

  return (
    <div
      className={[
        "rounded-xl border border-white/10 bg-black/20 overflow-hidden",
        className || "",
      ].join(" ")}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs font-bold text-[#E7C768] hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E7C768]/60 transition"
      >
        {icon && <span className="shrink-0">{icon}</span>}
        <span className="flex-1">{title}</span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>
      {open && (
        <div id={panelId} className={["p-3 text-xs text-slate-200", bodyClassName || ""].join(" ")}>
          {children}
        </div>
      )}
    </div>
  );
};

export default DisclosureBlock;