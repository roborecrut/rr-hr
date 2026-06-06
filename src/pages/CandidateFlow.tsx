/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "../components/RouterContext";
import Mascot from "../components/Mascot";
import TrainingCoursePreview from "../components/TrainingCoursePreview";
import CandidateStageTraining from "../components/CandidateStageTraining";
import Markdown from "react-markdown";
import { JobProject, Candidate, Message, TrainingBlock } from "../types";
import { supabase } from "@/integrations/supabase/client";
import { getCandidateSession, saveCandidateSession, type CandidateApplication } from "@/lib/candidateSession";
import {
  FileText,
  Upload,
  Send,
  Loader,
  Award,
  BookOpen,
  ArrowRight,
  TrendingUp,
  Cpu,
  Bookmark,
  CheckCircle,
  HelpCircle,
  X,
  ExternalLink,
  Menu,
  User,
  MessageSquare,
  Building,
  Clock,
  Coins,
  Users,
  ShieldCheck,
  Sparkles,
  RefreshCw
} from "lucide-react";

const get20ChecklistQuestions = (role: string) => {
  const normRole = (role || "").toLowerCase();
  
  let selectQs: any[] = [];
  let textQs: any[] = [];

  if (normRole.includes("продаж") || normRole.includes("торгов") || normRole.includes("клиент")) {
    selectQs = [
      {
        question: "Какая основная цель первого ('холодного') звонка клиенту?",
        type: "select",
        options: [
          "Сразу продать самый дорогой продукт",
          "Завязать контакт, выявить ЛПР и договориться о встрече или следующем шаге",
          "Попросить у клиента личный номер телефона его руководителя",
          "Прочитать весь текст регламента до конца любой ценой"
        ],
        correctAnswer: "Завязать контакт, выявить ЛПР и договориться о встрече или следующем шаге"
      },
      {
        question: "Если клиент говорит: 'Мне это сейчас не интересно', каков лучший ответ?",
        type: "select",
        options: [
          "Сказать 'Хорошо, жаль' и сразу положить трубку",
          "Уточнить: 'Понимаю вашу занятость. Подскажите, вы не заинтересованы именно в [ценность продукта] или просто нет времени?'",
          "Спросить 'А почему вам не интересно то, что приносит миллионы?!'",
          "Продолжать настойчиво читать скрипт без пауз"
        ],
        correctAnswer: "Уточнить: 'Понимаю вашу занятость. Подскажите, вы не заинтересованы именно в [ценность продукта] или просто нет времени?'"
      },
      {
        question: "Что из перечисленного является базовым этапом классических продаж?",
        type: "select",
        options: [
          "Покупка рекламы в Яндексе",
          "Определение бюджетирования компании куратором",
          "Отработка возражений и закрытие сделки",
          "Перевод клиента на другого менеджера"
        ],
        correctAnswer: "Отработка возражений и закрытие сделки"
      },
      {
        question: "Какая CRM-система наиболее популярна в СНГ для автоматизации продаж и контроля звонков?",
        type: "select",
        options: ["Jira", "Figma", "amoCRM", "Visual Studio Code"],
        correctAnswer: "amoCRM"
      },
      {
        question: "Как расшифровывается понятие 'ЛПР' в деловом мире?",
        type: "select",
        options: [
          "Личный Помощник Руководителя",
          "Лицо, принимающее решения",
          "Локальный Представитель Робототехники",
          "Лучший Продавец Региона"
        ],
        correctAnswer: "Лицо, принимающее решения"
      },
      {
        question: "Что означает средний чек (Average Ticket) компании?",
        type: "select",
        options: [
          "Длина квитанции в кассе",
          "Общая выручка, разделенная на количество совершенных продаж за период",
          "Максимальная стоимость одного товара в каталоге",
          "Размер скидки для постоянных VIP-клиентов"
        ],
        correctAnswer: "Общая выручка, разделенная на количество совершенных продаж за период"
      },
      {
        question: "Какой процент конверсии считается хорошим для холодной базы контактов?",
        type: "select",
        options: ["100% без исключений", "От 2% до 10% в зависимости от ниши", "Не более 0.01%", "Конверсию холодных баз невозможно замерить"],
        correctAnswer: "От 2% до 10% в зависимости от ниши"
      },
      {
        question: "Что такое апсейл (Up-sell) в торговой практике компании?",
        type: "select",
        options: [
          "Снижение цены по купону стажера",
          "Продажа клиенту более дорогой версии товара или дополнительного объема услуг",
          "Возврат неиспользованного товара обратно поставщику",
          "Отсутствие звонков в течение рабочего дня"
        ],
        correctAnswer: "Продажа клиенту более дорогой версии товара или дополнительного объема услуг"
      },
      {
        question: "Какой инструмент помогает продавцу правильно вести сложный телефонный диалог?",
        type: "select",
        options: ["Калькулятор валют", "Интерактивный скрипт (регламент) продаж", "Юридический кодекс страны", "Поисковая система Google"],
        correctAnswer: "Интерактивный скрипт (регламент) продаж"
      },
      {
        question: "Что такое воронка продаж (Sales Funnel)?",
        type: "select",
        options: [
          "Фильтр очистки базы данных",
          "Путь, который проходит клиент от первого знакомства с продуктом до завершения сделки",
          "Приспособление для переливания автомобильного масла",
          "Список уволенных сотрудников отдела продаж"
        ],
        correctAnswer: "Путь, который проходит клиент от первого знакомства с продуктом до завершения сделки"
      }
    ];

    textQs = [
      { question: "Опишите ваш самый успешный опыт продаж из прошлой практики (или почему вы хотите работать в продажах).", type: "text" },
      { question: "Как вы готовитесь к разговору с клиентом перед совершением звонка?", type: "text" },
      { question: "Поясните своими словами сущность выявления потребностей клиента.", type: "text" },
      { question: "Опишите ваш личный эффективный метод борьбы с эмоциональным выгоранием на работе.", type: "text" },
      { question: "Как вы аргументируете клиенту ценность дорогостоящего продукта, не прибегая к скидкам?", type: "text" },
      { question: "Что необходимо сделать менеджеру сразу после успешного завершения сложной продажи?", type: "text" },
      { question: "Как вы будете восстанавливать личные показатели эффективности при спаде продаж?", type: "text" },
      { question: "Какую роль в продажах играет дисциплина ведения базы клиентов в CRM-системе?", type: "text" },
      { question: "Опишите, как вы реагируете на резкое возражение клиента со словами 'Мне ничего не нужно!'.", type: "text" },
      { question: "Каковы ваши финансовые цели на данной вакансии на ближайшие 6 месяцев?", type: "text" }
    ];
  } else if (normRole.includes("разработ") || normRole.includes("it") || normRole.includes("програм") || normRole.includes("аналитик") || normRole.includes("тестир")) {
    selectQs = [
      {
        question: "Какая команда используется в Git для отправки локальных коммитов в удаленный репозиторий?",
        type: "select",
        options: ["git commit -m", "git push origin main", "git pull --all", "git clone https://"],
        correctAnswer: "git push origin main"
      },
      {
        question: "Что такое React в современной веб-разработке?",
        type: "select",
        options: [
          "Реляционная база данных компании Oracle",
          "Полноценная операционная система для серверов",
          "Популярная JavaScript-библиотека для создания пользовательских интерфейсов",
          "Облачный хостинг для запуска контейнеров"
        ],
        correctAnswer: "Популярная JavaScript-библиотека для создания пользовательских интерфейсов"
      },
      {
        question: "Какое основное отличие TypeScript от стандартного JavaScript?",
        type: "select",
        options: [
          "TS работает только в мобильных телефонах",
          "TS добавляет строгую статистическую типизацию для раннего предотвращения ошибок",
          "TS не поддерживает циклы и массивы",
          "JavaScript работает медленнее ровно в 10 раз"
        ],
         correctAnswer: "TS добавляет строгую статистическую типизацию для раннего предотвращения ошибок"
      },
      {
        question: "What is DBMS in the context of information architectures?",
        type: "select",
        options: ["Database Management System", "Detailed Binary Mail Service", "Distributed Board Matching Script", "Double Band Memory Selector"],
        correctAnswer: "Database Management System"
      },
      {
        question: "Какое расширение файлов веб-страниц по умолчанию используется в React-проектах с TypeScript?",
        type: "select",
        options: [".css", ".html", ".tsx", ".zip"],
        correctAnswer: ".tsx"
      },
      {
        question: "Что такое Docker в процессах CI/CD команд разработки?",
        type: "select",
        options: [
          "Игровая консоль со встроенными тестами",
          "Платформа контейнеризации приложений, упаковывающая код со всеми зависимостями в один образ",
          "Кабель для подключения монитора к серверной стойке",
          "Язык стилизации CSS-карточек"
        ],
        correctAnswer: "Платформа контейнеризации приложений, упаковывающая код со всеми зависимостями в один образ"
      },
      {
        question: "Какая HTTP-методология используется для полного обновления данных в REST API?",
        type: "select",
        options: ["GET", "DELETE", "PUT", "PATCH"],
        correctAnswer: "PUT"
      },
      {
        question: "Какова основная задача юнит-тестов (Unit Tests)?",
        type: "select",
        options: [
          "Замена ручного тестирования всего интерфейса",
          "Проверка корректности работы отдельных изолированных единиц/функций исходного кода",
          "Сбор аналитики о пользователях системы",
          "Автоматическая загрузка обновленного ПО на сервера"
        ],
        correctAnswer: "Проверка корректности работы отдельных изолированных единиц/функций исходного кода"
      },
      {
        question: "Что означает аббревиатура DRY в программировании?",
        type: "select",
        options: [
          "Do Repeat Yourself",
          "Don't Repeat Yourself (не повторяй свой собственный код)",
          "Data Ready Yes",
          "Developer Real Youth"
        ],
        correctAnswer: "Don't Repeat Yourself (не повторяй свой собственный код)"
      },
      {
        question: "Каким инструментом чаще всего пользуются для описания структуры REST API?",
        type: "select",
        options: ["Photoshop", "Swagger", "Notepad", "Excel"],
        correctAnswer: "Swagger"
      }
    ];

    textQs = [
      { question: "Опишите ваш основной стек технологий и опыт его коммерческого использования.", type: "text" },
      { question: "Como вы организуете процесс поиска и исправления сложной логической ошибки в коде?", type: "text" },
      { question: "Поясните разницу между реляционными и нереляционными базами данных из вашего опыта.", type: "text" },
      { question: "Как вы относитесь к переработкам перед релизами и как оптимизируете свое рабочее время?", type: "text" },
      { question: "Опишите самый запоминающийся проект, который вы реализовали лично или в команде.", type: "text" },
      { question: "Что для вас идеальное проведение код-ревью в дружной команде?", type: "text" },
      { question: "Как вы оцениваете трудоемкость новых технических задач?", type: "text" },
      { question: "Опишите ваш опыт работы под распределенной системой контроля версий Git.", type: "text" },
      { question: "Как вы изучаете новые стандарты веб-технологий или фреймворки?", type: "text" },
      { question: "Каковы ваши профессиональные ожидания от нашей команды инженеров?", type: "text" }
    ];
  } else {
    selectQs = [
      {
        question: "Какой стандартный график работы является классическим?",
        type: "select",
        options: ["2/2 круглые сутки", "5/2 по 8 часов в день", "7/0 без полноценных выходных", "1/3 суточный"],
        correctAnswer: "5/2 по 8 часов в день"
      },
      {
        question: "Что такое корпоративная почта сотрудника?",
        type: "select",
        options: [
          "Развлекательный почтовый ящик семьи",
          "Официальный электронный ящик в домене компании для рабочей переписки",
          "Облачные файлы на домашнем диске",
          "Брошюры в печатном ящике у входа в офис"
        ],
        correctAnswer: "Официальный электронный ящик в домене компании для рабочей переписки"
      },
      {
        question: "Как вести себя при возникновении спорного момента с коллегами?",
        type: "select",
        options: [
          "Игнорировать человека и заблокировать контакт",
          "Проявить вежливость, спокойно выявить причину спора и обсудить конструктивные пути решения",
          "Громко высказать обидные претензии на общем собрании",
          "Попросить куратора немедленно уволить оппонента"
        ],
        correctAnswer: "Проявить вежливость, спокойно выявить причину спора и обсудить конструктивные пути решения"
      },
      {
        question: "Какая основная задача онбординга новых стажеров?",
        type: "select",
        options: ["Проверка терпения новичков", "Плавная и быстрая адаптация стажера в рабочие инструменты, ценности и регламенты", "Организация корпоративных праздников", "Разъяснение личных хобби руководства"],
        correctAnswer: "Плавная и быстрая адаптация стажера в рабочие инструменты, ценности и регламенты"
      },
      {
        question: "Что делать с конфиденциальной внутренней базой знаний компании?",
        type: "select",
        options: [
          "Поделиться ею в открытом доступе на форумах",
          "Строго соблюдать коммерческую тайну и использовать только для выполнения служебных задач",
          "Разослать друзьям для ознакомления",
          "Удалить всю базу из рабочего пространства"
        ],
        correctAnswer: "Строго соблюдать коммерческую тайну и использовать только для выполнения служебных задач"
      },
      {
        question: "Что такое дедлайн в организации работы сотрудника?",
        type: "select",
        options: ["Конец рабочей года", "Крайний срок (дата и время) выполнения поставленной задачи", "Утренний созвон с напарниками", "Начало обеденного часа"],
        correctAnswer: "Крайний срок (дата и время) выполнения поставленной задачи"
      },
      {
        question: "Какая государственная система фиксирует статус профессионального дохода (Самозанятые)?",
        type: "select",
        options: ["Яндекс Почта", "Приложение 'Мой Налог'", "Государственная система здравоохранения РФ", "Сбербанк Онлайн"],
        correctAnswer: "Приложение 'Мой Налог'"
      },
      {
        question: "Зачем сотрудникам нужна регулярная обратная связь от руководителей?",
        type: "select",
        options: [
          "Для выговоров и снижения премий",
          "Для объективного понимания своих успехов, зон роста и повышения профессионализма",
          "Никакой роли ОС не играет",
          "Исключительно ради ведения отчетности"
        ],
        correctAnswer: "Для объективного понимания своих успехов, зон роста и повышения профессионализма"
      },
      {
        question: "Что делать при технической неисправности личного оборудования в рабочее время?",
        type: "select",
        options: [
          "Незамедлительно сообщить своему куратору или наставнику и согласовать действия",
          "Закрыть сессию окон и пойти заниматься личными хобби",
          "Ждать окончания смены, надеясь, что никто не заметит",
          "Попросить у коллег дать вам пароли от их компьютеров"
        ],
        correctAnswer: "Незамедлительно сообщить своему куратору или наставнику и согласовать действия"
      },
      {
        question: "Какой формат файлов является де-факто международным стандартом для сохранения резюме?",
        type: "select",
        options: [".exe", ".zip", ".pdf", ".png"],
        correctAnswer: ".pdf"
      }
    ];

    textQs = [
      { question: "Поделитесь вашим общим профессиональным стажем на аналогичных ролях.", type: "text" },
      { question: "Каким образом вы привыкли планировать свой рабочий день?", type: "text" },
      { question: "Что для вас является залогом успешной командной работы?", type: "text" },
      { question: "Опишите ваш самый запоминающийся опыт преодоления рабочих затруднений.", type: "text" },
      { question: "Как вы осваиваете новые рабочие программы и служебные инструкции?", type: "text" },
      { question: "Опишите ваше отношение к регулярной оценке качества вашей работы.", type: "text" },
      { question: "Какими способами вы боретесь с повседневным стрессом на рабочем месте?", type: "text" },
      { question: "Как вы организуете хранение своих профессиональных записей и планов?", type: "text" },
      { question: "Какую профессиональную планку на этой работе вы ставите перед собой на год?", type: "text" },
      { question: "Почему наша открытая вакансия заинтересовала вас в данный момент?", type: "text" }
    ];
  }

  const shuffledSelect = [...selectQs].sort(() => Math.random() - 0.5).slice(0, 10);
  const shuffledText = [...textQs].sort(() => Math.random() - 0.5).slice(0, 10);
  const combined = [...shuffledSelect, ...shuffledText];
  return combined.sort(() => Math.random() - 0.5);
};

