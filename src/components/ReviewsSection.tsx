import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { MessageSquare, Send, X, Sparkles, ShieldCheck, Loader2 } from "lucide-react";

type Review = {
  id: string;
  first_name: string;
  last_name: string;
  content: string;
  ai_reply: string | null;
  admin_reply: string | null;
  created_at: string;
};

export default function ReviewsSection() {
  const [rows, setRows] = useState<Review[]>([]);
  const [open, setOpen] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("reviews")
      .select("id,first_name,last_name,content,ai_reply,admin_reply,created_at")
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(50);
    setRows((data as any) || []);
  };
  useEffect(() => { load(); }, []);

  return (
    <section id="reviews" className="px-4 md:px-8 py-16 border-t border-white/10">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="text-center space-y-3">
          <h2 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-[#E7C768] to-[#F2D98A] bg-clip-text text-transparent">
            Отзывы
          </h2>
          <p className="text-slate-300 max-w-2xl mx-auto">
            Что говорят пользователи о Роботе Рекрутере. Оставьте свой отзыв — это анонимно, нужно только указать имя и фамилию.
          </p>
          <button
            onClick={() => setOpen(true)}
            className="btn-brand-gold inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold"
          >
            <MessageSquare className="w-4 h-4" /> Оставить отзыв
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="text-center text-slate-400 py-10">Пока нет отзывов — будьте первым.</div>
        ) : (
          <Carousel
            opts={{ loop: true, align: "start" }}
            className="w-full"
          >
            <CarouselContent className="-ml-4">
              {rows.map((r) => (
                <CarouselItem key={r.id} className="pl-4 basis-full md:basis-1/2 lg:basis-1/3">
                  <ReviewCard r={r} />
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="left-0 md:-left-10 border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white" />
            <CarouselNext className="right-0 md:-right-10 border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white" />
          </Carousel>
        )}
      </div>

      {open && <ReviewModal onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load(); }} />}
    </section>
  );
}

function ReviewCard({ r }: { r: Review }) {
  const date = new Date(r.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  const initials = `${(r.first_name[0] || "?").toUpperCase()}${(r.last_name[0] || "").toUpperCase()}`;
  return (
    <article className="bg-[#1D3E5E]/80 border border-white/10 rounded-2xl p-5 space-y-3 backdrop-blur h-full">
      <header className="flex items-center justify-between">
        <div>
          <div className="font-bold text-white">{r.first_name} {r.last_name}</div>
          <div className="text-xs text-slate-400">{date}</div>
        </div>
        <div className="w-10 h-10 rounded-full bg-[#E7C768]/20 text-[#E7C768] flex items-center justify-center text-sm font-bold">
          {initials}
        </div>
      </header>
      <p className="text-slate-200 text-sm whitespace-pre-wrap">{r.content}</p>

      {r.ai_reply && (
        <div className="mt-2 rounded-xl bg-[#17344F]/60 border border-[#E7C768]/30 p-3 space-y-1">
          <div className="text-xs text-[#E7C768] font-bold inline-flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Ответ ИИ Робота Рекрутера
          </div>
          <p className="text-slate-200 text-xs whitespace-pre-wrap">{r.ai_reply}</p>
        </div>
      )}
      {r.admin_reply && (
        <div className="mt-2 rounded-xl bg-emerald-900/30 border border-emerald-400/30 p-3 space-y-1">
          <div className="text-xs text-emerald-300 font-bold inline-flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" /> Ответ команды HR-RR
          </div>
          <p className="text-slate-200 text-xs whitespace-pre-wrap">{r.admin_reply}</p>
        </div>
      )}
    </article>
  );
}

function ReviewModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    const fn = firstName.trim(), ln = lastName.trim(), c = content.trim();
    if (!fn || !ln || !c) { setErr("Заполните все поля"); return; }
    if (c.length > 500) { setErr("Текст до 500 символов"); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("reviews-submit", {
        body: { first_name: fn, last_name: ln, content: c },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error(String((data as any).error));
      onSaved();
    } catch (e: any) {
      setErr(e?.message || "Не удалось отправить отзыв");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="brand-editor w-full max-w-lg rounded-3xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold bg-gradient-to-r from-[#E7C768] to-[#F2D98A] bg-clip-text text-transparent">
            Оставить отзыв
          </h3>
          <button onClick={onClose} className="text-slate-300 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-300">Имя</label>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value.slice(0, 50))}
              className="w-full mt-1 rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-white outline-none focus:border-[#E7C768]"
              placeholder="Иван" />
          </div>
          <div>
            <label className="text-xs text-slate-300">Фамилия</label>
            <input value={lastName} onChange={(e) => setLastName(e.target.value.slice(0, 50))}
              className="w-full mt-1 rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-white outline-none focus:border-[#E7C768]"
              placeholder="Иванов" />
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-300">Текст отзыва ({content.length}/500)</label>
          <textarea value={content} onChange={(e) => setContent(e.target.value.slice(0, 500))} rows={5}
            className="w-full mt-1 rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-white outline-none focus:border-[#E7C768]"
            placeholder="Поделитесь впечатлениями…" />
        </div>

        {err && <div className="text-rose-300 text-sm">{err}</div>}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-brand-secondary px-4 py-2 rounded-xl">Отмена</button>
          <button onClick={submit} disabled={busy} className="btn-brand-primary inline-flex items-center gap-2 px-5 py-2 rounded-xl font-bold">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Отправить
          </button>
        </div>
      </div>
    </div>
  );
}
