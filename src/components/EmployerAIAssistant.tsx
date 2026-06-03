/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MessageSquare, Send, X, Bot, Sparkles, Coins, Zap } from "lucide-react";
import Mascot from "./Mascot";
import Markdown from "react-markdown";

interface ChatMessage {
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
}

export default function EmployerAIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Initialize with a welcome message
  useEffect(() => {
    const savedMessages = localStorage.getItem("employer_assistant_chat_v1");
    if (savedMessages) {
      try {
        setMessages(JSON.parse(savedMessages));
        return;
      } catch (err) {
        console.error("Failed to parse saved chat", err);
      }
    }
    
    // Default initial message
    const initialMsg: ChatMessage = {
      sender: "assistant",
      text: "Здравствуйте! Я ИИ-Ассистент платформы «Робот Рекрутер» (RR). 🤖\n\nЯ с удовольствием расскажу вам про наши интеллектуальные модули, возможности RPA-найма, помогу сориентироваться в тарифной сетке и ценах, а также раскрою детали про наш приветственный бонус в 1000 RR! Чего бы вы хотели узнать в первую очередь?",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages([initialMsg]);
  }, []);

  // Save messages to local storage on change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem("employer_assistant_chat_v1", JSON.stringify(messages));
    }
  }, [messages]);

  // Scroll to bottom on updates
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 80);
    }
  }, [messages, isOpen]);

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim()) return;

    const userMsg: ChatMessage = {
      sender: "user",
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsTyping(true);

    try {
      // Map candidates API format or simple employer text assist
      const response = await fetch("/api/employer-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userQuestion: textToSend,
          messages: messages.concat(userMsg).map((m) => ({
            sender: m.sender,
            text: m.text,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to communicate with employer assistant");
      }

      const data = await response.json();
      const assistantMsg: ChatMessage = {
        sender: "assistant",
        text: data.reply || "Извините, возникли временные трудности с ответом. Попробуйте ещё раз!",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      console.error(err);
      const errorMsg: ChatMessage = {
        sender: "assistant",
        text: "Произошла сетевая ошибка при запросе к ИИ-Ассистенту. Пожалуйста, проверьте интернет и повторите попытку.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const clearChat = () => {
    if (window.confirm("Очистить историю диалога с ассистентом?")) {
      const initialMsg: ChatMessage = {
        sender: "assistant",
        text: "Диалог сброшен. Как я могу помочь вам сейчас по продукту Робот Рекрутер (RR) и ценам?",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages([initialMsg]);
      localStorage.removeItem("employer_assistant_chat_v1");
    }
  };

  const presetQuestions = [
    { label: "Что такое Робот Рекрутер?", text: "Расскажи подробнее про продукт Робот Рекрутер (RR)" },
    { label: "Какие цены и тарифы?", text: "Расскажи про все тарифы, цены и сколько стоят ИИ услуги в рублях" },
    { label: "Весь функционал", text: "Перечисли весь основной функционал платформы и возможности автоматизации" },
    { label: "Подарок 1000 RR", text: "Как получить приветственные 1000 RR на баланс при регистрации?" },
  ];

  return (
    <>
      {/* Floating Trigger Button in Right Bottom Corner with nice layout pulse animations */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        <AnimatePresence>
          {!isOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 15 }}
              className="bg-[#17344F] border border-[#E7C768]/40 hover:border-[#E7C768] text-white px-3.5 py-2 rounded-2xl shadow-xl text-[11px] font-semibold mb-1 mr-1 flex items-center gap-1.5 cursor-pointer select-none"
              onClick={() => setIsOpen(true)}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>ИИ-Ассистент RR онлайн</span>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          id="employer_assist_toggle_btn"
          onClick={() => setIsOpen(!isOpen)}
          className={`relative w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition hover:scale-110 active:scale-95 cursor-pointer ${
            isOpen 
              ? "bg-[#FF1A1A] text-white" 
              : "bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-white"
          }`}
          whileHover={{ y: -3 }}
          animate={{
            boxShadow: isOpen 
              ? "0 10px 25px -5px rgba(0, 0, 0, 0.4)" 
              : ["0 0px 0px 0px rgba(231,199,104,0)", "0 0px 15px 4px rgba(231,199,104,0.3)", "0 0px 0px 0px rgba(231,199,104,0)"]
          }}
          transition={{
            boxShadow: {
              repeat: Infinity,
              duration: 3,
              ease: "easeInOut"
            }
          }}
        >
          {isOpen ? (
            <X className="w-6 h-6 animate-spin-once" />
          ) : (
            <div className="relative">
              <MessageSquare className="w-6 h-6 animate-pulse-slow" />
              <span className="absolute -top-1.5 -right-1.5 bg-[#E7C768] w-4.5 h-4.5 rounded-full border border-[#17344F] flex items-center justify-center text-[8.5px] font-black text-slate-900 font-mono">
                AI
              </span>
            </div>
          )}
        </motion.button>
      </div>

      {/* Floating Dialogue Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            id="employer_assist_chat_window"
            initial={{ opacity: 0, scale: 0.95, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 30 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            className="fixed bottom-24 right-6 z-50 w-[380px] h-[550px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-8rem)] bg-[#1D3E5E]/95 backdrop-blur-md border border-[#E7C768]/30 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-white"
          >
            {/* Header info */}
            <div className="bg-gradient-to-r from-[#17344F] to-[#265582] p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-left">
                <Mascot state="chat" size="sm" className="scale-75 -my-2.5 -ml-1" />
                <div>
                  <h3 className="font-extrabold text-xs text-[#E7C768] flex items-center gap-1.5 leading-none">
                    <span>ИИ-Ассистент Робот Рекрутер</span>
                    <Sparkles className="w-3 h-3 text-[#E7C768] fill-[#E7C768]/20" />
                  </h3>
                  <p className="text-[9.5px] text-slate-300 mt-1 flex items-center gap-1 leading-none">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block"></span>
                    <span>Консультант по платформе</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={clearChat}
                  title="Очистить чат"
                  className="p-1 px-1.5 bg-white/5 border border-white/10 text-slate-400 hover:text-white rounded-lg text-[9px] font-bold tracking-wider hover:bg-white/10 transition"
                >
                  СБРОС
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-white/15 text-slate-300 hover:text-white transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Chat message body list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs pr-2 scrollbar-thin text-left">
              {messages.map((m, i) => {
                const isAssistant = m.sender === "assistant";
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: Math.min(0.15, i * 0.05) }}
                    className={`flex flex-col max-w-[85%] ${
                      isAssistant ? "mr-auto text-left" : "ml-auto text-right"
                    }`}
                  >
                    <div
                      className={`p-3 rounded-2xl leading-normal font-semibold ${
                        isAssistant
                          ? "bg-white/5 border border-white/10 text-slate-100 rounded-tl-none"
                          : "bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-white rounded-tr-none shadow-md"
                      }`}
                    >
                      <div className="markdown-body">
                        <Markdown>{m.text}</Markdown>
                      </div>
                    </div>
                    <span className="text-[8px] text-slate-400 font-mono mt-1 block px-1">
                      {m.timestamp}
                    </span>
                  </motion.div>
                );
              })}

              {isTyping && (
                <div className="flex items-center gap-1 bg-white/5 border border-white/10 p-3 rounded-2xl rounded-tl-none w-max block">
                  <span className="w-1.5 h-1.5 bg-[#E7C768] rounded-full animate-bounce"></span>
                  <span className="w-1.5 h-1.5 bg-[#E7C768] rounded-full animate-bounce delay-100"></span>
                  <span className="w-1.5 h-1.5 bg-[#E7C768] rounded-full animate-bounce delay-200"></span>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Quick Questions Buttons (Stretched and clean layout above inputs) */}
            <div className="p-3 bg-[#17344F]/50 border-t border-white/5 flex flex-col gap-1.5 text-left">
              <span className="text-[9px] block text-slate-400 font-extrabold uppercase tracking-wider mb-0.5">Частые вопросы работодателей:</span>
              <div className="grid grid-cols-2 gap-1.5">
                {presetQuestions.map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSend(q.text)}
                    className="bg-white/5 border border-white/10 hover:border-[#E7C768] hover:bg-white/10 text-[10px] font-bold text-slate-200 p-2 rounded-xl text-left transition leading-snug truncate"
                    title={q.label}
                  >
                    {idx === 0 && "🤖 "}
                    {idx === 1 && "💰 "}
                    {idx === 2 && "🛠️ "}
                    {idx === 3 && "🎁 "}
                    {q.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Message input bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend(inputValue);
              }}
              className="p-3 bg-[#17344F] border-t border-white/10 flex items-center gap-2"
            >
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Запросить цены, описание..."
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
