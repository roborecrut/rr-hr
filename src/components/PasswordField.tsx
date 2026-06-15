import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

type Props = {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  className?: string;
};

/**
 * Reusable password input with show/hide toggle. Visual style matches the
 * dark brand glass forms used across employer and candidate panels.
 */
export default function PasswordField({
  label, value, onChange, placeholder = "••••••••", autoComplete = "current-password", className,
}: Props) {
  const [show, setShow] = useState(false);
  return (
    <div className={`space-y-1 ${className || ""}`}>
      {label && <label className="text-[10px] font-bold text-slate-400 block">{label}</label>}
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-[#17344F] text-xs text-white p-2 pr-9 rounded-lg border border-white/10 focus:outline-none focus:border-[#E7C768]"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Скрыть пароль" : "Показать пароль"}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white transition"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}