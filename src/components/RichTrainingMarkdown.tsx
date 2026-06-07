import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { detectEmbed } from "@/components/EmbeddedMarkdown";
import { BookOpen, CheckCircle2, Circle, GraduationCap, Quote, Sparkles } from "lucide-react";

/**
 * Rich, branded rendering of a training material Markdown:
 * — золотые градиентные заголовки на стеклянных синих карточках
 * — красивые чек-листы (☐/✓), таблицы, цитаты, инлайн-код
 * — авто-встраивание YouTube / VK / Rutube / Google Docs (как в EmbeddedMarkdown)
 */
export default function RichTrainingMarkdown({ children }: { children: string }) {
  return (
    <div className="rich-training">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }: any) => (
            <div className="not-prose my-5 first:mt-0">
              <div className="relative rounded-2xl overflow-hidden p-5 md:p-6 border border-[#E7C768]/40"
                   style={{ background: "linear-gradient(135deg, rgba(244,238,142,0.18), rgba(217,158,65,0.18))" }}>
                <div className="absolute inset-0 pointer-events-none"
                     style={{ background: "radial-gradient(800px 200px at 0% 0%, rgba(244,238,142,0.18), transparent 60%)" }} />
                <div className="relative flex items-start gap-3">
                  <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
                       style={{ background: "linear-gradient(135deg, #F4EE8E, #D99E41)" }}>
                    <GraduationCap className="w-5 h-5 text-[#17344F]" />
                  </div>
                  <h1 className="m-0 text-xl md:text-2xl font-extrabold leading-tight"
                      style={{ backgroundImage: "linear-gradient(135deg, #F4EE8E, #D99E41)",
                               WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
                    {children}
                  </h1>
                </div>
              </div>
            </div>
          ),
          h2: ({ children }: any) => (
            <div className="not-prose mt-7 mb-3">
              <div className="flex items-center gap-2.5">
                <span className="inline-block w-1.5 h-7 rounded-full"
                      style={{ background: "linear-gradient(180deg, #F4EE8E, #D99E41)" }} />
                <h2 className="m-0 text-lg md:text-xl font-bold"
                    style={{ backgroundImage: "linear-gradient(135deg, #F4EE8E, #D99E41)",
                             WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
                  {children}
                </h2>
              </div>
              <div className="mt-2 h-px w-full" style={{ background: "linear-gradient(90deg, rgba(231,199,104,0.5), transparent)" }} />
            </div>
          ),
          h3: ({ children }: any) => (
            <h3 className="not-prose mt-5 mb-2 text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#E7C768]" /> {children}
            </h3>
          ),
          h4: ({ children }: any) => (
            <h4 className="not-prose mt-4 mb-1.5 text-sm font-bold text-[#F4EE8E]">{children}</h4>
          ),
          p({ node, children, ...rest }: any) {
            const arr = node?.children || [];
            if (arr.length === 1 && arr[0]?.tagName === "a") {
              const href: string = arr[0]?.properties?.href || "";
              const e = detectEmbed(href);
              if (e) {
                return (
                  <div className="not-prose my-4 aspect-video w-full overflow-hidden rounded-2xl border border-white/15 bg-black shadow-lg shadow-black/40">
                    <iframe src={e.src} className="w-full h-full" title={`embed-${e.kind}`}
                            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                            allowFullScreen referrerPolicy="no-referrer" />
                  </div>
                );
              }
            }
            return <p className="my-2.5 text-[13.5px] leading-relaxed text-slate-100/95" {...rest}>{children}</p>;
          },
          a: ({ href, children }: any) => (
            <a href={href} target="_blank" rel="noopener noreferrer"
               className="text-[#E7C768] underline decoration-[#E7C768]/40 underline-offset-2 hover:text-[#F4EE8E]">{children}</a>
          ),
          strong: ({ children }: any) => <strong className="font-bold text-white">{children}</strong>,
          em: ({ children }: any) => <em className="italic text-[#F4EE8E]">{children}</em>,
          code: ({ inline, children, ...rest }: any) =>
            inline ? (
              <code className="px-1.5 py-0.5 rounded-md bg-black/40 border border-white/10 text-[#F4EE8E] text-[12px] font-mono" {...rest}>{children}</code>
            ) : (
              <code className="block bg-black/50 border border-white/10 rounded-xl p-3 text-[12px] font-mono text-slate-100 overflow-x-auto" {...rest}>{children}</code>
            ),
          pre: ({ children }: any) => <pre className="not-prose my-3">{children}</pre>,
          blockquote: ({ children }: any) => (
            <div className="not-prose my-3 rounded-xl border border-[#E7C768]/30 bg-[#E7C768]/5 p-3.5 flex gap-2.5">
              <Quote className="w-4 h-4 text-[#E7C768] shrink-0 mt-0.5" />
              <div className="text-[13px] text-slate-100/95 italic">{children}</div>
            </div>
          ),
          ul: ({ children, className }: any) => {
            // task list (GFM checklist)
            if (typeof className === "string" && className.includes("contains-task-list")) {
              return <ul className="not-prose my-2 space-y-1.5">{children}</ul>;
            }
            return <ul className="not-prose my-2 space-y-1.5 pl-1">{children}</ul>;
          },
          ol: ({ children }: any) => (
            <ol className="not-prose my-2 space-y-1.5 pl-1 list-none counter-reset-rt" style={{ counterReset: "rt 0" } as any}>{children}</ol>
          ),
          li: ({ children, className, checked }: any) => {
            // Task list item
            if (typeof checked === "boolean") {
              return (
                <li className="flex items-start gap-2.5 text-[13px] text-slate-100/95">
                  {checked
                    ? <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" />
                    : <Circle className="w-4 h-4 mt-0.5 text-[#E7C768]/70 shrink-0" />}
                  <span>{children}</span>
                </li>
              );
            }
            return (
              <li className="flex items-start gap-2.5 text-[13px] text-slate-100/95">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: "linear-gradient(135deg,#F4EE8E,#D99E41)" }} />
                <span className="flex-1">{children}</span>
              </li>
            );
          },
          hr: () => (
            <hr className="not-prose my-6 border-0 h-px"
                style={{ background: "linear-gradient(90deg, transparent, rgba(231,199,104,0.6), transparent)" }} />
          ),
          table: ({ children }: any) => (
            <div className="not-prose my-3 overflow-x-auto rounded-xl border border-white/10 bg-black/25">
              <table className="w-full text-[12.5px] text-slate-100">{children}</table>
            </div>
          ),
          thead: ({ children }: any) => (
            <thead style={{ background: "linear-gradient(135deg, rgba(244,238,142,0.18), rgba(217,158,65,0.18))" }}>
              {children}
            </thead>
          ),
          th: ({ children }: any) => (
            <th className="text-left px-3 py-2 font-bold text-[#F4EE8E] border-b border-white/10">{children}</th>
          ),
          td: ({ children }: any) => (
            <td className="px-3 py-2 border-b border-white/5 align-top">{children}</td>
          ),
          tr: ({ children }: any) => <tr className="hover:bg-white/5 transition-colors">{children}</tr>,
          img: ({ src, alt }: any) => (
            <img src={src} alt={alt || ""} className="not-prose my-3 rounded-xl border border-white/10 max-w-full h-auto" />
          ),
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}

export function RichTrainingMaterialCard({
  title,
  children,
}: { title?: string; children: string }) {
  return (
    <div className="rounded-3xl p-5 md:p-7 border border-white/10 shadow-2xl shadow-black/30"
         style={{ background: "linear-gradient(135deg, #17344F 0%, #265582 100%)" }}>
      {title && (
        <div className="flex items-center gap-2 mb-3 text-[11px] uppercase tracking-wider font-bold"
             style={{ backgroundImage: "linear-gradient(135deg,#F4EE8E,#D99E41)",
                      WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
          <BookOpen className="w-3.5 h-3.5 text-[#E7C768]" /> {title}
        </div>
      )}
      <RichTrainingMarkdown>{children || ""}</RichTrainingMarkdown>
    </div>
  );
}