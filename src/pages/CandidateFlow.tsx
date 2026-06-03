/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "../components/RouterContext";
import Mascot from "../components/Mascot";
import Markdown from "react-markdown";
import { JobProject, Candidate, Message, TrainingBlock } from "../types";
import { supabase } from "@/integrations/supabase/client";
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
      const res = await fetch("/api/candidate-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: candidate?.id || "",
          userQuestion: userText,
          contextTab: activeTab,
          contextSubTab: activeTab === "terms" ? termsSubTab : (activeTab === "training" ? trainingSubTab : "")
        })
      });
      if (res.ok) {
        const data = await res.json();
        setAssistHistory(prev => [...prev, { sender: "ai", text: data.reply }]);
      } else {
        setAssistHistory(prev => [...prev, { sender: "ai", text: "Прошу прощения, произошла небольшая ошибка. Давайте попробуем еще раз!" }]);
      }
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

  // Stage 1 -> Stage 2 (Interviewing)
  const handleStartInterview = () => {
    setInterviewSubTab("resume");
    updateStageOnBackend("interview");
  };

  const handleEvaluateResume = async () => {
    if (!candidate) return;
    setResumeAnalysing(true);
    try {
      const payload = {
        candidateId: candidate.id,
        resumeText: resumeTextEntry + (resumeFile ? ` [Файл: ${resumeFile.name}]` : "")
      };
      const res = await fetch("/api/evaluate-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        setResumeFeedback(data.feedback);
        await refreshCandidate();
      }
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
      const res = await fetch("/api/evaluate-checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: candidate.id,
          answers: isSys ? checklistSysAnswers : checklistAnswers,
          isSystem: isSys
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (isSys) {
          setChecklistSysFeedback(data.feedback);
        } else {
          setChecklistFeedback(data.feedback);
        }
        await refreshCandidate();
      }
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
      const res = await fetch("/api/evaluate-situations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: candidate?.id || "",
          answers: [
            { question: targetSit.title || targetSit.desc, answer: userMsgText }
          ]
        })
      });

      if (res.ok) {
        const data = await res.json();
        targetSit.score = data.situationsScore || 85;
        targetSit.feedback = data.feedback || "Прекрасно обыграли ситуацию!";
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
      const res = await fetch("/api/evaluate-situations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: candidate.id,
          answers: formattedCaseAnswers
        })
      });
      if (res.ok) {
        await refreshCandidate();
        await updateStageOnBackend("scoring");
        setActiveTab("scoring");
      }
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
      const res = await fetch("/api/evaluate-training-block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: candidate.id,
          blockIndex: bIdx,
          answers: trainingAnswers
        })
      });
      if (res.ok) {
        const data = await res.json();
        setTrainingExamScore(data.overallScore);
        setTrainingExamFeedback(data.feedback);
        setTrainingExamSubmitted(true);
        await refreshCandidate();
      }
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
                    { id: "system", title: "⚙️ Система", desc: "Регламенты и Wiki" }
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
                    <p className="text-slate-300 text-xs leading-relaxed font-normal">
                      Мы ищем сильного специалиста на должность <strong className="text-[#E7C768]">{project?.roleName}</strong>. Эта позиция предполагает работу в нашей передовой ИИ-платформе. 
                      Вы будете вести сделки, коммуницировать с целевой аудиторией и помогать развивать наши высокотехнологичные продукты.
                    </p>
                    <div className="bg-white/5 p-4 rounded-xl border border-white/5 space-y-2">
                      <h4 className="text-xs font-bold text-[#E7C768] uppercase">Ключевые Обязанности:</h4>
                      <ul className="list-disc pl-4 text-xs text-slate-300 space-y-1">
                        <li>Качественное консультирование клиентов по стандартам и инструкциям;</li>
                        <li>Сопровождение клиентов в нашей экосистеме, ведение CRM;</li>
                        <li>Входной контроль требований и своевременная отчётность руководителю.</li>
                      </ul>
                    </div>
                  </div>
                )}

                {termsSubTab === "motivation" && (
                  <div className="space-y-4 animate-fadeIn">
                    <span className="text-[#E7C768] text-xs font-bold uppercase tracking-wider block">Мотивационный буклет</span>
                    <h2 className="text-xl font-bold text-white">Мотивация и Карьерный рост</h2>
                    <p className="text-xs text-slate-300 leading-relaxed italic border-l-4 border-[#E7C768] pl-3">
                      "{project?.motivationText || "Наша компания предлагает крутые возможности карьерной лестницы, стабильный оклад и оплачиваемое обучение."}"
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-black/35 p-4 rounded-xl border border-white/5">
                        <span className="text-[10px] font-bold text-slate-400 block uppercase">Структура дохода</span>
                        <p className="text-xs text-white font-bold mt-1">Оклад + KPI в зависимости от выполнения плана продаж или активности.</p>
                      </div>
                      <div className="bg-black/35 p-4 rounded-xl border border-white/5">
                        <span className="text-[10px] font-bold text-slate-400 block uppercase">Профессиональный Рост</span>
                        <p className="text-xs text-[#E7C768] font-bold mt-1">Грейдовая сетка (Junior, Middle, Senior) и выдвижение в тимлиды.</p>
                      </div>
                    </div>
                  </div>
                )}

                {termsSubTab === "company" && (
                  <div className="space-y-4 animate-fadeIn">
                    <span className="text-[#E7C768] text-xs font-bold uppercase tracking-wider block">Манифест организации</span>
                    <h2 className="text-xl font-bold text-white">Информация о компании: {project?.companyName || "ООО Работодатель"}</h2>
                    <p className="text-xs text-slate-300 leading-relaxed font-normal">
                      Компания <strong className="text-white">{project?.companyName}</strong> — признанный флагман в своей технологической сфере. Мы гордимся тем, что строим полностью прозрачные и понятные рабочие процессы. 
                      Внедрение нашего ИИ Робота Рекрутера помогает нам мгновенно обучать новых людей, адаптируя их прямо под внутреннюю специфику наших регламентов и Wiki-баз.
                    </p>
                    <div className="bg-[#E7C768]/5 p-4 rounded-xl border border-[#E7C768]/20 text-xs space-y-2">
                      <h4 className="font-bold text-[#E7C768]">Наши ценности:</h4>
                      <p className="text-slate-200">
                        Честность, инновационность и скорость. Мы дорожим временем наших соискателей и обеспечиваем автоматический онбординг сразу после собеседования!
                      </p>
                    </div>
                  </div>
                )}

                {termsSubTab === "onboarding" && (
                  <div className="space-y-4 animate-fadeIn">
                    <span className="text-[#E7C768] text-xs font-bold uppercase tracking-wider block">Правила адаптации</span>
                    <h2 className="text-xl font-bold text-white font-serif">Оформление и трудоустройство</h2>
                    <p className="text-xs text-slate-300 leading-relaxed font-normal">
                      Мы ставим процессы оформления на полностью прозрачные рельсы в строгом соответствии со стандартами.
                    </p>
                    <div className="bg-black/35 p-4 rounded-xl border border-white/5 space-y-2 text-xs font-normal">
                      <div className="flex justify-between border-b border-white/5 pb-1">
                        <span className="text-gray-400">Вид договора:</span>
                        <span className="text-white font-bold">ТК РФ / ГПХ / СЗ</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Срок оформления:</span>
                        <span className="text-white font-bold">1 рабочий день</span>
                      </div>
                    </div>
                  </div>
                )}

                {termsSubTab === "payouts" && (
                  <div className="space-y-4 animate-fadeIn">
                    <span className="text-[#E7C768] text-xs font-bold uppercase tracking-wider block">Финансы</span>
                    <h2 className="text-xl font-bold text-white font-serif">Выплаты и Бонусы</h2>
                    <p className="text-xs text-slate-300 leading-relaxed font-normal">
                      Заработная плата выплачивается стабильно два раза в месяц на любую карту банка РФ без скрытых комиссий.
                    </p>
                    <div className="bg-gradient-to-br from-[#E7C768]/15 to-[#FF4C4C]/5 p-4 rounded-xl border border-[#E7C768]/20 text-xs">
                      <strong>Прозрачные условия:</strong> {project?.salaryTerms || "Стабильно и вовремя"}
                    </div>
                  </div>
                )}

                {termsSubTab === "schedule" && (
                  <div className="space-y-4 animate-fadeIn">
                    <span className="text-[#E7C768] text-xs font-bold uppercase tracking-wider block">Режим работы</span>
                    <h2 className="text-xl font-bold text-white font-serif">График и Смены</h2>
                    <p className="text-xs text-slate-300 leading-relaxed font-normal">
                      Планируемый режим занятости: <span className="text-[#E7C768] font-bold">{project?.scheduleTerms || "Гибкий"}</span>. Все детали согласовываются индивидуально с наставником.
                    </p>
                  </div>
                )}

                {termsSubTab === "team" && (
                  <div className="space-y-4 animate-fadeIn">
                    <span className="text-[#E7C768] text-xs font-bold uppercase tracking-wider block">Коллеги</span>
                    <h2 className="text-xl font-bold text-white font-serif">Ваша рабочая группа</h2>
                    <p className="text-xs text-slate-300 leading-relaxed font-normal">
                      Вы будете работать в плотной интеграции со специалистами отдела адаптации и ведущими кураторами компании.
                    </p>
                  </div>
                )}

                {termsSubTab === "system" && (
                  <div className="space-y-4 animate-fadeIn">
                    <span className="text-[#E7C768] text-xs font-bold uppercase tracking-wider block">Регламенты</span>
                    <h2 className="text-xl font-bold text-white font-serif">Базовая Wiki-система</h2>
                    <p className="text-xs text-slate-300 leading-relaxed font-mono whitespace-pre-wrap bg-black/40 p-4 rounded-xl border border-white/5">
                      {project?.customWiki || "Определенные правила адаптации и пользования внутренними CRM-системами."}
                    </p>
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
            
            {/* Sub-tabs header inside the page for three sequential stages */}
            <div className="bg-[#1E4468]/30 border border-white/10 rounded-2xl p-2.5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { id: "resume", stepNum: "1", title: "Резюме", desc: "Скрининг & Оценка", score: candidate?.scores?.resumeScore },
                  { id: "checklist", stepNum: "2", title: "Чек-лист", desc: "20 вопросов от ИИ", score: candidate?.scores?.checklistScore },
                  { id: "situations", stepNum: "3", title: "Ситуации", desc: "Диалог в 3 кейсах", score: candidate?.scores?.situationsScore }
                ].map((sub) => {
                  const isSel = interviewSubTab === sub.id;
                  return (
                    <button
                      type="button"
                      key={sub.id}
                      onClick={() => setInterviewSubTab(sub.id)}
                      className={`cursor-pointer px-4 py-2.5 rounded-xl border transition-all duration-150 text-left flex items-center gap-3 ${
                        isSel
                          ? "bg-[#E7C768] text-[#17344F] border-[#E7C768] font-bold shadow-md"
                          : "bg-[#1E4468]/50 text-slate-300 border-white/5 hover:bg-white/5"
                      }`}
                    >
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${isSel ? "bg-[#17344F] text-[#E7C768]" : "bg-white/10 text-white"}`}>
                        {sub.stepNum}
                      </span>
                      <div>
                        <span className="text-xs block font-bold leading-tight">{sub.title}</span>
                        <span className={`text-[9px] block font-normal ${isSel ? "text-[#17344F]/75" : "text-gray-400"}`}>
                          {sub.score !== undefined && sub.score > 0 ? `✅ ${sub.score} баллов` : sub.desc}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="text-right text-xs bg-[#17344F] px-4 py-2 rounded-xl border border-white/5">
                <span className="text-slate-400 block font-mono text-[9px] uppercase">Ваш текущий прогресс:</span>
                <strong className="text-white font-bold">Этап {interviewSubTab === "resume" ? "1" : interviewSubTab === "checklist" ? "2" : "3"} из 3</strong>
              </div>
            </div>

            {/* Sub-tab 1: RESUME (Resume Screening & Upload) */}
            {interviewSubTab === "resume" && (
              <div className="bg-[#1E4468]/15 border border-white/10 shadow-2xl backdrop-blur-md rounded-3xl p-6 md:p-8 space-y-6">
                <div className="border-b border-white/5 pb-4 text-left">
                  <span className="text-[#E7C768] font-bold text-xs uppercase tracking-wider block">Этап #1: Скрининг Резюме</span>
                  <h2 className="text-2xl font-bold text-white mt-1">Оценка структуры опыта и квалификации</h2>
                  <p className="text-xs text-slate-300 mt-1">
                    Загрузите ваше актуальное резюме в формате PDF или введите подробности профессионального пути вручную для автоматического скоринга нейросетью.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                  
                  {/* Left Controls */}
                  <div className="space-y-5">
                    
                    {/* Drag & drop container */}
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-2xl p-6 text-center transition ${
                        isDragOver 
                          ? "border-[#E7C768] bg-amber-950/20" 
                          : attachmentUploaded 
                          ? "border-emerald-500 bg-emerald-950/20" 
                          : "border-white/10 bg-black/20 hover:border-[#E7C768]"
                      }`}
                    >
                      <Upload className="w-8 h-8 text-gray-400 mx-auto" />
                      <div className="text-sm font-bold text-gray-300 mt-2">
                        {attachmentUploaded ? "✅ Файл резюме прикреплен" : "Перетащите PDF резюме сюда"}
                      </div>
                      {resumeFile ? (
                        <p className="text-xs text-emerald-400 font-mono mt-1 font-bold">{resumeFile.name}</p>
                      ) : (
                        <p className="text-xs text-gray-400 mt-1">или выберите на вашем компьютере</p>
                      )}

                      <input
                        type="file"
                        accept=".pdf"
                        onChange={handleFileChange}
                        className="hidden"
                        id="resume-file-input"
                      />
                      
                      <label
                        htmlFor="resume-file-input"
                        className="cursor-pointer inline-block mt-3 bg-white/5 border border-white/10 shadow-sm text-xs font-bold px-4 py-2 rounded-lg hover:bg-white/10 transition"
                      >
                        Обзор файлов
                      </label>
                    </div>

                    {/* Manual Entry Text */}
                    <div className="space-y-1 text-left">
                      <label className="text-xs font-bold text-gray-300 block">Опишите свой профессиональный путь текстом:</label>
                      <textarea
                        rows={5}
                        className="w-full bg-black/35 text-white text-xs p-3 rounded-xl border border-white/10 focus:outline-none focus:border-[#E7C768]"
                        placeholder="Опишите ваши сильные стороны, навыки, предыдущие проекты, компании, где трудились ранее..."
                        value={resumeTextEntry}
                        onChange={(e) => setResumeTextEntry(e.target.value)}
                      />
                    </div>

                    <button
                      onClick={handleEvaluateResume}
                      disabled={resumeAnalysing}
                      className="cursor-pointer w-full bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-white font-bold py-3 rounded-xl text-center shadow hover:opacity-95 transition flex items-center justify-center gap-2"
                    >
                      {resumeAnalysing ? (
                        <>
                          <Loader className="w-4 h-4 animate-spin" /> Анализируем опыт по стандартам...
                        </>
                      ) : (
                        <>
                          <Cpu className="w-4 h-4" /> Провести скрининг резюме 🤖
                        </>
                      )}
                    </button>
                  </div>

                  {/* Right Results Output */}
                  <div className="bg-black/25 p-5 rounded-2xl border border-white/5 text-left flex flex-col justify-between min-h-[360px]">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-white/10 pb-2">
                        <h4 className="font-bold text-xs text-[#E7C768] uppercase tracking-wider flex items-center gap-2">
                          🎯 Вердикт ИИ-Системы
                        </h4>
                        {candidate?.scores?.resumeScore !== undefined && candidate.scores.resumeScore > 0 && (
                          <span className="bg-emerald-500/20 text-emerald-300 font-mono text-xs font-bold px-2 py-0.5 rounded-full">
                            {candidate.scores.resumeScore} / 100 баллов
                          </span>
                        )}
                      </div>

                      {resumeFeedback ? (
                        <div className="text-xs text-gray-200 leading-relaxed space-y-3 whitespace-pre-wrap font-normal">
                          {resumeFeedback}
                        </div>
                      ) : candidate?.scores?.resumeScore ? (
                        <div className="text-xs text-gray-200 leading-relaxed font-normal">
                          <p className="text-emerald-400 font-bold mb-2">✅ Скрининг успешно завершен.</p>
                          Резюме изучено, опыт калиброван под заданную вакансию ({project?.roleName || candidate.roleName}). Все метрики сохранены в профиле.
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400 italic py-10 text-center font-normal">
                          Ждем от вас запуска скрининга. Нажмите на красную кнопку слева для автоматического расчета балла резюме.
                        </div>
                      )}
                    </div>

                    {candidate?.scores?.resumeScore !== undefined && candidate.scores.resumeScore > 0 && (
                      <div className="pt-4 border-t border-white/5">
                        <button
                          onClick={() => setInterviewSubTab("checklist")}
                          className="cursor-pointer w-full bg-[#1E4468] hover:bg-[#1E4468]/80 text-white font-bold py-2 rounded-lg text-xs flex items-center justify-center gap-1.5"
                        >
                          Перейти на шаг #2: Чек-лист по теории <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                </div>
              </div>
            )}

            {/* Sub-tab 2: CHECKLIST (20 Theoretical questions for specialty & 20 for system) */}
            {interviewSubTab === "checklist" && (
              <div className="bg-[#1E4468]/15 border border-white/10 shadow-2xl backdrop-blur-md rounded-3xl p-6 md:p-8 space-y-6">
                <div className="border-b border-white/5 pb-4 text-left">
                  <span className="text-[#E7C768] font-bold text-xs uppercase tracking-wider block">Этап #2: Теоретические Чек-Листы</span>
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mt-2">
                    <h2 className="text-2xl font-bold text-white font-serif">Тестирование ИИ</h2>
                    <div className="flex flex-col gap-2 shrink-0">
                      <span className={`font-mono text-xs px-3 py-1 rounded-full border ${
                        candidate?.scores?.checklistScore !== undefined && candidate.scores.checklistScore > 0
                          ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                          : "bg-amber-500/10 text-amber-300 border-amber-500/20"
                      }`}>
                        Профессия: {candidate?.scores?.checklistScore !== undefined && candidate.scores.checklistScore > 0 ? `${candidate.scores.checklistScore} / 100` : "Не сдано"}
                      </span>
                      <span className={`font-mono text-xs px-3 py-1 rounded-full border ${
                        candidate?.scores?.checklistSysScore !== undefined && candidate.scores.checklistSysScore > 0
                          ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                          : "bg-amber-500/10 text-amber-300 border-amber-500/20"
                      }`}>
                        Система: {candidate?.scores?.checklistSysScore !== undefined && candidate.scores.checklistSysScore > 0 ? `${candidate.scores.checklistSysScore} / 100` : "Не сдано"}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-300 mt-2">
                    Вам необходимо сдать <strong className="text-[#E7C768]">оба чек-листа по 20 вопросов</strong> (по профессии и по корпоративной системе). Отредактируйте ответы и отправьте их на оценку искусственного интеллекта.
                  </p>
                </div>

                {/* Sub-Checklist Tab Switcher */}
                <div className="flex gap-2 p-1 bg-black/40 rounded-xl max-w-md border border-white/5">
                  <button
                    type="button"
                    onClick={() => setActiveChecklistPart("prof")}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      activeChecklistPart === "prof"
                        ? "bg-[#E7C768] text-[#17344F]"
                        : "text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    Чек-лист по Профессии
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveChecklistPart("sys")}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      activeChecklistPart === "sys"
                        ? "bg-[#E7C768] text-[#17344F]"
                        : "text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    Чек-лист по Системе
                  </button>
                </div>

                {/* 20 Questions interactive forms */}
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 text-left">
                  {(activeChecklistPart === "prof" ? checklistAnswers : checklistSysAnswers).map((item, idx) => (
                    <div key={idx} className="bg-black/20 p-4 rounded-xl border border-white/5 space-y-2">
                      <div className="flex gap-2">
                        <span className="text-xs font-mono font-bold text-[#E7C768] bg-[#E7C768]/10 w-5 h-5 rounded flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <h4 className="text-xs font-bold text-white flex-1">{item.question}</h4>
                      </div>
                      {item.type === "select" ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                          {item.options?.map((opt: string) => {
                            const isSelected = (item.answer || "").trim().toLowerCase() === opt.trim().toLowerCase();
                            return (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => {
                                  if (activeChecklistPart === "prof") {
                                    const updated = [...checklistAnswers] as any[];
                                    updated[idx].answer = opt;
                                    updated[idx].userAnswer = opt;
                                    setChecklistAnswers(updated);
                                  } else {
                                    const updated = [...checklistSysAnswers] as any[];
                                    updated[idx].answer = opt;
                                    updated[idx].userAnswer = opt;
                                    setChecklistSysAnswers(updated);
                                  }
                                }}
                                className={`text-left p-2.5 rounded-lg border text-xs transition-all flex items-start gap-2 cursor-pointer ${
                                  isSelected
                                    ? "bg-[#E7C768]/15 border-[#E7C768] text-white font-medium shadow"
                                    : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                                }`}
                              >
                                <span className={`w-3.5 h-3.5 rounded-full border shrink-0 mt-0.5 flex items-center justify-center ${
                                  isSelected ? "border-[#E7C768]" : "border-slate-500"
                                }`}>
                                  {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[#E7C768]" />}
                                </span>
                                <span>{opt}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <input
                          type="text"
                          className="w-full bg-[#17344F] text-xs text-slate-150 p-2 border border-white/10 rounded-lg focus:outline-none focus:border-[#E7C768]"
                          value={item.answer || ""}
                          onChange={(e) => {
                            if (activeChecklistPart === "prof") {
                              const updated = [...checklistAnswers] as any[];
                              updated[idx].answer = e.target.value;
                              updated[idx].userAnswer = e.target.value;
                              setChecklistAnswers(updated);
                            } else {
                              const updated = [...checklistSysAnswers] as any[];
                              updated[idx].answer = e.target.value;
                              updated[idx].userAnswer = e.target.value;
                              setChecklistSysAnswers(updated);
                            }
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t border-white/5 flex flex-col md:flex-row gap-4 items-center justify-between">
                  <div className="text-xs text-slate-300 text-left">
                    {(activeChecklistPart === "prof" ? checklistFeedback : checklistSysFeedback) ? (
                      <div className="p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-xl text-[11px] text-[#A6E22E] max-w-xl">
                        <strong>Разбор чек-листа:</strong> {activeChecklistPart === "prof" ? checklistFeedback : checklistSysFeedback}
                      </div>
                    ) : (
                      "Вы можете отредактировать любой ответ. Когда закончите — отправляйте форму на ИИ-оценку."
                    )}
                  </div>

                  <button
                    onClick={handleEvaluateChecklist}
                    disabled={activeChecklistPart === "prof" ? checklistAnalysing : checklistSysAnalysing}
                    className="cursor-pointer bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-white font-bold py-3 px-8 rounded-xl text-xs flex items-center gap-1 hover:opacity-95 shadow shrink-0"
                  >
                    {(activeChecklistPart === "prof" ? checklistAnalysing : checklistSysAnalysing) ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" /> Рассчитываем баллы...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" /> Сдать чек-лист на оценку 📝
                      </>
                    )}
                  </button>
                </div>

                {((candidate?.scores?.checklistScore !== undefined && candidate.scores.checklistScore > 0) ||
                  (candidate?.scores?.checklistSysScore !== undefined && candidate.scores.checklistSysScore > 0)) && (
                  <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row justify-between items-center gap-2">
                    <span className="text-[11px] text-slate-400 italic">
                      {!(candidate?.scores?.checklistScore !== undefined && candidate.scores.checklistScore > 0) && "Осталось сдать чек-лист по профессии"}
                      {candidate?.scores?.checklistScore !== undefined && candidate.scores.checklistScore > 0 && !(candidate?.scores?.checklistSysScore !== undefined && candidate.scores.checklistSysScore > 0) && "Осталось сдать чек-лист по системе"}
                      {candidate?.scores?.checklistScore !== undefined && candidate.scores.checklistScore > 0 && candidate?.scores?.checklistSysScore !== undefined && candidate.scores.checklistSysScore > 0 && "Оба чек-листа успешно сданы! Переходите на диалог."}
                    </span>
                    <button
                      onClick={() => setInterviewSubTab("situations")}
                      className="cursor-pointer bg-[#1E4468] hover:bg-[#1E4468]/80 text-[#E7C768] font-bold py-2.5 px-5 rounded-xl text-xs inline-flex items-center gap-1.5"
                    >
                      Перейти на шаг #3: Ситуации <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

              </div>
            )}

            {/* Sub-tab 3: SITUATIONS (Case Simulator) */}
            {interviewSubTab === "situations" && (
              <div className="bg-[#1E4468]/15 border border-white/10 shadow-2xl backdrop-blur-md rounded-3xl p-6 md:p-8 space-y-6">
                <div className="border-b border-white/5 pb-4 text-left">
                  <span className="text-[#E7C768] font-bold text-xs uppercase tracking-wider block">Этап #3: Ролевые Ситуации</span>
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <h2 className="text-2xl font-bold text-white font-serif">Ролевая игра с ИИ-Оппонентом</h2>
                    {candidate?.scores?.situationsScore !== undefined && candidate.scores.situationsScore > 0 && (
                      <span className="bg-emerald-500/25 text-emerald-300 font-mono text-sm font-black px-3 py-1 rounded-full border border-emerald-500/30">
                        Итог за ситуации: {candidate.scores.situationsScore} / 100 баллов
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    Ниже представлены <strong className="text-[#E7C768]">3 практических профессиональных кейса</strong>. Кликните на интересующий вас кейс справа, напишите ваш ответ боту на его каверзный вопрос в поле переписки, и отправьте на скоринг. 
                  </p>
                </div>

                {/* Main Simulator split grids */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
                  
                  {/* Left Column: List of 3 Cases */}
                  <div className="md:col-span-4 flex flex-col gap-3 text-left">
                    {situationsList.map((sit, idx) => {
                      const isActive = activeSitIdx === idx;
                      return (
                        <div
                          key={sit.id}
                          onClick={() => setActiveSitIdx(idx)}
                          className={`cursor-pointer p-3.5 rounded-xl border transition-all duration-150 ${
                            isActive
                              ? "bg-amber-950/20 border-[#E7C768] shadow"
                              : "bg-black/25 border-white/5 hover:bg-[#1E4468]/30"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-mono font-bold text-[#E7C768] uppercase bg-[#E7C768]/15 px-1.5 py-0.5 rounded">
                              Кейс {idx + 1}
                            </span>
                            {sit.submitted && (
                              <span className="text-[10px] font-bold font-mono text-emerald-400">
                                ⭐ {sit.score} б.
                              </span>
                            )}
                          </div>
                          <h4 className="font-bold text-xs text-white mt-1.5">{sit.title}</h4>
                          <p className="text-[10px] text-slate-400 mt-1 line-clamp-2 leading-tight">
                            {sit.desc}
                          </p>
                        </div>
                      );
                    })}

                    <div className="mt-4 bg-emerald-500/10 p-3.5 rounded-xl border border-emerald-500/20 text-xs">
                      <Mascot state="recruitment" size="sm" className="mx-auto" />
                      <p className="text-[10px] text-slate-200 mt-1 text-center font-normal">
                        Обыграйте все 3 ситуации с роботом, чтобы выставить максимальный итоговый балл!
                      </p>
                    </div>
                  </div>

                  {/* Right Column: Chat Dialog Box with simulator */}
                  <div className="md:col-span-8 bg-black/35 rounded-2xl border border-white/10 flex flex-col justify-between overflow-hidden min-h-[400px]">
                    
                    {/* Head */}
                    <div className="bg-[#1E4468]/50 p-3 border-b border-white/5 flex items-center justify-between text-left">
                      <div>
                        <h4 className="font-bold text-xs text-[#E7C768]">
                          {situationsList[activeSitIdx]?.title || "Загрузка кейса..."}
                        </h4>
                        <span className="text-[9px] text-slate-400 italic">
                          Оппонент: ИИ-Симулятор робота
                        </span>
                      </div>
                      {situationsList[activeSitIdx]?.submitted && (
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded-full font-mono">
                          Оценка кейса: {situationsList[activeSitIdx].score} баллов.
                        </span>
                      )}
                    </div>

                    {/* Scenario briefing Box */}
                    <div className="p-3 bg-white/5 border-b border-white/5 text-left text-[11px] text-slate-300">
                      <strong>Описание ситуации: </strong> {situationsList[activeSitIdx]?.desc}
                    </div>

                    {/* Chat container */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
                      {situationsList[activeSitIdx]?.transcript.map((item: any, i: number) => {
                        const isBot = item.sender === "bot";
                        return (
                          <div key={i} className={`flex ${isBot ? "justify-start" : "justify-end"}`}>
                            <div
                              className={`max-w-md p-3 rounded-xl text-xs leading-relaxed space-y-1 ${
                                isBot
                                  ? "bg-black/50 text-white border border-white/10 text-left rounded-tl-none font-normal"
                                  : "bg-[#1E4468] text-white text-left rounded-tr-none font-bold shadow"
                              }`}
                            >
                              <p className="whitespace-pre-wrap">{item.text}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Input interaction bar */}
                    <div className="p-3 border-t border-white/5 bg-black/45">
                      {situationsList[activeSitIdx]?.submitted ? (
                        <div className="text-center py-2 text-xs text-emerald-400 font-mono font-bold uppercase tracking-wider">
                          ✅ Кейс {activeSitIdx + 1} успешно сдан и оценён!
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Напишите ваш подробный профессиональный ответ..."
                            className="flex-1 bg-black/45 border border-white/10 px-3 py-2 rounded-lg text-xs text-white focus:outline-none focus:border-[#E7C768]"
                            value={activeSitTextInput}
                            onChange={(e) => setActiveSitTextInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSendSituationMessage(activeSitIdx)}
                            disabled={sitEvaluatingId !== null}
                          />
                          <button
                            onClick={() => handleSendSituationMessage(activeSitIdx)}
                            disabled={sitEvaluatingId !== null}
                            className="cursor-pointer bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-white px-4 py-2 rounded-lg text-xs font-bold hover:opacity-95 transition-all flex items-center gap-1 shadow shrink-0"
                          >
                            {sitEvaluatingId === situationsList[activeSitIdx]?.id ? (
                              <Loader className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              "Отправить 🚀"
                            )}
                          </button>
                        </div>
                      )}
                    </div>

                  </div>

                </div>

                {/* Footer action */}
                <div className="pt-6 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 text-left">
                  <span className="text-xs text-slate-400 italic">
                    Завершили диалоги во всех кейсах? Нажмите финальную кнопку для автоматического сведения и перехода к обзору итоговых оценок.
                  </span>
                  <button
                    onClick={handleFinishRoleplay}
                    disabled={situationsAnalysing}
                    className="cursor-pointer bg-[#FF1A1A] hover:bg-[#E54C00] text-white font-extrabold px-6 py-3 rounded-xl text-xs flex items-center gap-1.5 transition shadow-lg active:scale-98"
                  >
                    {situationsAnalysing ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" /> Рассчитываем итоговую матрицу...
                      </>
                    ) : (
                      <>
                        <Award className="w-4 h-4" /> Завершить и показать оценку 🎯
                      </>
                    )}
                  </button>
                </div>

              </div>
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
              }}
              className="cursor-pointer w-full bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-white font-bold py-3.5 rounded-xl text-center shadow-lg transition flex items-center justify-center gap-2"
            >
              Открыть персональный курс ИИ-обучения <ArrowRight className="w-4.5 h-4.5" />
            </button>
          </div>
        )}

        {/* Tab 5: Training interactive program */}
        {activeTab === "training" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Left side Sub tabs */}
            <aside className="lg:col-span-4 bg-[#1E4468]/15 border border-white/10 backdrop-blur-md rounded-3xl p-5 shadow-xl space-y-4">
              <h3 className="font-bold text-xs text-[#E7C768] uppercase tracking-wider flex items-center gap-1 border-b border-[#E7C768]/10 pb-2 text-left">
                <BookOpen className="w-4 h-4 text-[#E7C768]" /> Разделы Обучения
              </h3>
              
              <div className="flex flex-col gap-2">
                {[
                  { id: "professional", title: "💼 Профессиональное обучение", desc: "Устранение слабых сторон" },
                  { id: "product", title: "🎁 Обучение продукту", desc: "Что и как продаем" },
                  { id: "system", title: "⚙️ Обучение системе", desc: "Процессы и регламенты" }
                ].map((subTab) => {
                  const isSelected = trainingSubTab === subTab.id;
                  return (
                    <button
                      type="button"
                      key={subTab.id}
                      onClick={() => {
                        setTrainingSubTab(subTab.id);
                        setSelectedQuizIdx(null);
                        setQuizSubmitted(false);
                        setQuizMessage("");
                      }}
                      className={`cursor-pointer w-full text-left p-3.5 rounded-xl border transition duration-150 flex flex-col ${
                        isSelected
                          ? "bg-[#E7C768] text-[#17344F] border-[#E7C768] shadow font-bold"
                          : "bg-white/5 border-white/5 text-slate-300 hover:bg-white/10"
                      }`}
                    >
                      <span className="text-xs">{subTab.title}</span>
                      <span className={`text-[10px] font-normal ${isSelected ? "text-[#17344F]/80" : "text-gray-400"}`}>{subTab.desc}</span>
                    </button>
                  );
                })}
              </div>

              <div className="hidden lg:block bg-black/35 p-4 rounded-2xl border border-white/5 text-xs text-center space-y-2">
                <Cpu className="w-5 h-5 text-[#E7C768] mx-auto animate-pulse" />
                <span className="font-bold text-[11px] text-[#E7C768] uppercase block">Умный ИИ-контроль</span>
                <p className="text-[10px] text-slate-300 leading-relaxed font-normal">План обучения подобран нейросетью специально на основе вашего резюме и ответов на собеседовании.</p>
              </div>
            </aside>

            {/* Main Lesson Reader content card */}
            <main className="lg:col-span-8 bg-[#1E4468]/15 backdrop-blur-md border border-white/10 rounded-3xl shadow-2xl overflow-hidden min-h-[420px]">
              {candidate?.trainingPlan && candidate.trainingPlan.length > 0 ? (
                (() => {
                  const bIdx = getTrainingBlockIdx();
                  // Check if this block index is valid
                  const block = candidate.trainingPlan[bIdx] || candidate.trainingPlan[0];
                  if (!block) {
                    return (
                      <div className="p-12 text-center text-gray-400">
                        <p className="text-xs">Для Вас готовится индивидуальный план обучения роботом. Ожидайте...</p>
                      </div>
                    );
                  }
                  const lesson = block.lessons[activeLessonIdx] || block.lessons[0];
                  const answeredCount = trainingAnswers.filter(a => !!a.userAnswer).length;
                  const activeQuiz = trainingAnswers[activeTrainingSubSectionIdx];

                  return (
                    <div className="p-6 md:p-8 space-y-6 text-left">
                      {/* Lesson title bar */}
                      <div className="border-b border-white/10 pb-4">
                        <span className="text-[10px] uppercase font-mono font-bold text-[#E7C768] tracking-wider block bg-[#1E4468]/80 w-max px-2.5 py-0.5 rounded border border-white/10">
                          {block.title}
                        </span>
                        <h2 className="text-xl font-bold text-white mt-2">Портал обучения ИИ: 20 детальных разделов</h2>
                        <p className="text-xs text-slate-300 mt-1">Изучите каждый раздел и ответьте на соответствующий проверочный вопрос. Наберите 100 баллов, чтобы сдать модуль аттестации.</p>
                      </div>

                      {/* 20 Chapters horizontal tabs */}
                      <div className="flex gap-1 overflow-x-auto pb-3 border-b border-white/5 scrollbar-thin">
                        {trainingAnswers.map((item, idx) => {
                          const isEditingActive = idx === activeTrainingSubSectionIdx;
                          const isAnswered = !!item.userAnswer;
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setActiveTrainingSubSectionIdx(idx)}
                              className={`px-3 py-2 rounded-xl text-[10.5px] font-bold shrink-0 cursor-pointer transition flex items-center gap-1 border-none ${
                                isEditingActive
                                  ? "bg-[#E7C768] text-[#17344F] font-black scale-[1.02]"
                                  : isAnswered
                                    ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                                    : "bg-white/5 text-slate-300 hover:bg-white/10"
                              }`}
                            >
                              <span>{idx + 1}</span>
                              {isAnswered && <span className="text-[9px] text-emerald-400">✔</span>}
                            </button>
                          );
                        })}
                      </div>

                      {/* Active Subsection Detail - Study Landing Page */}
                      {activeQuiz ? (
                        <div className="space-y-4 animate-fadeIn">
                          {/* Rich theory card */}
                          <div className="bg-black/25 p-5 rounded-2xl border border-white/5 space-y-3">
                            <div className="flex items-center gap-2 text-[#E7C768] border-b border-white/5 pb-2">
                              <span className="bg-[#E7C768]/15 text-[#E7C768] font-mono text-xs font-bold w-5 h-5 rounded flex items-center justify-center">
                                {activeTrainingSubSectionIdx + 1}
                              </span>
                              <h4 className="text-xs font-extrabold uppercase tracking-wider">
                                Лендинг-Раздел: {activeQuiz.materialTitle || "Общие правила"}
                              </h4>
                            </div>
                            <p className="text-xs text-slate-200 leading-relaxed font-sans whitespace-pre-wrap">
                              {activeQuiz.materialContent || "Для изучения этого вопроса ознакомьтесь с основными инструкциями компании."}
                            </p>
                          </div>

                          {/* Instant control check */}
                          <div className="bg-[#E7C768]/5 p-5 rounded-2xl border border-[#E7C768]/15 space-y-4">
                            <div className="flex items-center gap-1.5 border-b border-white/5 pb-2">
                              <HelpCircle className="w-4 h-4 text-[#E7C768]" />
                              <h5 className="text-[10px] uppercase font-bold text-[#E7C768] tracking-wider">
                                Контрольный вопрос к разделу №{activeTrainingSubSectionIdx + 1}
                              </h5>
                            </div>
                            
                            <p className="text-xs text-white font-bold font-sans">{activeQuiz.question}</p>

                            {activeQuiz.type === "select" ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                                {activeQuiz.options?.map((opt: string) => {
                                  const isSelected = (activeQuiz.userAnswer || "").trim().toLowerCase() === opt.trim().toLowerCase();
                                  return (
                                    <button
                                      key={opt}
                                      type="button"
                                      disabled={trainingExamSubmitted}
                                      onClick={() => {
                                        const updated = [...trainingAnswers];
                                        updated[activeTrainingSubSectionIdx].userAnswer = opt;
                                        setTrainingAnswers(updated);
                                      }}
                                      className={`text-left p-2.5 rounded-lg border text-xs transition-all flex items-start gap-2 cursor-pointer ${
                                        isSelected
                                          ? "bg-[#E7C768]/15 border-[#E7C768] text-white font-medium shadow"
                                          : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 disabled:opacity-50"
                                      }`}
                                    >
                                      <span className={`w-3.5 h-3.5 rounded-full border shrink-0 mt-0.5 flex items-center justify-center ${
                                        isSelected ? "border-[#E7C768]" : "border-slate-500"
                                      }`}>
                                        {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[#E7C768]" />}
                                      </span>
                                      <span>{opt}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <textarea
                                disabled={trainingExamSubmitted}
                                placeholder="Ваш развернутый ответ на вопрос..."
                                className="w-full bg-[#17344F] text-xs text-slate-150 p-3 border border-white/10 rounded-lg focus:outline-none focus:border-[#E7C768] font-sans"
                                rows={2}
                                value={activeQuiz.userAnswer || ""}
                                onChange={(e) => {
                                  const updated = [...trainingAnswers];
                                  updated[activeTrainingSubSectionIdx].userAnswer = e.target.value;
                                  setTrainingAnswers(updated);
                                }}
                              />
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="p-8 text-center text-slate-400 text-xs">
                          Вопросы не обнаружены. Пожалуйста, обратитесь к куратору или дождитесь генерации.
                        </div>
                      )}

                      {/* Training Progress / Feedbacks Block */}
                      {trainingExamSubmitted ? (
                        <div className="pt-6 border-t border-white/10 space-y-4 text-left">
                          <div className="bg-[#102A45]/80 p-5 rounded-2xl border border-[#E7C768]/30 space-y-3">
                            <div className="flex items-center justify-between border-b border-white/10 pb-3">
                              <span className="text-white font-bold text-xs">Результат ИИ-аттестации:</span>
                              <span className="text-[#E7C768] font-bold text-base font-mono">{trainingExamScore} из 100 баллов!</span>
                            </div>
                            <p className="text-xs text-emerald-400 font-medium whitespace-pre-wrap">{trainingExamFeedback}</p>
                            {trainingExamScore === 100 ? (
                              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-[11px] text-emerald-400 font-bold animate-pulse text-center">
                                🎉 Поздравляем! Вы набрали максимальный балл (100) и успешно завершили этот блок курса!
                              </div>
                            ) : (
                              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-[11px] text-rose-400 font-bold text-center">
                                ⚠️ Требуется пересдача! Для продвижения дальше необходимо набрать ровно 100 баллов. Повторно изучите проблемные разделы Wiki, отредактируйте ответы и отправьте еще раз.
                              </div>
                            )}
                          </div>
                          {trainingExamScore !== 100 && (
                            <button
                              type="button"
                              onClick={() => setTrainingExamSubmitted(false)}
                              className="cursor-pointer w-full bg-[#E7C768] text-[#17344F] font-bold py-2.5 rounded-xl text-xs hover:shadow active:scale-[0.99] transition border-none"
                            >
                              ✏️ Исправить неверные ответы и пересдать
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="pt-6 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 text-left">
                          <div className="text-xs text-slate-300">
                            Заполнено разделов Wiki: <strong>{answeredCount} из 20</strong>
                          </div>
                          <button
                            type="button"
                            onClick={handleTrainingExamSubmit}
                            disabled={trainingExamAnalysing || answeredCount < 20}
                            className="cursor-pointer bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] disabled:from-stone-700 disabled:to-stone-800 text-white font-bold py-3 px-8 rounded-xl text-xs flex items-center gap-1.5 hover:opacity-95 shadow transition-all shrink-0 border-none"
                          >
                            {trainingExamAnalysing ? (
                              <>
                                <Loader className="w-4 h-4 animate-spin" /> Рассчитываем оценку аттестации...
                              </>
                            ) : answeredCount < 20 ? (
                              "Заполните контрольные вопросы во всех 20 разделах"
                            ) : (
                              <>
                                <ShieldCheck className="w-4 h-4" /> Сдать экзамен на ИИ-проверку куратором 🎓
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : (
                <div className="p-12 text-center text-slate-300 flex flex-col justify-center items-center">
                  <div className="animate-spin text-[#E7C768] mb-2">
                    <RefreshCw className="w-8 h-8" />
                  </div>
                  <p className="text-xs font-semibold">Ваша индивидуальная программа обучения генерируется ИИ Роботом Рекрутером...</p>
                  <p className="text-[10px] text-slate-400 mt-1">Ответы на собеседовании анализируются для выявления пробелов.</p>
                </div>
              )}
            </main>
          </div>
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
