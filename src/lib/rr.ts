/**
 * Единая внутренняя валюта RR (1 RR = 1 ₽).
 * Хранится напрямую в `wallets.units_balance` — без какого-либо множителя.
 */
export function formatRR(rr: number | null | undefined): string {
  return `${Math.max(0, Math.round(rr ?? 0)).toLocaleString("ru-RU")} RR`;
}

/** Тарифная сетка для пакетов интервью/обучения. */
export function packTierPrice(qty: number): number {
  if (qty <= 9) return 200;
  if (qty <= 49) return 150;
  if (qty <= 199) return 100;
  return 50;
}

export function packTierLabel(qty: number): string {
  if (qty <= 9) return "1–9 шт";
  if (qty <= 49) return "10–49 шт";
  if (qty <= 199) return "50–199 шт";
  return "200+ шт";
}

/** Фиксированные цены за разовые услуги. */
export const FIXED_PRICES = {
  landing: 500,
  interview_setup: 200,
  training_setup: 300,
} as const;