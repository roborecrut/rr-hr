import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Fallbacks ensure the bundle never crashes if env vars aren't injected at build time.
// These are the public anon credentials — safe to ship to the browser.
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://rjhtauzookkvlipvqpvr.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqaHRhdXpvb2trdmxpcHZxcHZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNjMxMDksImV4cCI6MjA5NTYzOTEwOX0.Xh40Gauewhcp80Ke4vv6Y9JsFSvI-W2Gn3QK8XabDfQ";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});