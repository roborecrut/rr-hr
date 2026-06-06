/**
 * Страницы возврата с платёжки Робокассы.
 * /payment/success и /payment/fail.
 */
import { useNavigate } from "react-router-dom";
import { CheckCircle2, XCircle } from "lucide-react";

const IMG_SUCCESS = "https://rjhtauzookkvlipvqpvr.supabase.co/storage/v1/object/public/Logos/RR5.png";
const IMG_FAIL = "https://rjhtauzookkvlipvqpvr.supabase.co/storage/v1/object/public/Logos/RR9.png";

function Requisites() {
  return (
    <div className="text-[10px] text-slate-400 leading-relaxed text-center mt-8 max-w-2xl mx-auto">
      ООО «РентРоп» · ИНН 7726477438 · ОГРН 1217700234157 ·
      115191, г. Москва, пер. Духовской, д. 17, стр. 15, помещ. 11Н/2 ·{" "}
      <a href="mailto:info@arenda-ropa.com" className="text-[#E7C768] hover:underline">info@arenda-ropa.com</a>
    </div>
  );
}

export function PaymentSuccessPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-[#0F2A45] text-white flex flex-col items-center justify-center px-4 py-10">
      <div className="bg-[#17344F] border-2 border-emerald-500/40 rounded-3xl p-8 md:p-10 max-w-md w-full text-center shadow-2xl space-y-5">
        <img src={IMG_SUCCESS} alt="Оплата прошла" className="w-48 h-48 object-contain mx-auto" />
        <div className="flex items-center justify-center gap-2 text-emerald-400">
          <CheckCircle2 className="w-6 h-6" />
          <h1 className="text-2xl font-black text-[#E7C768]">Оплата прошла успешно</h1>
        </div>
        <p className="text-sm text-slate-200">
          Цифровые единицы RR зачислены на ваш баланс. Если в течение нескольких минут баланс
          не обновился, обновите страницу личного кабинета.
        </p>
        <button
          onClick={() => navigate("/employer")}
          className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-[#17344F] font-black uppercase tracking-wider text-sm py-3 rounded-2xl hover:brightness-110 transition"
        >
          Вернуться в счета
        </button>
      </div>
      <Requisites />
    </div>
  );
}

export function PaymentFailPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-[#0F2A45] text-white flex flex-col items-center justify-center px-4 py-10">
      <div className="bg-[#17344F] border-2 border-rose-500/40 rounded-3xl p-8 md:p-10 max-w-md w-full text-center shadow-2xl space-y-5">
        <img src={IMG_FAIL} alt="Оплата не прошла" className="w-48 h-48 object-contain mx-auto" />
        <div className="flex items-center justify-center gap-2 text-rose-400">
          <XCircle className="w-6 h-6" />
          <h1 className="text-2xl font-black text-[#E7C768]">Оплата не прошла</h1>
        </div>
        <p className="text-sm text-slate-200">
          К сожалению, платёж не был завершён. Денежные средства не списаны.
          Вы можете попробовать оплатить ещё раз в личном кабинете.
        </p>
        <button
          onClick={() => navigate("/employer")}
          className="w-full bg-gradient-to-r from-rose-500 to-rose-600 text-white font-black uppercase tracking-wider text-sm py-3 rounded-2xl hover:brightness-110 transition"
        >
          Вернуться в счета
        </button>
      </div>
      <Requisites />
    </div>
  );
}