/**
 * Helpers for serving smaller versions of images stored in Supabase Storage.
 * Uses Supabase image transformation endpoint:
 *   /storage/v1/object/public/...  →  /storage/v1/render/image/public/...?width=W&quality=Q
 *
 * If transformations are not enabled on the project the request will fail and
 * <RRImage> falls back to the original URL via onError.
 */

export function rrImg(url: string | null | undefined, width: number, quality = 75): string {
  if (!url) return "";
  if (!/\/storage\/v1\/object\/public\//.test(url)) return url;
  const transformed = url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/");
  // dpr-aware: request 2x for crisp display on retina, capped at 1600px
  const w = Math.min(1600, Math.round(width * 2));
  const sep = transformed.includes("?") ? "&" : "?";
  return `${transformed}${sep}width=${w}&quality=${quality}`;
}