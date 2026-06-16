import React, { createContext, useCallback, useContext, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ConfirmOpts = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type ConfirmFn = (opts: ConfirmOpts) => Promise<boolean>;

const Ctx = createContext<ConfirmFn | null>(null);

// Fallback: when provider is missing, fall back to native confirm so
// callers keep working even outside the host.
const fallback: ConfirmFn = async (opts) =>
  typeof window !== "undefined" ? window.confirm(`${opts.title}${opts.description ? "\n\n" + opts.description : ""}`) : true;

export function useConfirm(): ConfirmFn {
  return useContext(Ctx) || fallback;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => setState({ ...opts, resolve }));
  }, []);

  const close = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <AlertDialog open={!!state} onOpenChange={(open) => { if (!open) close(false); }}>
        <AlertDialogContent className="bg-[#17344F] border border-[#E7C768]/40 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#E7C768]">{state?.title}</AlertDialogTitle>
            {state?.description && (
              <AlertDialogDescription className="text-slate-200 whitespace-pre-line">
                {state.description}
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => close(false)}
              className="bg-white/5 border-white/15 text-slate-200 hover:bg-white/10"
            >
              {state?.cancelLabel || "Отмена"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => close(true)}
              className={
                state?.destructive
                  ? "bg-gradient-to-r from-red-500 to-red-600 text-white hover:opacity-90"
                  : "bg-gradient-to-r from-[#E7C768] to-[#D99E41] text-[#17344F] hover:opacity-90"
              }
            >
              {state?.confirmLabel || "Подтвердить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Ctx.Provider>
  );
}