/**
 * Публичная страница с офертой по адресу /offer.
 */
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import OfferContent from "@/components/OfferContent";

export default function OfferPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#17344F] text-white">
      <header className="border-b border-white/10 bg-[#17344F]">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <button onClick={() => navigate("/")} className="flex items-center gap-2 text-xs font-bold text-slate-200 hover:text-[#E7C768]">
            <ArrowLeft className="w-4 h-4" /> На главную
          </button>
          <span className="text-[10px] uppercase tracking-widest text-[#E7C768] font-mono">hr-rr.online</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-10">
        <OfferContent />
      </main>

      <footer className="border-t border-white/10 bg-[#17344F] mt-8">
        <div className="max-w-4xl mx-auto px-4 py-6 text-[11px] text-slate-400 leading-relaxed text-center">
          ООО «РентРоп» · ИНН 7726477438 · ОГРН 1217700234157 ·
          115191, г. Москва, пер. Духовской, д. 17, стр. 15, помещ. 11Н/2 ·
          <a href="mailto:info@arenda-ropa.com" className="text-[#E7C768] hover:underline ml-1">info@arenda-ropa.com</a>
        </div>
      </footer>
    </div>
  );
}