const getSmartDefaultAnswer = (q: string, role: string): string => {
  const qLower = q.toLowerCase();
  if (qLower.includes("опыт в активных") || qLower.includes("опыт работы на")) {
    return "Более 3 лет успешного коммерческого опыта в данной сфере.";
  }
  if (qLower.includes("стек технологий")) {
    return "React, TypeScript, Node.js, Express, PostgreSQL, TailwindCSS, Git.";
  }
  if (qLower.includes("возражени") || qLower.includes("отказы")) {
    return "Отношусь конструктивно. Выслушиваю клиента, соглашаюсь с его правом на сомнение, перевожу разговор на ценность и выгоду продукта.";
  }
  if (qLower.includes("crm")) {
    return "Уверенно владею amoCRM, Bitrix24, Jira, фиксирую все этапы движения лида и ставлю напоминания.";
  }
  if (qLower.includes("рекорд по сумме") || qLower.includes("когда-либо")) {
    return "Закрыл крупный контракт на поставку ПО на сумму 1.2 млн рублей за один календарный месяц.";
  }
  if (qLower.includes("лпр")) {
    return "Через секретарей и выявление болей выхожу на ЛПР, задаю квалифицирующие вопросы напрямую руководителю.";
  }
  if (qLower.includes("средний чек")) {
    return "Средний чек сделок составлял около 75,000 рублей.";
  }
  if (qLower.includes("холодн") || qLower.includes("звонков")) {
    return "Да, есть большой опыт холодных звонков. Стабильно делал около 40-50 звонков в день на этапе разгона базы.";
  }
  if (qLower.includes("воронка") || qLower.includes("воронками")) {
    return "Конечно. Знаю, как конвертировать лиды из этапа 'первичный интерес' в 'согласование договора' и минимизировать потери.";
  }
  if (qLower.includes("коммерческих предложений") || qLower.includes("rest api")) {
    return "Регулярно составлял индивидуальные коммерческие предложения под боли конкретного клиента.";
  }
  if (qLower.includes("спин") || qLower.includes("git")) {
    return "Да, использую ситуационные, проблемные, извлекающие и направляющие вопросы для поиска скрытых потребностей.";
  }
  if (qLower.includes("быстро") || qLower.includes("контакт")) {
    return "Сразу проявляю вежливость, улыбку в голосе, называю по имени и держу уверенный профессиональный тон.";
  }
  if (qLower.includes("допродаж") || qLower.includes("cross-sell")) {
    return "Предлагаю расширенную гарантию, дополнительные модули или сопутствующие обучающие услуги.";
  }
  if (qLower.includes("тендерах") || qLower.includes("docker")) {
    return "Имею базовое понимание процессов и регламентов участия на электронных торговых площадках.";
  }
  if (qLower.includes("kpi") || qLower.includes("метрики")) {
    return "Основные показатели: объем продаж, количество звонков, средняя длина сделки и отзывы клиентов.";
  }
  if (qLower.includes("готовы ли") || qLower.includes("согласны")) {
    return "Да, абсолютно готов. Понимаю, что на старте необходима максимальная вовлеченность.";
  }
  if (qLower.includes("выгоранием") || qLower.includes("многозадачностью")) {
    return "Переключаю фокус внимания, занимаюсь спортом и четко планирую рабочие задачи по приоритетам.";
  }
  if (qLower.includes("встреч") || qLower.includes("презентацион")) {
    return "Да, проводил онлайн-демонстрации продукта в Zoom и личные встречи на территории заказчика.";
  }
  if (qLower.includes("этикет") || qLower.includes("английским")) {
    return "Владею деловым этикетом, грамотно пишу коммерческие предложения и легко нахожу общий язык.";
  }
  if (qLower.includes("почему") || qLower.includes("привлекает")) {
    return "Мне нравится помогать людям решать их проблемы с помощью качественного продукта и зарабатывать на этом.";
  }
  return "Имею высокий уровень профессионализма, быстро изучаю новую информацию и стремлюсь выполнять плановые показатели.";
};

