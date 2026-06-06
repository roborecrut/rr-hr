/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  isConnected: boolean;
}

export interface TrainingQuiz {
  question: string;
  type: "select" | "text";
  options?: string[];
  correctAnswer?: string;
  userAnswer?: string;
  isCorrect?: boolean;
  explanation?: string;
  materialTitle?: string;
  materialContent?: string;
}

export interface TrainingLesson {
  id: string;
  title: string;
  content: string;
  quiz?: {
    question: string;
    options: string[];
    answerIndex: number;
  };
  quizzes?: TrainingQuiz[];
  isCompleted: boolean;
  score?: number;
  quizFeedback?: string;
}

export interface TrainingBlock {
  title: string; // "Профессиональное обучение" | "Обучение продукту" | "Обучение процессам и мотивации"
  description: string;
  lessons: TrainingLesson[];
}

export interface CandidateScores {
  interviewScore: number; // 0-100
  resumeScore: number;    // 0-100
  checklistPoints: number; // 0-10
  roleplayPoints: number;  // 0-10
  overallScore: number;   // 0-100
  assessmentSummary: string;
  checklistScore?: number; // 0-100
  checklistSysScore?: number; // 0-100
  situationsScore?: number; // 0-100
}

export interface Candidate {
  id: string;
  name: string;
  email: string;
  telegramUsername?: string;
  telegramId?: string;
  telegramFirstName?: string;
  telegramLastName?: string;
  telegramAvatar?: string;
  googleName?: string;
  googleEmail?: string;
  googleAvatar?: string;
  projectId: string; // Attached to which Employer Onboarding system
  roleName: string;
  currentStage: "terms" | "interview" | "scoring" | "training" | "certified";
  crmStage?: "registration" | "screening" | "checklist" | "situations" | "professional" | "product" | "systems" | "certified";
  publicId?: string;
  companyId?: string;
  companySlug?: string;
  companyName?: string;
  resumeName?: string;
  resumeText?: string;
  scores?: CandidateScores;
  trainingPlan?: TrainingBlock[];
  createdAt: string;
  registeredVia: "google" | "telegram";
}

export interface JobProject {
  id: string;
  companyName: string;
  companySlug?: string;
  employerId?: string;
  roleName: string;
  salaryTerms?: string;
  scheduleTerms?: string;
  motivationText?: string;
  customWiki?: string;
  checklistQuestions: string[];
  roleplayQuestions: string[];
  createdTasks?: boolean;

  questionsChecklistProf?: TrainingQuiz[];
  questionsChecklistSys?: TrainingQuiz[];
  questionsTrainProf?: TrainingQuiz[];
  questionsTrainProduct?: TrainingQuiz[];
  questionsTrainSys?: TrainingQuiz[];

  // Precise subpages details
  vacancyText?: string;
  motivationTextDetail?: string;
  companyText?: string;
  onboardingText?: string;
  payoutsText?: string;
  scheduleText?: string;
  teamText?: string;
  systemText?: string;
  logoUrl?: string;
  tasksActivityText?: string;
  cabinetTabsText?: string;
  
  // Custom training curricula
  trainingProfText?: string;
  trainingProductText?: string;
  trainingSystemText?: string;
  
  // Mission & stats
  missionText?: string;
  statsValClients?: string;
  statsLabelClients?: string;
  statsValDialogs?: string;
  statsLabelDialogs?: string;
  statsValFounded?: string;
  statsLabelFounded?: string;
}

export interface Message {
  sender: "candidate" | "recruiter";
  text: string;
  timestamp: string;
}

export const BASIC_SPECIALTIES: string[] = [
  "Менеджер по продажам",
  "Продавец",
  "Оператор ПК",
  "Ассистент",
  "Комерческий директор",
  "Операционный директор",
  "Генеральный директор",
  "Руководитель отдела маркетинга",
  "Финансовый директор",
  "Руководитель отдела логистики",
  "Менеджер по закупкам",
  "Специалист по тендерам",
  "Продуктовый аналитик",
  "Руководитель группы разработки",
  "Руководитель отдела аналитики",
  "Руководитель проектов",
  "Специалист по информационной безопасности",
  "Специалист технической поддержки",
  "Тестировщик",
  "Технический директор (CTO)",
  "Технический писатель",
  "Гейм-дизайнер",
  "Дизайнер, художник",
  "Копирайтер, редактор, корректор",
  "PR-менеджер",
  "SMM-менеджер, контент-менеджер",
  "Аналитик",
  "Директор по маркетингу и PR (CMO)",
  "Маркетолог-аналитик",
  "Менеджер по маркетингу, интернет-маркетолог",
  "Менеджер по работе с партнерами",
  "Бизнес-тренер",
  "Психолог",
  "Оператор call-центра, специалист контактного центра",
  "Руководитель отдела клиентского обслуживания",
  "Руководитель отдела продаж",
  "Специалист по сертификации",
  "Страховой агент",
  "Бизнес-аналитик",
  "Менеджер/консультант по стратегии",
  "Финансовый аналитик, инвестиционный аналитик",
  "Архитектор",
  "Инженер-конструктор, инженер-проектировщик",
  "Инженер ПТО, инженер-сметчик",
  "Диспетчер",
  "Менеджер по логистике, менеджер по ВЭД",
  "Менеджер по туризму",
  "Директор по персоналу (HRD)",
  "Менеджер по компенсациям и льготам",
  "Менеджер по персоналу",
  "Руководитель отдела персонала",
  "Специалист по кадрам",
  "Специалист по подбору персонала",
  "Аудитор",
  "Брокер",
  "Бухгалтер",
  "Казначей",
  "Комплаенс-менеджер",
  "Кредитный специалист",
  "Методолог",
  "Специалист по взысканию задолженности",
  "Финансовый директор (CFO)",
  "Финансовый контролер",
  "Финансовый менеджер",
  "Экономист",
  "Директор юридического департамента (CLO)",
  "Юрисконсульт",
  "Юрист"
];
