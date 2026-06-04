/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { useRouter } from "../components/RouterContext";
import Mascot from "../components/Mascot";
import { BASIC_SPECIALTIES } from "../types";
import AuthModal from "../components/AuthModal";
import HiringCalculator from "../components/HiringCalculator";
import EmployerAIAssistant from "../components/EmployerAIAssistant";
import { supabase } from "@/integrations/supabase/client";
import { resolveProfilePathForUser } from "@/lib/links";
import { 
  Users, 
  Award, 
  Cpu, 
  MessageSquare, 
  BookOpen, 
  TrendingUp, 
  Briefcase, 
  Search, 
  ArrowRight,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Layers,
  Heart,
  Menu,
  X,
  Send,
  Chrome
} from "lucide-react";

export default function LandingPage() {
  const { navigate, path } = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // "Личный кабинет RR" — если юзер уже залогинен, ведём в его реальный кабинет.
  const handleOpenCabinet = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const target = await resolveProfilePathForUser(user.id);
        if (target && target !== "/") {
          navigate(target);
          return;
        }
      }
    } catch {/* fall through to modal */}
    setIsAuthModalOpen(true);
  };

      {/* Hiring Calculator: Robot vs Human */}
      <section className="py-20 px-4 md:px-8 bg-[#1D3E5E]/40 border-t border-b border-white/10 relative overflow-hidden" id="tariffs">
        <div className="max-w-5xl mx-auto space-y-8 relative z-10">
          <div className="text-center space-y-3">
            <span className="bg-[#E7C768]/15 text-[#E7C768] font-bold text-xs uppercase tracking-wider px-3.5 py-1.5 rounded-full border border-[#E7C768]/20">
              Сравнение с HR
            </span>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-white">
              ИИ дешевле и быстрее живого HR
            </h2>
            <p className="text-gray-300 text-sm md:text-base max-w-2xl mx-auto leading-relaxed">
              Выберите количество готовых сотрудников — мы покажем стоимость и время для двух сценариев.
            </p>
          </div>
          <HiringCalculator />
        </div>
      </section>


      {/* Styled Theme Footer with NO Black background */}
      <footer className="bg-[#17344F] text-white py-12 px-4 md:px-8 border-t-2 border-[#E7C768]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <img 
              src="https://i.ibb.co/WWRbtPq0/RR-Logo.png" 
              alt="RR Logo" 
              className="w-10 h-10 object-contain" 
              referrerPolicy="no-referrer"
            />
            <div className="text-left font-bold text-sm text-[#E7C768]">
              © 2026 Робот Рекрутер RR
              <span className="text-xs text-slate-300 block font-normal">Безоговорочная роботизация подбора персонала</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-6 text-xs text-slate-300">
            <button onClick={() => navigate("/main")} className="hover:text-white transition">Главная</button>
            <button onClick={() => navigate("/vacancy")} className="hover:text-[#E7C768] transition">Каталог должностей</button>
            <button onClick={() => navigate("/employer")} className="hover:text-white transition">Панель Руководителя</button>
            <button onClick={() => navigate("/candidate")} className="hover:text-white transition">Панель Кандидата</button>
            <button onClick={() => setIsAuthModalOpen(true)} className="hover:text-white transition font-bold text-[#E7C768]">Авторизация</button>
          </div>
        </div>
      </footer>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      <EmployerAIAssistant />
    </div>
  );
}
