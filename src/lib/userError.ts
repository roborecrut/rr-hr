/**
 * Единая утилита преобразования любых технических ошибок (Supabase, Edge Function,
 * Network, AI, валидация) в безопасное сообщение для пользователя на русском языке.
 *
 * НИКОГДА не показывайте пользователю сырой error.message / stack / JSON.stringify(error).
 * Используйте `toUserError(e)` и показывайте `.message`. Полный диагностический объект
 * сохраняйте в console.error (только в dev) и/или в локальный лог `client_errors`.
 */

export type UserError = {
  /** Понятное сообщение для UI. */
  message: string;
  /** Короткий код обращения, который пользователь может назвать в поддержке. */
  code: string;
  /** Категория для UX-веток: показ кнопки «Войти», «Пополнить», «Повторить» и т.п. */
  kind:
    | "network"
    | "auth"
    | "session_expired"
    | "no_credits"
    | "forbidden"
    | "not_found"
    | "already_done"
    | "ai_temporary"
    | "timeout"
    | "bad_file"
    | "validation"
    | "draft_save"
    | "unknown";
};

/**
 * Сообщения для понятных кодов. Карта закрытая — не вытаскиваем русский текст из
 * server-side error message, чтобы не утекли названия таблиц/функций.
 */
const MESSAGES: Record<UserError["kind"], string> = {
  network: "Нет соединения с сервером. Проверьте интернет и попробуйте ещё раз.",
  auth: "Не удалось подтвердить вход. Войдите снова.",
  session_expired: "Сессия истекла. Войдите снова, чтобы продолжить.",
  no_credits: "Недостаточно RR на балансе. Пополните счёт, чтобы продолжить.",
  forbidden: "У вас нет доступа к этому действию.",
  not_found: "Запись не найдена или уже удалена.",
  already_done: "Это действие уже было выполнено ранее.",
  ai_temporary: "ИИ временно недоступен. Попробуйте через минуту.",
  timeout: "Сервер не ответил вовремя. Попробуйте ещё раз.",
  bad_file: "Файл не подходит. Проверьте формат и размер.",
  validation: "Проверьте заполнение полей.",
  draft_save: "Не удалось сохранить черновик. Мы повторим попытку автоматически.",
  unknown: "Что-то пошло не так. Попробуйте ещё раз через минуту.",
};

function genCode(): string {
  // 8 символов A-Z 0-9 без неоднозначных
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

/**
 * Принимает что угодно (Error, FunctionsHttpError, Supabase PostgrestError, string),
 * возвращает UserError с понятным сообщением и кодом обращения.
 * Технические детали логируются в console только в dev.
 */
export function toUserError(e: unknown, hint?: Partial<UserError>): UserError {
  const code = hint?.code || genCode();
  let kind: UserError["kind"] = hint?.kind || "unknown";

  const raw = extractRawCode(e);

  // Маппинг известных серверных кодов → kind
  if (!hint?.kind) {
    if (/network|fetch|failed to fetch|networkerror/i.test(raw)) kind = "network";
    else if (/jwt|unauthor|invalid token|not authent/i.test(raw)) kind = "auth";
    else if (/token_expired|session.*expired|expired/i.test(raw)) kind = "session_expired";
    else if (/no_credits|insufficient|funds|спишутся|spend_pack/i.test(raw)) kind = "no_credits";
    else if (/forbidden|permission|denied|rls|violates/i.test(raw)) kind = "forbidden";
    else if (/not.?found|no_question|no_test|no_situations|no_questions/i.test(raw)) kind = "not_found";
    else if (/already|duplicate|conflict/i.test(raw)) kind = "already_done";
    else if (/timeout|timed out|504|deadline/i.test(raw)) kind = "timeout";
    else if (/ai_empty_response|protalk|gateway|502|503/i.test(raw)) kind = "ai_temporary";
    else if (/file.*too.*large|bad.*file|unsupported.*format|file_too_large|bad_kind/i.test(raw)) kind = "bad_file";
    else if (/bad_body|invalid|required|validation/i.test(raw)) kind = "validation";
  }

  const message = hint?.message || MESSAGES[kind];

  if (import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.warn(`[userError ${code}] kind=${kind} raw=${raw}`, e);
  }

  return { message, code, kind };
}

function extractRawCode(e: unknown): string {
  if (!e) return "";
  if (typeof e === "string") return e;
  if (typeof e === "object") {
    const any = e as any;
    return String(any?.code || any?.error || any?.message || "");
  }
  return String(e);
}

/**
 * Формирует строку для показа в toast/inline: "Сообщение (код: ABCD1234)".
 */
export function formatUserError(u: UserError): string {
  return `${u.message} (код: ${u.code})`;
}