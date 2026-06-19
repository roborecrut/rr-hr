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
const LS_KEY_LEGACY = "rr_welcome_tour_v1";
const LS_KEY_PREFIX = "rr_employer_tour_completed:";
const LS_KEY_VERSION = "v1";
const LS_KEY_USER_PREFIX = "rr_tour_user:";
// Marker that the autostart has already fired for this auth user, ever.
// Once set, the autostart never fires again — closing with X, completing,
// or even crashing mid-tour all count as "we've shown it to this user".
function lsKeyForUser(userId: string | null): string {
  return `${LS_KEY_USER_PREFIX}${userId || "anon"}:${LS_KEY_VERSION}`;
}

/** Per-employer LS key — survives logout/login on the same browser. */
function lsKeyFor(employerId: string | null): string {
  const eid = employerId || "anon";
  return `${LS_KEY_PREFIX}${eid}:${LS_KEY_VERSION}`;
}

async function getGlobalTourStatus(): Promise<"pending" | "completed" | "dismissed"> {
  // LocalStorage is the source of truth — guarantees we never re-show the tour
  // after completion/dismiss, regardless of DB write success, OAuth redirect
  // or vacuumed session. Key is scoped to the employer public id from the URL
  // so different employers on the same browser have independent state, and a
  // legacy global key from prior versions is also honoured.
  const empId = currentEmployerId();
  try {
    const perEmp = window.localStorage.getItem(lsKeyFor(empId));
    if (perEmp === "completed" || perEmp === "dismissed") return perEmp;
    const legacy = window.localStorage.getItem(LS_KEY_LEGACY);
    if (legacy === "completed" || legacy === "dismissed") {
      // Migrate legacy global flag to the per-employer key.
      try { window.localStorage.setItem(lsKeyFor(empId), legacy); } catch { /* ignore */ }
      return legacy;
    }
  } catch { /* ignore */ }
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return "completed";
  // Per-user LS marker — survives different employer URLs and works even
  // when the DB row for section='global' was never created (legacy users
  // only have per-section rows).
  try {
    const perUser = window.localStorage.getItem(lsKeyForUser(u.user.id));
    if (perUser === "completed" || perUser === "dismissed") return perUser;
  } catch { /* ignore */ }
  const { data } = await supabase
    .from("employer_tour_state" as any)
    .select("status")
    .eq("user_id", u.user.id)
    .eq("section", GLOBAL_KEY)
    .maybeSingle();
  const status = ((data as any)?.status as any) || "pending";
  if (status === "completed" || status === "dismissed") {
    try { window.localStorage.setItem(lsKeyFor(empId), status); } catch { /* ignore */ }
    try { window.localStorage.setItem(lsKeyForUser(u.user.id), status); } catch { /* ignore */ }
  }
  // Legacy fallback: if this user already has ANY completed/dismissed row in
  // employer_tour_state (the old per-section tour), treat them as a returning
  // user and never auto-launch the new global tour.
  if (status === "pending") {
    const { data: any2 } = await supabase
      .from("employer_tour_state" as any)
      .select("status")
      .eq("user_id", u.user.id)
      .in("status", ["completed", "dismissed"])
      .limit(1);
    if (Array.isArray(any2) && any2.length > 0) {
      try { window.localStorage.setItem(lsKeyForUser(u.user.id), "completed"); } catch { /* ignore */ }
      return "completed";
    }
  }
  return status;
}

