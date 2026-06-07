import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { RichTrainingMaterialCard } from "@/components/RichTrainingMarkdown";
import PostReactions from "@/components/PostReactions";
import PostComments from "@/components/PostComments";
import AuthModal from "@/components/AuthModal";
import { useSeo, SITE_URL } from "@/lib/seo";
import SiteHeader from "@/components/SiteHeader";

export default function BlogPostPage() {
  const navigate = useNavigate();
  const { pid: rawPid } = useParams<{ pid: string }>();
  const pid = (rawPid || "").replace(/^post/, "");
  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);

  const excerpt = (post?.excerpt || (post?.content_md || "").replace(/[#*`>_\-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 155)) || "";
  useSeo(post ? {
    title: `${post.title} — Блог Робот Рекрутер`,
    description: excerpt || `${post.title} — статья в блоге Робот Рекрутер.`,
    canonical: `${SITE_URL}/blog/${rawPid || pid}`,
    ogUrl: `${SITE_URL}/blog/${rawPid || pid}`,
    ogType: "article",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.title,
      image: post.cover_url || undefined,
      datePublished: post.created_at,
      mainEntityOfPage: `${SITE_URL}/blog/${rawPid || pid}`,
      publisher: { "@type": "Organization", name: "Робот Рекрутер" },
    },
  } : {});

  useEffect(() => {
    window.scrollTo(0, 0);
    (async () => {
      const [{ data }, { data: { user } }] = await Promise.all([
        supabase.from("posts").select("*").eq("public_id", pid).maybeSingle(),
        supabase.auth.getUser(),
      ]);
      setPost(data || null);
      setUserId(user?.id ?? null);
      setLoading(false);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUserId(s?.user?.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, [pid]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#17344F] to-[#265582] text-white">
      <SiteHeader active="blog" />

      <main className="max-w-4xl mx-auto px-4 md:px-8 py-8 md:py-12 space-y-6">
        {loading ? (
          <div className="text-center text-slate-300 py-16">Загрузка…</div>
        ) : !post ? (
          <div className="text-center text-slate-300 py-16">
            Статья не найдена.{" "}
            <button onClick={() => navigate("/blog")} className="text-[#E7C768] underline">Вернуться к ленте</button>
          </div>
        ) : (
          <>
            {post.cover_url && (
              <div className="aspect-[16/9] rounded-3xl overflow-hidden border border-white/10 bg-[#17344F]">
                <img src={post.cover_url} alt={post.title} className="w-full h-full object-cover" />
              </div>
            )}
            <div className="space-y-2">
              <div className="text-[11px] text-slate-400">
                #{post.public_id} · {new Date(post.created_at).toLocaleDateString("ru-RU")}
              </div>
              <h1 className="text-3xl md:text-4xl font-extrabold leading-tight"
                style={{ backgroundImage: "linear-gradient(135deg,#F4EE8E,#D99E41)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
                {post.title}
              </h1>
            </div>

            <RichTrainingMaterialCard>{post.content_md || ""}</RichTrainingMaterialCard>

            <div className="rounded-3xl border border-white/10 bg-[#1D3E5E]/70 p-5 space-y-3">
              <div className="text-sm text-slate-300">Понравилась статья? Оставьте реакцию:</div>
              <PostReactions postId={post.id} userId={userId} onRequireLogin={() => setAuthOpen(true)} />
            </div>

            <div className="rounded-3xl border border-white/10 bg-[#1D3E5E]/70 p-5">
              <PostComments postId={post.id} userId={userId} onRequireLogin={() => setAuthOpen(true)} />
            </div>
          </>
        )}
      </main>

      {authOpen && <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />}
    </div>
  );
}