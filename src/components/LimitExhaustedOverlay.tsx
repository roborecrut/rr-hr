import React from "react";
import Mascot from "@/components/Mascot";

export interface LimitExhaustedOverlayProps {
  kind: "interview" | "training";
  employer?: { name?: string | null; email?: string | null; phone?: string | null };
  onClose?: () => void;
}

const TITLES: Record<LimitExhaustedOverlayProps["kind"], string> = {
  interview: "Услуга проведения интервью не подключена",
  training:  "Услуга проведения обучения не подключена",
};

const SUBTITLES: Record<LimitExhaustedOverlayProps["kind"], string> = {
  interview: "Работодатель ещё не оплатил или исчерпал лимиты на интервью по этой вакансии. Свяжитесь с работодателем, чтобы он подключил услугу.",
  training:  "Работодатель ещё не оплатил или исчерпал лимиты на обучение по этой вакансии. Свяжитесь с работодателем, чтобы он подключил услугу.",
};

export const LimitExhaustedOverlay: React.FC<LimitExhaustedOverlayProps> = ({ kind, employer, onClose }) => {
  const name  = employer?.name?.trim() || "Работодатель";
  const email = employer?.email?.trim() || "";
  const phone = employer?.phone?.trim() || "";

  return (
    <div className="fixed inset-0 z-[9999] bg-[#0b1d2c]/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="brand-editor max-w-lg w-full rounded-2xl border border-[#E7C768]/30 bg-gradient-to-b from-[#17344F] to-[#265582] p-6 md:p-8 text-center shadow-2xl">
        <div className="flex justify-center mb-4">
          <Mascot state="serious" size="lg" />
        </div>
        <h2 className="text-xl md:text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-[#E7C768] to-[#F4D679] mb-2">
          {TITLES[kind]}
        </h2>
        <p className="text-sm text-white/85 mb-5 leading-relaxed">
          {SUBTITLES[kind]}
        </p>
        <div className="bg-white/5 border border-[#E7C768]/30 rounded-xl p-4 text-left text-sm space-y-1.5">
          <div className="text-[11px] uppercase tracking-wider font-bold text-[#E7C768]">Контакты работодателя</div>
          <div className="text-white font-bold">{name}</div>
          {email && (
            <div className="text-white/90 break-all">
              <span className="text-white/60">Email: </span>
              <a href={`mailto:${email}`} className="underline hover:text-[#E7C768]">{email}</a>
            </div>
          )}
          {phone && (
            <div className="text-white/90">
              <span className="text-white/60">Телефон: </span>
              <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="underline hover:text-[#E7C768]">{phone}</a>
            </div>
          )}
          {!email && !phone && (
            <div className="text-white/60 italic text-xs">Контакты не указаны. Уточните у работодателя напрямую.</div>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="mt-5 inline-flex items-center justify-center bg-white/10 hover:bg-white/15 text-white text-xs font-bold px-4 py-2 rounded-xl"
          >
            Закрыть
          </button>
        )}
      </div>
    </div>
  );
};

export default LimitExhaustedOverlay;