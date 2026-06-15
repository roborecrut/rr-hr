/**
 * Single source of truth for the RR mascot illustrations.
 * Брендовые URL получаем из единого config-модуля.
 * always render with `loading="lazy"`, `decoding="async"` and explicit
 * width/height to avoid layout shift.
 */
import { brandImage } from "@/config";

export const MASCOT = {
  logo: brandImage("RR-Logo"),
  greeting: brandImage("RR2"),
  megaphone: brandImage("RR3"),
  serious: brandImage("RR4"),
  shine: brandImage("RR5"),
  success: brandImage("RR6"),
  clock: brandImage("RR7"),
  question: brandImage("RR8"),
  broken: brandImage("RR9"),
  empty: brandImage("RR10"),
  cashier: brandImage("RR11"),
} as const;

export type MascotKey = keyof typeof MASCOT;