import React from "react";
import { rrImg } from "@/lib/img";

type Props = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string;
  /** Display width in CSS px, used to request a resized copy from Supabase. */
  w: number;
  quality?: number;
};

/**
 * <img> that requests a downscaled copy of a Supabase Storage image via the
 * render/image endpoint. Falls back to the original URL if transformation fails.
 */
export default function RRImage({ src, w, quality, onError, ...rest }: Props) {
  const [failed, setFailed] = React.useState(false);
  const finalSrc = failed ? src : rrImg(src, w, quality);
  return (
    <img
      {...rest}
      src={finalSrc}
      onError={(e) => {
        if (!failed) setFailed(true);
        onError?.(e);
      }}
    />
  );
}