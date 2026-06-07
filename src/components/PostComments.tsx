import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import PostReactions from "@/components/PostReactions";
import { MessageSquare, Send, Trash2, Reply } from "lucide-react";

type Comment = {
  id: string;
  parent_id: string | null;
  user_id: string;
  body: string;
  created_at: string;
  author?: { display_name?: string | null; avatar_url?: string | null };
};

export default function PostComments({ postId, userId, onRequireLogin }: {
  postId: string;
  userId: string | null;
  onRequireLogin: () => void;
}) {
  const [items, setItems] = useState<Comment[]>([]);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("post_comments")
      .select("id, parent_id, user_id, body, created_at")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });
    const rows = (data || []) as any[];
    const userIds = Array.from(new Set(rows.map(r => r.user_id)));
    let profiles: Record<string, any> = {};
    if (userIds.length) {
      const { data: p } = await supabase
        .from("profiles").select("id, display_name, avatar_url")
        .in("id", userIds);
      for (const x of (p || []) as any[]) profiles[x.id] = x;
    }
    setItems(rows.map(r => ({ ...r, author: profiles[r.user_id] })));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [postId]);

  const submit = async (body: string, parent: string | null) => {
    if (!userId) { onRequireLogin(); return; }
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    const { error } = await supabase.from("post_comments").insert({
      post_id: postId, parent_id: parent, user_id: userId, body: text,
    } as any);
    setBusy(false);
    if (error) { alert(error.message); return; }
    if (parent) { setReplyDraft(""); setReplyTo(null); } else { setDraft(""); }
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Удалить комментарий?")) return;
    await supabase.from("post_comments").delete().eq("id", id);
    load();
  };

  const roots = items.filter(i => !i.parent_id);
  const childrenOf = (id: string) => items.filter(i => i.parent_id === id);

  const Bubble = ({ c, isReply }: { c: Comment; isReply?: boolean }) => (
    <div className={`rounded-2xl border border-white/10 bg-white/5 p-3 ${isReply ? "ml-8 mt-2" : ""}`}>
      <div className="flex items-center gap-2 mb-1.5">
        {c.author?.avatar_url
          ? <img src={c.author.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
          : <div className="w-6 h-6 rounded-full bg-[#E7C768]/30 text-[10px] flex items-center justify-center font-bold text-[#F4EE8E]">
              {(c.author?.display_name?.[0] || "U").toUpperCase()}
            </div>}
        <span className="text-xs font-semibold text-slate-100">{c.author?.display_name || "Пользователь"}</span>
        <span className="text-[10px] text-slate-400">{new Date(c.created_at).toLocaleString("ru-RU")}</span>
        {userId === c.user_id && (
          <button type="button" onClick={() => remove(c.id)}
            className="ml-auto text-rose-300/70 hover:text-rose-200" title="Удалить">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="text-sm text-slate-100 whitespace-pre-wrap break-words">{c.body}</div>
      <div className="mt-2 flex items-center gap-2">
        <PostReactions commentId={c.id} userId={userId} onRequireLogin={onRequireLogin} />
        {!isReply && (
          <button type="button" onClick={() => { setReplyTo(replyTo === c.id ? null : c.id); setReplyDraft(""); }}
            className="ml-auto text-xs text-slate-300 hover:text-white inline-flex items-center gap-1">
            <Reply className="w-3.5 h-3.5" /> Ответить
          </button>
        )}
      </div>
      {!isReply && replyTo === c.id && (
        <div className="mt-2 flex items-end gap-2">
          <textarea value={replyDraft} onChange={e => setReplyDraft(e.target.value)} rows={2} maxLength={2000}
            placeholder="Ваш ответ…"
            className="flex-1 bg-[#17344F]/60 text-sm p-2 rounded-xl border border-white/10 text-slate-100 focus:outline-[#E7C768]" />
          <button type="button" disabled={busy || !replyDraft.trim()} onClick={() => submit(replyDraft, c.id)}
            className="px-3 py-2 rounded-xl bg-[#E7C768] text-[#17344F] text-xs font-bold disabled:opacity-50 inline-flex items-center gap-1">
            <Send className="w-3.5 h-3.5" /> Отправить
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[#E7C768] font-bold">
        <MessageSquare className="w-4 h-4" /> Комментарии ({items.length})
      </div>

      {userId ? (
        <div className="flex items-end gap-2">
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={3} maxLength={2000}
            placeholder="Поделитесь мнением…"
            className="flex-1 bg-[#17344F]/60 text-sm p-3 rounded-xl border border-white/10 text-slate-100 focus:outline-[#E7C768]" />
          <button type="button" disabled={busy || !draft.trim()} onClick={() => submit(draft, null)}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#E7C768] to-[#D99E41] text-[#17344F] text-sm font-bold disabled:opacity-50 inline-flex items-center gap-1.5">
            <Send className="w-4 h-4" /> Отправить
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center text-sm text-slate-200">
          Чтобы оставить комментарий или реакцию,{" "}
          <button onClick={onRequireLogin} className="text-[#E7C768] font-bold underline underline-offset-2">войдите в аккаунт</button>.
        </div>
      )}

      <div className="space-y-3">
        {roots.map(c => (
          <div key={c.id}>
            <Bubble c={c} />
            {childrenOf(c.id).map(child => <Bubble key={child.id} c={child} isReply />)}
          </div>
        ))}
        {items.length === 0 && (
          <div className="text-center text-sm text-slate-400 py-6">Будьте первым, кто оставит комментарий.</div>
        )}
      </div>
    </div>
  );
}