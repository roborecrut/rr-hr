import React from "react";
import { MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type FieldAction = {
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** Insert a divider above this item. */
  separatorAbove?: boolean;
};

interface Props {
  actions: FieldAction[];
  ariaLabel?: string;
  className?: string;
}

/**
 * Универсальное меню «···» для второстепенных действий у поля/карточки.
 * Скрывает шумные кнопки (Шаблон / Сброс / Дублировать / Удалить) под одной
 * иконкой, чтобы редакторы и списки выглядели чище и читабельнее.
 */
export default function FieldActionsMenu({ actions, ariaLabel = "Действия", className }: Props) {
  if (!actions || actions.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={ariaLabel}
        title={ariaLabel}
        className={
          "inline-flex h-9 w-9 items-center justify-center rounded-lg " +
          "border border-[#E7C768]/60 bg-[#E7C768]/15 text-[#E7C768] " +
          "shadow-[0_0_0_1px_rgba(231,199,104,0.15)] " +
          "transition hover:bg-[#E7C768]/30 hover:border-[#E7C768] hover:text-white " +
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E7C768]/70 " +
          "active:scale-95 " +
          (className || "")
        }
      >
        <MoreVertical className="h-5 w-5" strokeWidth={2.5} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-[200px] border border-white/15 bg-[#17344F] text-white"
      >
        {actions.map((a, i) => (
          <React.Fragment key={i}>
            {a.separatorAbove && i > 0 && <DropdownMenuSeparator className="bg-white/10" />}
            <DropdownMenuItem
              disabled={a.disabled}
              onSelect={(e) => {
                e.preventDefault();
                if (!a.disabled) a.onClick();
              }}
              className={
                "flex items-center gap-2 text-sm cursor-pointer focus:bg-white/10 " +
                (a.danger ? "text-red-300 focus:text-red-200" : "text-white")
              }
            >
              {a.icon && <span className="opacity-80">{a.icon}</span>}
              <span>{a.label}</span>
            </DropdownMenuItem>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}