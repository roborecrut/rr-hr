import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, Sparkles, Link2, Loader2 } from "lucide-react";
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
  const [busy, setBusy] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const [url, setUrl] = useState("");
  const [urlOpen, setUrlOpen] = useState(false);

  async function handleFile(f: File) {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      toast.error("Файл больше 10 МБ");
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("Войдите в систему"); return; }
    setBusy(true);
    const path = `${user.id}/${entity}-${entityId}-${Date.now()}-${f.name.replace(/[^\w.\-]+/g, "_")}`;
    try {
      const { error: upErr } = await supabase.storage.from(BUCKET[entity]).upload(path, f, { upsert: false });
      if (upErr) throw upErr;
      const data = await aiWaitRun<any>({
        title: "Распознавание документа",
        task: async () => {
          const { data, error } = await supabase.functions.invoke("ai-ingest-document", {
            body: { entity, entity_id: entityId, bucket: BUCKET[entity], file_path: path, filename: f.name },
          });
          if (error) throw new Error(error.message);
          return data;
        },
      });
      if (!data) return;
      const text = String(data?.text || "").slice(0, maxLength);
      onChange(text);
      toast.success("Документ разобран");
    } catch (e: any) {
      toast.error(e?.message || "Не удалось разобрать файл");
      // best-effort cleanup
      await supabase.storage.from(BUCKET[entity]).remove([path]).catch(() => {});
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleUrl() {
    if (!url.trim()) return;
    setBusy(true);
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
    } finally { setBusy(false); }
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
    <div className="space-y-2 rounded-md border border-border bg-card p-3">
      {label ? <div className="text-sm font-medium">{label}</div> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Загрузить файл
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setUrlOpen((v) => !v)}>
          <Link2 className="h-4 w-4" /> Вставить ссылку
        </Button>
        <input ref={fileRef} type="file" className="hidden"
          accept=".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      </div>
      {urlOpen ? (
        <div className="flex gap-2">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          <Button type="button" size="sm" disabled={busy || !url.trim()} onClick={handleUrl}>Разобрать</Button>
        </div>
      ) : null}
      {busy ? <LoadingPhrase entity={entity} /> : null}
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
        placeholder={placeholder || "Вставьте текст вручную или загрузите файл…"}
        className="min-h-[180px]"
        maxLength={maxLength}
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{value.length} / {maxLength}</span>
        {showDistribute ? (
          <Button type="button" size="sm" variant="secondary" disabled={distributing || !value.trim()} onClick={handleDistribute}>
            {distributing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Внести через ИИ
          </Button>
        ) : null}
      </div>
      {distributing ? <LoadingPhrase entity={entity} /> : null}
    </div>
  );
}