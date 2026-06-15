import { useEffect, useState } from "react";

/**
 * Посимвольный typewriter без мигающего курсора.
 * cps — символов в секунду (по умолчанию 40 — короткое сообщение
 * 15–20 слов появляется примерно за 1–2 секунды).
 */
export function useTypewriter(text: string, cps: number = 40): string {
  const [shown, setShown] = useState("");
  useEffect(() => {
    setShown("");
    if (!text) return;
    const intervalMs = Math.max(20, Math.round(1000 / Math.max(1, cps)));
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, intervalMs);
    return () => clearInterval(id);
  }, [text, cps]);
  return shown;
}

export default useTypewriter;