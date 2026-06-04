/**
 * URL/link helpers and DB-backed loaders that bind every dynamic segment
 * (`/{companySlug}/{projectSlug}/{candidate-public-id}/...`, `/employer{public_id}/...`,
 * `/candidate{public_id}/...`) to real records in Supabase. No hardcoded slugs.
 */
import { supabase } from "@/integrations/supabase/client";

export type DBCompany = {
  id: string;
  slug: string | null;
  name: string | null;
  owner_employer_id?: string | null;
  logo_url?: string | null;
};

export type DBProject = {
  id: string;
  slug: string | null;
  role_name: string | null;
  employer_id: string;
  company_id: string | null;
  is_published?: boolean;
};

export type DBCandidate = {
  id: string;
  public_id: string | null;
  project_id: string | null;
  user_id: string | null;
};

export type DBEmployer = {
  id: string;
  public_id: string | null;
  user_id: string | null;
  company_name?: string | null;
};

/* ----------------------------- URL builders ----------------------------- */

export function buildCompanyUrl(company: { slug: string | null } | null | undefined): string {
  return company?.slug ? `/com${company.slug}` : `/`;
}

export function buildVacancyUrl(
  company: { slug: string | null } | null | undefined,
  project: { slug: string | null } | null | undefined,
): string {
  if (!company?.slug || !project?.slug) return `/`;
  return `/com${company.slug}/vac${project.slug}`;
}

export function buildCandidateUrl(
  company: { slug: string | null } | null | undefined,
  project: { slug: string | null } | null | undefined,
  candidate: { public_id: string | null } | null | undefined,
  tab: string = "profile",
  sub?: string,
): string {
  const candId = candidate?.public_id ? `cand${candidate.public_id}` : `cand`;
  const tail = sub ? `${tab}/${sub}` : tab;
  if (company?.slug && project?.slug) {
    return `/com${company.slug}/vac${project.slug}/${candId}/${tail}`;
  }
  return `/${candId}/${tail}`;
}

export function buildEmployerUrl(
  employer: { public_id: string | null } | null | undefined,
  tab: string = "profile",
): string {
  const pid = employer?.public_id ?? "";
  return pid ? `/emp${pid}/${tab}` : `/employer/${tab}`;
}

/* ---------------------------- DB Resolvers ----------------------------- */

export async function resolveEmployerByPublicId(publicId: string): Promise<DBEmployer | null> {
  const { data } = await supabase
    .from("employers")
    .select("id, public_id, user_id, company_name")
    .eq("public_id", publicId)
    .maybeSingle();
  return (data as DBEmployer) || null;
}

export async function resolveEmployerByUser(userId: string): Promise<DBEmployer | null> {
  const { data } = await supabase
    .from("employers")
    .select("id, public_id, user_id, company_name")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as DBEmployer) || null;
}

export async function resolveCandidateByPublicId(publicId: string): Promise<DBCandidate | null> {
  const { data } = await supabase
    .from("candidates")
    .select("id, public_id, project_id, user_id")
    .eq("public_id", publicId)
    .maybeSingle();
  return (data as DBCandidate) || null;
}

export async function resolveCandidateByUser(userId: string): Promise<DBCandidate | null> {
  const { data } = await supabase
    .from("candidates")
    .select("id, public_id, project_id, user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as DBCandidate) || null;
}

export async function resolveCompanyBySlug(slug: string): Promise<DBCompany | null> {
  const { data } = await supabase
    .from("companies")
    .select("id, slug, name, owner_employer_id, logo_url")
    .eq("slug", slug)
    .maybeSingle();
  return (data as DBCompany) || null;
}

export async function resolveProjectBySlug(slug: string): Promise<DBProject | null> {
  const { data } = await supabase
    .from("projects")
    .select("id, slug, role_name, employer_id, company_id, is_published")
    .eq("slug", slug)
    .maybeSingle();
  return (data as DBProject) || null;
}

export async function resolveProjectById(id: string): Promise<DBProject | null> {
  const { data } = await supabase
    .from("projects")
    .select("id, slug, role_name, employer_id, company_id, is_published")
    .eq("id", id)
    .maybeSingle();
  return (data as DBProject) || null;
}

/**
 * Best-effort: given any user, find their public profile path.
 * Tries employer first (public_id), then candidate (public_id).
 */
export async function resolveProfilePathForUser(userId: string): Promise<string> {
  const emp = await resolveEmployerByUser(userId);
  if (emp?.public_id) return buildEmployerUrl(emp, "profile");
  const cand = await resolveCandidateByUser(userId);
  if (cand?.public_id) return `/cand${cand.public_id}/profile`;
  return "/";
}