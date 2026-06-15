/**
 * Email + password auth modal for candidates.
 * Always scoped to a specific vacancy (project) and its company.
 * On success stores a candidate session and calls onSuccess(publicId).
 */
import { useState } from "react";
import { X, Mail, Lock, Loader, CheckCircle, Phone, User, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { saveCandidateSession } from "@/lib/candidateSession";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  companyId?: string | null;
  roleName?: string;
  companyName?: string;
  onSuccess: (publicId: string, info?: { candidatePub?: string; projectPub?: string; companyPub?: string }) => void;
};

type Tab = "signup" | "login";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9 ()\-]{7,20}$/;

export default function CandidateAuthModal({
  isOpen, onClose, projectId, companyId, roleName, companyName, onSuccess,
}: Props) {
  const [tab, setTab] = useState<Tab>("signup");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);

  if (!isOpen) return null;

  const errorText = (code: string) => ({
    bad_email: "Введите корректный email",
    bad_password: "Пароль должен быть не короче 8 символов",
    bad_full_name: "Введите ФИО",
    bad_phone: "Введите корректный номер телефона",
    email_taken: "Этот email уже зарегистрирован — войдите",
    bad_credentials: "Неверный email или пароль",
    wrong_password: "Этот email уже используется с другим паролем",
    no_project: "Вакансия не найдена",
  }[code] || "Не удалось выполнить запрос");

  const submit = async () => {
    setErr("");
    if (!EMAIL_RE.test(email.trim())) { setErr("Введите корректный email"); return; }
    if (tab === "signup" && fullName.trim().length < 2) { setErr("Введите ФИО"); return; }
    if (pw.length < 8) { setErr("Пароль должен быть не короче 8 символов"); return; }
    if (tab === "signup" && pw !== pw2) { setErr("Пароли не совпадают"); return; }
    if (tab === "signup" && !PHONE_RE.test(phone.trim())) { setErr("Введите корректный номер телефона"); return; }

    setBusy(true);
    try {
      const rpc = tab === "signup" ? "candidate_email_signup" : "candidate_email_login";
      const args: any = tab === "signup"
        ? { _email: email.trim(), _password: pw, _project: projectId, _company: companyId || null, _phone: phone.trim(), _full_name: fullName.trim() }
        : { _email: email.trim(), _password: pw, _project: projectId };
      const { data, error } = await supabase.rpc(rpc, args);
      if (error) throw error;
      const res = data as any;
      if (!res?.ok) { setErr(errorText(res?.error || "")); setBusy(false); return; }

      saveCandidateSession({
        token: res.token,
        candidate_id: res.candidate_id,
        public_id: res.public_id,
        project_id: res.project_id ?? projectId,
        company_id: res.company_id ?? companyId ?? null,
        email: email.trim().toLowerCase(),
        full_name: res.full_name || fullName.trim() || null,
        applications: Array.isArray(res.applications) ? res.applications : undefined,
      });
      setOk(true);
      setTimeout(() => {
        setOk(false);
        setBusy(false);
        onSuccess(res.public_id || res.candidate_id, {
          candidatePub: res.public_id,
          projectPub: res.project_public_id,
          companyPub: res.company_public_id,
        });
      }, 700);
    } catch (e: any) {
      // Не показываем сырое серверное сообщение пользователю.
      setErr("Не удалось войти. Проверьте e-mail и пароль или попробуйте позже.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#1D3E5E] border-2 border-[#E7C768]/50 text-white rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-full text-slate-300 hover:bg-white/10 hover:text-white">
          <X className="w-5 h-5" />
        </button>

        {ok ? (
          <div className="py-8 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center">
              <CheckCircle className="w-7 h-7 text-emerald-300" />
            </div>
            <p className="text-emerald-200 font-bold">Готово! Открываем кабинет...</p>
          </div>
        ) : (
          <>
            <div className="text-center space-y-1">
              <h3 className="text-xl font-black text-[#E7C768]">Кабинет кандидата</h3>
              <p className="text-xs text-slate-300">
                {roleName ? <>Вакансия: <b className="text-white">{roleName}</b></> : null}
                {companyName ? <> · {companyName}</> : null}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-1 bg-black/30 p-1 rounded-xl">
              {(["signup","login"] as Tab[]).map(t => (
                <button key={t}
                  onClick={() => { setTab(t); setErr(""); }}
                  className={`py-2 text-xs font-bold rounded-lg transition ${
                    tab===t ? "bg-[#E7C768] text-[#112335]" : "text-slate-300 hover:text-white"
                  }`}>
                  {t === "signup" ? "Регистрация" : "Вход"}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {tab === "signup" && (
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">ФИО</span>
                  <div className="mt-1 flex items-center gap-2 bg-black/30 border border-white/10 rounded-xl px-3 py-2.5">
                    <User className="w-4 h-4 text-slate-400" />
                    <input
                      type="text" autoComplete="name" value={fullName}
                      onChange={e => setFullName(e.target.value)} placeholder="Иванов Иван Иванович"
                      className="bg-transparent outline-none w-full text-sm text-white placeholder:text-slate-500"
                    />
                  </div>
                </label>
              )}
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Email</span>
                <div className="mt-1 flex items-center gap-2 bg-black/30 border border-white/10 rounded-xl px-3 py-2.5">
                  <Mail className="w-4 h-4 text-slate-400" />
                  <input
                    type="email" autoComplete="email" value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="bg-transparent outline-none w-full text-sm text-white placeholder:text-slate-500"
                  />
                </div>
              </label>
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Пароль (мин. 8 символов)</span>
                <div className="mt-1 flex items-center gap-2 bg-black/30 border border-white/10 rounded-xl px-3 py-2.5">
                  <Lock className="w-4 h-4 text-slate-400" />
                  <input
                    type={showPw ? "text" : "password"} autoComplete={tab==="signup"?"new-password":"current-password"} value={pw}
                    onChange={e => setPw(e.target.value)} placeholder="••••••••"
                    className="bg-transparent outline-none w-full text-sm text-white placeholder:text-slate-500"
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    aria-label={showPw ? "Скрыть пароль" : "Показать пароль"}
                    className="p-1 text-slate-400 hover:text-white transition">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </label>
              {tab === "signup" && (
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Повторите пароль</span>
                  <div className="mt-1 flex items-center gap-2 bg-black/30 border border-white/10 rounded-xl px-3 py-2.5">
                    <Lock className="w-4 h-4 text-slate-400" />
                    <input
                      type={showPw2 ? "text" : "password"} autoComplete="new-password" value={pw2}
                      onChange={e => setPw2(e.target.value)} placeholder="••••••••"
                      className="bg-transparent outline-none w-full text-sm text-white placeholder:text-slate-500"
                    />
                    <button type="button" onClick={() => setShowPw2(v => !v)}
                      aria-label={showPw2 ? "Скрыть пароль" : "Показать пароль"}
                      className="p-1 text-slate-400 hover:text-white transition">
                      {showPw2 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </label>
              )}
              {tab === "signup" && (
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Телефон</span>
                  <div className="mt-1 flex items-center gap-2 bg-black/30 border border-white/10 rounded-xl px-3 py-2.5">
                    <Phone className="w-4 h-4 text-slate-400" />
                    <input
                      type="tel" inputMode="tel" autoComplete="tel" value={phone}
                      onChange={e => setPhone(e.target.value)} placeholder="+7 (900) 123-45-67"
                      className="bg-transparent outline-none w-full text-sm text-white placeholder:text-slate-500"
                    />
                  </div>
                </label>
              )}
            </div>

            {err && (
              <div className="text-xs text-red-300 bg-red-950/40 border border-red-500/30 rounded-xl px-3 py-2">
                ⚠️ {err}
              </div>
            )}

            <button
              onClick={submit} disabled={busy}
              className="w-full bg-[#E7C768] text-[#112335] font-extrabold text-sm py-3 rounded-2xl hover:bg-[#F4EE8E] disabled:opacity-60 flex items-center justify-center gap-2">
              {busy ? <Loader className="w-4 h-4 animate-spin" /> : null}
              {tab === "signup" ? "Создать кабинет" : "Войти"}
            </button>

            <p className="text-[10px] text-slate-400 text-center">
              Подтверждение email не требуется. Пароль хранится в зашифрованном виде.
            </p>
          </>
        )}
      </div>
    </div>
  );
}