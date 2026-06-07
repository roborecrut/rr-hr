/**
 * Single source of truth for the RR mascot illustrations.
 * Images are hosted on Supabase Storage (already optimized PNGs);
 * always render with `loading="lazy"`, `decoding="async"` and explicit
 * width/height to avoid layout shift.
 */
const base = "https://rjhtauzookkvlipvqpvr.supabase.co/storage/v1/object/public/Logos/";

export const MASCOT = {
  logo: base + "RR-Logo.png",            // лого RR
  greeting: base + "RR2.png",            // приветливый RR с планшетом
  megaphone: base + "RR3.png",           // RR с рупором — оповещения / CTA
  serious: base + "RR4.png",             // серьёзный, руки скрестил
  shine: base + "RR5.png",               // веселый/радостный
  success: base + "RR6.png",             // показывает, что всё получилось
  clock: base + "RR7.png",               // смотрит на часы
  question: base + "RR8.png",            // со знаком вопроса (тесты)
  broken: base + "RR9.png",              // грустный сломанный — ошибки
  cashier: base + "RR11.png",            // RR-кассир (списания)
} as const;

export type MascotKey = keyof typeof MASCOT;