import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Detects video/document URLs and returns an embed src + kind. */
export function detectEmbed(url: string): { src: string; kind: "youtube" | "vk" | "rutube" | "gdoc" } | null {
  if (!url) return null;
  try {
    const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/i);
    if (yt) return { src: `https://www.youtube.com/embed/${yt[1]}`, kind: "youtube" };
    const ru = url.match(/rutube\.ru\/video\/([\w]+)/i);
    if (ru) return { src: `https://rutube.ru/play/embed/${ru[1]}`, kind: "rutube" };
    const vk = url.match(/vk(?:video)?\.(?:com|ru)\/video(-?\d+)_(\d+)/i);
    if (vk) return { src: `https://vk.com/video_ext.php?oid=${vk[1]}&id=${vk[2]}&hd=2`, kind: "vk" };
    const gd = url.match(/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([\w-]+)/i);
    if (gd) return { src: `https://docs.google.com/${gd[1]}/d/${gd[2]}/preview`, kind: "gdoc" };
    return null;
  } catch { return null; }
}

/** Markdown renderer that auto-embeds YouTube/VK/Rutube/Google Docs links. */
export default function EmbeddedMarkdown({ children }: { children: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        p({ node, children, ...rest }: any) {
          const arr = node?.children || [];
          // Lone link in a paragraph → embed
          if (arr.length === 1 && arr[0]?.tagName === "a") {
            const href: string = arr[0]?.properties?.href || "";
            const e = detectEmbed(href);
            if (e) {
              return (
                <div className="my-3 aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black not-prose">
                  <iframe
                    src={e.src}
                    className="w-full h-full"
                    title={`embed-${e.kind}`}
                    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                    allowFullScreen
                    referrerPolicy="no-referrer"
                  />
                </div>
              );
            }
          }
          return <p {...rest}>{children}</p>;
        },
        a({ href, children, ...rest }: any) {
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
              {children}
            </a>
          );
        },
      }}
    >
      {children}
    </Markdown>
  );
}