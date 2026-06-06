/**
 * Helpers for serving smaller versions of images stored in Supabase Storage.
 * Uses Supabase image transformation endpoint:
 *   /storage/v1/object/public/...  →  /storage/v1/render/image/public/...?width=W&quality=Q
 *
 * If transformations are not enabled on the project the request will fail and
 * <RRImage> falls back to the original URL via onError.
 */

// NOTE: We previously rewrote Supabase Storage URLs through the
// /storage/v1/render/image/ transform endpoint to downscale images by display
// width. That made logos/robot images render too narrow when transforms were
// disabled on the bucket (the resized image kept native aspect but became
// blurry / squashed). For now we return the original URL untouched — browsers
// already cache the original, and weight optimization should be done at the
// upload step, not via on-the-fly width clipping.
export function rrImg(url: string | null | undefined, _width?: number, _quality?: number): string {
  return url || "";
}