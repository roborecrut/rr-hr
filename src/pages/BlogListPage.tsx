import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { mdExcerpt } from "@/lib/mdExcerpt";
import { ArrowLeft, BookOpen } from "lucide-react";
import { MASCOT } from "@/lib/mascotImages";

type Post = {
  id: string;
  public_id: string;
  slug: string;
  title: string;
  cover_url: string | null;
  excerpt: string;
  content_md: string;
  created_at: string;
};

export default function BlogListPage() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = "Блог RR — статьи о найме, ИИ-интервью и обучении";
    (async () => {
      const { data } = await supabase
        .from("posts")
        .select("id, public_id, slug, title, cover_url, excerpt, content_md, created_at")
        .eq("is_published", true)
        .order("created_at", { ascending: false });
      setPosts((data || []) as any);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#17344F] to-[#265582] text-white">
      <header className="sticky top-0 z-30 bg-[#17344F]/95 backdrop-blur border-b border-white/10 px-4 md:px-8 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <button onClick={() => navigate("/")} className="inline-flex items-center gap-1.5 text-sm text-slate-200 hover:text-white">
            <ArrowLeft className="w-4 h-4" /> Главная
          </button>
          <div className="flex items-center gap-2 text-[#E7C768] font-bold">
            <BookOpen className="w-5 h-5" /> Блог RR
          </div>
          <div className="w-16" />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-8 py-8 md:py-12">
        <h1 className="text-3xl md:text-4xl font-extrabold mb-2"
          style={{ backgroundImage: "linear-gradient(135deg,#F4EE8E,#D99E41)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
          Статьи и идеи
        </h1>
        <p className="text-slate-300 mb-8">Как нанимать быстрее, обучать без HR и запускать ИИ-интервью для любой вакансии.</p>

        {loading ? (
          <div className="text-center text-slate-300 py-16">Загрузка…</div>
        ) : posts.length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <img src={MASCOT.shine} alt="" className="w-32 h-32 mx-auto object-contain" />
            <p className="text-slate-300">Пока нет статей. Скоро здесь появится первая.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {posts.map(p => (
              <button key={p.id} type="button" onClick={() => navigate(`/blog/post${p.public_id}`)}
                className="text-left group rounded-3xl overflow-hidden border border-white/10 bg-[#1D3E5E]/70 hover:border-[#E7C768]/50 hover:-translate-y-0.5 transition shadow-xl shadow-black/20">
                <div className="aspect-[16/9] bg-[#17344F] overflow-hidden">
                  {p.cover_url
                    ? <img src={p.cover_url} alt={p.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                    : <div className="w-full h-full flex items-center justify-center text-slate-500"><BookOpen className="w-10 h-10" /></div>}
                </div>
                <div className="p-4 md:p-5 space-y-2">
                  <h2 className="text-base md:text-lg font-bold text-white leading-snug line-clamp-2">{p.title}</h2>
                  <p className="text-sm text-slate-300 line-clamp-3">{p.excerpt || mdExcerpt(p.content_md, 100)}</p>
                  <div className="text-[11px] text-slate-400">{new Date(p.created_at).toLocaleDateString("ru-RU")}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}