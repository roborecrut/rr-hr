/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from "react";
import { useRouter } from "../components/RouterContext";

export default function NotFoundPage() {
  const { navigate, path } = useRouter();

  useEffect(() => {
    console.warn("404: маршрут не найден ->", path);
  }, [path]);

  return (
    <div className="main-gradient min-h-screen flex items-center justify-center px-6 text-white">
      <div className="max-w-xl w-full text-center">
        <div className="gold-gradient inline-block text-transparent bg-clip-text text-7xl font-bold mb-4">
          404
        </div>
        <h1 className="text-3xl font-semibold mb-3">Страница не найдена</h1>
        <p className="text-white/70 mb-8">
          Адрес <code className="px-2 py-1 rounded bg-white/10">{path}</code> не существует
          или был перемещён. Вернитесь на главную и продолжите работу с RR.
        </p>
        <div className="flex gap-3 justify-center flex-wrap">
          <button
            onClick={() => navigate("/main")}
            className="px-6 py-3 rounded-lg bg-[#E7C768] text-[#17344F] font-semibold hover:opacity-90 transition"
          >
            На главную
          </button>
          <button
            onClick={() => navigate("/vacancy")}
            className="px-6 py-3 rounded-lg border border-white/30 text-white hover:bg-white/10 transition"
          >
            Каталог вакансий
          </button>
        </div>
      </div>
    </div>
  );
}
