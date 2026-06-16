/**
 * OnboardingHost — единый сквозной велком-тур работодателя.
 *
 * При первом входе в личный кабинет запускается одна последовательность,
 * которая ведёт пользователя по всей навигации: рассказывает, что такое
 * RR-сервис в целом, и поочерёдно подсвечивает каждый раздел в сайдбаре
 * (Профиль → Компании → Вакансии → Обучение → Интервью → CRM → Тариф),
 * объясняя что там делать, какие шаги выполнить и какой результат получить.
 *
 * Тексты разделов берутся из таблицы `onboarding_content`
 * (kind = 'section_welcome'), статус прохождения хранится в
 * `employer_tour_state` с ключом section = 'global'.
 *
 * Пропсы: `autoStart` — если true и тур ещё не пройден, запустится сам.
 * Компонент также экспортирует кнопку «Запустить вводный тур»,
 * которую можно отрендерить отдельно через слот children-free вариант.
 */
import { useEffect, useCallback } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { Play } from "lucide-react";
import {
  type OnboardingSection,
  getSectionWelcome,
  loadOnboarding,
} from "@/lib/onboarding";
import { supabase } from "@/integrations/supabase/client";

/* ------------------------------------------------------------------ */
/* Tour status helpers (используют synthetic section = 'global')      */
/* ------------------------------------------------------------------ */

const GLOBAL_KEY = "global";

async function getGlobalTourStatus(): Promise<"pending" | "completed" | "dismissed"> {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return "completed";
  const { data } = await supabase
    .from("employer_tour_state" as any)
    .select("status")
    .eq("user_id", u.user.id)
    .eq("section", GLOBAL_KEY)
    .maybeSingle();
  return ((data as any)?.status as any) || "pending";
}

async function setGlobalTourStatus(status: "completed" | "dismissed") {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return;
  await supabase.from("employer_tour_state" as any).upsert(
    {
      user_id: u.user.id,
      section: GLOBAL_KEY,
      status,
      completed_at: status === "completed" ? new Date().toISOString() : null,
    },
    { onConflict: "user_id,section" },
  );
}

/* ------------------------------------------------------------------ */
/* Шаги тура — порядок навигации RR                                   */
/* ------------------------------------------------------------------ */

type Step = {
  selector?: string;
  section?: OnboardingSection;
  title: string;
  fallback: string;
};

const STEPS: Step[] = [
  {
    title: "Добро пожаловать в RR — ваш ИИ-рекрутер 👋",
    fallback:
      "Это **Пульт Управления Рекрутом**. Здесь живёт ваш ИИ-рекрутер, который сам ищет, прозванивает, обучает и оценивает кандидатов 24/7.\n\nЧтобы получить результат — наняли подходящего человека — нужно пройти 5 простых шагов: заполнить **Профиль HR**, добавить **Компанию**, описать **Вакансию**, настроить **Обучение** и **Интервью**, а затем смотреть кандидатов в **CRM-воронке**.\n\nЯ проведу вас по всем разделам и расскажу что и зачем делать. Нажмите «Дальше →».",
  },
  {
    selector: '[data-tour="nav.profile"]',
    section: "profile",
    title: "Шаг 1 — Профиль HR",
    fallback: "Базовые данные ответственного HR-менеджера: имя, телефон, email. Эти данные подставляются в письма кандидатам и в счета на оплату.",
  },
  {
    selector: '[data-tour="nav.companies"]',
    section: "companies",
    title: "Шаг 2 — Мои Компании",
    fallback: "Карточка вашей компании: название, ИНН, сайт, описание, ценности. На её основе ИИ создаст лендинг и будет рассказывать кандидатам о вас.",
  },
  {
    selector: '[data-tour="nav.vacancies"]',
    section: "vacancies",
    title: "Шаг 3 — Вакансии & ИИ",
    fallback: "Создайте вакансию — ИИ сам сгенерирует описание, требования, оффер и публичный лендинг для приёма откликов.",
  },
  {
    selector: '[data-tour="nav.training"]',
    section: "training",
    title: "Шаг 4 — Обучение (ИИ)",
    fallback: "Курс адаптации для новичков: ИИ делает учебные модули и тесты по вашей вакансии. Кандидат проходит обучение ещё до собеседования.",
  },
  {
    selector: '[data-tour="nav.interviews"]',
    section: "interviews",
    title: "Шаг 5 — Интервью (ИИ)",
    fallback: "ИИ-интервьюер задаёт кандидатам вопросы голосом, оценивает ответы и ставит баллы. Вы получаете готовый отчёт.",
  },
  {
    selector: '[data-tour="nav.crm"]',
    section: "crm",
    title: "CRM & Воронка",
    fallback: "Все кандидаты в виде канбана: новый → обучение → интервью → нанят/отказ. Здесь вы принимаете финальные решения.",
  },
  {
    selector: '[data-tour="nav.billing"]',
    section: "billing",
    title: "Тариф & Счета",
    fallback: "Баланс RR-кредитов, пополнение через Robokassa, история транзакций и счета для бухгалтерии.",
  },
  {
    title: "Готово! 🚀",
    fallback:
      "Теперь вы знаете весь маршрут. Рекомендую начать с **Профиля HR**, затем **Компания → Вакансия → Обучение → Интервью**.\n\nРядом с каждым важным полем будет значок «?» — он откроет подробную подсказку. А если захотите пройти тур заново — нажмите кнопку «Запустить вводный тур» в левом сайдбаре.",
  },
];

