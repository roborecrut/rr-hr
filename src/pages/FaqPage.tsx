/**
 * /faq — Вики/база знаний по продукту RR.
 * Аккордеон вопросов из таблицы faq_items + поиск по тексту.
 */
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Search, Sparkles, BookOpen } from "lucide-react";
import Markdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { useRouter } from "@/components/RouterContext";
import EmployerAIAssistant from "@/components/EmployerAIAssistant";

type FaqItem = {
  id: string;
  question: string;
  answer: string;
  category: string;
  sort_order: number;
};

const CATEGORY_LABELS: Record<string, string> = {
  product: "О продукте",
  pricing: "Цены и тарифы",
  settings: "Личный кабинет",
  candidate: "Кандидаты",
  integrations: "Интеграции",
  account: "Аккаунт и поддержка",
  general: "Общие вопросы",
};

export default function FaqPage() {
  const { navigate } = useRouter();
  const [items, setItems] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("faq_items")
        .select("id, question, answer, category, sort_order")
        .eq("is_published", true)
        .order("category", { ascending: true })
        .order("sort_order", { ascending: true });
      if (cancelled) return;
      if (!error && data) setItems(data as FaqItem[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) => it.question.toLowerCase().includes(q) || it.answer.toLowerCase().includes(q),
    );
  }, [items, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, FaqItem[]>();
    for (const it of filtered) {
      const arr = map.get(it.category) || [];
      arr.push(it);
      map.set(it.category, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#17344F] to-[#265582] text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#17344F]/95 backdrop-blur-md border-b border-white/10 px-4 md:px-8 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <button onClick={() => navigate("/")} className="flex items-center gap-3 cursor-pointer">
            <img
              src="https://rjhtauzookkvlipvqpvr.supabase.co/storage/v1/object/public/Logos/RR-Logo.png"
              alt="RR"
              className="w-10 h-10 object-contain"
            />
            <span className="text-xl font-bold bg-gradient-to-r from-[#F4EE8E] to-[#E7C768] bg-clip-text text-transparent">
              Робот Рекрутер
            </span>
          </button>
          <button
            onClick={() => navigate("/")}
            className="text-sm font-semibold text-slate-300 hover:text-white"
          >
            ← На главную
          </button>
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-4 md:px-8 py-10 md:py-16">
        {/* Hero */}
        <div className="flex flex-col md:flex-row items-center gap-6 md:gap-10 mb-10">
          <img
            src="https://rjhtauzookkvlipvqpvr.supabase.co/storage/v1/object/public/Logos/RR8.png"
            alt="RR — Вики"
            className="w-40 h-40 md:w-52 md:h-52 object-contain drop-shadow-2xl shrink-0"
          />
          <div className="flex-1 text-center md:text-left">
            <div className="inline-flex items-center gap-2 bg-[#E7C768]/15 border border-[#E7C768]/30 rounded-full px-4 py-1.5 mb-4">
              <BookOpen className="w-4 h-4 text-[#E7C768]" />
              <span className="text-xs font-bold text-[#E7C768] uppercase tracking-wider">
                Вики Робот Рекрутер
              </span>
            </div>
            <h1 className="text-3xl md:text-5xl font-bold leading-tight">
              Ответы на{" "}
              <span className="bg-gradient-to-r from-[#F4EE8E] to-[#D99E41] bg-clip-text text-transparent">
                все вопросы
              </span>{" "}
              о платформе
            </h1>
            <p className="mt-3 text-slate-200 text-base md:text-lg max-w-2xl">
              Цены, настройки кабинета работодателя, как создать вакансию, запустить ИИ-интервью и
              онбординг. Если не нашли ответ — спросите ИИ-Ассистента в правом нижнем углу.
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="sticky top-[72px] z-30 -mx-4 md:mx-0 px-4 md:px-0 py-3 bg-gradient-to-b from-[#17344F] to-transparent">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#E7C768]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по вопросам и ответам…"
              className="w-full bg-white/10 border border-white/20 rounded-2xl pl-12 pr-4 py-4 text-white placeholder-slate-400 focus:outline-none focus:border-[#E7C768] focus:bg-white/15 transition font-medium text-base"
            />
            {query && (
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-300">
                {filtered.length} {pluralize(filtered.length, "вопрос", "вопроса", "вопросов")}
              </span>
            )}
          </div>
        </div>

        {/* List */}
        <div className="mt-6 space-y-8">
          {loading && <p className="text-center text-slate-300 py-12">Загружаем базу знаний…</p>}

          {!loading && filtered.length === 0 && (
            <div className="text-center py-16 bg-white/5 border border-white/10 rounded-2xl">
              <p className="text-slate-200 text-lg">Ничего не нашли по запросу «{query}».</p>
              <p className="text-slate-400 text-sm mt-2">
                Попробуйте другую формулировку или спросите ИИ-Ассистента →
              </p>
            </div>
          )}

          {!loading &&
            grouped.map(([cat, list]) => (
              <div key={cat}>
                <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-[#E7C768] mb-3 flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  {CATEGORY_LABELS[cat] || cat}
                  <span className="text-slate-400 font-mono">({list.length})</span>
                </h2>
                <div className="space-y-2">
                  {list.map((it) => {
                    const open = openId === it.id;
                    return (
                      <div
                        key={it.id}
                        className={`bg-white/5 border rounded-2xl overflow-hidden transition ${
                          open ? "border-[#E7C768]/60 bg-white/10" : "border-white/10 hover:border-white/20"
                        }`}
                      >
                        <button
                          onClick={() => setOpenId(open ? null : it.id)}
                          className="w-full flex items-center justify-between gap-4 text-left px-5 py-4"
                        >
                          <span className="font-semibold text-white text-[15px] leading-snug">
                            {it.question}
                          </span>
                          <ChevronDown
                            className={`w-5 h-5 shrink-0 text-[#E7C768] transition-transform ${
                              open ? "rotate-180" : ""
                            }`}
                          />
                        </button>
                        {open && (
                          <div className="px-5 pb-5 -mt-1 text-slate-200 leading-relaxed text-sm border-t border-white/10 pt-4 markdown-body">
                            <Markdown>{it.answer}</Markdown>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      </section>

      <EmployerAIAssistant />
    </div>
  );
}

function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}