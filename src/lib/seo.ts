import { useEffect } from "react";

type JsonLd = Record<string, any> | Record<string, any>[];

export type SeoOptions = {
  title?: string;
  description?: string;
  canonical?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogUrl?: string;
  ogType?: string;
  jsonLd?: JsonLd;
};

const SEO_MARK = "data-seo-managed";

function upsertMeta(selector: string, create: () => HTMLMetaElement, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = create();
    el.setAttribute(SEO_MARK, "true");
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
  return el;
}

function upsertCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    el.setAttribute(SEO_MARK, "true");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
  return el;
}

/**
 * Per-route SEO updater. Sets document.title, meta description, canonical,
 * Open Graph tags, and optional JSON-LD structured data. Restores nothing
 * on unmount (next route overwrites) except removes the JSON-LD block.
 */
export function useSeo(opts: SeoOptions) {
  useEffect(() => {
    if (opts.title) document.title = opts.title;
    if (opts.description) {
      upsertMeta('meta[name="description"]', () => {
        const m = document.createElement("meta");
        m.setAttribute("name", "description");
        return m;
      }, opts.description);
    }
    if (opts.canonical) upsertCanonical(opts.canonical);

    const ogTitle = opts.ogTitle ?? opts.title;
    const ogDesc = opts.ogDescription ?? opts.description;
    if (ogTitle) {
      upsertMeta('meta[property="og:title"]', () => {
        const m = document.createElement("meta");
        m.setAttribute("property", "og:title");
        return m;
      }, ogTitle);
      upsertMeta('meta[name="twitter:title"]', () => {
        const m = document.createElement("meta");
        m.setAttribute("name", "twitter:title");
        return m;
      }, ogTitle);
    }
    if (ogDesc) {
      upsertMeta('meta[property="og:description"]', () => {
        const m = document.createElement("meta");
        m.setAttribute("property", "og:description");
        return m;
      }, ogDesc);
      upsertMeta('meta[name="twitter:description"]', () => {
        const m = document.createElement("meta");
        m.setAttribute("name", "twitter:description");
        return m;
      }, ogDesc);
    }
    if (opts.ogUrl) {
      upsertMeta('meta[property="og:url"]', () => {
        const m = document.createElement("meta");
        m.setAttribute("property", "og:url");
        return m;
      }, opts.ogUrl);
    }
    if (opts.ogType) {
      upsertMeta('meta[property="og:type"]', () => {
        const m = document.createElement("meta");
        m.setAttribute("property", "og:type");
        return m;
      }, opts.ogType);
    }

    let script: HTMLScriptElement | null = null;
    if (opts.jsonLd) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      script.setAttribute(SEO_MARK, "route");
      script.textContent = JSON.stringify(opts.jsonLd);
      document.head.appendChild(script);
    }

    return () => {
      if (script && script.parentNode) script.parentNode.removeChild(script);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    opts.title,
    opts.description,
    opts.canonical,
    opts.ogTitle,
    opts.ogDescription,
    opts.ogUrl,
    opts.ogType,
    JSON.stringify(opts.jsonLd ?? null),
  ]);
}

export const SITE_URL = "https://hr-rr.online";

export function absUrl(path: string): string {
  if (!path) return SITE_URL;
  if (path.startsWith("http")) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
