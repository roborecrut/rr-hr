import { useId, useRef, useState } from "react";
import { FileText, Sparkles, RefreshCw, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAIWait } from "@/components/AIWaitProvider";
import { useAIReady, waitForAIReady, requestAIRestartOverlay } from "@/lib/aiReady";
import { toast } from "sonner";

/**
 * Global, brand-styled document uploader used across editors and wizards
 * (companies, vacancies, trainings, interviews, resumes).
 *
 * Flow — identical to the working company uploader:
 *   1) Upload file to the entity's Supabase Storage bucket
 *   2) Press "Распознать документ" → calls ai-ingest-document via aiWaitRun
 *      (shows global mascot overlay)
 *   3) Edit the recognized markdown text in a textarea (≤ maxChars)
 *   4) Press "Оформить красиво с помощью ИИ" (centered, below textarea)
 *      → calls parent-supplied onEnhance()
 */

type Entity = "company" | "vacancy" | "training" | "interview" | "resume";

const BUCKETS: Record<Entity, string> = {
  company: "company-uploads",
  vacancy: "vacancy-uploads",
  training: "training-uploads",
  interview: "interview-uploads",
  resume: "candidate-resumes",
};

export interface DocumentUploaderProps {
  entity: Entity;
  entityId: string | null | undefined;
  /** Folder prefix inside the bucket, e.g. `${uid}/${draftId}`. */
  pathPrefix: string;
  rawText: string;
  onRawTextChange: (text: string) => void;
  maxChars?: number;
  title?: string;
  hint?: string;
  /** Centered AI-beautify button (parent's handler — usually aiEnhanceAll). */
  onEnhance?: () => void | Promise<void>;
  enhanceBusy?: boolean;
  canEnhance?: boolean;
  enhanceHint?: string;
  enhanceLabel?: string;
  accept?: string;
  /** Optional audit hook for parent's event log. */
  onAudit?: (level: "info" | "success" | "warning", title: string, detail: string) => void;
  disabled?: boolean;
}

const DEFAULT_ACCEPT =
  ".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown";

function sanitizeName(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[^\x20-\x7E]+/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || `file_${Date.now()}`
  );
}

