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
        "rounded-xl border border-white/10 bg-black/25 overflow-hidden",
        className || "",
      ].join(" ")}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={[
          "w-full flex items-center gap-2.5 px-4 py-3.5 text-left text-sm md:text-[15px] font-bold text-[#E7C768]",
          "hover:bg-white/5 active:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E7C768]/60 transition",
          open ? "bg-white/5 border-b border-white/10" : "",
        ].join(" ")}
      >
        {icon && <span className="shrink-0">{icon}</span>}
        <span className="flex-1">{title}</span>
        <span
          aria-hidden
          className={[
            "shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full",
            "bg-white/5 border border-white/10 text-[#E7C768]",
            "transition-transform duration-200",
            open ? "rotate-180 bg-[#E7C768]/15 border-[#E7C768]/40" : "",
          ].join(" ")}
        >
          <ChevronDown className="w-4 h-4" />
        </span>
      </button>
      {open && (
        <div
          id={panelId}
          className={[
            "px-4 md:px-5 py-4 text-sm md:text-[15px] leading-relaxed text-slate-100/90",
            "[&>*+*]:mt-3 [&_p]:leading-relaxed [&_li]:leading-relaxed",
            "[&_ul]:space-y-2 [&_ol]:space-y-2",
            "divide-y divide-white/5 [&>section]:py-3 first:[&>section]:pt-0 last:[&>section]:pb-0",
            bodyClassName || "",
          ].join(" ")}
        >
          {children}
        </div>
      )}
    </div>
  );
};

export default DisclosureBlock;