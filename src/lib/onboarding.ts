/**
 * Кэш контента онбординга (welcome-окна + подсказки полей).
 * Источник правды — таблица `onboarding_content`. Читается один раз
 * за сессию (anon-доступ), затем хранится в памяти.
 */
import { supabase } from "@/integrations/supabase/client";

export type OnboardingSection =
  | "profile" | "companies" | "vacancies"
  | "interviews" | "training" | "crm" | "billing";

export type OnboardingItem = {
  id: string;
  section: OnboardingSection;
  field_key: string | null;
  kind: "section_welcome" | "field_help";
  title: string;
  body_md: string;
  selector: string | null;
  order_idx: number;
};

let cache: OnboardingItem[] | null = null;
let pending: Promise<OnboardingItem[]> | null = null;

export async function loadOnboarding(): Promise<OnboardingItem[]> {
  if (cache) return cache;
  if (pending) return pending;
  pending = (async () => {
    const { data, error } = await supabase
      .from("onboarding_content" as any)
      .select("id, section, field_key, kind, title, body_md, selector, order_idx")
      .order("section", { ascending: true })
      .order("order_idx", { ascending: true });
    if (error) {
      console.warn("[onboarding] load failed", error);
      cache = [];
      return cache;
    }
    cache = ((data as unknown) as OnboardingItem[]) || [];
    return cache;
  })();
  return pending;
}

export async function getSectionWelcome(section: OnboardingSection) {
  const all = await loadOnboarding();
  return all.find((x) => x.section === section && x.kind === "section_welcome") || null;
}

export async function getSectionFields(section: OnboardingSection) {
  const all = await loadOnboarding();
  return all.filter((x) => x.section === section && x.kind === "field_help");
}

export async function getFieldHelp(section: OnboardingSection, field_key: string) {
  const all = await loadOnboarding();
  return all.find(
    (x) => x.section === section && x.kind === "field_help" && x.field_key === field_key,
  ) || null;
}

/* ----------------------- Tour state in Supabase --------------------------- */

export type TourStatus = "pending" | "completed" | "dismissed";

export async function getTourStatus(section: OnboardingSection): Promise<TourStatus> {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return "completed"; // не показываем неавторизованным
  const { data } = await supabase
    .from("employer_tour_state" as any)
    .select("status")
    .eq("user_id", u.user.id)
    .eq("section", section)
    .maybeSingle();
  return ((data as any)?.status as TourStatus) || "pending";
}

export async function setTourStatus(section: OnboardingSection, status: TourStatus) {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return;
  await supabase.from("employer_tour_state" as any).upsert(
    {
      user_id: u.user.id,
      section,
      status,
      completed_at: status === "completed" ? new Date().toISOString() : null,
    },
    { onConflict: "user_id,section" },
  );
}

export async function resetAllTours() {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return;
  await supabase.from("employer_tour_state" as any).delete().eq("user_id", u.user.id);
}