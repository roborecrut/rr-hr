// Generate three HH (HeadHunter) templates for a vacancy in one ProTalk call:
//   - hh_post_text       — продающий текст вакансии для публикации на hh.ru
//   - hh_invite_text     — шаблон приглашения на интервью с Роботом Рекрутером
//                          (используется в авто-отклике hh.ru, со ссылкой на вакансию)
//   - hh_autoresume_text — инструкция для подключения авто-разбора резюме на hh.ru
//
// Uses the standard job-flow (ai_jobs + ai_job_attempts) so на ошибку
// фронт получает job_id + fallback_available=true и может перезапустить
// задачу через резервный оверлей RR Pro Max (ai-fallback-rr-pro-max).
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callProTalk, tryParseJson, buildChatId, buildSocialId, getAdminClient, getUserFromAuthHeader, logToDb, resolveEmployerPublicId,
} from "../_shared/protalk.ts";
import { requireEmployerForProject } from "../_shared/auth.ts";
import { createOrReuseAiJob, startPrimaryAttempt, finishAttempt, markJobStatus } from "../_shared/ai-jobs.ts";

const PUBLIC_SITE = "https://hr-rr.ru";

function buildVacancyUrl(companySlug: string | null, projectSlug: string | null): string {
  if (!companySlug || !projectSlug) return "";
  return `${PUBLIC_SITE}/com${companySlug}/vac${projectSlug}`;
}

