// =============================================================================
// Safe array normalizers for legacy jsonb cells that may be array | string |
// object | null. Renderers must NEVER call `.map` on a raw cell — they should
// pipe through `toStrArr` / `toObjArr` first.
// =============================================================================

/** Array of strings, dropping empties. Accepts array | string | null. */
export function toStrArr(x: unknown): string[] {
  if (x == null) return [];
  if (Array.isArray(x)) {
    return x
      .map((v) => {
        if (v == null) return "";
        if (typeof v === "string") return v.trim();
        if (typeof v === "number" || typeof v === "boolean") return String(v);
        // Unknown object — try common "label" fields, else hide silently.
        if (typeof v === "object") {
          const o = v as Record<string, unknown>;
          for (const k of ["title", "name", "text", "label"]) {
            const s = o[k];
            if (typeof s === "string" && s.trim()) return s.trim();
          }
        }
        return "";
      })
      .filter((s) => !!s);
  }
  if (typeof x === "string") {
    const t = x.trim();
    return t ? [t] : [];
  }
  return [];
}

/**
 * Array of objects. Accepts array | object | string | null.
 *  - array  → kept (objects only).
 *  - string → wrapped via `wrapString` (default: hidden — returns []).
 *  - object → wrapped as [obj] when not array.
 */
export function toObjArr<T = Record<string, unknown>>(
  x: unknown,
  wrapString?: (s: string) => T | null,
): T[] {
  if (x == null) return [];
  if (Array.isArray(x)) {
    return x.filter((v) => v && typeof v === "object" && !Array.isArray(v)) as T[];
  }
  if (typeof x === "string") {
    const t = x.trim();
    if (!t) return [];
    const wrapped = wrapString ? wrapString(t) : null;
    return wrapped ? [wrapped] : [];
  }
  if (typeof x === "object") {
    return [x as T];
  }
  return [];
}