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
/* Шаги тура — короткие, точные, по подразделам                       */
/* ------------------------------------------------------------------ */

type Step = {
  selector?: string;
  /** Куда увести пользователя перед показом шага (относительный путь после /emp{id}/). */
  route?: "profile" | "companies" | "vacancies" | "training" | "interviews" | "crm" | "tariff";
  title: string;
  body: string;
  /** Где разместить поповер относительно элемента. */
  side?: "top" | "right" | "bottom" | "left" | "over";
};

const STEPS: Step[] = [
  {
    title: "Привет! Я — ваш виртуальный помощник 👋",
    body: "Я научу пользоваться <b>Робо Рекрутёром</b> за 2 минуты. Покажу разделы и ключевые кнопки. Жмите «Дальше →».",
  },

  /* ───── Профиль ───── */
  { selector: '[data-tour="nav.profile"]', route: "profile", side: "right",
    title: "Раздел «Профиль HR»",
    body: "Здесь — ваши контакты как ответственного HR. Их видят кандидаты и бухгалтерия.",
  },
  { selector: '[data-tour="section.profile.referral"]', side: "top",
    title: "Реферальная ссылка",
    body: "Делитесь — приглашённые работодатели приносят вам бонусные RR на баланс.",
  },

  /* ───── Компании ───── */
  { selector: '[data-tour="nav.companies"]', route: "companies", side: "right",
    title: "Раздел «Мои Компании»",
    body: "Карточки ваших юрлиц или брендов. ИИ опирается на них при создании вакансий и лендингов.",
  },
  { selector: '[data-tour="section.companies.add"]', side: "left",
    title: "Кнопка «Добавить Компанию»",
    body: "Откроет мастер: название, сайт, ИНН, описание. Добавление и редактирование — бесплатно.",
  },

  /* ───── Вакансии ───── */
  { selector: '[data-tour="nav.vacancies"]', route: "vacancies", side: "right",
    title: "Раздел «Вакансии & ИИ»",
    body: "Список открытых позиций. У каждой — свой публичный лендинг, обучение и интервью.",
  },
  { selector: '[data-tour="section.vacancies.add"]', side: "left",
    title: "Кнопка «Добавить вакансию»",
    body: "Запустит мастер: ИИ сам предложит описание, требования и оффер на основе названия должности.",
  },

  /* ───── Обучение ───── */
  { selector: '[data-tour="nav.training"]', route: "training", side: "right",
    title: "Раздел «Обучение (ИИ)»",
    body: "Учебные модули и тесты по каждой вакансии. Кандидат проходит их до интервью — это отсеивает слабых.",
  },

  /* ───── Интервью ───── */
  { selector: '[data-tour="nav.interviews"]', route: "interviews", side: "right",
    title: "Раздел «Интервью (ИИ)»",
    body: "Чек-листы, кейсы и критерии оценки. ИИ-интервьюер общается с кандидатом текстом и формирует отчёт с баллами.",
  },

  /* ───── CRM ───── */
  { selector: '[data-tour="nav.crm"]', route: "crm", side: "right",
    title: "Раздел «CRM & Воронка»",
    body: "Все кандидаты на одной канбан-доске: новый → обучение → интервью → решение.",
  },
  { selector: '[data-tour="section.crm.header"]', side: "bottom",
    title: "Переключатели вида",
    body: "Канбан удобен для управления, таблица — для массовой выгрузки и фильтров.",
  },

  /* ───── Тариф ───── */
  { selector: '[data-tour="nav.billing"]', route: "tariff", side: "right",
    title: "Раздел «Тариф & Счета»",
    body: "Баланс RR-кредитов, пополнение и история операций. 1 RR = 1 ₽.",
  },
  { selector: '[data-tour="section.tariff.balance"]', side: "right",
    title: "Лицевой счёт",
    body: "Кредиты списываются при генерации лендинга, обучения, интервью и при прохождении этапов кандидатами.",
  },

  /* ───── Финал ───── */
  {
    title: "Готово! 🚀",
    body: "Рекомендую путь: <b>Профиль → Компания → Вакансия → Обучение → Интервью</b>. У каждого важного поля есть «?» — нажмите, чтобы получить подсказку. Перезапустить тур можно кнопкой в сайдбаре.",
  },
];

/* ------------------------------------------------------------------ */
/* Ждём появления элемента в DOM (после смены маршрута React успевает отрендерить). */
function waitForElement(selector: string, timeoutMs = 1500): Promise<Element | null> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      if (Date.now() - start > timeoutMs) return resolve(null);
      requestAnimationFrame(tick);
    };
    tick();
  });
}

/** Текущий публичный id работодателя из URL вида /emp{id}/... */
function currentEmployerId(): string | null {
  const m = window.location.pathname.match(/\/emp([^/]+)\b/);
  return m ? m[1] : null;
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
    const driverSteps = STEPS.map((s) => ({
      ...(s.selector ? { element: s.selector } : {}),
      popover: {
        title: s.title,
        description: s.body,
        side: s.side ?? "bottom",
        align: "center" as const,
      },
      // Перед каждым шагом: уводим на нужный маршрут и ждём появления элемента.
      onHighlightStarted: async (_el: any, _step: any, opts: any) => {
        if (s.route) {
          const empId = currentEmployerId();
          if (empId) {
            const target = `/emp${empId}/${s.route}`;
            if (!window.location.pathname.startsWith(target)) {
              window.history.pushState({}, "", target);
              window.dispatchEvent(new PopStateEvent("popstate"));
            }
          }
        }
        if (s.selector) {
          const el = await waitForElement(s.selector);
          if (el && opts?.driver) {
            // Подменяем элемент: если React перерисовал — driver увидит новый node.
            opts.driver.refresh?.();
          }
        }
      },
    }));

    const d = driver({
      showProgress: true,
      animate: true,
      smoothScroll: true,
      allowClose: true,
      overlayOpacity: 0.72,
      stagePadding: 10,
      stageRadius: 16,
      popoverClass: "rr-tour-popover",
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

  if (!buttonOnly) {
    // Невидимый авто-стартер
    return null;
  }

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