function buildPrompt(input: {
  roleName: string;
  companyName: string;
  vacancyUrl: string;
  vacancyText: string;
  tasksText: string;
  scheduleText: string;
  motivationText: string;
  motivationDetail: string;
  payoutsText: string;
  onboardingText: string;
  teamText: string;
  systemText: string;
}): string {
  const ctx = (label: string, val: string) =>
    val && val.trim() ? `\n--- ${label} ---\n${val.trim()}` : "";
  const fullCtx = [
    ctx("Требования к кандидату", input.vacancyText),
    ctx("Задачи / ежедневная активность", input.tasksText),
    ctx("График", input.scheduleText),
    ctx("Мотивация (коротко)", input.motivationText),
    ctx("Мотивация (детально)", input.motivationDetail),
    ctx("Оплата", input.payoutsText),
    ctx("Этапы онбординга", input.onboardingText),
    ctx("Команда", input.teamText),
    ctx("Системы и регламенты", input.systemText),
  ].join("");

  return `Ты — старший HR-копирайтер с глубоким опытом публикации вакансий на hh.ru.
Пиши строго на русском языке. Избегай англицизмов, кроме общеупотребительных профессиональных терминов.

ИСХОДНЫЕ ДАННЫЕ О ВАКАНСИИ
Должность: ${input.roleName || "—"}
Компания: ${input.companyName || "—"}
Ссылка на лендинг вакансии (нужно использовать в шаблонах): ${input.vacancyUrl || "—"}
${fullCtx}

ЗАДАЧА: верни СТРОГО ОДИН JSON-объект с ровно тремя строковыми ключами:
{
  "hh_post_text": "...",
  "hh_invite_text": "...",
  "hh_autoresume_text": "..."
}

ТРЕБОВАНИЯ К ПОЛЯМ:

1. "hh_post_text" — готовый продающий текст вакансии для публикации на hh.ru.
   Структура (используй именно эти заголовки заглавными буквами на отдельной строке):
     О КОМПАНИИ
     ОБЯЗАННОСТИ
     ТРЕБОВАНИЯ
     УСЛОВИЯ
   Каждый пункт — отдельной строкой, начинается с «— ».
   Не выдумывай конкретные цифры/ссылки/имена, которых нет в исходных данных.
   Объём: 1500–3000 символов.

2. "hh_invite_text" — короткий, человечный шаблон ОТВЕТНОГО письма соискателю
   для авто-отклика hh.ru. Цель — пригласить пройти интервью с ИИ-рекрутёром
   «Робот Рекрутёр» по ссылке вакансии.
   Обязательно: обращение к кандидату, благодарность за отклик, 1-2 фразы
   о компании/должности, чёткий призыв перейти по ссылке и пройти короткое
   интервью (10–15 минут), сама ссылка ${input.vacancyUrl || "{ссылка_на_вакансию}"} отдельной строкой,
   подпись от лица HR-команды. Без markdown.
   Объём: 500–1500 символов.

3. "hh_autoresume_text" — пошаговая инструкция для работодателя, как
   подключить авто-разбор откликов на hh.ru, чтобы все входящие резюме
   автоматически уходили в Робот Рекрутёр на анализ и приглашение на
   интервью. Структура: пронумерованные шаги (1., 2., 3., ...), внутри
   шага — короткое пояснение. В конце — блок «РЕКОМЕНДАЦИИ» с 3–5
   маркированными советами (начинаются с «— »). Объём: 1000–2500 символов.

ЖЁСТКИЕ ПРАВИЛА ОТВЕТА:
- Только валидный JSON, без markdown-обёрток, без пояснений до или после.
- Все три ключа обязательны, значения — непустые строки.
- Никаких дополнительных ключей.
- Не вызывай внешние инструменты, не делай поиск, не ходи по URL.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => null) as null | { project_id: string };
  if (!body?.project_id) return jsonResponse({ error: "bad_body" }, 400);

  const guard = await requireEmployerForProject(req, body.project_id);
  if (guard instanceof Response) return guard;

  const admin = getAdminClient();
  if (!admin) return jsonResponse({ error: "no_admin_client" }, 500);

  const { data: proj } = await admin.from("projects").select(
    "id, role_name, slug, company_id, vacancy_text, tasks_activity_text, schedule_text, motivation_text, motivation_text_detail, payouts_text, onboarding_text, team_text, system_text",
  ).eq("id", body.project_id).maybeSingle();
  if (!proj) return jsonResponse({ error: "no_project" }, 404);

  let companyName = "";
  let companySlug: string | null = null;
  if ((proj as any).company_id) {
    const { data: co } = await admin.from("companies").select("name, slug").eq("id", (proj as any).company_id).maybeSingle();
    companyName = (co as any)?.name || "";
    companySlug = (co as any)?.slug || null;
  }
  const vacancyUrl = buildVacancyUrl(companySlug, (proj as any).slug || null);

  const user = await getUserFromAuthHeader(req.headers.get("Authorization"));
  const empPid = await resolveEmployerPublicId({ projectId: body.project_id, userId: user?.id });

  const chatId = buildChatId({ userId: user?.id, employerPublicId: empPid });

  const socialId = buildSocialId({ user_id: user?.id, employer_public_id: empPid });

  const msg = buildPrompt({
    roleName: (proj as any).role_name || "",
    companyName,
    vacancyUrl,
    vacancyText: (proj as any).vacancy_text || "",
    tasksText: (proj as any).tasks_activity_text || "",
    scheduleText: (proj as any).schedule_text || "",
    motivationText: (proj as any).motivation_text || "",
    motivationDetail: (proj as any).motivation_text_detail || "",
    payoutsText: (proj as any).payouts_text || "",
    onboardingText: (proj as any).onboarding_text || "",
    teamText: (proj as any).team_text || "",
    systemText: (proj as any).system_text || "",
  });

  const idem = `hh_templates:${body.project_id}`;
  const job = await createOrReuseAiJob({
    userId: user?.id || null,
    jobType: "hh_templates",
    idempotencyKey: idem,
    requestSnapshot: { message: msg, project_id: body.project_id, timeout_ms: 180_000 },
    fallbackAllowed: true,
  });
  const jobId = "id" in job ? job.id : null;
  const attemptId = jobId ? await startPrimaryAttempt(jobId) : null;

  try {
    const r = await callProTalk({ messages: [{ role: "user", content: msg }], chatId, socialId, timeoutMs: 180_000 });
    const obj = tryParseJson<Record<string, string>>(r.text);
    if (!obj || typeof obj !== "object" || !obj.hh_post_text || !obj.hh_invite_text || !obj.hh_autoresume_text) {
      throw new Error("bad_json");
    }
    const fields = {
      hh_post_text: String(obj.hh_post_text).slice(0, 6000),
      hh_invite_text: String(obj.hh_invite_text).slice(0, 3000),
      hh_autoresume_text: String(obj.hh_autoresume_text).slice(0, 5000),
    };
    const upd = await admin.from("projects").update(fields).eq("id", body.project_id);
    if (upd.error) throw new Error("save_failed");
    await logToDb({ user_message: `[prompt:${msg.length}b]`, bot_reply: `[reply:${r.text.length}b]`, channel_id: chatId, user_social_id: socialId, channel_name: "ai-hh-templates", server_name: "ai-generate-hh-templates" });
    if (attemptId) await finishAttempt(attemptId, { status: "succeeded", result_reference: `projects:${body.project_id}:hh_templates` });
    if (jobId) await markJobStatus(jobId, "primary_succeeded", true);
    return jsonResponse({ ok: true, fields, job_id: jobId });
  } catch (e) {
    const err = String((e as Error).message);
    await logToDb({ user_message: `[prompt:${msg.length}b]`, bot_reply: "", channel_id: chatId, user_social_id: socialId, channel_name: "ai-hh-templates", server_name: "ai-generate-hh-templates", function_error: err.slice(0, 200) });
    if (attemptId) await finishAttempt(attemptId, { status: "failed", safe_error_code: err.slice(0, 64) });
    if (jobId) {
      await markJobStatus(jobId, "primary_failed");
      await markJobStatus(jobId, "fallback_available");
    }
    return jsonResponse({ error: err, job_id: jobId, fallback_available: !!jobId }, 500);
  }
});