import React, { useRef, useState } from "react";
import {
  Heading1, Heading2, Bold, Italic, Code, List, ListOrdered,
  Link2, Youtube, Video, FileText, Eye, Pencil,
} from "lucide-react";
import { RichTrainingMaterialCard } from "@/components/RichTrainingMarkdown";

type Props = {
  value: string;
  onChange: (v: string) => void;
  previewTitle?: string;
  rows?: number;
  placeholder?: string;
  maxLength?: number;
};

/**
 * Reusable Markdown editor with brand-styled toolbar + live preview toggle.
 * Behavior mirrors TrainingWizard's material editor.
 */
export default function MarkdownEditor({
  value, onChange, previewTitle, rows = 18,
  placeholder = "Markdown статьи…", maxLength,
}: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [preview, setPreview] = useState(false);

  const clamp = (s: string) => maxLength ? s.slice(0, maxLength) : s;

  const applyMd = (prefix: string, suffix = "", placeholder = "") => {
    const ta = ref.current; if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const before = value.slice(0, start);
    const sel = value.slice(start, end) || placeholder;
    const after = value.slice(end);
    const next = clamp(`${before}${prefix}${sel}${suffix}${after}`);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = before.length + prefix.length;
      ta.setSelectionRange(pos, pos + sel.length);
    });
  };
  const applyLinePrefix = (prefix: string) => {
    const ta = ref.current; if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const lineEnd = value.indexOf("\n", end);
    const realEnd = lineEnd === -1 ? value.length : lineEnd;
    const seg = value.slice(lineStart, realEnd);
    const replaced = seg.split("\n").map(l => l.startsWith(prefix) ? l : `${prefix}${l}`).join("\n");
    onChange(clamp(value.slice(0, lineStart) + replaced + value.slice(realEnd)));
    requestAnimationFrame(() => ta.focus());
  };
  const insertEmbed = (kind: "youtube" | "vk" | "rutube" | "gdoc") => {
    const ta = ref.current; if (!ta) return;
    const ph: Record<string, string> = {
      youtube: "https://www.youtube.com/watch?v=ID",
      vk: "https://vk.com/video-1234567_456239021",
      rutube: "https://rutube.ru/video/abc123def456/",
      gdoc: "https://docs.google.com/document/d/DOC_ID/edit",
    };
    const url = window.prompt(`Вставьте ссылку (${kind.toUpperCase()})`, ph[kind]);
    if (!url) return;
    const start = ta.selectionStart ?? value.length;
    const before = value.slice(0, start);
    const after = value.slice(start);
    const sep1 = before.endsWith("\n\n") || before.length === 0 ? "" : (before.endsWith("\n") ? "\n" : "\n\n");
    const sep2 = after.startsWith("\n\n") || after.length === 0 ? "" : (after.startsWith("\n") ? "\n" : "\n\n");
    onChange(clamp(before + sep1 + url + sep2 + after));
    requestAnimationFrame(() => ta.focus());
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="ml-auto flex items-center gap-1 bg-[#0F2A42]/60 border border-white/10 rounded-lg p-1">
          <button type="button" onClick={() => setPreview(false)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold inline-flex items-center gap-1 ${!preview ? "bg-[#E7C768] text-[#17344F]" : "text-slate-200 hover:bg-white/10"}`}>
            <Pencil className="w-3 h-3" /> Редактор
          </button>
          <button type="button" onClick={() => setPreview(true)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold inline-flex items-center gap-1 ${preview ? "bg-[#E7C768] text-[#17344F]" : "text-slate-200 hover:bg-white/10"}`}>
            <Eye className="w-3 h-3" /> Превью
          </button>
        </div>
      </div>

      {preview ? (
        <div className="min-h-[200px]">
          <RichTrainingMaterialCard title={previewTitle}>
            {value || "_Пусто_"}
          </RichTrainingMaterialCard>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1 bg-[#0F2A42]/60 border border-white/10 rounded-lg p-1.5">
            <button type="button" title="Заголовок H1" onClick={() => applyLinePrefix("# ")}
              className="p-1.5 rounded hover:bg-white/10 text-slate-200"><Heading1 className="w-3.5 h-3.5" /></button>
            <button type="button" title="Заголовок H2" onClick={() => applyLinePrefix("## ")}
              className="p-1.5 rounded hover:bg-white/10 text-slate-200"><Heading2 className="w-3.5 h-3.5" /></button>
            <span className="w-px bg-white/10 mx-1" />
            <button type="button" title="Жирный" onClick={() => applyMd("**", "**", "текст")}
              className="p-1.5 rounded hover:bg-white/10 text-slate-200"><Bold className="w-3.5 h-3.5" /></button>
            <button type="button" title="Курсив" onClick={() => applyMd("_", "_", "текст")}
              className="p-1.5 rounded hover:bg-white/10 text-slate-200"><Italic className="w-3.5 h-3.5" /></button>
            <button type="button" title="Код" onClick={() => applyMd("`", "`", "код")}
              className="p-1.5 rounded hover:bg-white/10 text-slate-200"><Code className="w-3.5 h-3.5" /></button>
            <span className="w-px bg-white/10 mx-1" />
            <button type="button" title="Маркированный список" onClick={() => applyLinePrefix("- ")}
              className="p-1.5 rounded hover:bg-white/10 text-slate-200"><List className="w-3.5 h-3.5" /></button>
            <button type="button" title="Нумерованный список" onClick={() => applyLinePrefix("1. ")}
              className="p-1.5 rounded hover:bg-white/10 text-slate-200"><ListOrdered className="w-3.5 h-3.5" /></button>
            <button type="button" title="Ссылка" onClick={() => applyMd("[", "](https://)", "текст")}
              className="p-1.5 rounded hover:bg-white/10 text-slate-200"><Link2 className="w-3.5 h-3.5" /></button>
            <span className="w-px bg-white/10 mx-1" />
            <button type="button" title="Видео YouTube" onClick={() => insertEmbed("youtube")}
              className="p-1.5 rounded hover:bg-white/10 text-rose-300"><Youtube className="w-3.5 h-3.5" /></button>
            <button type="button" title="Видео VK" onClick={() => insertEmbed("vk")}
              className="p-1.5 rounded hover:bg-white/10 text-sky-300"><Video className="w-3.5 h-3.5" /></button>
            <button type="button" title="Видео Rutube" onClick={() => insertEmbed("rutube")}
              className="p-1.5 rounded hover:bg-white/10 text-orange-300"><Video className="w-3.5 h-3.5" /></button>
            <button type="button" title="Google Docs / Sheets / Slides" onClick={() => insertEmbed("gdoc")}
              className="p-1.5 rounded hover:bg-white/10 text-emerald-300"><FileText className="w-3.5 h-3.5" /></button>
          </div>
          <p className="text-[10px] text-slate-400 -mt-1">
            Совет: вставьте отдельной строкой ссылку YouTube / VK Video / Rutube или Google Docs — в превью и на странице статьи она автоматически станет встроенным проигрывателем/документом.
          </p>
          <textarea
            ref={ref}
            rows={rows}
            maxLength={maxLength}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full bg-[#17344F]/60 text-xs p-3 rounded-xl border border-white/10 font-mono text-slate-100 focus:outline-[#E7C768]"
          />
          {maxLength ? (
            <div className="text-[10px] text-slate-400 text-right">{value.length}/{maxLength}</div>
          ) : null}
        </>
      )}
    </div>
  );
}