/**
 * Единая точка конфигурации приложения.
 *
 * Все значения берутся из Vite env. Жёстко прописанные fallback существуют
 * только для production-домена, чтобы публичные страницы продолжали работать
 * при отсутствии env (например, во время предварительного просмотра). Никаких
 * сервисных ключей и секретов здесь нет.
 *
 * НЕ ИМПОРТИРУЙТЕ Supabase URL и project ref из других мест — используйте
 * config.SUPABASE_URL / config.FN(name) / config.brandImage(name).
 */

const env = import.meta.env;

export const SUPABASE_URL: string =
  (env.VITE_SUPABASE_URL as string) || "https://rjhtauzookkvlipvqpvr.supabase.co";

export const SUPABASE_PUBLISHABLE_KEY: string =
  (env.VITE_SUPABASE_PUBLISHABLE_KEY as string) ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqaHRhdXpvb2trdmxpcHZxcHZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNjMxMDksImV4cCI6MjA5NTYzOTEwOX0.Xh40Gauewhcp80Ke4vv6Y9JsFSvI-W2Gn3QK8XabDfQ";

/** Edge-function URL. Используется только для multipart/FormData запросов. Для обычного
 * JSON-вызова используйте supabase.functions.invoke(name, { body }). */
export const FN = (name: string): string => `${SUPABASE_URL}/functions/v1/${name}`;

/** Базовый URL публичной storage-папки с брендовыми изображениями. */
const BRAND_BASE = `${SUPABASE_URL}/storage/v1/object/public/Logos`;

/** Брендовое изображение по имени (без .png). */
export const brandImage = (name: string): string => `${BRAND_BASE}/${name}.png`;

/** Логотип «Робот Рекрутер». */
export const RR_LOGO_URL = brandImage("RR-Logo");

/** В run-time: краткая диагностика для разработчика, не для пользователя. */
if (!env.VITE_SUPABASE_URL && env.DEV) {
  // eslint-disable-next-line no-console
  console.warn("[config] VITE_SUPABASE_URL не задан — используется production-fallback.");
}