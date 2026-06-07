import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import MarkdownEditor from "@/components/MarkdownEditor";
import { Plus, Trash2, Save, Upload, X, BookOpen, Loader2, ExternalLink, ImageIcon } from "lucide-react";

type Post = {
  id: string;
  public_id: string;
  slug: string;
  title: string;
  cover_url: string | null;
  content_md: string;
  excerpt: string;
  is_published: boolean;
  created_at: string;
};

export default function BlogAdmin() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Post | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("posts").select("*").order("created_at", { ascending: false });
    setPosts((data || []) as any);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const createNew = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("posts").insert({
      title: "Новая статья",
      content_md: "# Заголовок статьи\n\nТекст вашей статьи в Markdown…",
      is_published: false,
      author_id: user?.id || null,
    } as any).select("*").single();
    if (error) { alert(error.message); return; }
    setEditing(data as any);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Удалить статью безвозвратно?")) return;
    const { error } = await supabase.from("posts").delete().eq("id", id);
    if (error) { alert(error.message); return; }
    if (editing?.id === id) setEditing(null);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[#E7C768] inline-flex items-center gap-2">
          <BookOpen className="w-5 h-5" /> Блог — статьи
        </h2>
        <button onClick={createNew}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-[#E7C768] to-[#D99E41] text-[#17344F] text-xs font-bold">
          <Plus className="w-3.5 h-3.5" /> Новая статья
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4 space-y-2">
          {loading && <div className="text-slate-300 text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Загрузка…</div>}
          {posts.map(p => (
            <button key={p.id} onClick={() => setEditing(p)}
              className={`w-full text-left rounded-2xl border p-3 transition ${
                editing?.id === p.id ? "bg-[#E7C768]/10 border-[#E7C768]/50" : "bg-[#1D3E5E]/60 border-white/10 hover:bg-[#1D3E5E]"
              }`}>
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-lg bg-[#17344F] overflow-hidden flex-shrink-0">
                  {p.cover_url ? <img src={p.cover_url} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-slate-500"><ImageIcon className="w-5 h-5" /></div>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-white truncate">{p.title || "Без заголовка"}</div>
                  <div className="text-[11px] text-slate-400">
                    #{p.public_id} · {p.is_published ? <span className="text-emerald-300">опубликовано</span> : <span className="text-amber-300">черновик</span>}
                  </div>
                </div>
              </div>
            </button>
          ))}
          {!loading && posts.length === 0 && (
            <div className="text-sm text-slate-400">Пока нет статей. Нажмите «Новая статья».</div>
          )}
        </div>

        <div className="lg:col-span-8">
          {editing ? (
            <BlogEditor key={editing.id} post={editing} onSaved={(p) => { setEditing(p); load(); }} onDelete={() => remove(editing.id)} onClose={() => setEditing(null)} />
          ) : (
            <div className="rounded-3xl border border-white/10 bg-[#1D3E5E]/60 p-8 text-center text-slate-300">
              Выберите статью слева или создайте новую.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BlogEditor({ post, onSaved, onDelete, onClose }: {
  post: Post; onSaved: (p: Post) => void; onDelete: () => void; onClose: () => void;
}) {
  const [title, setTitle] = useState(post.title);
  const [content, setContent] = useState(post.content_md);
  const [coverUrl, setCoverUrl] = useState(post.cover_url || "");
  const [isPublished, setIsPublished] = useState(post.is_published);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const uploadCover = async (file: File) => {
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("posts").upload(path, file, { upsert: false, contentType: file.type });
    if (error) { alert(error.message); setUploading(false); return; }
    const { data } = supabase.storage.from("posts").getPublicUrl(path);
    setCoverUrl(data.publicUrl);
    setUploading(false);
  };

  const save = async () => {
    setSaving(true);
    const { data, error } = await supabase.from("posts").update({
      title, content_md: content, cover_url: coverUrl || null, is_published: isPublished,
    } as any).eq("id", post.id).select("*").single();
    setSaving(false);
    if (error) { alert(error.message); return; }
    onSaved(data as any);
  };

  return (
    <div className="brand-editor rounded-3xl border border-white/10 p-5 space-y-4"
         style={{ background: "linear-gradient(135deg, #17344F 0%, #265582 100%)" }}>
      <div className="flex items-center gap-2">
        <div className="text-xs text-slate-300">
          #{post.public_id} · URL: <code className="text-[#E7C768]">/blog/post{post.public_id}</code>
        </div>
        <a href={`/blog/post${post.public_id}`} target="_blank" rel="noreferrer" className="text-[#E7C768] hover:text-[#F4EE8E]" title="Открыть">
          <ExternalLink className="w-4 h-4" />
        </a>
        <button onClick={onClose} className="ml-auto text-slate-300 hover:text-white"><X className="w-4 h-4" /></button>
      </div>

      <div>
        <label className="text-[11px] uppercase tracking-wider font-bold text-[#F4EE8E]">Заголовок</label>
        <input value={title} onChange={e => setTitle(e.target.value)} maxLength={300}
          className="w-full mt-1 bg-[#17344F]/60 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-[#E7C768]" />
      </div>

      <div>
        <label className="text-[11px] uppercase tracking-wider font-bold text-[#F4EE8E]">Обложка</label>
        <div className="mt-1 flex items-center gap-3">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="w-32 h-20 object-cover rounded-lg border border-white/10" />
          ) : (
            <div className="w-32 h-20 rounded-lg bg-[#17344F] border border-white/10 flex items-center justify-center text-slate-500">
              <ImageIcon className="w-6 h-6" />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadCover(f); }} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-bold disabled:opacity-60">
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Загрузить фото
            </button>
            {coverUrl && (
              <button type="button" onClick={() => setCoverUrl("")} className="text-xs text-rose-300 hover:text-rose-200 text-left">Удалить обложку</button>
            )}
          </div>
        </div>
      </div>

      <div>
        <label className="text-[11px] uppercase tracking-wider font-bold text-[#F4EE8E]">Текст статьи (Markdown)</label>
        <div className="mt-1">
          <MarkdownEditor value={content} onChange={setContent} previewTitle={title || "Превью статьи"} rows={22} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/10">
        <label className="inline-flex items-center gap-2 text-sm text-slate-200">
          <input type="checkbox" checked={isPublished} onChange={e => setIsPublished(e.target.checked)}
            className="w-4 h-4 accent-[#E7C768]" />
          Опубликовано (видно всем на /blog)
        </label>
        <div className="flex items-center gap-2">
          <button onClick={onDelete} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs font-bold hover:bg-rose-500/25">
            <Trash2 className="w-3.5 h-3.5" /> Удалить
          </button>
          <button onClick={save} disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#E7C768] to-[#D99E41] text-[#17344F] text-sm font-bold disabled:opacity-60">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}