export default function CandidateFlow() {
  const { path, navigate } = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Active state ids
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [project, setProject] = useState<JobProject | null>(null);
  const [allProjects, setAllProjects] = useState<any[]>([]);
  // Full DB row for the active project + parent company + employer contacts
  const [projectFull, setProjectFull] = useState<any | null>(null);
  const [companyFull, setCompanyFull] = useState<any | null>(null);
  const [employerContacts, setEmployerContacts] = useState<{ email?: string|null; phone?: string|null; telegram?: string|null }>({});
  // Multi-application switcher (item 10)
  const [applications, setApplications] = useState<CandidateApplication[]>([]);
  const [appsMenuOpen, setAppsMenuOpen] = useState(false);

  // Flow navigation stage index: "terms" | "interview" | "scoring" | "training" | "certified"
  const [currentStage, setCurrentStage] = useState<string>("terms");

  // Main navigation tab
  const [activeTab, setActiveTabState] = useState<string>("profile");
  
  // Sub-tabs for "Условия"
  const [termsSubTab, setTermsSubTabState] = useState<string>("vacancy");

  // Sub-tabs for "ИИ обучение"
  const [trainingSubTab, setTrainingSubTabState] = useState<string>("professional");

  // Sub-tabs for "Интервью"
  const [interviewSubTab, setInterviewSubTabState] = useState<string>("resume");

  // Helper to build cohesive URLs
  const getDynamicPath = (tabId: string, subTabId?: string, forceProject?: any) => {
    const parts = path.split("/").filter(Boolean);
    const candIndex = parts.findIndex(p => p.startsWith("candidate"));
    const candidateId = candidate?.id || localStorage.getItem("cand_session_id") || "";

    const targetProject = forceProject || project;
    let slug = "";
    let vacId = "";

    if (candIndex >= 2) {
      slug = parts[0];
      vacId = parts[1];
    } else if (targetProject) {
      slug = targetProject.companySlug || "";
      vacId = targetProject.id;
    }

    let targetSub = subTabId;
    if (!targetSub) {
      if (tabId === "terms") targetSub = termsSubTab || "vacancy";
      else if (tabId === "training") targetSub = trainingSubTab || "professional";
      else if (tabId === "interview") targetSub = interviewSubTab || "resume";
    }

    if (slug && vacId) {
      return `/${slug}/${vacId}/${candidateId}/${tabId}${targetSub ? `/${targetSub}` : ""}`;
    } else {
      return `/${candidateId}/${tabId}${targetSub ? `/${targetSub}` : ""}`;
    }
  };

  const setActiveTab = (tabId: string) => {
    setActiveTabState(tabId);
    let sub = "";
    if (tabId === "terms") sub = termsSubTab || "vacancy";
    else if (tabId === "training") sub = trainingSubTab || "professional";
    else if (tabId === "interview") sub = interviewSubTab || "resume";
    navigate(getDynamicPath(tabId, sub));
  };

  const setTermsSubTab = (subTabId: string) => {
    setTermsSubTabState(subTabId);
    navigate(getDynamicPath("terms", subTabId));
  };

  const setTrainingSubTab = (subTabId: string) => {
    setTrainingSubTabState(subTabId);
    navigate(getDynamicPath("training", subTabId));
  };

  const setInterviewSubTab = (subTabId: string) => {
    setInterviewSubTabState(subTabId);
    navigate(getDynamicPath("interview", subTabId));
  };

  // Redirect literally "candidate" or "cand" segments to proper IDs
  useEffect(() => {
    const parts = path.split("/").filter(Boolean);
    const candIndex = parts.findIndex(p => {
      const lower = p.toLowerCase();
      return lower.startsWith("candidate") || lower.startsWith("cand");
    });
    
    if (candIndex !== -1 && (parts[candIndex].toLowerCase() === "candidate" || parts[candIndex].toLowerCase() === "cand")) {
      let properId = localStorage.getItem("cand_session_id") || "";
      if (!properId.toLowerCase().startsWith("candidate") || !/\d+/.test(properId)) {
        properId = "candidate" + Math.floor(100000 + Math.random() * 900000).toString();
      }
      localStorage.setItem("cand_session_id", properId);
      const newParts = [...parts];
      newParts[candIndex] = properId;
      const newPath = "/" + newParts.join("/");
      navigate(newPath);
    }
  }, [path, navigate]);

  // Sync URL subpath to activeTab, termsSubTab and trainingSubTab states
  useEffect(() => {
    const parts = path.split("/").filter(Boolean);
    const candIndex = parts.findIndex(p => p.startsWith("candidate"));
    
    let parsedTab = "profile";
    let parsedSubTab = "";

    if (candIndex !== -1) {
      if (candIndex === 0) {
        parsedTab = parts[1] || "profile";
        parsedSubTab = parts[2] || "";
      } else if (candIndex >= 2) {
        parsedTab = parts[3] || "profile";
        parsedSubTab = parts[4] || "";
      }
    } else {
      if (parts[0] && parts[0].startsWith("candidate")) {
        parsedTab = parts[1] || "profile";
        parsedSubTab = parts[2] || "";
      } else if (parts[0] === "candidate") {
        parsedTab = parts[1] || "profile";
        parsedSubTab = parts[2] || "";
      }
    }

    if (parsedTab && parsedTab !== activeTab) {
      setActiveTabState(parsedTab);
    }
    
    if (parsedTab === "terms") {
      const sub = parsedSubTab || "vacancy";
      if (sub !== termsSubTab) {
        setTermsSubTabState(sub);
      }
    } else if (parsedTab === "training") {
      const sub = parsedSubTab || "professional";
      if (sub !== trainingSubTab) {
        setTrainingSubTabState(sub);
      }
    } else if (parsedTab === "interview") {
      const sub = parsedSubTab || "resume";
      if (sub !== interviewSubTab) {
        setInterviewSubTabState(sub);
      }
    }
  }, [path]);

  // Floating AI Assistant states
  const [assistOpen, setAssistOpen] = useState(false);
  const [assistTextInput, setAssistTextInput] = useState("");
  const [assistHistory, setAssistHistory] = useState<{ sender: "ai" | "user", text: string }[]>([
    { sender: "ai", text: "Привет! Я твой ИИ Робот-Помощник. Спрашивай меня обо всем — о регламентах, вакансии, графике, выплатах или обучении! 😊" }
  ]);
  const [assistLoading, setAssistLoading] = useState(false);

  const handleSendAssist = async () => {
    if (!assistTextInput.trim()) return;
    const userText = assistTextInput;
    setAssistHistory(prev => [...prev, { sender: "user", text: userText }]);
    setAssistTextInput("");
    setAssistLoading(true);

    try {
      const { aiChat } = await import("@/lib/aiClient");
      const contextLine = `Раздел: ${activeTab}; Подраздел: ${activeTab === "terms" ? termsSubTab : (activeTab === "training" ? trainingSubTab : "")}`;
      const reply = await aiChat({
        kind: "candidate",
        candidate_id: candidate?.id,
        project_id: candidate?.projectId,
        context: contextLine,
        messages: [{ role: "user", content: userText }],
      });
      setAssistHistory(prev => [...prev, { sender: "ai", text: reply || "Я задумался… попробуйте задать вопрос иначе." }]);
    } catch (err) {
      console.error(err);
      setAssistHistory(prev => [...prev, { sender: "ai", text: "Не удалось отправить сообщение. Пожалуйста, проверьте интернет-соединение." }]);
    } finally {
      setAssistLoading(false);
    }
  };

  // Profile management edit states
  const [editingProfile, setEditingProfile] = useState(false);
  const [profName, setProfName] = useState("");
  const [profEmail, setProfEmail] = useState("");
  const [profTelegram, setProfTelegram] = useState("");
  const [saveProfileMsg, setSaveProfileMsg] = useState("");
  const [certSavedMsg, setCertSavedMsg] = useState("");

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidate) return;

    try {
      const res = await fetch(`/api/candidates/${candidate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profName,
          email: profEmail,
          telegramUsername: profTelegram
        })
      });

      if (res.ok) {
        const updated = await res.json();
        setCandidate(updated);
        setEditingProfile(false);
        setSaveProfileMsg("✅ Данные профиля успешно сохранены!");
        setTimeout(() => setSaveProfileMsg(""), 3000);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Load candidate session from URL or localStorage
  const loadSession = async () => {
    const parts = path.split("/").filter(Boolean);
    const candIndex = parts.findIndex(p => {
      const lower = p.toLowerCase();
      return lower.startsWith("candidate") || lower.startsWith("cand");
    });
    
    if (candIndex !== -1 && (parts[candIndex].toLowerCase() === "candidate" || parts[candIndex].toLowerCase() === "cand")) {
      return;
    }

    let activeId = localStorage.getItem("cand_session_id") || "";
    
    if (candIndex !== -1) {
      activeId = parts[candIndex];
      localStorage.setItem("cand_session_id", activeId);
    } else if (parts[0] && parts[0].startsWith("candidate")) {
      activeId = parts[0];
      localStorage.setItem("cand_session_id", activeId);
    }

    try {
      // 1. Fetch available projects
      let projsList: any[] = [];
      const resAllProjs = await fetch("/api/projects").catch(() => null as any);
      if (resAllProjs && resAllProjs.ok) {
        projsList = await resAllProjs.json();
      } else {
        // Supabase fallback — pull published projects + parent company name/slug
        const { data } = await supabase
          .from("projects")
          .select("*, companies(name, slug, logo_url)")
          .eq("is_published", true);
        projsList = (data || []).map((p: any) => ({
          id: p.id,
          companyName: p.companies?.name || "",
          companySlug: p.companies?.slug || undefined,
          employerId: p.employer_id,
          roleName: p.role_name,
          salaryTerms: p.salary_terms || undefined,
          scheduleTerms: p.schedule_terms || undefined,
          motivationText: p.motivation_text || undefined,
          customWiki: p.custom_wiki || undefined,
          checklistQuestions: [],
          roleplayQuestions: [],
          logoUrl: p.logo_url || p.companies?.logo_url || undefined,
          slug: p.slug,
        }));
      }
      setAllProjects(projsList);

      // 2. Resolve candidate. Prefer Supabase by public_id, then legacy API.
      let activeCand: any = null;
      const pubId = activeId.startsWith("candidate") ? activeId.replace(/^candidate/, "") : activeId;
      if (pubId) {
        const { data: cand } = await supabase
          .from("candidates")
          .select("*")
          .eq("public_id", pubId)
          .maybeSingle();
        if (cand) {
          activeCand = {
            id: `candidate${cand.public_id}`,
            publicId: cand.public_id,
            name: cand.resume_name || `Кандидат #${cand.public_id}`,
            email: "",
            projectId: cand.project_id,
            roleName: cand.role_name || "",
            currentStage: cand.current_stage,
            registeredVia: cand.registered_via || "telegram",
          };
        }
      }

      if (!activeCand) {
        const resCand = await fetch(`/api/candidates`).catch(() => null as any);
        if (resCand && resCand.ok) {
          const candidatesList = await resCand.json();
          activeCand = candidatesList.find((c: any) => c.id === activeId);
        }
      }

      // If starts with candidateXXXXXX and doesn't exist, auto-provision a Supabase row
      if (!activeCand && activeId.startsWith("candidate")) {
        const randomNum = activeId.replace("candidate", "");
        const randId = randomNum || Math.floor(100000 + Math.random() * 900000).toString();
        const { data: created } = await supabase
          .from("candidates")
          .insert({
            public_id: randId,
            project_id: parts[1] ? null : null,
            role_name: "Менеджер по продажам",
            current_stage: "terms",
            registered_via: "telegram",
          })
          .select("*")
          .single();
        if (created) {
          activeCand = {
            id: `candidate${created.public_id}`,
            publicId: created.public_id,
            name: `Кандидат #${created.public_id}`,
            email: `candidate_${created.public_id}@candidate-pool.ru`,
            projectId: created.project_id,
            roleName: created.role_name,
            currentStage: created.current_stage,
            registeredVia: created.registered_via,
          };
        }
      }

      if (activeCand) {
        setCandidate(activeCand);
        setCurrentStage(activeCand.currentStage || "terms");

        // Set editing initial fields
        setProfName(activeCand.name || "");
        setProfEmail(activeCand.email || "");
        setProfTelegram(activeCand.telegramUsername || "");

        // Determine tabs
        let parsedTab = "profile";
        let parsedSubTab = "";

        if (candIndex !== -1) {
          if (candIndex === 0) {
            parsedTab = parts[1] || "profile";
            parsedSubTab = parts[2] || "";
          } else if (candIndex >= 2) {
            parsedTab = parts[3] || "profile";
            parsedSubTab = parts[4] || "";
          }
        } else {
          if (parts[0] && parts[0].startsWith("candidate")) {
            parsedTab = parts[1] || "profile";
            parsedSubTab = parts[2] || "";
          } else if (parts[0] === "candidate") {
            parsedTab = parts[1] || "profile";
            parsedSubTab = parts[2] || "";
          }
        }

        setActiveTabState(parsedTab || activeCand.currentStage || "profile");
        if (parsedTab === "terms") {
          setTermsSubTabState(parsedSubTab || "vacancy");
        } else if (parsedTab === "training") {
          setTrainingSubTabState(parsedSubTab || "professional");
        } else if (parsedTab === "interview") {
          setInterviewSubTabState(parsedSubTab || "resume");
        }

        // Fetch corresponding project details
        const activeProjId = (candIndex >= 2 ? parts[1] : null) || activeCand.projectId || "";
        if (activeProjId) {
          const resProj = await fetch(`/api/projects/${activeProjId}`).catch(() => null as any);
          if (resProj && resProj.ok) {
            setProject(await resProj.json());
          } else {
            // Supabase fallback by id OR slug
            const isUuid = /^[0-9a-f-]{36}$/i.test(activeProjId);
            const q = isUuid
              ? supabase.from("projects").select("*, companies(name, slug, logo_url)").eq("id", activeProjId).maybeSingle()
              : supabase.from("projects").select("*, companies(name, slug, logo_url)").eq("slug", activeProjId).maybeSingle();
            const { data: p } = await q;
            if (p) {
              setProject({
                id: p.id,
                companyName: p.companies?.name || "",
                companySlug: p.companies?.slug || undefined,
                employerId: p.employer_id,
                roleName: p.role_name,
                salaryTerms: p.salary_terms || undefined,
                scheduleTerms: p.schedule_terms || undefined,
                motivationText: p.motivation_text || undefined,
                customWiki: p.custom_wiki || undefined,
                checklistQuestions: [],
                roleplayQuestions: [],
                logoUrl: p.logo_url || p.companies?.logo_url || undefined,
              } as any);
              setProjectFull(p);
              // Fetch full company + employer contacts (item 11 + 12)
              if (p.company_id) {
                const { data: co } = await supabase.from("companies").select("*").eq("id", p.company_id).maybeSingle();
                if (co) setCompanyFull(co);
              }
              if (p.employer_id) {
                const { data: emp } = await supabase
                  .from("employers")
                  .select("contact_email, contact_phone, contact_telegram")
                  .eq("id", p.employer_id)
                  .maybeSingle();
                if (emp) setEmployerContacts({
                  email: (emp as any).contact_email,
                  phone: (emp as any).contact_phone,
                  telegram: (emp as any).contact_telegram,
                });
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("Error loading candidate session:", err);
    }
  };

  useEffect(() => {
    loadSession();
  }, []);

  // Hydrate "My applications" from saved candidate session + refresh from DB
  useEffect(() => {
    const s = getCandidateSession();
    if (s?.applications && s.applications.length) setApplications(s.applications);
    (async () => {
      if (!s?.email) return;
      try {
        const { data, error } = await supabase
          .from("candidates")
          .select("id, public_id, project_id, company_id, role_name, current_stage, created_at, companies(name, slug)")
          .ilike("email", s.email);
        if (!error && Array.isArray(data)) {
          const apps: CandidateApplication[] = data.map((c: any) => ({
            candidate_id: c.id,
            public_id: c.public_id,
            project_id: c.project_id,
            company_id: c.company_id,
            role_name: c.role_name,
            company_name: c.companies?.name ?? null,
            company_slug: c.companies?.slug ?? null,
            current_stage: c.current_stage,
          }));
          setApplications(apps);
          saveCandidateSession({ ...s, applications: apps });
        }
      } catch {}
    })();
  }, [candidate?.id]);

  const switchApplication = (a: CandidateApplication) => {
    const s = getCandidateSession();
    if (s) {
      saveCandidateSession({
        ...s,
        candidate_id: a.candidate_id,
        public_id: a.public_id,
        project_id: a.project_id,
        company_id: a.company_id,
      });
    }
    localStorage.setItem("cand_session_id", `candidate${a.public_id || a.candidate_id}`);
    setAppsMenuOpen(false);
    const slug = a.company_slug || "";
    const vacId = a.project_id || "";
    const candId = `candidate${a.public_id || a.candidate_id}`;
    const target = slug && vacId ? `/${slug}/${vacId}/${candId}/profile` : `/${candId}/profile`;
    navigate(target);
    setTimeout(() => window.location.reload(), 50);
  };

  // Sync stage to backend
  const updateStageOnBackend = async (newStage: string, additionalPayload: any = {}) => {
    if (!candidate) return;

    try {
      const res = await fetch(`/api/candidates/${candidate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentStage: newStage,
          ...additionalPayload
        })
      });

      if (res.ok) {
        const updated = await res.json();
        setCandidate(updated);
        setCurrentStage(newStage);
      }
    } catch (err) {
      console.error("Error syncing candidate stage:", err);
    }
  };

  // --- STAGE 2: 3-STEP INTEGRATED INTERVIEW AND SCORING STAGE ---
  const [resumeAnalysing, setResumeAnalysing] = useState(false);
  const [resumeFeedback, setResumeFeedback] = useState("");
  
  const [checklistAnalysing, setChecklistAnalysing] = useState(false);
  const [checklistFeedback, setChecklistFeedback] = useState("");
  
  const [situationsAnalysing, setSituationsAnalysing] = useState(false);
  
  // 20 Checklist questions state
  const [checklistAnswers, setChecklistAnswers] = useState<{ question: string; answer: string; type?: string; options?: string[] }[]>([]);
  const [checklistSysAnswers, setChecklistSysAnswers] = useState<{ question: string; answer: string; type?: string; options?: string[] }[]>([]);
  const [activeChecklistPart, setActiveChecklistPart] = useState<"prof" | "sys">("prof");
  const [checklistSysFeedback, setChecklistSysFeedback] = useState("");
  const [checklistSysAnalysing, setChecklistSysAnalysing] = useState(false);

  // 3 situational cases
  const [situationsList, setSituationsList] = useState<any[]>([]);
  const [activeSitIdx, setActiveSitIdx] = useState(0);
  const [activeSitTextInput, setActiveSitTextInput] = useState("");
  const [sitEvaluatingId, setSitEvaluatingId] = useState<string | null>(null);

  // Resume Drag & Drop Usability handling
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeTextEntry, setResumeTextEntry] = useState("Имеется высшее образование, 3 года успешных продаж в ИТ-компании, владею amoCRM, навыки активного ведения переговоров.");
  const [isDragOver, setIsDragOver] = useState(false);
  const [attachmentUploaded, setAttachmentUploaded] = useState(false);

  // Helper inside CandidateFlow to refresh Candidate session
  const refreshCandidate = async () => {
    if (!candidate) return;
    try {
      const res = await fetch(`/api/candidates`);
      const list = await res.json();
      const current = list.find((c: any) => c.id === candidate.id);
      if (current) {
        setCandidate(current);
        setCurrentStage(current.currentStage || "terms");
      }
    } catch (e) {
      console.error("Error refreshing candidate:", e);
    }
  };

  // Run initialisers for the 20 checklist questions and 3 situations
  const initSituations = (role: string) => {
    const sit1 = {
      id: "sit_1",
      title: "Кейс 1: Работа с возражениями 'Дорого'",
      desc: "Клиент говорит: 'У ваших конкурентов аналогичное решение стоит на 30% дешевле, не вижу смысла платить больше'.",
      botPrompt: "Я ухожу к конкурентам. Почему я должен переплачивать вам за то же самое?",
      transcript: [
        { sender: "bot", text: "Я ухожу к конкурентам. Почему я должен переплачивать вам за то же самое?" }
      ] as { sender: "bot" | "user", text: string }[],
      score: 0,
      feedback: "",
      submitted: false,
    };
    const sit2 = {
      id: "sit_2",
      title: "Кейс 2: Требование невозможного дедлайна",
      desc: "Руководитель требует внести критическое изменение в проект к сегодняшнему вечеру, хотя на это требуется минимум три дня.",
      botPrompt: "Мне все равно на технические сложности! Запуск сегодня вечером, иначе мы сорвем контракт с партнером и виноваты будете вы. Сделаете?",
      transcript: [
        { sender: "bot", text: "Мне все равно на технические сложности! Запуск сегодня вечером, иначе мы сорвем контракт с партнером и виноваты будете вы. Сделаете?" }
      ] as { sender: "bot" | "user", text: string }[],
      score: 0,
      feedback: "",
      submitted: false,
    };
    const sit3 = {
      id: "sit_3",
      title: "Кейс 3: Согласование бюджетов с Финдиром",
      desc: "Вам необходимо защитить перед финансовым директором целесообразность закупки современного ПО для оптимизации работы за 50 тыс. руб.",
      botPrompt: "Наш бюджет расписан до копейки. Зачем нам переплачивать за ваши модные ИИ-инструменты?",
      transcript: [
        { sender: "bot", text: "Наш бюджет расписан до копейки. Зачем нам переплачивать за ваши модные ИИ-инструменты?" }
      ] as { sender: "bot" | "user", text: string }[],
      score: 0,
      feedback: "",
      submitted: false,
    };
    
    const normRole = (role || "").toLowerCase();
    if (normRole.includes("разработ") || normRole.includes("it") || normRole.includes("програм") || normRole.includes("аналитик") || normRole.includes("тестир")) {
      sit1.title = "Кейс 1: Срочное внесение изменений в архитектуру";
      sit1.desc = "Заказчик требует посреди спринта переделать структуру баз данных и поменять сторонний API интеграции.";
      sit1.botPrompt = "Нам срочно нужно заменить весь платежный шлюз на Stripe уже к завтрашнему утру для презентации инвесторам! Справитесь?";
      sit1.transcript = [
        { sender: "bot", text: "Нам срочно нужно заменить весь платежный шлюз на Stripe уже к завтрашнему утру для презентации инвесторам! Справитесь?" }
      ];
      
      sit2.title = "Кейс 2: Критическая регрессия на прод сервере";
      sit2.desc = "База полетела прямо во время демонстрации заказчикам. Ведущий девопс-инженер недоступен.";
      sit2.botPrompt = "Все лежит! Пользователи видят 500 ошибку. Что вы будете предпринимать прямо сейчас?";
      sit2.transcript = [
        { sender: "bot", text: "Все лежит! Пользователи видят 500 ошибку, а через час у нас созвон с крупным фондом. Что вы будете предпринимать прямо сейчас?" }
      ];
      
      sit3.title = "Кейс 3: Архитектурные разногласия с Тимлидом";
      sit3.desc = "Вы считаете, что нужно использовать масштабируемый NoSQL, а тимлид настаивает на традиционной реляционной СУБД.";
      sit3.botPrompt = "NoSQL принесет кучу проблем в будущем с поддержкой транзакций. Давай писать на PostgreSQL. Обоснуй аргументы.";
      sit3.transcript = [
        { sender: "bot", text: "NoSQL принесет кучу проблем в будущем с поддержкой транзакций. Давай писать на PostgreSQL. Обоснуй аргументы в копилку своей идеи." }
      ];
    }
    
    setSituationsList([sit1, sit2, sit3]);
  };

  // Populate checklist questions and cases when candidate context resolves
  useEffect(() => {
    const loadAllChecklistsAndCases = async () => {
      if (!candidate) return;
      const role = candidate.roleName || project?.roleName || "Менеджер";
      const company = project?.companyName || "Компания";

      try {
        // Load Profession Checklist
        if (checklistAnswers.length === 0) {
          const respProf = await fetch(`/api/get-questions?category=checklist_prof&roleName=${encodeURIComponent(role)}&companyName=${encodeURIComponent(company)}`);
          const qsPr = await respProf.json();
          setChecklistAnswers(qsPr.map((qObj: any) => ({
            question: qObj.question,
            type: qObj.type,
            options: qObj.options,
            correctAnswer: qObj.correctAnswer,
            userAnswer: qObj.type === "select" ? qObj.options?.[0] || "" : getSmartDefaultAnswer(qObj.question, role),
            answer: qObj.type === "select" ? qObj.options?.[0] || "" : getSmartDefaultAnswer(qObj.question, role)
          })));
        }

        // Load System Checklist
        if (checklistSysAnswers.length === 0) {
          const respSys = await fetch(`/api/get-questions?category=checklist_sys&roleName=${encodeURIComponent(role)}&companyName=${encodeURIComponent(company)}`);
          const qsSy = await respSys.json();
          setChecklistSysAnswers(qsSy.map((qObj: any) => ({
            question: qObj.question,
            type: qObj.type,
            options: qObj.options,
            correctAnswer: qObj.correctAnswer,
            userAnswer: qObj.type === "select" ? qObj.options?.[0] || "" : getSmartDefaultAnswer(qObj.question, role),
            answer: qObj.type === "select" ? qObj.options?.[0] || "" : getSmartDefaultAnswer(qObj.question, role)
          })));
        }

        initSituations(role);
      } catch (err) {
        console.error("Error loading checklist questions from backend:", err);
      }
    };

    if (candidate && (checklistAnswers.length === 0 || checklistSysAnswers.length === 0)) {
      loadAllChecklistsAndCases();
    }
  }, [candidate, project]);

  // Списать 1 лимит интервью/обучения работодателю — идемпотентно.
  const spendStagePack = async (kind: "interview" | "training") => {
    try {
      const pubId = (candidate as any)?.publicId || (candidate?.id || "").replace(/^candidate/, "");
      if (!pubId) return;
      const { data: cand } = await supabase
        .from("candidates")
        .select("id")
        .eq("public_id", pubId)
        .maybeSingle();
      if (!cand?.id) return;
      const { error } = await supabase.rpc("spend_pack", { _candidate: cand.id, _kind: kind });
      if (error) console.warn(`spend_pack(${kind}) failed`, error.message);
    } catch (e) {
      console.warn(`spend_pack(${kind}) failed`, e);
    }
  };

  // Stage 1 -> Stage 2 (Interviewing)
  const handleStartInterview = () => {
    setInterviewSubTab("resume");
    updateStageOnBackend("interview");
    spendStagePack("interview");
  };

  const handleEvaluateResume = async () => {
    if (!candidate) return;
    setResumeAnalysing(true);
    try {
      const { aiEvaluate } = await import("@/lib/aiClient");
      const result: any = await aiEvaluate({
        mode: "resume",
        candidate_id: candidate.id,
        project_id: candidate.projectId,
        payload: {
          role_name: candidate.roleName,
          resume: resumeTextEntry + (resumeFile ? ` [Файл: ${resumeFile.name}]` : ""),
        },
      });
      const feedback = result?.summary || `Сильные стороны: ${(result?.strengths || []).join(", ")}\nПробелы: ${(result?.gaps || []).join(", ")}`;
      setResumeFeedback(feedback);
      await refreshCandidate();
    } catch (e) {
      console.error(e);
    } finally {
      setResumeAnalysing(false);
    }
  };

  const handleEvaluateChecklist = async () => {
    if (!candidate) return;
    const isSys = activeChecklistPart === "sys";
    if (isSys) {
      setChecklistSysAnalysing(true);
    } else {
      setChecklistAnalysing(true);
    }
    try {
      const { aiEvaluate } = await import("@/lib/aiClient");
      const result: any = await aiEvaluate({
        mode: "checklist",
        candidate_id: candidate.id,
        project_id: candidate.projectId,
        payload: {
          is_system: isSys,
          answers: isSys ? checklistSysAnswers : checklistAnswers,
        },
      });
      const feedback = `Итог: ${result?.total ?? "—"}/100\n` +
        (result?.items || []).map((it: any, i: number) => `${i+1}. ${it.feedback || ""}`).join("\n");
      if (isSys) setChecklistSysFeedback(feedback);
      else setChecklistFeedback(feedback);
      await refreshCandidate();
    } catch (e) {
      console.error(e);
    } finally {
      setChecklistAnalysing(false);
      setChecklistSysAnalysing(false);
    }
  };

  const handleSendSituationMessage = async (idx: number) => {
    if (!activeSitTextInput.trim()) return;
    const currentList = [...situationsList];
    const targetSit = currentList[idx];
    if (targetSit.submitted) return;

    targetSit.transcript.push({ sender: "user", text: activeSitTextInput });
    const userMsgText = activeSitTextInput;
    setActiveSitTextInput("");
    setSituationsList(currentList);

    setSitEvaluatingId(targetSit.id);
    try {
      const { aiEvaluate } = await import("@/lib/aiClient");
      const result: any = await aiEvaluate({
        mode: "situations",
        candidate_id: candidate?.id,
        project_id: candidate?.projectId,
        payload: { answers: [{ question: targetSit.title || targetSit.desc, answer: userMsgText }] },
      });
      {
        targetSit.score = result?.total ?? result?.items?.[0]?.score ?? 85;
        targetSit.feedback = result?.advice || result?.items?.[0]?.feedback || "Прекрасно обыграли ситуацию!";
        targetSit.transcript.push({
          sender: "bot",
          text: `🎯 Оценка за кейс: ${targetSit.score} / 100 баллов.\n\nРазбор Робота:\n${targetSit.feedback}`
        });
        targetSit.submitted = true;
        setSituationsList(currentList);
        await refreshCandidate();
      }
    } catch (e) {
      console.error(e);
      targetSit.transcript.push({ sender: "bot", text: "Ошибка связи с ИИ-рекрутером. Пожалуйста, попробуйте еще раз!" });
      setSituationsList(currentList);
    } finally {
      setSitEvaluatingId(null);
    }
  };

  const handleFinishRoleplay = async () => {
    if (!candidate) return;
    setSituationsAnalysing(true);
    try {
      const formattedCaseAnswers = situationsList.map(sit => ({
        question: sit.title,
        answer: sit.transcript.map((t: any) => `${t.sender === "user" ? "Вы" : "Робот"}: ${t.text}`).join("\n")
      }));
      const { aiEvaluate } = await import("@/lib/aiClient");
      await aiEvaluate({
        mode: "situations",
        candidate_id: candidate.id,
        project_id: candidate.projectId,
        payload: { answers: formattedCaseAnswers },
      });
      await refreshCandidate();
      await updateStageOnBackend("scoring");
      setActiveTab("scoring");
    } catch (e) {
      console.error(e);
    } finally {
      setSituationsAnalysing(false);
    }
  };

  // Resume Drag & Drop Usability handling
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = () => {
    setIsDragOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setResumeFile(e.dataTransfer.files[0]);
      setAttachmentUploaded(true);
    }
  };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setResumeFile(e.target.files[0]);
      setAttachmentUploaded(true);
    }
  };

  // --- STAGE 4: INTERACTIVE TRAINING & LESSON PANEL ---
  const [activeLessonIdx, setActiveLessonIdx] = useState(0);

  const getTrainingBlockIdx = () => {
    if (trainingSubTab === "professional") return 0;
    if (trainingSubTab === "product") return 1;
    if (trainingSubTab === "system") return 2;
    return 0;
  };

  // Active quiz choice
  const [selectedQuizIdx, setSelectedQuizIdx] = useState<number | null>(null);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizMessage, setQuizMessage] = useState("");
  const [quizError, setQuizError] = useState(false);

  // Training Exam states for hybrid 20 questions (10 select, 10 text)
  const [trainingAnswers, setTrainingAnswers] = useState<any[]>([]);
  const [trainingExamSubmitted, setTrainingExamSubmitted] = useState(false);
  const [trainingExamFeedback, setTrainingExamFeedback] = useState("");
  const [trainingExamScore, setTrainingExamScore] = useState(0);
  const [trainingExamAnalysing, setTrainingExamAnalysing] = useState(false);
  const [activeTrainingSubSectionIdx, setActiveTrainingSubSectionIdx] = useState(0);

  // Auto load active lesson's 20 quizzes
  const bIdxLocal = getTrainingBlockIdx();
  const currentBlockObj = candidate?.trainingPlan?.[bIdxLocal];
  const activeLessonObj = currentBlockObj?.lessons?.[activeLessonIdx];

  useEffect(() => {
    setActiveTrainingSubSectionIdx(0);
  }, [trainingSubTab]);

  useEffect(() => {
    if (activeLessonObj && activeLessonObj.quizzes) {
      setTrainingAnswers(activeLessonObj.quizzes.map((q: any) => ({
        ...q,
        userAnswer: q.userAnswer || ""
      })));
      setTrainingExamSubmitted(activeLessonObj.isCompleted || false);
      setTrainingExamFeedback(activeLessonObj.quizFeedback || "");
      setTrainingExamScore(activeLessonObj.score || 0);
    } else {
      setTrainingAnswers([]);
      setTrainingExamSubmitted(false);
      setTrainingExamFeedback("");
      setTrainingExamScore(0);
    }
  }, [activeLessonObj]);

  const handleTrainingExamSubmit = async () => {
    if (!candidate) return;
    setTrainingExamAnalysing(true);
    try {
      const bIdx = getTrainingBlockIdx();
      const { aiEvaluate } = await import("@/lib/aiClient");
      const result: any = await aiEvaluate({
        mode: "training_block",
        candidate_id: candidate.id,
        project_id: candidate.projectId,
        payload: { block_index: bIdx, answers: trainingAnswers },
      });
      setTrainingExamScore(result?.block_score ?? 0);
      setTrainingExamFeedback(result?.summary || "");
      setTrainingExamSubmitted(true);
      await refreshCandidate();
    } catch (e) {
      console.error(e);
    } finally {
      setTrainingExamAnalysing(false);
    }
  };

  const handleLessonQuizSubmit = () => {
    if (!candidate || !candidate.trainingPlan) return;
    if (selectedQuizIdx === null) return;

    const bIdx = getTrainingBlockIdx();
    const block = candidate.trainingPlan[bIdx];
    if (!block) return;
    const lesson = block.lessons[activeLessonIdx];

    if (lesson && lesson.quiz) {
      const isCorrect = selectedQuizIdx === lesson.quiz.answerIndex;
      setQuizSubmitted(true);

      if (isCorrect) {
        setQuizError(false);
        setQuizMessage("✨ Отлично! Правильный ответ! Вы успешно усвоили урок.");
        
        // Mark lesson complete dynamically in training plan arrays
        const updatedPlan = [...candidate.trainingPlan];
        updatedPlan[bIdx].lessons[activeLessonIdx].isCompleted = true;

        // Check if all lessons across all blocks are finished
        const allCompleted = updatedPlan.every(b => b.lessons.every(l => l.isCompleted));
        
        if (allCompleted) {
          updateStageOnBackend("certified", { trainingPlan: updatedPlan });
        } else {
          // Sync current block complete back to backend
          updateStageOnBackend("training", { trainingPlan: updatedPlan });
        }
      } else {
        setQuizError(true);
        setQuizMessage("❌ Неверный ответ. Пожалуйста, внимательно изучите теорию урока выше и попробуйте еще раз.");
      }
    }
  };

  const handleNextLesson = () => {
    if (!candidate || !candidate.trainingPlan) return;

    setSelectedQuizIdx(null);
    setQuizSubmitted(false);
    setQuizMessage("");

    const bIdx = getTrainingBlockIdx();
    const block = candidate.trainingPlan[bIdx];
    if (!block) return;
    const nextLessonIdx = activeLessonIdx + 1;

    if (nextLessonIdx < block.lessons.length) {
      setActiveLessonIdx(nextLessonIdx);
    } else {
      // Auto move to next subtab of training block to represent successful flow progression!
      if (trainingSubTab === "professional") {
        setTrainingSubTab("product");
        setActiveLessonIdx(0);
      } else if (trainingSubTab === "product") {
        setTrainingSubTab("system");
        setActiveLessonIdx(0);
      } else {
        // finished system, check if certified is set
        setActiveTab("certified");
      }
    }
  };


  const tabsList = [
    { id: "profile", title: "👤 Профиль", desc: "Мой кабинет" },
    { id: "terms", title: "📋 Условия", desc: "О вакансии" },
    { id: "interview", title: "💬 Собесед-ние", desc: "Блиц HR-ИИ" },
    { id: "scoring", title: "🎯 Оценка", desc: "Анализ баллов" },
    { id: "training", title: "📚 ИИ обучение", desc: "Курс и тесты" },
    { id: "certified", title: "🏆 Сертификат", desc: "Мой диплом" }
  ];

  return (
    <div className="bg-gradient-to-b from-[#17344F] to-[#265582] min-h-screen text-white font-sans antialiased selection:bg-[#E7C768] selection:text-[#17344F] flex flex-col justify-between">
      
      {/* Top Header Navigation with Direct Access Bypasses for Candidates */}
      <header className="sticky top-0 z-50 bg-[#17344F]/95 backdrop-blur-md border-b border-white/10 px-4 md:px-8 py-3">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4 w-full">
          {/* Logo & Vacancy info */}
          <div className="flex items-center gap-2.5 cursor-pointer w-full lg:w-auto" onClick={() => { const id = candidate?.id || localStorage.getItem("cand_session_id") || ""; if (id) navigate(`/${id}/profile`); }}>
            <div className="bg-[#E7C768]/10 p-1.5 rounded-xl border border-[#E7C768]/20">
              <img src="https://i.ibb.co/WWRbtPq0/RR-Logo.png" alt="RR" className="w-8 h-8 object-contain" />
            </div>
            <div className="text-left">
              <span className="font-extrabold text-sm tracking-tight text-[#E7C768] block leading-none">ЛИЧНЫЙ КАБИНЕТ СОИСКАТЕЛЯ</span>
              <span className="text-[10px] block text-slate-350 mt-1">
                ID кандидата: <strong className="text-white font-mono">{candidate?.id || localStorage.getItem("cand_session_id") || "—"}</strong>
              </span>
            </div>
          </div>

          {/* Dedicated page tabs directly in header */}
          <nav className="hidden md:flex items-center bg-black/25 p-1 rounded-xl border border-white/5 gap-1 text-xs">
            {tabsList.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  type="button"
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`cursor-pointer px-3 py-2 rounded-lg font-bold transition-all text-center flex items-center gap-1.5 whitespace-nowrap ${
                    isActive
                      ? "bg-[#E7C768] text-[#17344F] shadow-md scale-102"
                      : "text-slate-300 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <span className="text-[11px]">{tab.title}</span>
                </button>
              );
            })}
          </nav>

          {/* Right section: Name & Logout button */}
          <div className="hidden lg:flex items-center gap-3">
            {applications.length > 1 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAppsMenuOpen(o => !o)}
                  className="cursor-pointer bg-[#E7C768]/10 hover:bg-[#E7C768]/20 border border-[#E7C768]/30 text-[#E7C768] px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5"
                  title="Переключить отклик"
                >
                  📂 Мои отклики · {applications.length}
                </button>
                {appsMenuOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-[#17344F] border border-white/10 rounded-xl shadow-2xl p-2 z-50 max-h-96 overflow-y-auto">
                    {applications.map(a => {
                      const isActive = a.candidate_id === candidate?.id || a.public_id === (candidate as any)?.publicId;
                      return (
                        <button
                          key={a.candidate_id}
                          type="button"
                          onClick={() => switchApplication(a)}
                          className={`w-full text-left px-3 py-2 rounded-lg text-xs transition mb-1 ${
                            isActive ? "bg-[#E7C768] text-[#17344F] font-bold" : "text-slate-200 hover:bg-white/5"
                          }`}
                        >
                          <div className="font-bold">{a.role_name || "Вакансия"}</div>
                          <div className={`text-[10px] ${isActive ? "text-[#17344F]/80" : "text-slate-400"}`}>
                            {a.company_name || "Компания"} · {a.current_stage || "—"}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {candidate && (
              <div className="bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl text-left text-xs">
                <span className="text-slate-400 text-[10px] block font-normal leading-tight">Авторизован:</span>
                <strong className="text-[#E7C768] font-bold block mt-0.5">{candidate.name || "Соискатель"}</strong>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem("cand_session_id");
                localStorage.removeItem("cand_role");
                navigate("/main");
              }}
              className="cursor-pointer bg-red-500/10 hover:bg-red-500/20 text-red-300 hover:text-red-200 border border-red-500/20 hover:border-red-500/35 px-3.5 py-2 rounded-xl font-bold transition text-xs flex items-center gap-1.5"
              title="Выйти из кабинета"
            >
              <span>Выйти 🚪</span>
            </button>
          </div>

          {/* Mobile top-bar controls */}
          <div className="flex md:hidden items-center justify-between w-full border-t border-white/5 pt-2 mt-0.5">
            {candidate && (
              <span className="text-[11px] font-semibold text-[#E7C768] truncate max-w-[200px]">
                👤 {candidate.name}
              </span>
            )}
            <button 
              type="button"
              className="flex items-center justify-center p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-all ml-auto"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-5 h-5 text-[#E7C768]" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu container featuring the tabs directly */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-3 pt-3 border-t border-white/10 flex flex-col gap-2">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block px-2 mb-1">Разделы кабинета:</span>
            {tabsList.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  type="button"
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`transition text-left w-full px-4 py-3 rounded-xl flex items-center justify-between ${
                    isActive
                      ? "bg-[#E7C768] text-[#17344F] font-bold"
                      : "text-slate-300 hover:text-white hover:bg-white/5 font-semibold"
                  }`}
                >
                  <span className="text-xs">{tab.title}</span>
                  <span className="text-[10px] opacity-80 font-normal">{tab.desc}</span>
                </button>
              );
            })}
            <div className="h-px bg-white/5 my-1"></div>
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem("cand_session_id");
                localStorage.removeItem("cand_role");
                setMobileMenuOpen(false);
                navigate("/main");
              }}
              className="cursor-pointer text-left w-full px-4 py-3 rounded-xl hover:bg-red-500/10 text-red-300 font-bold transition flex items-center gap-2"
            >
              <span>Выйти из кабинета 🚪</span>
            </button>
          </div>
        )}

        {/* Fallback tablet/mobile secondary inline nav to allow tab selection without menu for sizes md -> lg */}
        <div className="hidden md:flex lg:hidden items-center justify-center bg-[#17344F]/50 p-1.5 rounded-xl border border-white/10 mt-3 gap-1">
          {tabsList.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                type="button"
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`cursor-pointer px-2.5 py-1.5 rounded-lg font-semibold transition text-[11px] ${
                  isActive ? "bg-[#E7C768] text-[#17344F]" : "text-slate-300 hover:text-white"
                }`}
              >
                {tab.title}
              </button>
            );
          })}
        </div>
      </header>

      {/* Main interactive Stepper panel */}
      <main className="flex-1 py-8 px-4 md:px-8 max-w-5xl mx-auto w-full">
        
        {/* Tab 1: Profile tab */}
        {activeTab === "profile" && (
          <div className="bg-[#1E4468]/15 border border-white/10 shadow-2xl backdrop-blur-md rounded-3xl p-6 md:p-8 space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-white/10">
              <div className="text-left">
                <span className="text-[#E7C768] font-bold text-xs uppercase tracking-wider block">Личный кабинет соискателя</span>
                <h2 className="text-2xl font-bold text-white mt-1">Профиль кандидата: {candidate?.name || "Алексей Иванов"}</h2>
                <p className="text-xs text-gray-300 mt-1">
                  Зарегистрирован через {candidate?.registeredVia === "telegram" ? "Telegram 🤖" : "Email ✉️"}. Идентификатор сессии: <span className="font-mono text-xs text-[#E7C768]">{candidate?.id || "—"}</span>
                </p>
              </div>
              
              <button
                type="button"
                onClick={() => setEditingProfile(!editingProfile)}
                className="cursor-pointer bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-white font-bold text-xs px-4 py-2.5 rounded-xl transition hover:opacity-95 shadow"
              >
                {editingProfile ? "Отмена редактирования" : "📝 Редактировать профиль"}
              </button>
            </div>

            {saveProfileMsg && (
              <div className="p-3 bg-emerald-500/20 text-emerald-200 border border-emerald-500/30 text-xs font-bold rounded-xl text-left">
                {saveProfileMsg}
              </div>
            )}

            {editingProfile ? (
              <form onSubmit={handleSaveProfile} className="space-y-4 max-w-xl bg-black/25 p-6 rounded-2xl border border-white/5 text-left">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">ФИО Кандидата:</label>
                    <input
                      type="text"
                      className="w-full bg-[#17344F] text-xs text-white p-2.5 rounded-xl border border-white/10 focus:outline-none focus:border-[#E7C768]"
                      value={profName}
                      onChange={(e) => setProfName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">Email (Почта):</label>
                    <input
                      type="email"
                      className="w-full bg-[#17344F] text-xs text-white p-2.5 rounded-xl border border-white/10 focus:outline-none focus:border-[#E7C768]"
                      value={profEmail}
                      onChange={(e) => setProfEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs font-bold text-slate-300">Никнейм в Телеграм (без @):</label>
                    <input
                      type="text"
                      className="w-full bg-[#17344F] text-xs text-white p-2.5 rounded-xl border border-white/10 focus:outline-none focus:border-[#E7C768]"
                      value={profTelegram}
                      placeholder="alex_ivanov_sale"
                      onChange={(e) => setProfTelegram(e.target.value)}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="cursor-pointer bg-[#E7C768] hover:bg-[#E7C768]/90 text-[#17344F] font-bold text-xs py-2.5 px-5 rounded-xl transition"
                >
                  Сохранить изменения
                </button>
              </form>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* 1. Google + Telegram metadata details */}
                <div className="bg-black/25 p-5 rounded-2xl border border-white/5 space-y-4 text-left">
                  <h3 className="font-bold text-xs text-[#E7C768] uppercase border-b border-white/5 pb-2">🌐 Регистрация & Интеграции</h3>
                  
                  {/* Google Profile Data */}
                  <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="bg-red-500/10 text-red-400 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider">Google Auth</div>
                      <span className="text-[10px] text-emerald-400 font-semibold">● Активен</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <img 
                        src={candidate?.googleAvatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${candidate?.id || 'alex'}`} 
                        alt="Google avatar" 
                        className="w-11 h-11 rounded-xl border border-white/10 shrink-0"
                        referrerPolicy="no-referrer"
                      />
                      <div className="text-xs min-w-0">
                        <div className="text-slate-400 text-[9px] uppercase tracking-wide">ФИО в Google:</div>
                        <strong className="text-white font-bold block truncate">{candidate?.googleName || candidate?.name || "Алексей Иванов"}</strong>
                        <div className="text-slate-400 text-[9px] uppercase tracking-wide mt-2">Почта Google:</div>
                        <span className="text-[#E7C768] font-mono text-[11px] block truncate">{candidate?.googleEmail || candidate?.email || "ivanov@example.com"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Telegram Profile Data */}
                  <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="bg-sky-500/10 text-sky-400 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider">Telegram Bot</div>
                      <span className={candidate?.telegramId ? "text-emerald-400 text-[10px] font-semibold" : "text-yellow-400 text-[10px] font-semibold"}>
                        {candidate?.telegramId ? "● Привязан" : "○ Не привязан"}
                      </span>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <img 
                        src={candidate?.telegramAvatar || `https://api.dicebear.com/7.x/identicon/svg?seed=tg_${candidate?.id || 'demo'}`} 
                        alt="Telegram avatar" 
                        className="w-11 h-11 rounded-xl border border-white/10 shrink-0"
                        referrerPolicy="no-referrer"
                      />
                      <div className="text-xs min-w-0 space-y-1">
                        <div>
                          <div className="text-slate-400 text-[9px] uppercase tracking-wide">ФИО в Telegram:</div>
                          <strong className="text-white font-bold block truncate">
                            {candidate?.telegramFirstName || "Алексей"} {candidate?.telegramLastName || "Иванов"}
                          </strong>
                        </div>
                        <div>
                          <div className="text-slate-400 text-[9px] uppercase tracking-wide">ID Телеграм:</div>
                          <span className="text-slate-300 font-mono text-[11px] block">{candidate?.telegramId || "123456789 (тест)"}</span>
                        </div>
                        <div>
                          <div className="text-slate-400 text-[9px] uppercase tracking-wide">Юзернейм:</div>
                          {candidate?.telegramUsername ? (
                            <a 
                              href={`https://t.me/${candidate.telegramUsername}`} 
                              target="_blank" 
                              className="text-[#E7C768] font-extrabold hover:text-[#f3da82] underline flex items-center gap-1 text-[11px] mt-0.5" 
                              rel="noreferrer"
                            >
                              @{candidate.telegramUsername} <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          ) : (
                            <span className="text-slate-450 italic text-[10px]">не привязан</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Onboarding map Checklist progression */}
                <div className="bg-black/25 p-5 rounded-2xl border border-white/5 space-y-4 text-left">
                  <h3 className="font-bold text-xs text-[#E7C768] uppercase border-b border-white/5 pb-2">Степень прохождения</h3>
                  <div className="space-y-3.5 text-xs">
                    {[
                      { id: "terms", title: "Желаемые условия изучены", stageVal: "terms" },
                      { id: "interview", title: "ИИ Собеседование пройдено", stageVal: "interview" },
                      { id: "scoring", title: "Анализ и оценка баллов", stageVal: "scoring" },
                      { id: "training", title: "Корпоративное ИИ Обучение", stageVal: "training" },
                      { id: "certified", title: "Выдан электронный сертификат", stageVal: "certified" }
                    ].map((step, idx) => {
                      const stagesList = ["terms", "interview", "scoring", "training", "certified"];
                      const currentIdx = stagesList.indexOf(currentStage);
                      const isPast = currentIdx > idx;
                      const isCurrent = currentStage === step.stageVal;
                      return (
                        <div key={step.id} className="flex items-start gap-2.5 p-1">
                          <CheckCircle className={`w-4 h-4 shrink-0 mt-0.5 ${isPast ? "text-emerald-400" : isCurrent ? "text-[#E7C768] animate-pulse" : "text-gray-600"}`} />
                          <div className="min-w-0">
                            <span className={`${isCurrent ? "text-[#E7C768] font-extrabold" : isPast ? "text-slate-200" : "text-gray-400"}`}>
                              {step.title}
                            </span>
                            {isCurrent && (
                              <span className="block text-[9px] text-[#E7C768]/80 font-semibold mt-0.5 uppercase tracking-wider">Текущий шаг ИИ-отбора</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Active Job context card & Multi-vacancy system */}
                <div className="bg-black/25 p-5 rounded-2xl border border-white/5 space-y-4 text-left">
                  <h3 className="font-bold text-xs text-[#E7C768] uppercase border-b border-white/5 pb-2">📂 Выберите Компанию & Вакансию</h3>
                  
                  {!(path.split("/").filter(Boolean).length >= 4 && path.split("/").filter(Boolean).findIndex(p => p.startsWith("candidate")) >= 2) && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-200 leading-normal mb-2">
                      ⚠️ Пожалуйста, <strong>выберите одну из активных вакансий ниже</strong>, чтобы начать проходить этапы ИИ-собеседования для соответствующего работодателя.
                    </div>
                  )}

                  <div className="space-y-4 max-h-[350px] overflow-y-auto scrollbar-thin pr-1 text-xs">
                    {allProjects.map((proj) => {
                      const slug = proj.companySlug || "";
                      const candidateId = candidate?.id || "";
                      const isSelected = project?.id === proj.id;
                      
                      // Precise tab path keeping current states
                      const targetPathOfThisProj = `/${slug}/${proj.id}/${candidateId}/profile`;

                      return (
                        <div 
                          key={proj.id} 
                          className={`p-3.5 rounded-xl border transition-all duration-300 ${
                            isSelected 
                              ? "bg-[#E7C768]/15 border-[#E7C768] shadow-sm" 
                              : "bg-[#1E4468]/20 border-white/5 hover:border-[#E7C768]/40 hover:bg-[#1E4468]/35"
                          }`}
                        >
                          <div className="flex justify-between items-start gap-2">
                            <div className="min-w-0">
                              <span className="text-[10px] text-slate-300 font-bold block uppercase tracking-wide truncate">{proj.companyName || "ООО РобоРекрут"}</span>
                              <strong className={`${isSelected ? "text-[#E7C768]" : "text-white"} font-extrabold text-xs block mt-0.5`}>{proj.roleName}</strong>
                            </div>
                            {isSelected && (
                              <span className="text-[8px] bg-[#E7C768] text-[#112335] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider whitespace-nowrap">Активна</span>
                            )}
                          </div>
                          
                          <div className="mt-3 pt-2.5 border-t border-white/5 space-y-2">
                            <button
                              type="button"
                              onClick={async () => {
                                if (!candidate) return;
                                try {
                                  // 1. PATCH backend candidate projectId
                                  await fetch(`/api/candidates/${candidate.id}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      projectId: proj.id,
                                      roleName: proj.roleName
                                    })
                                  });
                                  // 2. Local state update
                                  setProject(proj);
                                  // 3. Move to high-fidelity /{companySlug}/{id}/{candidateId}/profile url format
                                  navigate(targetPathOfThisProj);
                                } catch (e) {
                                  console.error("Error patching project selection:", e);
                                }
                              }}
                              className={`cursor-pointer text-[10px] w-full font-bold px-3 py-2 rounded-xl text-center transition-all duration-200 flex items-center justify-center gap-1.5 ${
                                isSelected 
                                  ? "bg-[#E7C768] text-[#112335] hover:bg-[#f3ea8b]" 
                                  : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white border border-white/10"
                              }`}
                            >
                              <span>{isSelected ? "Перейти к условиям вакансии" : "Выбрать и Активировать"}</span>
                              <ArrowRight className="w-3 h-3 shrink-0" />
                            </button>
                            
                            {isSelected && (
                              <div className="pt-1.5">
                                <span className="text-[9px] text-slate-400 block font-mono">Адрес страницы кандидата:</span>
                                <div className="bg-black/35 p-2 rounded-lg border border-white/5 overflow-x-auto text-[9px] text-[#E7C768] font-mono whitespace-nowrap scrollbar-thin mt-1">
                                  {`/${slug}/${proj.id}/${candidateId}/profile`}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            )}

            {/* Resume Upload Module */}
            <div className="bg-black/15 p-5 border border-white/5 rounded-2xl text-left">
              <h3 className="font-bold text-xs text-[#E7C768] uppercase pb-2 mb-3 border-b border-white/15">
                📁 Файловое досье кандидата (Резюме и Документы)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                <div className="space-y-2 text-xs text-slate-300">
                  <p>
                    Для улучшения ИИ-аналитики и более точной оценки выставите подробное описание опыта в поле ниже или загрузите резюме в формате PDF.
                  </p>
                  <p className="font-mono text-[10px] text-emerald-400">
                    Статус файла: {resumeFile ? `✅ Загружен: ${resumeFile.name}` : "⚠️ Файл не загружен. Используется текстовое резюме"}
                  </p>
                </div>

                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-2xl p-5 text-center transition ${
                    isDragOver 
                      ? "border-[#E7C768] bg-amber-950/20" 
                      : attachmentUploaded 
                      ? "border-emerald-500 bg-emerald-950/20" 
                      : "border-white/10 bg-black/20 hover:border-[#E7C768]"
                  }`}
                >
                  <Upload className="w-5 h-5 text-gray-400 mx-auto" />
                  <div className="text-xs font-bold text-gray-300 mt-1">
                    {attachmentUploaded ? "✅ Файл резюме прикреплен" : "Перетащите PDF сюда"}
                  </div>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleFileChange}
                    className="hidden"
                    id="profile-resume-input"
                  />
                  <label
                    htmlFor="profile-resume-input"
                    className="cursor-pointer inline-block mt-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg text-[10px] font-bold text-center hover:bg-white/10 transition"
                  >
                    Обзор файлов
                  </label>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* Tab 2: Terms & Conditions with nested tabs */}
        {activeTab === "terms" && (
          <div className="bg-[#1E4468]/15 border border-white/10 shadow-2xl backdrop-blur-md rounded-3xl overflow-hidden min-h-[480px] flex flex-col md:flex-row">
            
            {/* Left/Internal Sub navigation list */}
            <div className="w-full md:w-56 bg-gradient-to-b from-[#17344F] to-[#1F2E3E]/70 p-4 border-r border-white/10 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="border-b border-white/10 pb-2 text-left">
                  <span className="text-[#E7C768] font-bold text-[10px] uppercase tracking-wider block">Разделы условий</span>
                  <h3 className="font-extrabold text-[13px] text-white">Условия работы</h3>
                </div>
                
                <div className="flex flex-col gap-1">
                  {[
                    { id: "vacancy", title: "💼 Вакансия", desc: "Суть работы" },
                    { id: "motivation", title: "🚀 Мотивация", desc: "Ваш доход и рост" },
                    { id: "company", title: "🏢 О компании", desc: "Кто мы такие" },
                    { id: "onboarding", title: "✍️ Оформление", desc: "Трудоустройство" },
                    { id: "payouts", title: "💳 Выплаты", desc: "Когда и сколько" },
                    { id: "schedule", title: "📅 График", desc: "Режим и смены" },
                    { id: "team", title: "👥 Команда", desc: "Коллеги и руководство" },
                    { id: "system", title: "⚙️ Система", desc: "Регламенты и Wiki" },
                    { id: "contacts", title: "📞 Контакты", desc: "Связаться с работодателем" }
                  ].map((subTab) => {
                    const isSelected = termsSubTab === subTab.id;
                    return (
                      <button
                        type="button"
                        key={subTab.id}
                        onClick={() => setTermsSubTab(subTab.id)}
                        className={`cursor-pointer w-full text-left p-2 rounded-xl transition duration-150 flex flex-col ${
                          isSelected
                            ? "bg-[#E7C768] text-[#17344F] shadow-md font-bold"
                            : "text-slate-300 hover:bg-white/5"
                        }`}
                      >
                        <span className="text-xs">{subTab.title}</span>
                        <span className={`text-[9px] font-normal ${isSelected ? "text-[#17344F]/80" : "text-gray-400"}`}>{subTab.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 bg-black/25 p-3 rounded-xl border border-white/5 text-center hidden md:block">
                <Mascot state="narrator" size="sm" />
                <p className="text-[10px] text-slate-300 mt-1">Ознакомьтесь со всеми вкладками, далее нажмите "Пройти собеседование"!</p>
              </div>
            </div>

            {/* Right panel details based on subTab */}
            <div className="flex-1 p-6 md:p-8 flex flex-col justify-between">
              <div className="space-y-6 text-left">
                
                {termsSubTab === "vacancy" && (
                  <div className="space-y-4 animate-fadeIn">
                    <span className="text-[#E7C768] text-xs font-bold uppercase tracking-wider block">Опубликованная вакансия</span>
                    <h2 className="text-2xl font-bold text-white">{project?.roleName || "Специалист"}</h2>
                    <p className="text-slate-300 text-xs leading-relaxed whitespace-pre-wrap">
                      {projectFull?.vacancy_text || `Мы ищем специалиста на должность ${project?.roleName || ""}.`}
                    </p>
                    {projectFull?.tasks_activity_text && (
                      <div className="bg-white/5 p-4 rounded-xl border border-white/5 space-y-2">
                        <h4 className="text-xs font-bold text-[#E7C768] uppercase">Задачи и Деятельность</h4>
                        <p className="text-xs text-slate-300 whitespace-pre-wrap">{projectFull.tasks_activity_text}</p>
                      </div>
                    )}
                  </div>
                )}

                {termsSubTab === "motivation" && (
                  <div className="space-y-4 animate-fadeIn">
                    <span className="text-[#E7C768] text-xs font-bold uppercase tracking-wider block">Мотивационный буклет</span>
                    <h2 className="text-xl font-bold text-white">Мотивация и Карьерный рост</h2>
                    <p className="text-xs text-slate-300 leading-relaxed italic border-l-4 border-[#E7C768] pl-3 whitespace-pre-wrap">
                      {projectFull?.motivation_text || project?.motivationText || "Карьерный рост, стабильный оклад и оплачиваемое обучение."}
                    </p>
                  </div>
                )}

                {termsSubTab === "company" && (
                  <div className="space-y-4 animate-fadeIn">
                    <span className="text-[#E7C768] text-xs font-bold uppercase tracking-wider block">Манифест организации</span>
                    <h2 className="text-xl font-bold text-white">Информация о компании: {project?.companyName || "ООО Работодатель"}</h2>
                    <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                      {companyFull?.description_text || companyFull?.about_text || `Компания ${project?.companyName || ""}.`}
                    </p>
                    {companyFull?.mission_text && (
                      <div className="bg-[#E7C768]/5 p-4 rounded-xl border border-[#E7C768]/20 text-xs">
                        <h4 className="font-bold text-[#E7C768] mb-1">Миссия</h4>
                        <p className="text-slate-200 whitespace-pre-wrap">{companyFull.mission_text}</p>
                      </div>
                    )}
                    {companyFull?.products_text && (
                      <div className="bg-white/5 p-4 rounded-xl border border-white/5 text-xs">
                        <h4 className="font-bold text-[#E7C768] mb-1">Продукты и услуги</h4>
                        <p className="text-slate-200 whitespace-pre-wrap">{companyFull.products_text}</p>
                      </div>
                    )}
                  </div>
                )}

                {termsSubTab === "onboarding" && (
                  <div className="space-y-4 animate-fadeIn">
                    <span className="text-[#E7C768] text-xs font-bold uppercase tracking-wider block">Правила адаптации</span>
                    <h2 className="text-xl font-bold text-white font-serif">Оформление и трудоустройство</h2>
                    <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                      {projectFull?.onboarding_text || "Процесс оформления прозрачный, в соответствии со стандартами."}
                    </p>
                  </div>
                )}

                {termsSubTab === "payouts" && (
                  <div className="space-y-4 animate-fadeIn">
                    <span className="text-[#E7C768] text-xs font-bold uppercase tracking-wider block">Финансы</span>
                    <h2 className="text-xl font-bold text-white font-serif">Выплаты и Бонусы</h2>
                    <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                      {projectFull?.payouts_text || projectFull?.salary_terms || project?.salaryTerms || "Условия выплат уточняются."}
                    </p>
                  </div>
                )}

                {termsSubTab === "schedule" && (
                  <div className="space-y-4 animate-fadeIn">
                    <span className="text-[#E7C768] text-xs font-bold uppercase tracking-wider block">Режим работы</span>
                    <h2 className="text-xl font-bold text-white font-serif">График и Смены</h2>
                    <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                      {projectFull?.schedule_text || projectFull?.schedule_terms || project?.scheduleTerms || "График работы уточняется."}
                    </p>
                  </div>
                )}

                {termsSubTab === "team" && (
                  <div className="space-y-4 animate-fadeIn">
                    <span className="text-[#E7C768] text-xs font-bold uppercase tracking-wider block">Коллеги</span>
                    <h2 className="text-xl font-bold text-white font-serif">Ваша рабочая группа</h2>
                    <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                      {projectFull?.team_text || companyFull?.team_text || "Информация о команде уточняется."}
                    </p>
                  </div>
                )}

                {termsSubTab === "system" && (
                  <div className="space-y-4 animate-fadeIn">
                    <span className="text-[#E7C768] text-xs font-bold uppercase tracking-wider block">Регламенты</span>
                    <h2 className="text-xl font-bold text-white font-serif">Базовая Wiki-система</h2>
                    <p className="text-xs text-slate-300 leading-relaxed font-mono whitespace-pre-wrap bg-black/40 p-4 rounded-xl border border-white/5">
                      {projectFull?.system_text || companyFull?.system_text || project?.customWiki || "Регламенты уточняются."}
                    </p>
                  </div>
                )}

                {termsSubTab === "contacts" && (
                  <div className="space-y-4 animate-fadeIn">
                    <span className="text-[#E7C768] text-xs font-bold uppercase tracking-wider block">Связь с работодателем</span>
                    <h2 className="text-xl font-bold text-white font-serif">Контакты</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                      <div className="bg-black/35 p-4 rounded-xl border border-white/5">
                        <div className="text-[10px] uppercase text-slate-400 font-bold">Email</div>
                        <div className="text-white font-bold mt-1 break-all">{employerContacts.email || "—"}</div>
                      </div>
                      <div className="bg-black/35 p-4 rounded-xl border border-white/5">
                        <div className="text-[10px] uppercase text-slate-400 font-bold">Телефон</div>
                        <div className="text-white font-bold mt-1">{employerContacts.phone || "—"}</div>
                      </div>
                      <div className="bg-black/35 p-4 rounded-xl border border-white/5">
                        <div className="text-[10px] uppercase text-slate-400 font-bold">Telegram</div>
                        <div className="text-white font-bold mt-1">{employerContacts.telegram || "—"}</div>
                      </div>
                    </div>
                  </div>
                )}

              </div>

              {/* Direct path trigger button to transition candidate */}
              <div className="mt-8 pt-4 border-t border-white/10 flex flex-col sm:flex-row justify-between items-center gap-4">
                <span className="text-[11px] text-slate-400 italic text-center sm:text-left">Все разделы изучены? Теперь смело переходите на собеседование!</span>
                <button
                  type="button"
                  id="btn_accept_terms"
                  onClick={() => {
                    setActiveTab("interview");
                    if (currentStage === "terms") {
                      handleStartInterview();
                    }
                  }}
                  className="cursor-pointer bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-white font-bold py-3 px-6 rounded-xl text-xs flex items-center gap-1 hover:opacity-95 shadow active:scale-98 transition-all"
                >
                  Перейти на ИИ-Собеседование <ArrowRight className="w-4 h-4" />
                </button>
              </div>

            </div>
          </div>
        )}

        {/* Tab 3: Interview module */}
        {activeTab === "interview" && (
          <div className="space-y-6">
            {projectId && candidate?.id ? (
              <CandidateInterview
                projectId={projectId}
                candidateId={candidate.id}
                onCompleted={(passed) => { if (passed) setActiveTab("training"); }}
              />
            ) : (
              <div className="text-slate-300 text-sm">Загрузка...</div>
            )}
          </div>
        )}



        {/* Tab 4: Evaluation scoring tab */}
        {activeTab === "scoring" && (
          <div className="bg-[#1E4468]/15 border border-white/10 shadow-2xl backdrop-blur-md rounded-3xl p-6 md:p-8 space-y-6 text-center max-w-2xl mx-auto">
            <Mascot state="serious" size="lg" />
            
            <div>
              <span className="bg-[#E7C768] text-[#1A1A1A] font-bold text-[10px] px-3 py-1 rounded-full uppercase tracking-wider inline-block">ИИ Оценка Завершена!</span>
              <h2 className="text-2xl font-bold text-[#E7C768] mt-2 font-serif">Результаты вашего тестирования</h2>
              <p className="text-xs text-gray-300 mt-1 font-normal">Оценка сведена в баллах на основе ответов на опрос и разбора вашего резюме.</p>
            </div>

            {/* Score Ring indicator */}
            <div className="flex items-center justify-center py-4">
              <div className="w-32 h-32 rounded-full border-4 border-[#E7C768] bg-amber-950/45 flex flex-col items-center justify-center shadow-md">
                <span className="text-4xl font-black text-[#E7C768]">
                  {Math.round(
                    ((candidate?.scores?.resumeScore !== undefined ? candidate.scores.resumeScore : 70) +
                     (candidate?.scores?.checklistScore !== undefined ? candidate.scores.checklistScore : 80) +
                     (candidate?.scores?.situationsScore !== undefined ? candidate.scores.situationsScore : 75)) / 3
                  )}
                </span>
                <span className="text-[10px] font-bold uppercase text-gray-300 font-mono">Общий балл</span>
              </div>
            </div>

            {/* Grid details checklist score elements */}
            <div className="grid grid-cols-3 gap-3.5 max-w-lg mx-auto">
              <div className="bg-black/25 p-3 rounded-xl border border-[#FAFAFA]/5 text-center flex flex-col justify-between">
                <span className="text-[9px] text-slate-300 uppercase font-semibold font-mono block">1. Резюме</span>
                <strong className="text-[#E7C768] font-extrabold text-lg block mt-1">
                  {candidate?.scores?.resumeScore !== undefined ? candidate.scores.resumeScore : 70}/100
                </strong>
              </div>
              <div className="bg-black/25 p-3 rounded-xl border border-[#FAFAFA]/5 text-center flex flex-col justify-between">
                <span className="text-[9px] text-slate-300 uppercase font-semibold font-mono block">2. Чек-лист</span>
                <strong className="text-[#E7C768] font-extrabold text-lg block mt-1">
                  {candidate?.scores?.checklistScore !== undefined ? candidate.scores.checklistScore : 80}/100
                </strong>
              </div>
              <div className="bg-[#101010]/35 p-3 rounded-xl border border-[#FAFAFA]/5 text-center flex flex-col justify-between">
                <span className="text-[9px] text-slate-300 uppercase font-semibold font-mono block">3. Ситуации</span>
                <strong className="text-[#E7C768] font-extrabold text-lg block mt-1">
                  {candidate?.scores?.situationsScore !== undefined ? candidate.scores.situationsScore : 75}/100
                </strong>
              </div>
            </div>

            {/* Assessment critique */}
            <div className="bg-black/45 p-5 rounded-2xl text-left border border-white/10 space-y-2">
              <span className="text-xs font-bold text-[#E7C768] uppercase flex items-center gap-1">
                <Cpu className="w-4 h-4 text-[#E7C768]" /> Разбор ваших навыков ИИ Роботом:
              </span>
              <p className="text-xs text-gray-200 leading-relaxed italic font-normal">
                "{candidate?.scores?.assessmentSummary || "Кандидат продемонстрировал хорошие базовые результаты на собеседовании. Выявлены отличные черты коммуникатора. Следующий шаг - изучение специфики нашего продукта и преодоление пробелов в знаниях."}"
              </p>
            </div>

            {/* Training action CTA */}
            <button
              onClick={() => {
                updateStageOnBackend("training");
                setActiveTab("training");
                spendStagePack("training");
              }}
              className="cursor-pointer w-full bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-white font-bold py-3.5 rounded-xl text-center shadow-lg transition flex items-center justify-center gap-2"
            >
              Открыть персональный курс ИИ-обучения <ArrowRight className="w-4.5 h-4.5" />
            </button>
          </div>
        )}

        {/* Tab 5: Training interactive program */}
        {activeTab === "training" && (
          (() => {
            // Training is only unlocked after a successful interview.
            // Stages progress: terms → interview → scoring → training → certified.
            const unlocked = ["training", "certified"].includes(currentStage)
              || (candidate?.scores?.overallScore ?? 0) >= 60;
            if (!unlocked) {
              return (
                <div className="bg-[#1E4468]/30 border border-amber-500/30 rounded-3xl p-10 text-center space-y-3">
                  <BookOpen className="w-10 h-10 text-[#E7C768] mx-auto" />
                  <h2 className="text-lg font-bold text-white">Курс обучения откроется после интервью</h2>
                  <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
                    Сначала пройдите ИИ-собеседование и получите положительную оценку. После этого здесь появится персональный курс с уроками, тестами и финальной аттестацией.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab("interview")}
                    className="bg-[#E7C768] text-[#17344F] font-bold text-xs px-4 py-2 rounded-xl"
                  >
                    💬 Перейти к интервью
                  </button>
                </div>
              );
            }
            return <CandidateStageTraining candidateId={candidate!.id} projectId={candidate!.projectId} />;
          })()
        )}

        {/* Tab 6: Certified diploma success tab */}
        {activeTab === "certified" && (
          <div className="space-y-8 max-w-2xl mx-auto">
            
            {/* Visual Issued Certificate styled like a physical luxury diploma */}
            <div className="bg-[#161616] rounded-3xl border-8 border-double border-[#E7C768] shadow-2xl p-8 relative overflow-hidden text-center select-none bg-gradient-to-tr from-stone-900 via-[#1A1A1A] to-stone-900">
              
              {/* Corner Ornaments */}
              <div className="absolute top-4 left-4 w-12 h-12 border-t-2 border-l-2 border-[#E7C768]"></div>
              <div className="absolute top-4 right-4 w-12 h-12 border-t-2 border-r-2 border-[#E7C768]"></div>
              <div className="absolute bottom-4 left-4 w-12 h-12 border-b-2 border-l-2 border-[#E7C768]"></div>
              <div className="absolute bottom-4 right-4 w-12 h-12 border-b-2 border-r-2 border-[#E7C768]"></div>

              {/* Watermark Logo */}
              <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none">
                <img src="https://i.ibb.co/WWRbtPq0/RR-Logo.png" alt="watermark" className="w-80 h-80 object-contain" />
              </div>

              {/* Certificate Head */}
              <div className="space-y-2 relative z-10">
                <img src="https://i.ibb.co/WWRbtPq0/RR-Logo.png" alt="RR Logo" className="w-16 h-16 object-contain mx-auto drop-shadow" />
                <h1 className="text-xs uppercase tracking-[0.2em] font-bold text-[#E7C768] font-serif">
                  Сертификат Соответствия Квалификации
                </h1>
                <div className="text-[10px] text-gray-400 font-serif italic">Выдан платформой автоматического онбординга Робот Рекрутер (RR)</div>
              </div>

              {/* Line ornament */}
              <div className="w-32 h-0.5 bg-gradient-to-r from-transparent via-[#E7C768] to-transparent mx-auto my-6"></div>

              {/* Certification Statement */}
              <div className="space-y-6 relative z-10 text-center">
                <p className="text-xs text-gray-300 font-serif italic">Настоящим подтверждается, что соискатель</p>
                <div className="text-2xl md:text-3xl font-black tracking-tight text-[#E7C768] font-serif">
                  {candidate?.name || "Иван Иванов"}
                </div>
                
                <p className="text-xs text-gray-300 leading-relaxed max-w-md mx-auto font-normal">
                  Успешно завершил индивидуальную программу скрининга, кейс-собеседование ИИ и обучающий экспресс-курс подготовки по должности
                </p>

                <div className="bg-[#1E4468] text-[#E7C768] font-bold text-sm md:text-base py-2.5 px-6 rounded-xl inline-block border-2 border-[#E7C768] shadow-md">
                  {candidate?.roleName || "Менеджер"}
                </div>

                <p className="text-xs text-gray-400">
                  на проект компании: <strong className="text-white font-bold">{project?.companyName || "ООО Работодатель"}</strong>
                </p>
              </div>

              {/* Stamps and Signatures */}
              <div className="mt-10 grid grid-cols-2 gap-8 items-end relative z-10 text-left px-4">
                <div className="space-y-1">
                  <div className="text-[9px] uppercase tracking-wider text-gray-400">Выдан Системой:</div>
                  <div className="text-[11px] font-bold font-mono text-[#E7C768]">Робот Рекрутер (ИИ Аудит)</div>
                  <div className="w-24 h-px bg-white/20"></div>
                  <div className="text-[9px] text-gray-400 font-normal">Уполномоченная подпись системного робота</div>
                </div>

                <div className="text-right flex flex-col items-end">
                  {/* Luxury Stamp icon */}
                  <div className="w-16 h-16 rounded-full border-4 border-double border-[#E7C768] flex flex-col items-center justify-center text-[#E7C768] bg-black/40 transform rotate-12 scale-90 shadow-sm leading-none font-black text-[9px] select-none font-serif">
                    <span>RR</span>
                    <span>CERTIFIED</span>
                    <span className="text-[6px]">2026</span>
                  </div>
                </div>
              </div>

            </div>

            {/* State message banner */}
            {certSavedMsg && (
              <div className="p-3 bg-emerald-500/20 text-emerald-200 border border-emerald-500/30 text-xs font-bold rounded-xl text-center">
                {certSavedMsg}
              </div>
            )}

            {/* Actions list */}
            <div className="space-y-3">
              <button
                onClick={() => {
                  setCertSavedMsg("🏆 Сертификат соответствия сохранен в ваше ИИ-портфолио и продублирован нанимателям в CRM!");
                  setTimeout(() => setCertSavedMsg(""), 5000);
                }}
                className="cursor-pointer w-full bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-white font-bold py-3.5 rounded-xl text-center shadow-lg transition flex items-center justify-center gap-2"
              >
                Сохранить сертификат в PDF
              </button>

              <button
                onClick={() => {
                  localStorage.clear();
                  navigate("/main");
                }}
                className="cursor-pointer w-full bg-white/5 border border-white/10 text-white font-bold py-2.5 rounded-xl text-center text-xs transition hover:bg-white/10"
              >
                Войти под другим профилем
              </button>
            </div>

          </div>
        )}

      </main>

      {/* Small footer */}
      <footer className="py-4 text-center text-xs text-gray-400 border-t border-white/5 bg-[#1A1A1A]">
        © 2026 Робот Рекрутер. Система обучения соискателей.
      </footer>

      {/* Floating AI Assistant Widget in the bottom-right corner of every sub-page */}
      <div className="fixed bottom-6 right-6 z-50">
        
        {/* Pulsing highlight */}
        {!assistOpen && (
          <div className="absolute top-0 right-0 w-3.5 h-3.5 bg-[#E7C768] rounded-full animate-ping"></div>
        )}

        {/* Circular Trigger button */}
        <button
          type="button"
          onClick={() => setAssistOpen(!assistOpen)}
          className="cursor-pointer w-14 h-14 bg-gradient-to-tr from-[#FF1A1A] to-[#E54C00] hover:from-[#FF3333] hover:to-[#FF5500] text-white rounded-full flex items-center justify-center shadow-2xl transition duration-200 transform hover:scale-105 active:scale-95 border-2 border-white/20"
        >
          {assistOpen ? <X className="w-6 h-6 animate-spin-once" /> : <MessageSquare className="w-6 h-6" />}
        </button>

        {/* Dialog Window */}
        {assistOpen && (
          <div className="absolute bottom-18 right-0 w-80 md:w-96 bg-[#17344F]/95 backdrop-blur border border-white/20 shadow-2xl rounded-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-4 bg-gradient-to-r from-[#17344F] to-[#1E4468] border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#E7C768]/20 flex items-center justify-center border border-[#E7C768]/40">
                  <Cpu className="w-4 h-4 text-[#E7C768]" />
                </div>
                <div className="text-left">
                  <h4 className="font-bold text-xs text-white">ИИ-Помощник соискателя ⚡</h4>
                  <span className="text-[9px] text-[#E7C768]">Робот RR всегда онлайн</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAssistOpen(false)}
                className="text-gray-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content History area */}
            <div className="p-3 space-y-3 max-h-64 overflow-y-auto bg-black/25 flex flex-col text-left">
              {assistHistory.map((msg, idx) => {
                const isAI = msg.sender === "ai";
                return (
                  <div key={idx} className={`flex ${isAI ? "justify-start" : "justify-end"}`}>
                    <div className={`p-2.5 rounded-xl text-[11px] leading-relaxed max-w-[85%] font-normal ${
                      isAI 
                        ? "bg-[#1E4468]/65 text-white border border-white/5 rounded-tl-none" 
                        : "bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-white rounded-tr-none"
                    }`}>
                      <div className="markdown-body">
                        <Markdown>{msg.text}</Markdown>
                      </div>
                    </div>
                  </div>
                );
              })}
              {assistLoading && (
                <div className="flex justify-start items-center gap-1.5 text-[10px] text-gray-400">
                  <Loader className="w-3.5 h-3.5 animate-spin" />
                  <span>ИИ Робот размышляет...</span>
                </div>
              )}
            </div>

            {/* Footer Input form */}
            <div className="p-3 border-t border-white/10 bg-black/45 flex gap-2">
              <input
                type="text"
                placeholder="Задать любой вопрос по разделу..."
                className="flex-1 bg-black/35 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-[#E7C768] placeholder-gray-400"
                value={assistTextInput}
                onChange={(e) => setAssistTextInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendAssist()}
              />
              <button
                type="button"
                onClick={handleSendAssist}
                className="cursor-pointer bg-[#E7C768] hover:bg-[#E7C768]/90 text-[#17344F] p-2 rounded-xl transition"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
