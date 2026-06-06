/**
 * Чекбокс согласия с публичной офертой. По умолчанию включён.
 * Текст-ссылка открывает попап OfferDialog со скроллом.
 */
import { useState } from "react";
import OfferDialog from "./OfferDialog";

interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
  /** Контекст: регистрация или оплата — меняет первое слово в подписи. */
  context?: "register" | "pay";
  className?: string;
}

export default function OfferConsent({ checked, onChange, context = "pay", className }: Props) {
  const [open, setOpen] = useState(false);
  const verb = context === "register" ? "Регистрируясь" : "Оплачивая";

  return (
    <div className={"flex items-start gap-2 text-[11px] text-slate-200 " + (className || "")}>
      <input
        id="offer-consent"
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 accent-[#E7C768] cursor-pointer flex-shrink-0"
      />
      <label htmlFor="offer-consent" className="leading-snug cursor-pointer">
        {verb}, я подтверждаю, что ознакомлен(а) с{" "}
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); setOpen(true); }}
          className="text-[#E7C768] underline underline-offset-2 hover:text-[#D99E41]"
        >
          публичной офертой
        </button>{" "}
        и принимаю её условия.
      </label>
      <OfferDialog
        isOpen={open}
        onClose={() => setOpen(false)}
        onAccept={() => onChange(true)}
      />
    </div>
  );
}