export function DocumentUploader({
  entity,
  entityId,
  pathPrefix,
  rawText,
  onRawTextChange,
  maxChars = 5000,
  title = "Распознавание текста из файла",
  hint = "Шаг 1 — загрузите файл в Supabase. Шаг 2 — нажмите «Распознать текст» (ИИ извлечёт текст). Шаг 3 — нажмите «Оформить красиво с помощью ИИ».",
  onEnhance,
  enhanceBusy = false,
  canEnhance = true,
  enhanceHint,
  enhanceLabel = "Оформить красиво с помощью ИИ",
  accept = DEFAULT_ACCEPT,
  onAudit,
  disabled = false,
}: DocumentUploaderProps) {
  const { run: aiWaitRun } = useAIWait();
  const aiReady = useAIReady();
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");

  const bucket = BUCKETS[entity];
  const busy = uploading || parsing || disabled;

  async function handleFile(file: File) {
    setUploadError("");
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      const msg = "Файл больше 10 МБ.";
      setUploadError(msg);
      toast.error(msg);
      return;
    }
    const { data: u } = await supabase.auth.getUser();
    const uid = u?.user?.id;
    if (!uid) {
      const msg = "Войдите в систему — без авторизации файл нельзя загрузить.";
      setUploadError(msg);
      toast.error(msg);
      onAudit?.("warning", "Нет авторизации", msg);
      return;
    }
    if (!pathPrefix) {
      const msg = "Черновик ещё не создан. Закройте мастер и откройте снова.";
      setUploadError(msg);
      toast.error(msg);
      return;
    }
    const safe = sanitizeName(file.name);
    const path = `${uid}/${pathPrefix}/${Date.now()}_${safe}`;
    setUploading(true);
    onAudit?.("info", "Загрузка файла", `Загружаем «${file.name}» в Supabase…`);
    try {
      const up = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
      if (up.error) throw up.error;
      setFilePath(path);
      setFileName(file.name);
      onAudit?.("success", "Файл загружен", `${file.name} → ${bucket}/${path}`);
    } catch (err: any) {
      const msg = err?.message || "Не удалось загрузить файл.";
      setUploadError(msg);
      toast.error(msg);
      onAudit?.("warning", "Ошибка загрузки", msg);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function recognize() {
    if (!filePath) return;
    if (!aiReady) {
      // ProTalk /restart still in flight — surface the overlay and wait for it
      // before sending a second request to the same dialog.
      requestAIRestartOverlay();
      toast.message("ИИ ещё готовится — подождите пару секунд…");
      await waitForAIReady();
    }
    setParsing(true);
    onAudit?.("info", "ИИ разбор документа", `ProTalk считывает «${fileName}»…`);
    try {
      const res = await aiWaitRun<any>({
        title: `ИИ читает файл ${fileName}`,
        task: async () => {
          const { data, error } = await supabase.functions.invoke("ai-ingest-document", {
            body: {
              entity,
              entity_id: entityId || undefined,
              bucket,
              file_path: filePath,
              filename: fileName,
              max_chars: maxChars,
            },
          });
          if (error) throw new Error(error.message);
          return data;
        },
      });
      const text = String(res?.text || "").slice(0, maxChars);
      if (text) {
        onRawTextChange(text);
        onAudit?.("success", "Текст извлечён", `Распознано ${text.length} симв.`);
      } else {
        onAudit?.("warning", "Пустой ответ", "ИИ не вернул текст из документа.");
      }
      // Edge function deletes the source file on completion.
      setFilePath(null);
    } catch (err: any) {
      const msg = err?.message || "Не удалось разобрать файл.";
      toast.error(msg);
      onAudit?.("warning", "Ошибка распознавания", msg);
    } finally {
      setParsing(false);
    }
  }

  return (
    <div className="brand-editor editor-section rounded-3xl p-4 space-y-3 border border-[#E7C768]/30 bg-gradient-to-br from-[#17344F]/95 to-[#265582]/95 shadow-xl">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-[#E7C768] uppercase tracking-wider flex items-center gap-1.5">
          <FileText className="w-4 h-4" /> {title}
        </span>
      </div>
      {hint ? <p className="text-[11px] text-white/75 leading-snug">{hint}</p> : null}

      {/* DROPZONE */}
      <div
        onClick={() => !busy && fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (busy) return;
          const f = e.dataTransfer.files?.[0];
          if (f) void handleFile(f);
        }}
        className={`editor-dropzone cursor-pointer border-2 border-dashed border-[#E7C768]/40 bg-white/5 hover:bg-white/10 rounded-2xl p-4 text-center space-y-1.5 transition-all ${
          busy ? "animate-pulse opacity-90" : ""
        }`}
      >
        <input
          id={inputId}
          ref={fileRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        <div className="text-xs font-bold text-white flex items-center justify-center gap-2">
          {uploading ? (
            <span className="text-[#E7C768] flex items-center gap-1.5">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Загружаем «{fileName || "файл"}» в Supabase Storage…
            </span>
          ) : parsing ? (
            <span className="text-[#E7C768] flex items-center gap-1.5">
              <RefreshCw className="w-4 h-4 animate-spin" />
              ИИ извлекает текст…
            </span>
          ) : filePath ? (
            <span className="text-[#E7C768] flex items-center gap-1.5">
              <FileText className="w-4 h-4" /> Файл загружен: {fileName} ✓
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <Upload className="w-4 h-4 text-[#E7C768]" />
              Кликните или перетащите файл — затем нажмите «Распознать текст»
            </span>
          )}
        </div>
        <span className="text-[10px] text-white/60 block font-mono">
          Поддерживаются PDF, DOCX, TXT, MD (до 10 МБ)
        </span>
        {uploadError ? <div className="text-[10px] text-[#FF4C4C] mt-1">{uploadError}</div> : null}
      </div>

      {/* STEP 2: RECOGNIZE */}
      {filePath && !parsing && !uploading ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={recognize}
            disabled={!aiReady}
            title={aiReady ? undefined : "ИИ ещё готовится — кнопка станет активной через пару секунд"}
            className="btn-brand-secondary px-5 py-2.5 text-xs flex items-center justify-center gap-1.5 shadow-md"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {aiReady ? "Распознать текст" : "ИИ готовится…"}
          </button>
        </div>
      ) : null}

      {/* STEP 3: editable raw text */}
      {rawText || parsing ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-[#E7C768] uppercase tracking-wider">
              Распознанный текст (редактируется, до {maxChars} симв.)
            </span>
            <span className="text-[10px] text-white/60 font-mono">
              {rawText.length} / {maxChars}
            </span>
          </div>
          <textarea
            value={rawText}
            onChange={(e) => onRawTextChange(e.target.value.slice(0, maxChars))}
            placeholder="Здесь появится распознанный текст из загруженного файла. Можно дописать вручную."
            className="w-full bg-black/40 text-xs p-3 rounded-xl border border-white/10 text-white placeholder:text-white/40 focus:outline-none focus:border-[#E7C768]/60 min-h-[160px]"
            maxLength={maxChars}
          />
        </div>
      ) : null}

      {/* STEP 4: enhance button — centered under the uploader */}
      {onEnhance ? (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={() => void onEnhance()}
            disabled={!canEnhance || enhanceBusy || busy}
            title={
              enhanceHint ||
              (canEnhance
                ? "Оформить все поля красиво через ИИ"
                : "Заполните поля минимум на 50 символов суммарно (или загрузите файл)")
            }
            className="btn-brand-primary px-5 py-2.5 text-xs flex items-center justify-center gap-1.5 shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Sparkles className={`w-3.5 h-3.5 ${enhanceBusy ? "animate-spin" : ""}`} />
            {enhanceBusy ? "Обработка ИИ..." : enhanceLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default DocumentUploader;