/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Guards /admin: allows only DB admins, or sessions opened inside the Lovable editor iframe.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRouter } from "@/components/RouterContext";

const LOVABLE_HOSTS = [
  "lovable.dev",
  "lovableproject.com",
  "lovable.app",
];

function isLovableEditorHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return LOVABLE_HOSTS.some((root) => h === root || h.endsWith("." + root));
}

function isInLovableEditor(): boolean {
  try {
    if (sessionStorage.getItem("lovable_editor") === "1") return true;
  } catch { /* ignore */ }
  try {
    if (window.self === window.top) return false;
    const ref = document.referrer;
    if (!ref) return false;
    const u = new URL(ref);
    if (u.protocol !== "https:") return false;
    if (isLovableEditorHost(u.hostname)) {
      try { sessionStorage.setItem("lovable_editor", "1"); } catch { /* ignore */ }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { navigate } = useRouter();
  const [status, setStatus] = useState<"checking" | "ok" | "deny">("checking");

  useEffect(() => {
    (async () => {
      // 1) DB role
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data, error } = await supabase.rpc("has_role", {
            _user_id: user.id,
            _role: "admin",
          });
          if (!error && data === true) {
            setStatus("ok");
            return;
          }
        }
      } catch { /* ignore */ }
      // 2) Lovable editor iframe fallback
      if (isInLovableEditor()) {
        setStatus("ok");
        return;
      }
      setStatus("deny");
      setTimeout(() => navigate("/"), 50);
    })();
  }, [navigate]);

  if (status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0F1F33] text-white">
        <div className="animate-pulse text-slate-300">Проверяем доступ…</div>
      </div>
    );
  }
  if (status === "deny") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0F1F33] text-white p-6">
        <div className="bg-[#1D3E5E] border border-[#E7C768]/30 rounded-2xl p-6 text-center max-w-md">
          <div className="text-[#E7C768] font-black text-xl mb-2">Доступ запрещён</div>
          <p className="text-sm text-slate-300">У вас нет прав администратора.</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}