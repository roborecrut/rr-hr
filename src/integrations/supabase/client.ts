import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '@/config';

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

// Read the opaque candidate token from localStorage on every request so
// PostgREST policies can resolve `public.current_candidate_id()` from the
// `x-candidate-token` header. Anon `auth.uid()` is NULL — without this
// header candidate-cabinet rows are invisible to RLS.
function candidateAuthHeaders(): Record<string, string> {
  try {
    const raw = localStorage.getItem('cand_session');
    if (!raw) return {};
    const s = JSON.parse(raw);
    const tok = typeof s?.token === 'string' ? s.token : '';
    return tok ? { 'x-candidate-token': tok } : {};
  } catch {
    return {};
  }
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    fetch: (input, init = {}) => {
      const headers = new Headers(init.headers || {});
      const tok = candidateAuthHeaders()['x-candidate-token'];
      if (tok && !headers.has('x-candidate-token')) {
        headers.set('x-candidate-token', tok);
      }
      return fetch(input as RequestInfo, { ...init, headers });
    },
  },
});