async function setGlobalTourStatus(status: "completed" | "dismissed") {
  // Always persist the per-employer key FIRST so reload/login is safe even
  // if the DB upsert fails (RLS, offline, race). Also keep the legacy
  // global key for backward compatibility with older builds.
  const empId = currentEmployerId();
  try {
    window.localStorage.setItem(lsKeyFor(empId), status);
    window.localStorage.setItem(LS_KEY_LEGACY, status);
  } catch { /* ignore */ }
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return;
  try { window.localStorage.setItem(lsKeyForUser(u.user.id), status); } catch { /* ignore */ }
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
    body: "Я научу пользоваться <b>Робо Рекрутёром</b> шаг за шагом. Покажу каждый раздел и ключевые кнопки, расскажу как и для чего их использовать. Жмите «Дальше →».",
  },
  {
    title: "Как устроен сервис",
    body: "Логика простая: <b>Компания</b> → <b>Вакансия</b> → <b>Обучение</b> → <b>Интервью</b> → <b>CRM</b>. ИИ берёт всю рутину: сам пишет вакансию, обучает кандидата, проводит интервью и складывает результаты в воронку.",
  },

  /* ───── Профиль ───── */
  { selector: '[data-tour="nav.profile"]', route: "profile", side: "right",
    title: "Раздел «Профиль HR»",
    body: "Здесь хранятся ваши контакты как ответственного HR. Их видят кандидаты в финале интервью и наша бухгалтерия при выставлении счетов.",
  },
  { selector: '[data-tour="section.profile.header"]', side: "bottom",
    title: "Заполните контактные данные",
    body: "Имя, телефон, email, мессенджер — кандидат увидит их после успешного интервью, чтобы связаться с вами.",
  },
  { selector: '[data-tour="section.profile.referral"]', side: "top",
    title: "Реферальная ссылка",
    body: "Делитесь — каждый приглашённый работодатель приносит вам бонусные RR-кредиты на баланс после первого пополнения.",
  },

  /* ───── Компании ───── */
  { selector: '[data-tour="nav.companies"]', route: "companies", side: "right",
    title: "Раздел «Мои Компании»",
    body: "Карточки ваших юрлиц или брендов. ИИ опирается на эти данные, когда создаёт вакансию, лендинг и общается с кандидатом.",
  },
  { selector: '[data-tour="section.companies.header"]', side: "bottom",
    title: "Шапка раздела",
    body: "Сверху — поиск по вашим компаниям и фильтры. Ниже — карточки. Можно вести несколько брендов параллельно.",
  },
  { selector: '[data-tour="section.companies.add"]', side: "left",
    title: "Кнопка «Добавить Компанию»",
    body: "Откроет мастер: название, сайт, ИНН, описание, продукт. Чем подробнее — тем точнее ИИ опишет вакансии. Создание и редактирование бесплатны.",
  },

  /* ───── Вакансии ───── */
  { selector: '[data-tour="nav.vacancies"]', route: "vacancies", side: "right",
    title: "Раздел «Вакансии & ИИ»",
    body: "Список ваших открытых позиций. У каждой вакансии — свой публичный лендинг для кандидатов, своя программа обучения и сценарий интервью.",
  },
  { selector: '[data-tour="section.vacancies.header"]', side: "bottom",
    title: "Поиск и фильтры",
    body: "Здесь находите вакансию по названию, статусу или компании. Карточки ниже — кликабельны, открывают редактор.",
  },
  { selector: '[data-tour="section.vacancies.add"]', side: "left",
    title: "Кнопка «Добавить вакансию»",
    body: "Запускает мастер. Вы вводите название должности — ИИ сам предложит описание, требования, обязанности и оффер. Любое поле можно поправить.",
  },

  /* ───── Обучение ───── */
  { selector: '[data-tour="nav.training"]', route: "training", side: "right",
    title: "Раздел «Обучение (ИИ)»",
    body: "Учебные модули и тесты по каждой вакансии. Кандидат проходит обучение ДО интервью — это автоматически отсеивает тех, кто не готов вникать.",
  },
  {
    title: "Как работает обучение",
    body: "ИИ читает данные о компании и вакансии, формирует материал в 3 этапа и тест к каждому. Все поля редактируются, тест можно перегенерировать или дополнить вручную.",
  },

  /* ───── Интервью ───── */
  { selector: '[data-tour="nav.interviews"]', route: "interviews", side: "right",
    title: "Раздел «Интервью (ИИ)»",
    body: "Чек-листы, кейсы и критерии оценки. ИИ-интервьюер общается с кандидатом в чате и формирует отчёт с баллами по каждому блоку.",
  },
  {
    title: "Три блока интервью",
    body: "<b>Резюме</b> — оценка опыта. <b>Чек-лист</b> — проверка знаний. <b>Ситуации</b> — кейсы из реальной работы. ИИ ставит балл по каждому, вы задаёте проходной средний.",
  },

  /* ───── CRM ───── */
  { selector: '[data-tour="nav.crm"]', route: "crm", side: "right",
    title: "Раздел «CRM & Воронка»",
    body: "Все кандидаты на одной канбан-доске: новый → обучение → интервью → решение. Тяните карточки между этапами, оставляйте заметки, выгружайте отчёты.",
  },
  { selector: '[data-tour="section.crm.header"]', side: "bottom",
    title: "Переключатели вида",
    body: "Канбан — удобно управлять руками. Таблица — массовая выгрузка, фильтры по баллам и этапам, экспорт в Excel.",
  },

  /* ───── Тариф ───── */
  { selector: '[data-tour="nav.billing"]', route: "tariff", side: "right",
    title: "Раздел «Тариф & Счета»",
    body: "Баланс RR-кредитов, пополнение, история операций и закрывающие документы. Курс простой: <b>1 RR = 1 ₽</b>.",
  },
  { selector: '[data-tour="section.tariff.balance"]', side: "right",
    title: "Лицевой счёт",
    body: "Кредиты списываются за генерацию лендинга, материалов обучения, интервью и за прохождение этапов кандидатами. Все операции — в истории ниже.",
  },

  /* ───── Финал ───── */
  {
    title: "Готово! 🚀",
    body: "Рекомендую путь: <b>Профиль → Компания → Вакансия → Обучение → Интервью</b>. У каждого важного поля справа есть значок «<b>?</b>» — нажмите, чтобы получить подробную подсказку. Перезапустить тур можно кнопкой в сайдбаре в любое время.",
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
      stagePadding: 4,
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
    // Guard against duplicate auto-mounts firing the tour twice (StrictMode,
    // remounts on navigation, etc.) — once started, never auto-start again
    // in the same tab session.
    try {
      if (window.sessionStorage.getItem("rr_tour_autostarted") === "1") return;
    } catch { /* ignore */ }
    (async () => {
      // Wait for a stable employer id from the URL before deciding. Without
      // this we'd compute the per-employer LS key with "anon" on the very
      // first render and ignore the real per-employer marker.
      let empId = currentEmployerId();
      const tStart = Date.now();
      while (!empId && Date.now() - tStart < 1500) {
        await new Promise((r) => setTimeout(r, 100));
        if (cancelled) return;
        empId = currentEmployerId();
      }
      const status = await getGlobalTourStatus();
      if (cancelled || status !== "pending") return;
      // Ждём, пока сайдбар отрендерится
      await new Promise((r) => setTimeout(r, 700));
      if (cancelled) return;
      try { window.sessionStorage.setItem("rr_tour_autostarted", "1"); } catch { /* ignore */ }
      // Hard one-time gate: even if the user closes the browser instantly,
      // we never auto-launch again for this auth user.
      try {
        const { data: u } = await supabase.auth.getUser();
        if (u?.user) {
          window.localStorage.setItem(lsKeyForUser(u.user.id), "dismissed");
        }
      } catch { /* ignore */ }
      runTour();
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