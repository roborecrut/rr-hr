import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Send, X, Sparkles } from "lucide-react";
import RichMarkdown from "@/components/RichMarkdown";
import { aiChat } from "@/lib/aiClient";

interface ChatMsg {
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
}

const FALLBACK_LOGO =
  "https://rjhtauzookkvlipvqpvr.supabase.co/storage/v1/object/public/Logos/RR-Logo.png";

/**
 * Floating AI assistant for the vacancy landing page.
 * Visually mirrors the main-landing EmployerAIAssistant
 * (blue gradient circle + pulsing gold ring + AI badge),
 * but uses the company logo and a vacancy-specific knowledge base.
 */
export default function VacancyAIAssistant({
  logoUrl,
  companyName,
  roleName,
  context,
  projectId,
}: {
  logoUrl?: string | null;
  companyName?: string | null;
  roleName?: string | null;
  context: string;
  projectId?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Seed with a friendly greeting unique to this vacancy
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          sender: "assistant",
          text: `Здравствуйте! Я ИИ-консультант по вакансии${roleName ? ` «${roleName}»` : ""}${
            companyName ? ` в компании ${companyName}` : ""
          }. Спросите про обязанности, график, оплату, оформление или процесс отбора — отвечу на основе данных этой вакансии.`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleName, companyName]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
    }
  }, [messages, isOpen]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || isTyping) return;
    const userMsg: ChatMsg = {
      sender: "user",
      text: t,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages(prev => [...prev, userMsg]);
    setInputValue("");
    setIsTyping(true);
    try {
      const history = messages.map(m => ({
        role: (m.sender === "user" ? "user" : "assistant") as "user" | "assistant",
        content: m.text,
      }));
      const reply = await aiChat({
        kind: "vacancy_consultant",
        project_id: projectId,
        context,
        messages: [...history, { role: "user", content: t }],
      });
      setMessages(prev => [
        ...prev,
        {
          sender: "assistant",
          text: reply || "Извините, ИИ-консультант временно недоступен. Попробуйте ещё раз.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } catch (e: any) {
      const detail = (e?.message || "").toString().slice(0, 300);
      setMessages(prev => [
        ...prev,
        {
          sender: "assistant",
          text:
            "Не удалось получить ответ от ИИ-консультанта. " +
            (detail ? `Причина: ${detail}. ` : "") +
            "Попробуйте задать вопрос ещё раз — иногда модель отвечает со второго запроса.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
      // eslint-disable-next-line no-console
      console.error("[VacancyAIAssistant] aiChat failed", e);
    } finally {
      setIsTyping(false);
    }
  };

  const preset = [
    "Какие основные обязанности?",
    "Какой график работы?",
    "Какая оплата и бонусы?",
    "Как проходит отбор?",
  ];

  return (
    <>
      {/* Floating Trigger Button — blue gradient circle, pulsing gold ring, AI badge */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        <motion.button
          type="button"
          onClick={() => setIsOpen(o => !o)}
          aria-label={isOpen ? "Закрыть ИИ-консультанта" : "Открыть ИИ-консультанта"}
          title="ИИ-консультант по вакансии"
          className="relative w-16 h-16 rounded-full flex items-center justify-center transition hover:scale-110 active:scale-95 cursor-pointer border-2 bg-gradient-to-br from-[#17344F] to-[#265582] border-[#E7C768] text-white"
          whileHover={{ y: -3 }}
          animate={{
            boxShadow: isOpen
              ? "0 0 25px 6px rgba(231,199,104,0.55)"
              : [
                  "0 0 0px 0px rgba(231,199,104,0.0)",
                  "0 0 22px 6px rgba(231,199,104,0.55)",
                  "0 0 0px 0px rgba(231,199,104,0.0)",
                ],
          }}
          transition={{ boxShadow: { repeat: Infinity, duration: 2.6, ease: "easeInOut" } }}
        >
          {isOpen ? (
            <X className="w-6 h-6" />
          ) : (
            <div className="relative">
              <img
                src={logoUrl || FALLBACK_LOGO}
                alt={companyName || "Компания"}
                className="w-9 h-9 object-contain drop-shadow rounded-full bg-white/5"
                referrerPolicy="no-referrer"
                onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_LOGO; }}
              />
              <span className="absolute -top-1.5 -right-2 bg-gradient-to-br from-[#F4EE8E] to-[#D99E41] w-5 h-5 rounded-full border border-[#17344F] flex items-center justify-center text-[8.5px] font-black text-[#17344F] font-mono shadow">
                AI
              </span>
            </div>
          )}
        </motion.button>
      </div>

      {/* Chat window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 30 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            className="fixed bottom-24 right-6 z-50 w-[380px] h-[550px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-8rem)] bg-[#1D3E5E]/95 backdrop-blur-md border border-[#E7C768]/30 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-white"
          >
            <div className="bg-gradient-to-r from-[#17344F] to-[#265582] p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-left">
                <img
                  src={logoUrl || FALLBACK_LOGO}
                  alt={companyName || "Компания"}
                  className="w-9 h-9 object-contain rounded-full bg-white/5 border border-[#E7C768]/30"
                  referrerPolicy="no-referrer"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_LOGO; }}
                />
                <div>
                  <h3 className="font-extrabold text-xs text-[#E7C768] flex items-center gap-1.5 leading-none">
                    <span>ИИ-консультант по вакансии</span>
                    <Sparkles className="w-3 h-3 text-[#E7C768] fill-[#E7C768]/20" />
                  </h3>
                  <p className="text-[9.5px] text-slate-300 mt-1 leading-none truncate max-w-[200px]">
                    {roleName ? roleName : "Вакансия"}{companyName ? ` · ${companyName}` : ""}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/15 text-slate-300 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs pr-2 text-left">
              {messages.map((m, i) => {
                const isAssistant = m.sender === "assistant";
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`flex flex-col max-w-[85%] ${isAssistant ? "mr-auto text-left" : "ml-auto text-right"}`}
                  >
                    <div
                      className={`p-3 rounded-2xl leading-normal font-medium ${
                        isAssistant
                          ? "bg-white/5 border border-white/10 text-slate-100 rounded-tl-none"
                          : "bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-white rounded-tr-none shadow-md"
                      }`}
                    >
                      <div className="markdown-body">
                        <RichMarkdown tone="chat">{m.text}</RichMarkdown>
                      </div>
                    </div>
                    <span className="text-[8px] text-slate-400 font-mono mt-1 block px-1">{m.timestamp}</span>
                  </motion.div>
                );
              })}
              {isTyping && (
                <div className="flex items-center gap-1 bg-white/5 border border-white/10 p-3 rounded-2xl rounded-tl-none w-max">
                  <span className="w-1.5 h-1.5 bg-[#E7C768] rounded-full animate-bounce"></span>
                  <span className="w-1.5 h-1.5 bg-[#E7C768] rounded-full animate-bounce delay-100"></span>
                  <span className="w-1.5 h-1.5 bg-[#E7C768] rounded-full animate-bounce delay-200"></span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="p-3 bg-[#17344F]/50 border-t border-white/5 flex flex-col gap-1.5 text-left">
              <span className="text-[9px] block text-slate-400 font-extrabold uppercase tracking-wider mb-0.5">
                Частые вопросы кандидатов:
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {preset.map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => send(q)}
                    className="bg-white/5 border border-white/10 hover:border-[#E7C768] hover:bg-white/10 text-[10px] font-bold text-slate-200 p-2 rounded-xl text-left transition leading-snug truncate"
                    title={q}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); send(inputValue); }}
              className="p-3 bg-[#17344F] border-t border-white/10 flex items-center gap-2"
            >
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Спросите о вакансии…"
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-[#E7C768] transition font-medium"
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || isTyping}
                className="bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] hover:from-[#FF4D1A] text-white p-2.5 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}