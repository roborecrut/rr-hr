import React, { useRef, useState, useCallback } from "react";
import { Upload, FileText, X, Loader, CheckCircle2, Send, AlertTriangle } from "lucide-react";

/**
 * Универсальная область загрузки резюме — поддерживает перетаскивание,
 * клик, состояние загрузки и подтверждение перед отправкой в ИИ.
 * Используется в демо-интервью и в кабинете кандидата, чтобы поведение
 * было одинаковым.
 *
 * Никаких технических терминов (Supabase / bucket / storage / Edge Function)
 * в UI — только пользовательский язык.
 */

const ACCEPT =
  ".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

export interface ResumeDropzoneProps {
  uploading: boolean;
  parsing: boolean;
  uploaded: { filename: string } | null;
  /** Имя файла в textarea (когда резюме уже распознано) */
  hasRecognizedText?: boolean;
  error?: string;
  busy?: boolean;
  onFile: (file: File) => void;
  onSend?: () => void;
  onClear?: () => void;
  sendLabel?: string;
  sendDisabled?: boolean;
  /**
   * Wave §5 — резюме-файл удалён на сервере (terminal-код
   * `file_deleted`/`file_missing`/`no_resume`). Рисуем выделенный баннер
   * «загрузите файл снова», очищаем превью и разблокируем дропзону.
   */
  fileMissing?: boolean;
}

export const ResumeDropzone: React.FC<ResumeDropzoneProps> = ({
  uploading,
  parsing,
  uploaded,
  error,
  busy,
  onFile,
  onSend,
  onClear,
  sendLabel = "Распознать резюме",
  sendDisabled,
  fileMissing,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // fileMissing — серверный отказ: дропзона должна оставаться активной,
  // даже если родитель ещё держит busy/uploaded из прошлого прогона.
  const disabled = !fileMissing && (uploading || parsing || !!busy);
  // При fileMissing превью неактуально — игнорируем устаревшее значение.
  const effectiveUploaded = fileMissing ? null : uploaded;

  const openPicker = useCallback(() => {
    if (disabled) return;
    inputRef.current?.click();
  }, [disabled]);

  const validateAndSend = useCallback(
    (file: File | undefined | null) => {
      if (!file) return;
      const name = file.name.toLowerCase();
      const okExt = /\.(pdf|docx?|txt)$/i.test(name);
      if (!okExt) {
        alert("Поддерживаются только файлы PDF, DOC, DOCX и TXT.");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert("Файл больше 10 МБ. Сожмите документ или выберите другой.");
        return;
      }
      onFile(file);
    },
    [onFile],
  );

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    validateAndSend(file);
  };

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        aria-label="Перетащите файл резюме или нажмите для выбора"
        aria-disabled={disabled}
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPicker();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={[
          "w-full rounded-2xl border-2 border-dashed transition-all p-5 md:p-6 text-center cursor-pointer select-none",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E7C768]",
          fileMissing
            ? "border-[#FF7B7B]/70 bg-[#FF4C4C]/10 hover:bg-[#FF4C4C]/15"
            : dragOver
              ? "border-[#E7C768] bg-[#E7C768]/15 scale-[1.01]"
              : effectiveUploaded
                ? "border-emerald-400/60 bg-emerald-500/10"
                : "border-[#E7C768]/40 bg-white/5 hover:bg-white/10 hover:border-[#E7C768]/70",
          disabled ? "opacity-80 cursor-progress" : "",
        ].join(" ")}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onClick={(e) => {
            (e.currentTarget as HTMLInputElement).value = "";
          }}
          onChange={(e) => validateAndSend(e.target.files?.[0] || null)}
        />

        <div className="flex flex-col items-center gap-2">
          {fileMissing ? (
            <>
              <AlertTriangle className="w-7 h-7 text-[#FF7B7B]" />
              <div className="text-sm font-bold text-white">
                Файл резюме был удалён
              </div>
              <div className="text-[12px] text-white/80 max-w-sm">
                Загрузите резюме заново — старый файл больше недоступен на сервере.
              </div>
              <div className="text-[11px] text-white/70 mt-1">
                Нажмите, чтобы выбрать новый файл, или перетащите его сюда.
              </div>
            </>
          ) : uploading ? (
            <>
              <Loader className="w-6 h-6 text-[#E7C768] animate-spin" />
              <div className="text-sm font-bold text-[#E7C768]">Загружаем файл…</div>
              <div className="text-[11px] text-white/70">Это занимает несколько секунд</div>
            </>
          ) : parsing ? (
            <>
              <Loader className="w-6 h-6 text-[#E7C768] animate-spin" />
              <div className="text-sm font-bold text-[#E7C768]">ИИ распознаёт резюме…</div>
              <div className="text-[11px] text-white/70">Не закрывайте страницу</div>
            </>
          ) : effectiveUploaded ? (
            <>
              <CheckCircle2 className="w-7 h-7 text-emerald-300" />
              <div className="text-sm font-bold text-white break-all">
                {effectiveUploaded.filename}
              </div>
              <div className="text-[11px] text-emerald-200">Файл готов к распознаванию</div>
            </>
          ) : (
            <>
              <Upload className="w-7 h-7 text-[#E7C768]" />
              <div className="text-sm font-bold text-white">
                Перетащите файл резюме сюда
              </div>
              <div className="text-[11px] text-white/70">
                или <span className="underline">нажмите, чтобы выбрать</span>
              </div>
              <div className="text-[10px] text-white/50 mt-1">
                PDF, DOC, DOCX или TXT — до 10 МБ
              </div>
            </>
          )}
        </div>
      </div>

      {error && !fileMissing && (
        <div className="text-xs text-[#FF7B7B] bg-[#FF4C4C]/10 border border-[#FF4C4C]/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {effectiveUploaded && !uploading && !parsing && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs text-white bg-white/5 border border-[#E7C768]/30">
          <span className="flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-[#E7C768]" />
            <span className="break-all">{effectiveUploaded.filename}</span>
          </span>
          <div className="flex items-center gap-2">
            {onClear && (
              <button
                type="button"
                onClick={onClear}
                className="text-[11px] text-white/70 hover:text-white inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-white/10"
              >
                <X className="w-3.5 h-3.5" /> Убрать
              </button>
            )}
            {onSend && (
              <button
                type="button"
                disabled={sendDisabled || parsing}
                onClick={onSend}
                className="bg-[#E7C768] hover:bg-[#F4D679] text-[#17344F] font-bold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-3.5 h-3.5" /> {sendLabel}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ResumeDropzone;