/* ------------------------------------------------------------------ */
/* Markdown → HTML (минимальный inline-рендер для popover driver.js)  */
/* ------------------------------------------------------------------ */

function mdToHtml(md: string) {
  const esc = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br/>")
    .replace(/^/, "<p>")
    .concat("</p>");
}

interface Props {
  /** Если true — автоматически стартует тур при первом входе пользователя. */
  autoStart?: boolean;
  /** Если true — отрендерить только кнопку «Запустить вводный тур» (без авто-старта). */
  buttonOnly?: boolean;
}

/* ------------------------------------------------------------------ */
/* Основной компонент                                                 */
/* ------------------------------------------------------------------ */

export default function OnboardingHost({ autoStart = true, buttonOnly = false }: Props) {
  const runTour = useCallback(async () => {
    // Подтягиваем подробные welcome-тексты разделов из БД (1000+ симв.)
    await loadOnboarding();
    const welcomes = await Promise.all(
      STEPS.map((s) => (s.section ? getSectionWelcome(s.section) : Promise.resolve(null))),
    );

    const driverSteps = STEPS.map((s, idx) => {
      const dbText = welcomes[idx]?.body_md;
      const dbTitle = welcomes[idx]?.title;
      const description = mdToHtml(dbText || s.fallback);
      const title = dbTitle || s.title;
      const hasEl = s.selector && document.querySelector(s.selector);
      return {
        ...(hasEl ? { element: s.selector } : {}),
        popover: { title, description },
      };
    });

    const d = driver({
      showProgress: true,
      animate: true,
      allowClose: true,
      overlayOpacity: 0.72,
      stagePadding: 8,
      stageRadius: 14,
      nextBtnText: "Дальше →",
      prevBtnText: "← Назад",
      doneBtnText: "Поехали 🚀",
      progressText: "{{current}} из {{total}}",
      steps: driverSteps,
      onDestroyStarted: () => {
        const isLast = !d.hasNextStep();
        setGlobalTourStatus(isLast ? "completed" : "dismissed").catch(() => {});
        d.destroy();
      },
    });
    d.drive();
  }, []);

  /* Авто-старт только при первом входе пользователя */
  useEffect(() => {
    if (buttonOnly || !autoStart) return;
    let cancelled = false;
    (async () => {
      const status = await getGlobalTourStatus();
      if (cancelled || status !== "pending") return;
      // Ждём, пока сайдбар отрендерится
      await new Promise((r) => setTimeout(r, 700));
      if (!cancelled) runTour();
    })();
    return () => { cancelled = true; };
  }, [autoStart, buttonOnly, runTour]);

  return (
    <button
      type="button"
      onClick={runTour}
      className="w-full text-[11px] font-bold inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#E7C768]/15 border border-[#E7C768]/60 text-[#E7C768] hover:bg-[#E7C768]/25 transition"
    >
      <Play className="w-3.5 h-3.5" />
      Запустить вводный тур
    </button>
  );
}