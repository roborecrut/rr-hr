import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { detectEmbed } from "@/components/EmbeddedMarkdown";
import { CheckCircle2, Circle, Quote, Sparkles } from "lucide-react";

/**
 * Универсальный бренд-Markdown для чатов / резюме / коротких блоков.
 * Совместим с remark-gfm: чек-листы, таблицы, цитаты, ссылки, авто-эмбеды
 * (YouTube / VK / Rutube / Google Docs).
 *
 * tone="chat"   — компактный, в пузыре сообщения; наследует цвет текста.
 * tone="resume" — слегка крупнее, золотые заголовки, для резюме/транскриптов.
 */
export default function RichMarkdown({
  children,
  tone = "chat",
  className = "",
}: {
  children: string;
  tone?: "chat" | "resume";
  className?: string;
}) {
  const compact = tone === "chat";
  const baseText = compact ? "text-[13px] leading-relaxed" : "text-[13.5px] leading-relaxed text-slate-100/95";

  return (
    <div className={`rich-md ${className}`}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }: any) => (
            <h2 className="not-prose mt-3 mb-2 text-base md:text-lg font-extrabold flex items-center gap-2"
                style={{ backgroundImage: "linear-gradient(135deg, #F4EE8E, #D99E41)",
                         WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
              <Sparkles className="w-4 h-4 text-[#E7C768]" /> {children}
            </h2>
          ),
          h2: ({ children }: any) => (
            <h3 className="not-prose mt-3 mb-1.5 text-[15px] font-bold"
                style={{ backgroundImage: "linear-gradient(135deg, #F4EE8E, #D99E41)",
                         WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
              {children}
            </h3>
          ),
          h3: ({ children }: any) => (
            <h4 className="not-prose mt-2.5 mb-1 text-[13.5px] font-bold text-[#F4EE8E]">{children}</h4>
          ),
          h4: ({ children }: any) => (
            <h5 className="not-prose mt-2 mb-1 text-[12.5px] font-bold text-[#E7C768]">{children}</h5>
          ),
          p({ node, children, ...rest }: any) {
            const arr = node?.children || [];
            if (arr.length === 1 && arr[0]?.tagName === "a") {
              const href: string = arr[0]?.properties?.href || "";
              const e = detectEmbed(href);
              if (e) {
                return (
                  <div className="not-prose my-3 aspect-video w-full overflow-hidden rounded-xl border border-white/15 bg-black shadow-md">
                    <iframe src={e.src} className="w-full h-full" title={`embed-${e.kind}`}
                            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                            allowFullScreen referrerPolicy="no-referrer" />
                  </div>
                );
              }
            }
            return <p className={`my-1.5 ${baseText}`} {...rest}>{children}</p>;
          },
          a: ({ href, children }: any) => (
            <a href={href} target="_blank" rel="noopener noreferrer"
               className="text-[#E7C768] underline decoration-[#E7C768]/40 underline-offset-2 hover:text-[#F4EE8E] break-words">{children}</a>
          ),
          strong: ({ children }: any) => <strong className="font-bold text-white">{children}</strong>,
          em: ({ children }: any) => <em className="italic text-[#F4EE8E]">{children}</em>,
          code: ({ inline, children, ...rest }: any) =>
            inline ? (
              <code className="px-1.5 py-0.5 rounded-md bg-black/40 border border-white/10 text-[#F4EE8E] text-[12px] font-mono" {...rest}>{children}</code>
            ) : (
              <code className="block bg-black/50 border border-white/10 rounded-xl p-2.5 text-[12px] font-mono text-slate-100 overflow-x-auto" {...rest}>{children}</code>
            ),
          pre: ({ children }: any) => <pre className="not-prose my-2">{children}</pre>,
          blockquote: ({ children }: any) => (
            <div className="not-prose my-2 rounded-xl border border-[#E7C768]/30 bg-[#E7C768]/5 p-2.5 flex gap-2">
              <Quote className="w-3.5 h-3.5 text-[#E7C768] shrink-0 mt-0.5" />
              <div className="text-[12.5px] text-slate-100/95 italic">{children}</div>
            </div>
          ),
          ul: ({ children, className }: any) => {
            if (typeof className === "string" && className.includes("contains-task-list")) {
              return <ul className="not-prose my-1.5 space-y-1">{children}</ul>;
            }
            return <ul className="not-prose my-1.5 space-y-1 pl-1">{children}</ul>;
          },
          ol: ({ children }: any) => (
            <ol className="not-prose my-1.5 space-y-1 pl-5 list-decimal marker:text-[#E7C768]">{children}</ol>
          ),
          li: ({ children, checked }: any) => {
            if (typeof checked === "boolean") {
              return (
                <li className="flex items-start gap-2 text-[13px] text-slate-100/95">
                  {checked
                    ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-emerald-400 shrink-0" />
                    : <Circle className="w-3.5 h-3.5 mt-0.5 text-[#E7C768]/70 shrink-0" />}
                  <span>{children}</span>
                </li>
              );
            }
            return (
              <li className="flex items-start gap-2 text-[13px] text-slate-100/95">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: "linear-gradient(135deg,#F4EE8E,#D99E41)" }} />
                <span className="flex-1">{children}</span>
              </li>
            );
          },
          hr: () => (
            <hr className="not-prose my-4 border-0 h-px"
                style={{ background: "linear-gradient(90deg, transparent, rgba(231,199,104,0.6), transparent)" }} />
          ),
          table: ({ children }: any) => (
            <div className="not-prose my-2 overflow-x-auto rounded-xl border border-white/10 bg-black/25">
              <table className="w-full text-[12px] text-slate-100">{children}</table>
            </div>
          ),
          thead: ({ children }: any) => (
            <thead style={{ background: "linear-gradient(135deg, rgba(244,238,142,0.18), rgba(217,158,65,0.18))" }}>
              {children}
            </thead>
          ),
          th: ({ children }: any) => (
            <th className="text-left px-2.5 py-1.5 font-bold text-[#F4EE8E] border-b border-white/10">{children}</th>
          ),
          td: ({ children }: any) => (
            <td className="px-2.5 py-1.5 border-b border-white/5 align-top">{children}</td>
          ),
          tr: ({ children }: any) => <tr className="hover:bg-white/5 transition-colors">{children}</tr>,
          img: ({ src, alt }: any) => (
            <img src={src} alt={alt || ""} className="not-prose my-2 rounded-xl border border-white/10 max-w-full h-auto" />
          ),
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}