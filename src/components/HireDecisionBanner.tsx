/**
 * Banner shown in candidate cabinet when employer made a hire decision.
 * Reads from `candidates` table via RLS (candidate token).
 */
import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

type State = {
  decision: "invited" | "rejected" | "review" | null;
  message: string | null;
  decided_at: string | null;
  company: string | null;
};

export default function HireDecisionBanner({ candidateId }: { candidateId: string | null | undefined }) {
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    if (!candidateId) { setState(null); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase as any)
        .from("candidates")
        .select("hire_decision,hire_message,hire_decided_at,company_id,companies(name)")
        .eq("id", candidateId)
        .maybeSingle();
      if (cancelled || error || !data) return;
      setState({
        decision: data.hire_decision ?? null,
        message: data.hire_message ?? null,
        decided_at: data.hire_decided_at ?? null,
        company: data?.companies?.name ?? null,
      });
    })();
    return () => { cancelled = true; };
  }, [candidateId]);

  if (!state || !state.decision) return null;

  const invited = state.decision === "invited";
  const review = state.decision === "review";
  return (
    <div className={`rounded-2xl border p-4 md:p-5 mb-5 text-left ${
      invited
        ? "bg-gradient-to-r from-emerald-500/15 to-emerald-400/10 border-emerald-400/40"
        : review
          ? "bg-gradient-to-r from-amber-500/15 to-amber-400/10 border-amber-400/40"
        : "bg-gradient-to-r from-rose-500/15 to-rose-400/10 border-rose-400/40"
    }`}>
      <div className="flex items-start gap-3">
        {invited
          ? <CheckCircle2 className="w-6 h-6 text-emerald-300 flex-shrink-0 mt-0.5" />
          : review
            ? <Clock className="w-6 h-6 text-amber-300 flex-shrink-0 mt-0.5" />
            : <XCircle className="w-6 h-6 text-rose-300 flex-shrink-0 mt-0.5" />}
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-bold ${invited ? "text-emerald-100" : review ? "text-amber-100" : "text-rose-100"}`}>
            {invited
              ? `Вас пригласили на работу${state.company ? ` в «${state.company}»` : ""}!`
              : review
                ? `Ваша кандидатура на рассмотрении${state.company ? ` в «${state.company}»` : ""}`
              : `Решение по вашей кандидатуре${state.company ? ` от «${state.company}»` : ""}`}
          </div>
          {state.message && (
            <div className="mt-2 text-[13px] text-white/90 whitespace-pre-wrap leading-relaxed">
              {state.message}
            </div>
          )}
          {state.decided_at && (
            <div className="mt-2 text-[10px] text-white/50 font-mono">
              {new Date(state.decided_at).toLocaleString("ru-RU")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}