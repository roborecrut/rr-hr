import { useState, useMemo } from "react";
import { X, Coins, Wallet, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FIXED_PRICES, formatRR } from "@/lib/rr";
import type { JobProject } from "../types";

export type SpendKind = "landing" | "interview_setup" | "training_setup";

const LABEL: Record<SpendKind, string> = {
  landing: "ИИ-Лендинг вакансии",
  interview_setup: "ИИ-Система интервью",
  training_setup: "ИИ-Система обучения",
};

const RR_CASHIER = "https://rjhtauzookkvlipvqpvr.supabase.co/storage/v1/object/public/Logos/RR11.png";
const RR_EMPTY   = "https://rjhtauzookkvlipvqpvr.supabase.co/storage/v1/object/public/Logos/RR10.png";

type Props = {
  open: boolean;
  kind: SpendKind;
  /** Pre-known project (vacancy flow). When omitted, a picker is shown. */
  projectId?: string;
  /** Projects to choose from when projectId is not pre-known. */
  pickProjects?: JobProject[];
  /** Optional set of project ids that already have this system (will be filtered out from picker). */
  excludeProjectIds?: Set<string>;
  balance: number;
  credits: number;
  /** Called after a successful spend (or already-charged idempotent hit). */
  onConfirmed: (projectId: string) => void;
  /** Called when user closes or cancels. */
  onClose: () => void;
  /** Open the billing/top-up screen. */
  onGoToBilling: () => void;
};

export default function SpendConfirmDialog({
  open, kind, projectId, pickProjects, excludeProjectIds,
  balance, credits, onConfirmed, onClose, onGoToBilling,
}: Props) {
  const price = FIXED_PRICES[kind];
  const [pickedId, setPickedId] = useState<string>(projectId || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>("");

  const effectiveProjectId = projectId || pickedId;

  const filteredProjects = useMemo(
    () => (pickProjects || []).filter(p => !excludeProjectIds?.has(p.id)),
    [pickProjects, excludeProjectIds],
  );

  if (!open) return null;

  const hasCredit = credits > 0;
  const canPayRR = !hasCredit && balance >= price;
  const insufficient = !hasCredit && balance < price;

  const handleSpend = async (prefer: "credit" | "balance" = "credit") => {
    if (!effectiveProjectId) { setErr("Выберите вакансию"); return; }
    setBusy(true); setErr("");
    try {
      const { error } = await supabase.rpc("spend_fixed" as any, { _project: effectiveProjectId, _item: kind, _prefer: prefer });
      if (error) throw new Error(error.message || "Ошибка списания");
      onConfirmed(effectiveProjectId);
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (/insufficient_funds/.test(msg)) {
        setErr("Недостаточно RR на балансе. Пополните счёт.");
      } else {
        setErr(msg || "Не удалось выполнить списание");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="brand-editor bg-gradient-to-br from-[#17344F] to-[#265582] border-2 border-[#E7C768]/60 rounded-3xl w-full max-w-md text-white shadow-2xl relative overflow-hidden">
        <button
          onClick={() => !busy && onClose()}
          className="absolute top-3 right-3 text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 w-8 h-8 rounded-full flex items-center justify-center transition z-10"
          aria-label="Закрыть"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center px-6 pt-6 pb-2">
          <img
            src={insufficient ? RR_EMPTY : RR_CASHIER}
            alt="RR робот-кассир"
            width={160}
            height={160}
            loading="lazy"
            decoding="async"
            className="w-40 h-40 object-contain drop-shadow-[0_4px_20px_rgba(231,199,104,0.35)]"
          />
          <h2 className="mt-2 text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-[#F4EE8E] to-[#D99E41] text-center">
            {insufficient ? "Недостаточно RR на балансе" : "Подтверждение списания"}
          </h2>
          <p className="mt-1 text-xs text-slate-200 text-center">{LABEL[kind]} · {price} RR</p>
        </div>

        <div className="px-6 pb-6 space-y-4">
          {!projectId && (
            <div>
              <label className="block text-[11px] font-bold text-slate-200 mb-1">Вакансия</label>
              <select
                value={pickedId}
                onChange={(e) => setPickedId(e.target.value)}
                disabled={busy}
                className="w-full bg-[#0E2236] border border-white/15 rounded-xl px-3 py-2 text-sm text-white focus:border-[#E7C768] outline-none"
              >
                <option value="">— выберите —</option>
                {filteredProjects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.roleName || "(без названия)"} · 🏢 {p.companyName || "—"}
                  </option>
                ))}
              </select>
              {filteredProjects.length === 0 && (
                <p className="mt-1 text-[11px] text-amber-300">
                  Нет доступных вакансий — для всех уже создана система.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-2">
              <div className="text-slate-400">Лимиты услуги</div>
              <div className="text-white font-bold flex items-center gap-1">
                <Coins className="w-3 h-3 text-[#E7C768]" /> {credits} шт
              </div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-2">
              <div className="text-slate-400">Баланс</div>
              <div className="text-white font-bold flex items-center gap-1">
                <Wallet className="w-3 h-3 text-[#E7C768]" /> {formatRR(balance)}
              </div>
            </div>
          </div>

          {err && (
            <div className="bg-red-500/15 border border-red-400/40 text-red-200 text-[11px] px-3 py-2 rounded-lg flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {err}
            </div>
          )}

          {insufficient ? (
            <>
              <p className="text-xs text-slate-200 leading-relaxed text-center">
                Чтобы создать «{LABEL[kind]}», нужно <b>{price} RR</b>, а на балансе сейчас{" "}
                <b>{formatRR(balance)}</b>. Пополните счёт и вернитесь — мы вас ждём!
              </p>
              <button
                onClick={() => { onClose(); onGoToBilling(); }}
                className="w-full btn-brand-gold py-3 rounded-xl text-sm font-black"
              >
                Пополнить баланс RR
              </button>
            </>
          ) : hasCredit ? (
            <div className="space-y-2">
              <button
                onClick={() => handleSpend("credit")}
                disabled={busy || !effectiveProjectId}
                className="w-full btn-brand-gold py-3 rounded-xl text-sm font-black"
              >
                {busy ? "Списываем…" : `Списать 1 лимит (осталось ${credits - 1})`}
              </button>
              <button
                onClick={() => handleSpend("balance")}
                disabled={busy || !effectiveProjectId || balance < price}
                className="w-full btn-brand-secondary py-3 rounded-xl text-sm font-black disabled:opacity-50"
                title={balance < price ? "Недостаточно RR на балансе" : ""}
              >
                {busy ? "Списываем…" : `Списать ${price} RR с баланса (оставить лимит)`}
              </button>
            </div>
          ) : (
            <button
              onClick={() => handleSpend("balance")}
              disabled={busy || !canPayRR || !effectiveProjectId}
              className="w-full btn-brand-gold py-3 rounded-xl text-sm font-black"
            >
              {busy ? "Списываем…" : `Списать ${price} RR с баланса`}
            </button>
          )}

          <button
            onClick={() => !busy && onClose()}
            className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 py-2 rounded-xl text-xs font-bold"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}