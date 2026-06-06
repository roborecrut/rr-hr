/**
 * Попап с публичной офертой. Кнопка «Принять» активируется только после
 * скролла до самого низа (как просил пользователь).
 */
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import OfferContent from "./OfferContent";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAccept?: () => void;
}

export default function OfferDialog({ isOpen, onClose, onAccept }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [reachedEnd, setReachedEnd] = useState(false);

  useEffect(() => { if (isOpen) setReachedEnd(false); }, [isOpen]);

  if (!isOpen) return null;

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setReachedEnd(true);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 md:p-6 bg-black/85 backdrop-blur-md">
      <div className="bg-[#17344F] border-2 border-[#E7C768]/40 text-white rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-sm md:text-base font-black text-[#E7C768] uppercase tracking-wider">Публичная оферта</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-slate-300 hover:text-white" title="Закрыть">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div ref={scrollRef} onScroll={onScroll} className="overflow-y-auto px-5 py-5 flex-1">
          <OfferContent />
          <div className="h-2" />
        </div>

        <div className="px-5 py-4 border-t border-white/10 flex items-center justify-between gap-3 bg-black/30">
          <p className="text-[11px] text-slate-300">
            {reachedEnd ? "Вы ознакомились с офертой полностью." : "Прокрутите до конца, чтобы подтвердить ознакомление."}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-200 bg-white/5 hover:bg-white/10">Закрыть</button>
            {onAccept && (
              <button
                disabled={!reachedEnd}
                onClick={() => { onAccept(); onClose(); }}
                className="px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-gradient-to-r from-emerald-500 to-emerald-600 text-[#17344F] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Принимаю
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}