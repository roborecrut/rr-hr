import React from "react";
import { rrImg } from "@/lib/img";

type Props = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src?: string | null;
  /** Display width in CSS px, used to request a resized copy from Supabase. */
  w: number;
  quality?: number;
  /** Render this node instead of <img> when src is missing or load fails. */
  fallback?: React.ReactNode;
};

/**
 * <img> that requests a downscaled copy of a Supabase Storage image via the
 * render/image endpoint. Falls back to the original URL if transformation fails.
 * When the image cannot be displayed at all (no src, or onError fires twice),
 * an optional `fallback` ReactNode is rendered in its place to keep the UI
 * tidy instead of showing a browser "broken image" icon.
 */
export default function RRImage({ src, w, quality, onError, fallback, alt, className, ...rest }: Props) {
  const [failed, setFailed] = React.useState(false);
  const [originalFailed, setOriginalFailed] = React.useState(false);
  const hasSrc = !!src && String(src).trim() !== "";
  if (!hasSrc || originalFailed) {
    if (fallback !== undefined) return <>{fallback}</>;
    // Default branded placeholder: keep layout box, hide broken-image glyph.
    return (
      <div
        role="img"
        aria-label={alt as string | undefined}
        className={[
          className || "",
          "inline-flex items-center justify-center bg-gradient-to-br from-[#265582] to-[#17344F] text-white/40 text-xs select-none",
        ].join(" ")}
      >
        <svg viewBox="0 0 24 24" fill="none" className="w-1/2 h-1/2 opacity-60" aria-hidden>
          <path d="M3 21V7l9-4 9 4v14M9 21V12h6v9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    );
  }
  const finalSrc = failed ? (src as string) : rrImg(src as string, w, quality);
  return (
    <img
      {...rest}
      alt={alt}
      className={className}
      src={finalSrc}
      onError={(e) => {
        if (!failed) setFailed(true);
        else setOriginalFailed(true);
        onError?.(e);
      }}
    />
  );
}