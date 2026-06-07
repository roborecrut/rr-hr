import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, Sparkles, Link2, Loader2, Send, CheckCircle2 } from "lucide-react";
import { LoadingPhrase } from "@/components/LoadingPhrase";
import { useAIWait } from "@/components/AIWaitProvider";
import type { LoadingEntity } from "@/lib/loadingPhrases";

type Entity = Exclude<LoadingEntity, "generic">;

const BUCKET: Record<Entity, string> = {
  company: "company-uploads",
  vacancy: "vacancy-uploads",
  training: "training-uploads",
  interview: "interview-uploads",
};

// Universal file/URL → ProTalk → markdown → entity field component.
// Lets user upload a file or paste a URL, runs `ai-ingest-document` which returns
// formatted markdown. The text is editable (max 10k chars) and bound to the parent
// entity field via onChange. Optionally exposes "Внести через ИИ" to redistribute
// the text across entity fields via `ai-distribute-text`.
export function DocumentIngestField({
  entity,
  entityId,
  value,
  onChange,
  onDistributed,
  maxLength = 10000,
  label,
  placeholder,
  showDistribute = true,
}: {
  entity: Entity;
  entityId: string;
  value: string;
  onChange: (text: string) => void;
  onDistributed?: (fields: Record<string, any>) => void;
  maxLength?: number;
  label?: string;
  placeholder?: string;
  showDistribute?: boolean;
}) {
  const { run: aiWaitRun } = useAIWait();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const [url, setUrl] = useState("");
  const [urlOpen, setUrlOpen] = useState(false);
  // After a successful upload we keep the storage path + filename so the user
  // can explicitly trigger ProTalk on step 2.
  const [uploaded, setUploaded] = useState<{ path: string; filename: string } | null>(null);
  const [uploadError, setUploadError] = useState("");

  const busy = uploading || sending;

  async function handleFile(f: File) {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      toast.error("Файл больше 10 МБ");
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("Войдите в систему"); return; }
    setUploadError("");
    setUploading(true);
    const path = `${user.id}/${entity}-${entityId}-${Date.now()}-${f.name.replace(/[^\w.\-]+/g, "_")}`;
    try {
      const { error: upErr } = await supabase.storage.from(BUCKET[entity]).upload(path, f, { upsert: false });
      if (upErr) throw upErr;
      setUploaded({ path, filename: f.name });
      toast.success("Файл загружен в Supabase");
    } catch (e: any) {
      const msg = e?.message || "Не удалось загрузить файл";
      setUploadError(msg);
      toast.error(msg);
      await supabase.storage.from(BUCKET[entity]).remove([path]).catch(() => {});
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function sendToProTalk() {
    if (!uploaded) return;
    setSending(true);
    try {
      const data = await aiWaitRun<any>({
        title: "Распознавание документа",
        task: async () => {
          const { data, error } = await supabase.functions.invoke("ai-ingest-document", {
            body: { entity, entity_id: entityId, bucket: BUCKET[entity], file_path: uploaded.path, filename: uploaded.filename },
          });
          if (error) throw new Error(error.message);
          return data;
        },
      });
      if (!data) return;
      const text = String(data?.text || "").slice(0, maxLength);
      onChange(text);
      setUploaded(null); // file was removed server-side after ingest
      toast.success("Документ разобран");
    } catch (e: any) {
      toast.error(e?.message || "Не удалось разобрать файл");
    } finally {
      setSending(false);
    }
  }

  async function handleUrl() {
    if (!url.trim()) return;
    setSending(true);
    try {
      const data = await aiWaitRun<any>({
        title: "Разбор ссылки",
        task: async () => {
          const { data, error } = await supabase.functions.invoke("ai-ingest-document", {
            body: { entity, entity_id: entityId, file_url: url.trim() },
          });
          if (error) throw new Error(error.message);
          return data;
        },
      });
      if (!data) return;
      onChange(String(data?.text || "").slice(0, maxLength));
      setUrl(""); setUrlOpen(false);
      toast.success("Ссылка разобрана");
    } catch (e: any) {
      toast.error(e?.message || "Не удалось разобрать ссылку");
    } finally { setSending(false); }
  }

  async function handleDistribute() {
    if (!value.trim()) { toast.error("Сначала добавьте текст"); return; }
    setDistributing(true);
    try {
      const data = await aiWaitRun<any>({
        title: "ИИ разносит данные по полям",
        task: async () => {
          const { data, error } = await supabase.functions.invoke("ai-distribute-text", {
            body: { entity, entity_id: entityId, text: value.slice(0, maxLength) },
          });
          if (error) throw new Error(error.message);
          return data;
        },
      });
      if (!data) return;
      onDistributed?.(data?.fields || {});
      toast.success("ИИ разнёс данные по полям");
    } catch (e: any) {
      toast.error(e?.message || "Не удалось разнести");
    } finally { setDistributing(false); }
  }

  return (
    <div className="brand-editor space-y-2 rounded-2xl p-3">
      {label ? <div className="text-sm font-medium text-white">{label}</div> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" className="btn-brand-secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? "Загружаем в Supabase…" : "Загрузить файл"}
        </Button>
        <Button type="button" size="sm" className="btn-brand-secondary" disabled={busy} onClick={() => setUrlOpen((v) => !v)}>
          <Link2 className="h-4 w-4" /> Вставить ссылку
        </Button>
        <input ref={fileRef} type="file" className="hidden"
          accept=".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      </div>
      {urlOpen ? (
        <div className="flex gap-2">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          <Button type="button" size="sm" className="btn-brand-primary" disabled={busy || !url.trim()} onClick={handleUrl}>
            Распознать текст
          </Button>
        </div>
      ) : null}
      {uploaded ? (
        <div className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs text-white" style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(231,199,104,0.3)"}}>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-[#E7C768]"/>Файл загружен: {uploaded.filename}</span>
          <Button type="button" size="sm" className="btn-brand-primary" disabled={busy} onClick={sendToProTalk}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Распознать текст
          </Button>
        </div>
      ) : null}
      {uploadError ? <div className="text-xs text-[#FF4C4C]">{uploadError}</div> : null}
      {sending ? <LoadingPhrase entity={entity} /> : null}
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
        placeholder={placeholder || "Вставьте текст вручную или загрузите файл…"}
        className="min-h-[180px]"
        maxLength={maxLength}
      />
      <div className="flex items-center justify-between text-xs text-white/70">
        <span>{value.length} / {maxLength}</span>
        {showDistribute ? (
          <Button type="button" size="sm" className="btn-brand-gold" disabled={distributing || !value.trim()} onClick={handleDistribute}>
            {distributing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Оформить красиво через ИИ
          </Button>
        ) : null}
      </div>
      {distributing ? <LoadingPhrase entity={entity} /> : null}
    </div>
  );
}