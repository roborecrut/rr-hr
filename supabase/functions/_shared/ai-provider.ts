// RR Pro Max stage 4a: server-side AI provider contract.
//
// Это ЗАГЛУШКА. Здесь нет реальных сетевых вызовов резервной модели.
// Реальная имплементация rr_pro_max будет добавлена на этапе 4b отдельной
// edge-функцией (ai-fallback-rrpromax). На 4a фиксируем контракт, который
// сервер будет использовать для нормализованного вызова primary / fallback
// провайдеров и для соблюдения idempotency и однократного списания RR.

export type AiProviderId = "primary" | "rr_pro_max";

/** Минимальный безопасный контекст задачи. БЕЗ секретов и Authorization. */
export interface ProviderContext {
  jobId: string;
  jobType: string;
  promptVersion?: string;
  expectedSchema?: string;
  /** Идентификатор для дедупликации повторных попыток у провайдера. */
  attemptKey: string;
}

export interface NormalizedAiRequest {
  context: ProviderContext;
  /** Системный промпт по ключу/версии (или полный текст, если версия неизвестна). */
  system: { key?: string; version?: string; text?: string };
  /** Пользовательский промпт + входные данные. Хранится в приватном snapshot. */
  user: { text: string; data?: Record<string, unknown> };
  /** Жёсткий бюджет на попытку, мс. */
  timeoutMs: number;
}

export interface NormalizedAiResponse {
  ok: boolean;
  /** Текст или структурированный JSON в зависимости от expectedSchema. */
  text?: string;
  data?: unknown;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  /** Короткий безопасный код ошибки (provider_timeout / auth_failed / validation_failed …). */
  safeErrorCode?: string;
  /** Статус валидации ответа против expectedSchema. */
  responseValidationStatus?: "ok" | "invalid" | "skipped";
}

export interface AiProvider {
  readonly id: AiProviderId;
  /**
   * Опциональный «холодный старт» резервного провайдера (например, /restart
   * для ProTalk-совместимого бэкенда). Никогда не списывает RR.
   */
  restart?(context: ProviderContext): Promise<void>;
  run(request: NormalizedAiRequest): Promise<NormalizedAiResponse>;
}

/**
 * Заглушка резервного провайдера. На 4a НЕ выполняет реальный сетевой запрос
 * — возвращает безопасный отказ. Заменяется на боевую реализацию в 4b.
 */
export const rrProMaxStub: AiProvider = {
  id: "rr_pro_max",
  async restart() { /* no-op на 4a */ },
  async run(_req): Promise<NormalizedAiResponse> {
    return { ok: false, safeErrorCode: "fallback_not_enabled", responseValidationStatus: "skipped" };
  },
};

/** Допустимые переходы статусов AI job. См. одноимённый ENUM в БД. */
export const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  created: ["primary_running", "cancelled"],
  primary_running: ["primary_succeeded", "primary_failed", "timed_out", "cancelled", "validation_failed", "save_failed"],
  primary_succeeded: [],
  primary_failed: ["fallback_available", "cancelled"],
  fallback_available: ["fallback_restarting", "fallback_running", "cancelled"],
  fallback_restarting: ["fallback_running", "fallback_failed", "cancelled", "timed_out"],
  fallback_running: ["fallback_succeeded", "fallback_failed", "timed_out", "cancelled", "validation_failed", "save_failed"],
  fallback_succeeded: [],
  fallback_failed: [],
  cancelled: [],
  timed_out: [],
  save_failed: [],
  validation_failed: [],
};

export function canTransition(from: string, to: string): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}