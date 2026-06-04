/**
 * Внутренняя валюта RR. 1 единица в БД (`wallets.units_balance`) = 100 RR.
 * Используем только в UI — БД-схема не меняется.
 */
export const RR_PER_UNIT = 100;

export function unitsToRR(units: number | null | undefined): number {
  return Math.max(0, Math.round((units ?? 0) * RR_PER_UNIT));
}

export function formatRR(rr: number | null | undefined): string {
  return `${(rr ?? 0).toLocaleString("ru-RU")} RR`;
}