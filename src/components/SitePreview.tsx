import React from "react";
import { ExternalLink } from "lucide-react";

/** Normalises a user-entered site value into a full https URL. */
export function normalizeSiteUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const v = String(raw).trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v.replace(/^\/+/, "")}`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

type Props = {
  url?: string | null;
  /** "card" — bigger preview tile (used on company landing). "compact" — small inline chip. */
  variant?: "card" | "compact";
  className?: string;
};

/**
 * Visual preview of an external company site:
 * - favicon via Google s2 (no API key)
 * - automatic screenshot via image.thum.io (free, no key)
 * - graceful fallback to plain link chip if image fails to load
 */
export default function SitePreview({ url, variant = "card", className = "" }: Props) {
  const href = normalizeSiteUrl(url);
  const [imgOk, setImgOk] = React.useState(true);
  if (!href) return null;
  const host = hostOf(href);
  const favicon = `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  const shot = `https://image.thum.io/get/width/720/crop/420/noanimate/${href}`;

  if (variant === "compact") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={`inline-flex items-center gap-2 bg-black/30 hover:bg-black/40 border border-white/10 hover:border-[#E7C768]/50 rounded-xl px-2.5 py-1.5 transition group ${className}`}
      >
        <img src={favicon} alt="" className="w-4 h-4 rounded-sm shrink-0" referrerPolicy="no-referrer" />
        <span className="text-[11px] text-slate-200 group-hover:text-[#E7C768] font-semibold truncate max-w-[180px]">
          {host}
        </span>
        <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-[#E7C768] shrink-0" />
      </a>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`group block rounded-2xl border border-white/10 bg-black/30 hover:border-[#E7C768]/50 hover:bg-black/40 transition overflow-hidden ${className}`}
    >
      {imgOk ? (
        <div className="aspect-[16/9] bg-gradient-to-br from-[#1D3E5E]/60 to-[#0E2235]/60 overflow-hidden">
          <img
            src={shot}
            alt={`Превью ${host}`}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgOk(false)}
            className="w-full h-full object-cover object-top group-hover:scale-[1.02] transition-transform duration-500"
          />
        </div>
      ) : null}
      <div className="flex items-center gap-2.5 p-3">
        <img src={favicon} alt="" className="w-5 h-5 rounded-sm shrink-0" referrerPolicy="no-referrer" />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wider text-[#E7C768] font-bold">
            Официальный сайт
          </div>
          <div className="text-sm text-white font-bold truncate">{host}</div>
        </div>
        <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-[#E7C768] shrink-0" />
      </div>
    </a>
  );
}