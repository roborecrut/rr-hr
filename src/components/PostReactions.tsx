import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const REACTIONS: { kind: string; emoji: string; label: string }[] = [
  { kind: "like",  emoji: "👍", label: "Нравится" },
  { kind: "heart", emoji: "❤️", label: "Любовь" },
  { kind: "fire",  emoji: "🔥", label: "Огонь" },
  { kind: "clap",  emoji: "👏", label: "Аплодисменты" },
  { kind: "wow",   emoji: "😮", label: "Удивление" },
];

type Target = { postId?: string; commentId?: string };

export default function PostReactions({ postId, commentId, userId, onRequireLogin }:
  Target & { userId: string | null; onRequireLogin?: () => void }) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [mine, setMine] = useState<Set<string>>(new Set());

  const load = async () => {
    let q = supabase.from("post_reactions").select("kind, user_id");
    if (postId) q = q.eq("post_id", postId).is("comment_id", null);
    if (commentId) q = q.eq("comment_id", commentId).is("post_id", null);
    const { data } = await q;
    const c: Record<string, number> = {};
    const m = new Set<string>();
    for (const r of (data || []) as any[]) {
      c[r.kind] = (c[r.kind] || 0) + 1;
      if (userId && r.user_id === userId) m.add(r.kind);
    }
    setCounts(c); setMine(m);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [postId, commentId, userId]);

  const toggle = async (kind: string) => {
    if (!userId) { onRequireLogin?.(); return; }
    const has = mine.has(kind);
    if (has) {
      let q = supabase.from("post_reactions").delete().eq("user_id", userId).eq("kind", kind);
      if (postId) q = q.eq("post_id", postId);
      if (commentId) q = q.eq("comment_id", commentId);
      await q;
    } else {
      await supabase.from("post_reactions").insert({
        user_id: userId, kind,
        post_id: postId || null, comment_id: commentId || null,
      } as any);
    }
    load();
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {REACTIONS.map(r => {
        const active = mine.has(r.kind);
        const n = counts[r.kind] || 0;
        return (
          <button key={r.kind} type="button" title={r.label} onClick={() => toggle(r.kind)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition ${
              active
                ? "bg-[#E7C768]/20 border-[#E7C768]/60 text-[#F4EE8E]"
                : "bg-white/5 border-white/10 text-slate-200 hover:bg-white/10"
            }`}>
            <span className="text-base leading-none">{r.emoji}</span>
            {n > 0 && <span className="tabular-nums">{n}</span>}
          </button>
        );
      })}
    </div>
  );
}