/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared auth helpers.
 */
import { supabase } from "@/integrations/supabase/client";

/**
 * Полный выход: сбрасываем supabase-сессию (в т.ч. refresh token в localStorage),
 * чистим только наши служебные ключи (не трогаем весь localStorage),
 * и делаем hard-reload, чтобы сбросить in-memory state провайдеров.
 */
export async function signOutEverywhere(redirectTo: string = "/main") {
  try {
    await supabase.auth.signOut();
  } catch {
    /* ignore */
  }
  try {
    ["pendingGoogleAuth", "cand_session_id", "cand_role"].forEach((k) => {
      try { localStorage.removeItem(k); } catch { /* ignore */ }
    });
  } catch { /* ignore */ }
  try {
    window.location.assign(redirectTo);
  } catch {
    window.location.href = redirectTo;
  }
}