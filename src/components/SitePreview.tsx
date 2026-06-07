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
  /** "card" — 16:9 preview tile. "banner" — wide 4:1 social-style preview. "compact" — small inline chip. */
  variant?: "card" | "banner" | "compact";
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
  const shotWide = `https://image.thum.io/get/width/1280/crop/320/noanimate/${href}`;
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

  if (variant === "banner") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={`group relative block rounded-2xl border border-white/15 bg-gradient-to-br from-[#17344F] to-[#265582] hover:border-[#E7C768]/60 transition overflow-hidden shadow-[0_20px_60px_-30px_rgba(0,0,0,0.6)] ${className}`}
      >
        {imgOk ? (
          <div className="aspect-[4/1] w-full overflow-hidden">
            <img
              src={shotWide}
              alt={`Превью ${host}`}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setImgOk(false)}
              className="w-full h-full object-cover object-top group-hover:scale-[1.02] transition-transform duration-500"
            />
          </div>
        ) : (
          <div className="aspect-[4/1] w-full bg-gradient-to-br from-[#17344F] to-[#265582]" />
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0E2235]/95 via-[#0E2235]/70 to-transparent px-4 py-3 flex items-center gap-2.5">
          <img src={favicon} alt="" className="w-6 h-6 rounded-md shrink-0 bg-white/10 p-0.5" referrerPolicy="no-referrer" />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-widest text-[#E7C768] font-bold leading-none">Официальный сайт</div>
            <div className="text-sm text-white font-bold truncate mt-0.5">{host}</div>
          </div>
          <ExternalLink className="w-4 h-4 text-slate-200 group-hover:text-[#E7C768] shrink-0" />
        </div>
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