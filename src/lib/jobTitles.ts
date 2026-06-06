import { supabase } from "@/integrations/supabase/client";
import { BASIC_SPECIALTIES } from "@/types";

export type JobTitle = { id: string; title: string; usage_count: number; is_basic: boolean };

let cache: JobTitle[] | null = null;

/**
 * Load the shared job titles catalog. Ordered by popularity then alphabetically.
 * Falls back to the hard-coded BASIC_SPECIALTIES list on network failure.
 */
export async function fetchJobTitles(force = false): Promise<JobTitle[]> {
  if (cache && !force) return cache;
  try {
    const { data, error } = await supabase
      .from("job_titles")
      .select("id, title, usage_count, is_basic")
      .order("usage_count", { ascending: false })
      .order("title", { ascending: true });
    if (error) throw error;
    cache = (data as JobTitle[]) || [];
    return cache;
  } catch (err) {
    // Fallback so the UI is never empty.
    cache = BASIC_SPECIALTIES.map((t, i) => ({
      id: `fallback-${i}`,
      title: t,
      usage_count: 0,
      is_basic: true,
    }));
    return cache;
  }
}

/**
 * Upsert a title (or bump its usage_count if it already exists). Returns the
 * canonical row. Drops the local cache so the next read shows the updated list.
 */
export async function upsertJobTitle(title: string): Promise<JobTitle | null> {
  const t = (title || "").trim();
  if (!t) return null;
  try {
    const { data, error } = await supabase.rpc("job_title_upsert" as any, { _title: t });
    if (error) throw error;
    cache = null;
    return (data as unknown) as JobTitle;
  } catch (err) {
    console.warn("upsertJobTitle failed", err);
    return null;
  }
}

export function invalidateJobTitlesCache() {
  cache = null;
}