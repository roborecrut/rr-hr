// Унифицированные хелперы авторизации для Edge Functions.
//
// requireEmployerJwt(req) — проверяет Supabase Auth JWT работодателя через getClaims().
// Возвращает { userId } либо Response(401).
//
// requireCandidateToken(req, body) — проверяет токен кандидата из заголовка
// `x-candidate-token` или поля `candidate_token` тела запроса в таблице
// candidate_sessions. Возвращает { candidateId } либо Response(401).
//
// Оба хелпера возвращают понятный JSON c полем `error` (короткий код) и не раскрывают
// внутренних деталей.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "./cors.ts";

function err(code: string, status: number): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Проверяет JWT работодателя/админа из заголовка Authorization.
 * Если токен валиден — возвращает { userId }. Иначе — Response(401).
 */
export async function requireEmployerJwt(
  req: Request,
): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return err("unauthorized", 401);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) return err("server_misconfigured", 500);

  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.slice("Bearer ".length).trim();
  try {
    // supabase-js v2.45 не имеет надёжного getClaims на всех сборках edge —
    // используем admin getUser(token), который валидирует JWT по тому же ключу
    // и возвращает auth.users.id. Это устраняет ложные 401 при генерации
    // ИИ-чек-листа / ситуаций, когда токен на самом деле валиден.
    const url2 = Deno.env.get("SUPABASE_URL");
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url2 || !svc) return err("server_misconfigured", 500);
    const admin = createClient(url2, svc);
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user?.id) return err("unauthorized", 401);
    return { userId: data.user.id };
  } catch {
    return err("unauthorized", 401);
  }
}

/**
 * Проверяет токен кандидатской сессии. Токен ищется в:
 *   1. заголовке `x-candidate-token`
 *   2. поле `candidate_token` тела запроса (если оно передано).
 * Возвращает { candidateId } либо Response(401).
 *
 * IMPORTANT: candidate_id вызывающий код должен брать ТОЛЬКО из возвращённого
 * candidateId, не из body — иначе кандидат может выдать себя за другого.
 */
export async function requireCandidateToken(
  req: Request,
  bodyToken?: string | null,
): Promise<{ candidateId: string } | Response> {
  const headerToken = req.headers.get("x-candidate-token") || req.headers.get("X-Candidate-Token");
  const token = (headerToken || bodyToken || "").toString().trim();
  if (!token) return err("candidate_token_required", 401);

  const url = Deno.env.get("SUPABASE_URL");
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !svc) return err("server_misconfigured", 500);

  const admin = createClient(url, svc);
  const { data, error } = await admin
    .from("candidate_sessions")
    .select("candidate_id, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (error || !data?.candidate_id) return err("bad_token", 401);
  if (data.expires_at && new Date(data.expires_at as string).getTime() < Date.now()) {
    return err("token_expired", 401);
  }
  return { candidateId: data.candidate_id as string };
}

/**
 * Возвращает employers.id для текущего auth-пользователя, либо Response(403/500).
 * Работодатели хранятся в таблице employers со связкой user_id -> auth.users.id.
 */
export async function getEmployerIdForUser(userId: string): Promise<{ employerId: string } | Response> {
  const url = Deno.env.get("SUPABASE_URL");
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !svc) return err("server_misconfigured", 500);
  const admin = createClient(url, svc);
  const { data } = await admin
    .from("employers")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.id) return err("forbidden", 403);
  return { employerId: data.id as string };
}

/** Возвращает true, если пользователь имеет роль 'admin' в user_roles. */
export async function isAdminUser(userId: string): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL");
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !svc) return false;
  const admin = createClient(url, svc);
  const { data } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

/**
 * Проверяет, что project (или company) принадлежит работодателю текущего пользователя.
 * Возвращает true либо Response(403/404).
 */
export async function assertProjectOwner(opts: {
  userId: string;
  projectId?: string | null;
  companyId?: string | null;
}): Promise<true | Response> {
  const url = Deno.env.get("SUPABASE_URL");
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !svc) return err("server_misconfigured", 500);
  const admin = createClient(url, svc);

  if (await isAdminUser(opts.userId)) return true;

  const emp = await getEmployerIdForUser(opts.userId);
  if (emp instanceof Response) return emp;
  const employerId = emp.employerId;

  if (opts.projectId) {
    const { data } = await admin
      .from("projects")
      .select("employer_id, company_id")
      .eq("id", opts.projectId)
      .maybeSingle();
    if (!data) return err("project_not_found", 404);
    if ((data as any).employer_id !== employerId) return err("forbidden", 403);
    return true;
  }

  if (opts.companyId) {
    const { data } = await admin
      .from("companies")
      .select("owner_employer_id")
      .eq("id", opts.companyId)
      .maybeSingle();
    if (!data) return err("company_not_found", 404);
    if ((data as any).owner_employer_id !== employerId) return err("forbidden", 403);
    return true;
  }

  return true;
}

/**
 * Проверяет, что candidate принадлежит проекту, владельцем которого является пользователь.
 */
export async function assertCandidateOwner(opts: {
  userId: string;
  candidateId: string;
}): Promise<true | Response> {
  const url = Deno.env.get("SUPABASE_URL");
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !svc) return err("server_misconfigured", 500);
  if (await isAdminUser(opts.userId)) return true;
  const admin = createClient(url, svc);
  const { data } = await admin
    .from("candidates")
    .select("project_id")
    .eq("id", opts.candidateId)
    .maybeSingle();
  if (!data?.project_id) return err("candidate_not_found", 404);
  return assertProjectOwner({ userId: opts.userId, projectId: data.project_id as string });
}

/**
 * Sugar: проверяет JWT работодателя и ownership проекта одной операцией.
 * Возвращает { userId } либо Response с корректным статусом (401/403/404).
 * Использовать ПЕРЕД любым приватным чтением из projects/companies.
 */
export async function requireEmployerForProject(
  req: Request,
  projectId: string | null | undefined,
): Promise<{ userId: string } | Response> {
  const auth = await requireEmployerJwt(req);
  if (auth instanceof Response) return auth;
  if (!projectId) {
    return new Response(JSON.stringify({ error: "bad_body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const own = await assertProjectOwner({ userId: auth.userId, projectId });
  if (own instanceof Response) return own;
  return { userId: auth.userId };
}

/**
 * Sugar: проверяет JWT работодателя и ownership компании одной операцией.
 */
export async function requireEmployerForCompany(
  req: Request,
  companyId: string | null | undefined,
): Promise<{ userId: string } | Response> {
  const auth = await requireEmployerJwt(req);
  if (auth instanceof Response) return auth;
  if (!companyId) {
    return new Response(JSON.stringify({ error: "bad_body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const own = await assertProjectOwner({ userId: auth.userId, companyId });
  if (own instanceof Response) return own;
  return { userId: auth.userId };
}