/**
 * Strip Markdown to plain text (for previews/excerpts in lists).
 */
export function mdToPlain(md: string): string {
  let s = md || "";
  s = s.replace(/```[\s\S]*?```/g, " ");
  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  s = s.replace(/^>\s?/gm, "");
  s = s.replace(/^#{1,6}\s+/gm, "");
  s = s.replace(/[*_~]+/g, "");
  s = s.replace(/^\s*[-+*]\s+/gm, "");
  s = s.replace(/^\s*\d+\.\s+/gm, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

export function mdExcerpt(md: string, n = 100): string {
  const plain = mdToPlain(md);
  return plain.length > n ? plain.slice(0, n).trimEnd() + "…" : plain;
}