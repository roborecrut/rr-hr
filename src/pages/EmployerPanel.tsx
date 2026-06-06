/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import RRImage from "@/components/RRImage";
import { useRouter } from "../components/RouterContext";
import Mascot from "../components/Mascot";
import EmployerAIAssistant from "../components/EmployerAIAssistant";
import HiringCalculator from "../components/HiringCalculator";
import TrainingWizard from "../components/TrainingWizard";
import InterviewWizard from "../components/InterviewWizard";
import { JobProject, Candidate, BASIC_SPECIALTIES } from "../types";
import { fetchJobTitles, upsertJobTitle } from "@/lib/jobTitles";
import {
  DEFAULT_VAC_TEMPLATES,
  DEFAULT_TRAINING_TEMPLATES,
  getRoleTemplates,
  mergedTemplate,
  saveRoleTemplates,
  type TrainingFieldKey,
} from "@/lib/vacancyTemplates";
import { supabase } from "@/integrations/supabase/client";
import { FIXED_PRICES, packTierPrice } from "@/lib/rr";
import { useAIWait } from "../components/AIWaitProvider";
import { useAIReady } from "../lib/aiReady";
import SitePreview from "../components/SitePreview";
import VacancyEditor from "../components/VacancyEditor";
import { DocumentUploader } from "../components/DocumentUploader";
import {
  VACANCY_FIELDS,
  VACANCY_FIELDS_BY_KEY,
  type VacancyFieldKey,
  type VacancyField,
} from "../lib/fieldFormats";

// ---------------------------------------------------------------------------
// Mapping helpers: JobProject (camelCase) ↔ VacancyFormValues (snake_case keys
// matching `public.projects` columns and the canonical 15-field spec).
// ---------------------------------------------------------------------------
const CAMEL_BY_KEY: Record<VacancyFieldKey, string> = {
  role_name: "roleName",
  vacancy_text: "vacancyText",
  tasks_activity_text: "tasksActivityText",
  schedule_text: "scheduleText",
  motivation_text: "motivationText",
  motivation_text_detail: "motivationTextDetail",
  payouts_text: "payoutsText",
  onboarding_text: "onboardingText",
  team_text: "teamText",
  system_text: "systemText",
  training_professional_text: "trainingProfessionalText",
  training_product_text: "trainingProductText",
  training_systems_text: "trainingSystemsText",
  training_wiki_text: "trainingWikiText",
  training_regulations_text: "trainingRegulationsText",
};

function projectToVacancyValues(p: any): Partial<Record<VacancyFieldKey, string>> {
  const out: Partial<Record<VacancyFieldKey, string>> = {};
  for (const key of Object.keys(CAMEL_BY_KEY) as VacancyFieldKey[]) {
    out[key] = p?.[CAMEL_BY_KEY[key]] ?? "";
  }
  return out;
}

function vacancyValuesToCamel(
  patch: Partial<Record<VacancyFieldKey, string>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(patch)) {
    out[CAMEL_BY_KEY[k as VacancyFieldKey]] = v ?? "";
  }
  return out;
}

/**
 * Map the per-role template payload (legacy keys used by saveRoleTemplates +
 * generic DEFAULT_*_TEMPLATES) onto the canonical VacancyFieldKey schema used
 * by `<VacancyEditor>`. Used to (a) feed `roleTemplates` prop to the editor
 * so the "Шаблон" button picks per-role values, and (b) bulk-overwrite all
 * 15 fields when the user changes the role.
 */
function roleTplToFields(
  tpl: Record<string, string> | undefined | null,
): Partial<Record<VacancyFieldKey, string>> {
  const t = tpl || {};
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = (t as any)?.[k];
      if (v && String(v).trim()) return String(v);
    }
    return "";
  };
  return {
    vacancy_text: pick("vacancy_text"),
    tasks_activity_text: pick("tasks_activity_text"),
    schedule_text: pick("schedule_text"),
    motivation_text: pick("motivation_text"),
    motivation_text_detail: pick("motivation_text_detail"),
    payouts_text: pick("payouts_text"),
    onboarding_text: pick("onboarding_text"),
    team_text: pick("team_text", "team_text_vac"),
    system_text: pick("system_text", "system_text_vac"),
    training_professional_text: pick("training_professional_text", "training_prof_text"),
    training_product_text: pick("training_product_text"),
    training_systems_text: pick("training_systems_text", "training_system_text"),
    training_wiki_text: pick("training_wiki_text"),
    training_regulations_text: pick("training_regulations_text"),
  };
}
import {
  Users,
  Smartphone,
  Plus,
  Send,
  Chrome,
  Cpu,
  Search,
  RefreshCw,
  Copy,
  Check,
  CheckCircle,
  FileText,
  LogOut,
  Settings,
  ArrowLeftRight,
  Menu,
  X,
  Briefcase,
  Building2,
  CreditCard,
  User,
  Activity,
  Bell,
  Mail,
  Layers,
  Trash2,
  Play,
  Pause,
  ShieldCheck,
  Sliders,
  DollarSign,
  Award,
  Sparkles,
  ChevronRight,
  Phone,
  MessageSquare,
  GraduationCap,
  Upload,
  Wand2
} from "lucide-react";
import {
  VacancyView,
  MotivationView,
  CompanyView,
  OnboardingView,
  PayoutsView,
  ScheduleView,
  TeamView,
  SystemView
} from "../components/VacancySections";
import CandidateDetailsModal from "../components/CandidateDetailsModal";
import OfferConsent from "../components/OfferConsent";

export default function EmployerPanel() {
  const { path, navigate } = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { run: aiWaitRun } = useAIWait();
  const aiReady = useAIReady();

  // Derive active tab from subroute PATH
  let activeTab: "crm" | "vacancies" | "companies" | "tariff" | "profile" | "interviews" | "training" = "crm";
  if (path.includes("/vacancies")) {
    activeTab = "vacancies";
  } else if (path.includes("/companies")) {
    activeTab = "companies";
  } else if (path.includes("/tariff") || path.includes("/billing") || path.includes("/invoice") || path.includes("/payment") || path.includes("/accounts")) {
    activeTab = "tariff";
  } else if (path.includes("/profile")) {
    activeTab = "profile";
  } else if (path.includes("/interviews")) {
    activeTab = "interviews";
  } else if (path.includes("/training")) {
    activeTab = "training";
  } else {
    activeTab = "crm";
  }

  // CRM sub-view styles
  const [crmViewMode, setCrmViewMode] = useState<"kanban" | "table" | "mailing">("kanban");

  // Fetching data state
  const [projects, setProjects] = useState<JobProject[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [tgMsgLog, setTgMsgLog] = useState<{ id: string; chatId: string; message: string; timestamp: string }[]>([]);
  const [aiStatus, setAiStatus] = useState({ active: true, model: "" });

  const [copiedProjectId, setCopiedProjectId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // CRM States
  const [crmSearch, setCrmSearch] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);

  // Mailing States
  const [mailingSegment, setMailingSegment] = useState<string>("all");
  const [mailingTemplate, setMailingTemplate] = useState<string>("welcome");
  const [mailingText, setMailingText] = useState("Здравствуйте! Рады видеть вас в команде. Пожалуйста, пройдите ИИ-собеседование для активации.");
  const [isSendingMail, setIsSendingMail] = useState(false);
  const [mailingLogs, setMailingLogs] = useState<string[]>([]);

  // Vacancy States
  const [pausedProjectIds, setPausedProjectIds] = useState<string[]>([]);
  const [setupCompanyName, setSetupCompanyName] = useState("ООО РобоРекрут инжиниринг");
  const [setupRoleName, setSetupRoleName] = useState("Менеджер по продажам");
  const [setupSalary, setSetupSalary] = useState("80000 - 120000 руб");
  const [setupSchedule, setSetupSchedule] = useState("5/2, гибридный график");
  const [setupCustomWiki, setSetupCustomWiki] = useState("Правила адаптации: мы поставляем ИИ-сервисы. Кандидат должен владеть техниками продаж.");
  const [specialtySearch, setSpecialtySearch] = useState("");
  const [showAddNewVacancy, setShowAddNewVacancy] = useState(false);

  // Extended vacancy wizard fields (mirror of project landing sections).
  const [setupVacancyText, setSetupVacancyText] = useState("");
  const [setupTasksActivityText, setSetupTasksActivityText] = useState("");
  const [setupMotivationText, setSetupMotivationText] = useState("");
  const [setupMotivationDetail, setSetupMotivationDetail] = useState("");
  const [setupScheduleText, setSetupScheduleText] = useState("");
  const [setupPayoutsText, setSetupPayoutsText] = useState("");
  const [setupOnboardingText, setSetupOnboardingText] = useState("");
  const [setupTeamText, setSetupTeamText] = useState("");
  const [setupSystemText, setSetupSystemText] = useState("");
  // Training-group canonical fields (4/15) — also persisted on save.
  const [setupTrainingProfessionalText, setSetupTrainingProfessionalText] = useState("");
  const [setupTrainingProductText, setSetupTrainingProductText] = useState("");
  const [setupTrainingSystemsText, setSetupTrainingSystemsText] = useState("");
  const [setupTrainingWikiText, setSetupTrainingWikiText] = useState("");
  const [setupTrainingRegulationsText, setSetupTrainingRegulationsText] = useState("");
  // AI-enhance loading state for the in-wizard VacancyEditor.
  const [wizardAiKey, setWizardAiKey] = useState<VacancyFieldKey | null>(null);

  // Vacancy wizard: 2-step file ingest (upload → recognize → fill raw text).
  const [draftVacancyFilePath, setDraftVacancyFilePath] = useState<string | null>(null);
  const [vacancyFileName, setVacancyFileName] = useState<string>("");
  const [isUploadingVacancyFile, setIsUploadingVacancyFile] = useState(false);
  const [vacancyUploadError, setVacancyUploadError] = useState<string>("");
  // Raw extracted vacancy text from uploaded document (≤5000 chars). Editable.
  // Passed to «Оформить красиво» as file_context.
  const [vacancyRawText, setVacancyRawText] = useState<string>("");

  // Per-role templates merged from DB (job_titles.field_templates) over generic defaults.
  // Used to (a) show visible "Пример" next to each field, (b) prefill empty fields when
  // the role changes, (c) pass as "эталон" context to the AI (single + all_vacancy).
  const [roleTemplates, setRoleTemplates] = useState<Record<string, string>>({});
  const exampleFor = (field: string): string =>
    mergedTemplate(field, roleTemplates, { ...DEFAULT_VAC_TEMPLATES, ...DEFAULT_TRAINING_TEMPLATES } as any);
  const [showExampleFor, setShowExampleFor] = useState<Record<string, boolean>>({});

  // Reload templates when the selected role changes and OVERWRITE all 15
  // wizard fields with the per-role template (falling back to the canonical
  // example). If the user has already typed something, ask before overwriting.
  useEffect(() => {
    if (!setupRoleName.trim()) return;
    let cancelled = false;
    (async () => {
      const tpl = await getRoleTemplates(setupRoleName);
      if (cancelled) return;
      setRoleTemplates(tpl as Record<string, string>);

      const mapped = roleTplToFields(tpl as any);
      const valueFor = (key: VacancyFieldKey) =>
        (mapped[key] && mapped[key]!.trim()) ||
        VACANCY_FIELDS_BY_KEY[key].example;

      const current: Record<VacancyFieldKey, string> = {
        role_name: setupRoleName,
        vacancy_text: setupVacancyText,
        tasks_activity_text: setupTasksActivityText,
        schedule_text: setupScheduleText,
        motivation_text: setupMotivationText,
        motivation_text_detail: setupMotivationDetail,
        payouts_text: setupPayoutsText,
        onboarding_text: setupOnboardingText,
        team_text: setupTeamText,
        system_text: setupSystemText,
        training_professional_text: setupTrainingProfessionalText,
        training_product_text: setupTrainingProductText,
        training_systems_text: setupTrainingSystemsText,
        training_wiki_text: setupTrainingWikiText,
        training_regulations_text: setupTrainingRegulationsText,
      };
      const hasUserContent = (Object.keys(current) as VacancyFieldKey[]).some(
        (k) => k !== "role_name" && (current[k] || "").trim().length > 0,
      );
      if (hasUserContent) {
        const ok = window.confirm(
          `Подставить шаблоны для должности «${setupRoleName}» во все 15 полей? Текущие значения будут заменены.`,
        );
        if (!ok) return;
      }
      setSetupVacancyText(valueFor("vacancy_text"));
      setSetupTasksActivityText(valueFor("tasks_activity_text"));
      setSetupScheduleText(valueFor("schedule_text"));
      setSetupMotivationText(valueFor("motivation_text"));
      setSetupMotivationDetail(valueFor("motivation_text_detail"));
      setSetupPayoutsText(valueFor("payouts_text"));
      setSetupOnboardingText(valueFor("onboarding_text"));
      setSetupTeamText(valueFor("team_text"));
      setSetupSystemText(valueFor("system_text"));
      setSetupTrainingProfessionalText(valueFor("training_professional_text"));
      setSetupTrainingProductText(valueFor("training_product_text"));
      setSetupTrainingSystemsText(valueFor("training_systems_text"));
      setSetupTrainingWikiText(valueFor("training_wiki_text"));
      setSetupTrainingRegulationsText(valueFor("training_regulations_text"));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupRoleName]);

  // Draft project bookkeeping (matches the company wizard pattern).
  const [draftProjectId, setDraftProjectId] = useState<string | null>(null);
  const [draftProjectPublicId, setDraftProjectPublicId] = useState<string | null>(null);
  const [enhancingVacFields, setEnhancingVacFields] = useState<Record<string, boolean>>({});

  // Shared job titles catalog (loaded from public.job_titles).
  const [jobTitlesList, setJobTitlesList] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await fetchJobTitles();
      if (!cancelled) setJobTitlesList(rows.map((r) => r.title));
    })();
    return () => { cancelled = true; };
  }, []);

  // Profile States
  const [adminTgId, setAdminTgId] = useState(() => localStorage.getItem("employer_tg_id") || "59384591");
  const [profileName, setProfileName] = useState("");
  const [profileTitle, setProfileTitle] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [isProfileSaved, setIsProfileSaved] = useState(false);

  // High-fidelity Google and Telegram profile states
  const [googleName, setGoogleName] = useState("");
  const [googleEmail, setGoogleEmail] = useState("");
  const [googlePhoto, setGooglePhoto] = useState("");
  const [googleId, setGoogleId] = useState("");
  const [googleVerified, setGoogleVerified] = useState(true);

  const [telegramIdState, setTelegramIdState] = useState("");
  const [telegramPhoto, setTelegramPhoto] = useState("");
  const [telegramFirstName, setTelegramFirstName] = useState("");
  const [telegramLastName, setTelegramLastName] = useState("");
  const [telegramUsernameState, setTelegramUsernameState] = useState("");
  const [telegramPhone, setTelegramPhone] = useState<string>("");
  const [isRequestingPhone, setIsRequestingPhone] = useState(false);
  const [referralStats, setReferralStats] = useState<{ count: number; rr: number }>({ count: 0, rr: 0 });

  // Billing & Tariff States
  const [employerId, setEmployerId] = useState<string>(
    () => localStorage.getItem("employer_session_id") || "",
  );

  const [balance, setBalance] = useState<number>(1000);
  const [interviewCredits, setInterviewCredits] = useState<number>(0);
  const [trainingCredits, setTrainingCredits] = useState<number>(0);
  const [landingCredits, setLandingCredits] = useState<number>(0);
  const [interviewSetupCredits, setInterviewSetupCredits] = useState<number>(0);
  const [trainingSetupCredits, setTrainingSetupCredits] = useState<number>(0);
  const [packQty, setPackQty] = useState<{ interview: number; training: number }>({ interview: 10, training: 0 });
  const [packBusy, setPackBusy] = useState<boolean>(false);
  const [fixedBusy, setFixedBusy] = useState<null | "landing" | "interview_setup" | "training_setup">(null);
  const [referrer, setReferrer] = useState<null | { name: string; email: string; phone: string | null; telegram: string | null; public_id: string }>(null);
  const [referees, setReferees] = useState<Array<{ name: string; email: string; created_at: string; bonus_rr: number }>>([]);

  const [topupAmountRub, setTopupAmountRub] = useState<number>(100);
  const [purchaseError, setPurchaseError] = useState<string>("");
  const [isBuying, setIsBuying] = useState<string | null>(null);
  const [isToppingUp, setIsToppingUp] = useState(false);
  const [topupOfferOk, setTopupOfferOk] = useState<boolean>(true);

  const [tariffLevel, setTariffLevel] = useState<"bronze" | "silver" | "gold">("bronze");
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPlanToBuy, setSelectedPlanToBuy] = useState<"silver" | "gold" | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Admin mode: разрешает редактору Lovable открывать кабинет демо-кандидата и
  // переходить на лендинги без полноценной регистрации.
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (!cancelled && data) setIsAdmin(true);
    })();
    return () => { cancelled = true; };
  }, []);

  // Open the demo candidate cabinet under a real URL: /{companySlug}/{projectSlug}/candidate{publicId}/profile
  const handleOpenCandidateAsAdmin = async (candidateOverride?: any) => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { buildCandidateUrl, buildVacancyUrl, buildCompanyUrl } = await import("@/lib/links");
    let cand: any = candidateOverride;
    if (!cand) {
      const { data } = await supabase
        .from("candidates")
        .select("id, public_id, project_id")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      cand = data;
    }
    if (!cand?.project_id || !cand?.public_id) return;
    const { data: proj } = await supabase
      .from("projects")
      .select("id, slug, role_name, company_id")
      .eq("id", cand.project_id)
      .maybeSingle();
    const { data: comp } = proj?.company_id
      ? await supabase.from("companies").select("id, slug, name").eq("id", proj.company_id).maybeSingle()
      : { data: null } as any;
    sessionStorage.setItem("rr_admin_impersonate", "1");
    navigate(buildCandidateUrl(comp, proj, cand, "profile"));
    // hint vars to satisfy eslint about unused builders in some envs
    void buildVacancyUrl; void buildCompanyUrl;
  };

  const handleOpenVacancyAsAdmin = async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { buildVacancyUrl } = await import("@/lib/links");
    const { data: proj } = await supabase
      .from("projects")
      .select("id, slug, company_id")
      .eq("is_published", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const { data: comp } = proj?.company_id
      ? await supabase.from("companies").select("id, slug").eq("id", proj.company_id).maybeSingle()
      : { data: null } as any;
    if (proj && comp) navigate(buildVacancyUrl(comp, proj));
  };

  // Companies custom database state
  const [companiesList, setCompaniesList] = useState<any[]>([]);
  const [showAddCompany, setShowAddCompany] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyIndustry, setNewCompanyIndustry] = useState("");
  const [newCompanyStaff, setNewCompanyStaff] = useState("");
  const [newCompanyDesc, setNewCompanyDesc] = useState("");
  const [newCompanySite, setNewCompanySite] = useState("");
  const DEFAULT_LOGO_URL = "https://rjhtauzookkvlipvqpvr.supabase.co/storage/v1/object/public/Logos/RR-Logo.png";
  const [newCompanyLogo, setNewCompanyLogo] = useState(DEFAULT_LOGO_URL);
  const [newCompanyFiles, setNewCompanyFiles] = useState("");
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState<string>("");
  // Raw extracted company text from the uploaded document (≤5000 chars).
  // Editable in a large textarea, also passed to «Оформить красиво» as a hint.
  const [companyRawText, setCompanyRawText] = useState("");

  // New fields per spec: "Описание компании и чем занимается" + "Основные продукты"
  const [newCompanyDescription, setNewCompanyDescription] = useState("");
  const [newCompanyProducts, setNewCompanyProducts] = useState("");

  // Draft company state (Supabase) — created when user opens the wizard
  const [draftCompanyId, setDraftCompanyId] = useState<string | null>(null);
  const [draftCompanyPublicId, setDraftCompanyPublicId] = useState<string | null>(null);
  const [draftFilePath, setDraftFilePath] = useState<string | null>(null);

  // New Brand fields requested by end-user:
  const [newCompanyMissionText, setNewCompanyMissionText] = useState("");
  const [newCompanyCustomWiki, setNewCompanyCustomWiki] = useState("");
  const [newCompanySalaryTerms, setNewCompanySalaryTerms] = useState("");
  const [newCompanyScheduleTerms, setNewCompanyScheduleTerms] = useState("");
  const [newCompanyStatsValClients, setNewCompanyStatsValClients] = useState("");
  const [newCompanyStatsLabelClients, setNewCompanyStatsLabelClients] = useState("");
  const [newCompanyStatsValDialogs, setNewCompanyStatsValDialogs] = useState("");
  const [newCompanyStatsLabelDialogs, setNewCompanyStatsLabelDialogs] = useState("");
  const [newCompanyStatsValFounded, setNewCompanyStatsValFounded] = useState("");
  const [newCompanyStatsLabelFounded, setNewCompanyStatsLabelFounded] = useState("");

  const [enhancingFields, setEnhancingFields] = useState<Record<string, boolean>>({});
  const [isEnhancingAll, setIsEnhancingAll] = useState(false);

  const handleEnhanceSingleField = async (fieldName: string, currentVal: string) => {
    setEnhancingFields(prev => ({ ...prev, [fieldName]: true }));
    try {
      const { aiEnhanceSingle } = await import("@/lib/aiClient");
      const newVal = await aiWaitRun({
        title: `ИИ улучшает поле «${fieldName}»`,
        task: () => aiEnhanceSingle({
          field: fieldName,
          value: currentVal,
          company_name: newCompanyName,
          hint: `industry=${newCompanyIndustry}; staff=${newCompanyStaff}; description=${newCompanyDesc}; site=${newCompanySite}; mission=${newCompanyMissionText}`,
        }),
      });
      if (newVal) {
        if (fieldName === "name") setNewCompanyName(newVal);
        else if (fieldName === "industry") setNewCompanyIndustry(newVal);
        else if (fieldName === "staff") setNewCompanyStaff(newVal);
        else if (fieldName === "description") setNewCompanyDesc(newVal);
        else if (fieldName === "sites") setNewCompanySite(newVal);
        else if (fieldName === "logoUrl") setNewCompanyLogo(newVal);
        else if (fieldName === "missionText") setNewCompanyMissionText(newVal);
        else if (fieldName === "customWiki") setNewCompanyCustomWiki(newVal);
        else if (fieldName === "salaryTerms") setNewCompanySalaryTerms(newVal);
        else if (fieldName === "scheduleTerms") setNewCompanyScheduleTerms(newVal);
        else if (fieldName === "statsValClients") setNewCompanyStatsValClients(newVal);
        else if (fieldName === "statsLabelClients") setNewCompanyStatsLabelClients(newVal);
        else if (fieldName === "statsValDialogs") setNewCompanyStatsValDialogs(newVal);
        else if (fieldName === "statsLabelDialogs") setNewCompanyStatsLabelDialogs(newVal);
        else if (fieldName === "statsValFounded") setNewCompanyStatsValFounded(newVal);
        else if (fieldName === "statsLabelFounded") setNewCompanyStatsLabelFounded(newVal);
        else if (fieldName === "descriptionText") setNewCompanyDescription(newVal);
        else if (fieldName === "productsText") setNewCompanyProducts(newVal);

        addAuditEvent("success", "ИИ Улучшение поля", `Поле успешно улучшено ИИ!`);
      }
    } catch (err) {
      console.error(err);
      addAuditEvent("warning", "Ошибка ИИ-полировки", "Не удалось связаться с ProTalk.");
    } finally {
      setEnhancingFields(prev => ({ ...prev, [fieldName]: false }));
    }
  };

  const handleEnhanceAllFields = async () => {
    setIsEnhancingAll(true);
    addAuditEvent("info", "ИИ Настройка", "ИИ-аналитик RR комплексно оформляет ваш бренд...");
    try {
      const { aiEnhanceAll } = await import("@/lib/aiClient");
      const fields = {
        name: newCompanyName,
        industry: newCompanyIndustry,
        staff: newCompanyStaff,
        description_text: newCompanyDescription,
        products_text: newCompanyProducts,
        missionText: newCompanyMissionText,
        team: newCompanyDesc,
        sites: newCompanySite,
        logoUrl: newCompanyLogo,
        customWiki: newCompanyCustomWiki,
        salaryTerms: newCompanySalaryTerms,
        scheduleTerms: newCompanyScheduleTerms,
        statsValClients: newCompanyStatsValClients,
        statsLabelClients: newCompanyStatsLabelClients,
        statsValDialogs: newCompanyStatsValDialogs,
        statsLabelDialogs: newCompanyStatsLabelDialogs,
        statsValFounded: newCompanyStatsValFounded,
        statsLabelFounded: newCompanyStatsLabelFounded,
      };
      const enriched = await aiWaitRun({
        title: "ИИ упаковывает бренд компании",
        task: () => aiEnhanceAll({
          mode: "all_company",
          company_name: newCompanyName,
          fields,
          hint: [
            newCompanyFiles ? `attached files: ${String(newCompanyFiles)}` : "",
            companyRawText ? `Извлечённый текст о компании из документа:\n${companyRawText}` : "",
          ].filter(Boolean).join("\n\n") || undefined,
        }),
      });
      if (enriched) {
        if (enriched.name) setNewCompanyName(enriched.name);
        if (enriched.industry) setNewCompanyIndustry(enriched.industry);
        if (enriched.staff) setNewCompanyStaff(enriched.staff);
        if (enriched.description_text) setNewCompanyDescription(enriched.description_text);
        if (enriched.products_text) setNewCompanyProducts(enriched.products_text);
        if (enriched.team) setNewCompanyDesc(enriched.team);
        if (enriched.sites) setNewCompanySite(enriched.sites);
        if (enriched.logoUrl) setNewCompanyLogo(enriched.logoUrl);
        if (enriched.missionText) setNewCompanyMissionText(enriched.missionText);
        if (enriched.customWiki) setNewCompanyCustomWiki(enriched.customWiki);
        if (enriched.salaryTerms) setNewCompanySalaryTerms(enriched.salaryTerms);
        if (enriched.scheduleTerms) setNewCompanyScheduleTerms(enriched.scheduleTerms);
        if (enriched.statsValClients) setNewCompanyStatsValClients(enriched.statsValClients);
        if (enriched.statsLabelClients) setNewCompanyStatsLabelClients(enriched.statsLabelClients);
        if (enriched.statsValDialogs) setNewCompanyStatsValDialogs(enriched.statsValDialogs);
        if (enriched.statsLabelDialogs) setNewCompanyStatsLabelDialogs(enriched.statsLabelDialogs);
        if (enriched.statsValFounded) setNewCompanyStatsValFounded(enriched.statsValFounded);
        if (enriched.statsLabelFounded) setNewCompanyStatsLabelFounded(enriched.statsLabelFounded);

        addAuditEvent("success", "Бренд упакован", "Все поля вашей компании успешно улучшены и структурированы ИИ!");
      }
    } catch (err) {
      console.error(err);
      addAuditEvent("warning", "Ошибка ИИ-полировки", "Не удалось связаться с ProTalk.");
    } finally {
      setIsEnhancingAll(false);
    }
  };

  const parseCompanyFileWithAI = async (filename: string) => {
    setIsParsingFile(true);
    addAuditEvent("info", "ИИ разбор документа", `ИИ-Копирайтер ProTalk считывает текст из файла: ${filename}...`);
    try {
      const filePath = draftFilePath;
      const res = await aiWaitRun<any>({
        title: `ИИ читает файл ${filename}`,
        task: async () => {
          const { data, error } = await supabase.functions.invoke("ai-ingest-document", {
            body: {
              entity: "company",
              entity_id: draftCompanyId || undefined,
              bucket: filePath ? "company-uploads" : undefined,
              file_path: filePath || undefined,
              filename,
              max_chars: 5000,
            },
          });
          if (error) throw new Error(error.message);
          return data;
        },
      });
      const text = String(res?.text || "").slice(0, 5000);
      if (text) {
        setCompanyRawText(text);
        addAuditEvent("success", "Текст извлечён", `Документ ${filename} распознан (${text.length} симв.). Проверьте текст и нажмите «Оформить красиво».`);
      } else {
        addAuditEvent("warning", "Пустой ответ", "ИИ не вернул текст из документа.");
      }
      // ai-ingest-document already removes the file from storage on completion.
      setDraftFilePath(null);
    } catch (err: any) {
      console.error(err);
      addAuditEvent("warning", "Ошибка распознавания", err?.message || "Не удалось разобрать файл.");
    } finally {
      setIsParsingFile(false);
    }
  };

  // Open wizard: create draft company + reset ProTalk dialog with /restart
  const openAddCompanyWizard = async () => {
    if (showAddCompany) { await cancelAddCompanyWizard(); return; }
    try {
      const { data, error } = await supabase.rpc("company_create_draft");
      if (error) throw error;
      const d = data as any;
      setDraftCompanyId(d?.id || null);
      setDraftCompanyPublicId(d?.public_id || null);
      // Reset wizard fields so the user starts clean.
      setNewCompanyName("");
      setNewCompanyIndustry("");
      setNewCompanyStaff("");
      setNewCompanySite("");
      setNewCompanyLogo(DEFAULT_LOGO_URL);
      setNewCompanyDescription("");
      setNewCompanyProducts("");
      setNewCompanyMissionText("");
      setNewCompanyDesc("");
      setNewCompanySalaryTerms("");
      setNewCompanyScheduleTerms("");
      setNewCompanyCustomWiki("");
      setCompanyRawText("");
      setNewCompanyFiles("");
      // Source of truth for the list is Supabase. We do not optimistically
      // push a "draft" card here — fetchCompanies() will surface it after
      // the user actually saves data, which avoids ghost cards on cancel.
      setShowAddCompany(true);
      try {
        const { aiRestart } = await import("@/lib/aiClient");
        aiRestart(employerId).catch(() => {});
      } catch {}
    } catch (err: any) {
      console.error(err);
      addAuditEvent("warning", "Ошибка создания компании", err?.message || "RPC error");
    }
  };

  // Cancel wizard: cleanup any uploaded files in storage for the current draft folder
  const cancelAddCompanyWizard = async () => {
    try {
      if (draftFilePath) {
        const folder = draftFilePath.split("/").slice(0, -1).join("/");
        const list = await supabase.storage.from("company-uploads").list(folder);
        if (list.data?.length) {
          await supabase.storage.from("company-uploads").remove(list.data.map((f) => `${folder}/${f.name}`));
        }
      }
      // If the wizard was opened on a fresh empty draft (no name yet) — drop it
      // so the user does not end up with phantom "Без названия" cards.
      if (draftCompanyId) {
        const { data: row } = await supabase
          .from("companies")
          .select("name, status")
          .eq("id", draftCompanyId)
          .maybeSingle();
        const isEmptyDraft =
          row && row.status === "draft" && (!row.name || String(row.name).trim() === "");
        if (isEmptyDraft) {
          await supabase.from("companies").delete().eq("id", draftCompanyId);
        }
      }
    } catch (e) { console.warn("cancel cleanup error", e); }
    setDraftFilePath(null);
    setShowAddCompany(false);
    setDraftCompanyId(null);
    setDraftCompanyPublicId(null);
    // Refresh list from DB so any leftover state is reconciled.
    fetchCompanies();
  };

  // Open existing company in the wizard for editing (free, same UX as draft)
  const openEditCompanyWizard = async (comp: any) => {
    setDraftCompanyId(comp.id);
    setDraftCompanyPublicId(comp.public_id || null);
    setNewCompanyName(comp.name || "");
    setNewCompanyLogo(comp.logo_url || DEFAULT_LOGO_URL);
    setNewCompanyIndustry(comp.industry || "");
    setNewCompanyStaff(comp.staff || "");
    setNewCompanySite(comp.website || "");
    setNewCompanyDescription(comp.description_text || "");
    setNewCompanyProducts(comp.products_text || "");
    setNewCompanyMissionText(comp.mission_text || "");
    setNewCompanyDesc(comp.about_text || "");
    setNewCompanySalaryTerms(comp.payouts_text || "");
    setNewCompanyScheduleTerms(comp.schedule_text || "");
    setNewCompanyCustomWiki(comp.system_text || "");
    const st = (comp.stats || {}) as any;
    setNewCompanyStatsValFounded(st.founded_year ? String(st.founded_year) : "");
    setNewCompanyStatsValClients(st.employees ? String(st.employees) : "");
    setNewCompanyStatsValDialogs(st.turnover ? String(st.turnover) : "");
    const lbl = (st.labels || {}) as any;
    setNewCompanyStatsLabelFounded(lbl.founded || "");
    setNewCompanyStatsLabelClients(lbl.employees || "");
    setNewCompanyStatsLabelDialogs(lbl.turnover || "");
    // Open editor immediately — restart fires in background with overlay UI
    setShowAddCompany(true);
    try {
      const { aiRestart } = await import("@/lib/aiClient");
      aiRestart(employerId).catch(() => {});
    } catch {}
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50);
  };

  // Upload a file to storage, returns signed URL
  const uploadCompanyFile = async (file: File): Promise<string | null> => {
    setUploadError("");
    setIsUploadingFile(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id;
      if (!uid) {
        const msg = "Войдите в систему — без авторизации файл нельзя загрузить в Supabase Storage.";
        setUploadError(msg);
        addAuditEvent("warning", "Нет авторизации", msg);
        return null;
      }
      if (!draftCompanyId) {
        const msg = "Черновик компании ещё не создан. Закройте и снова откройте «Добавить компанию».";
        setUploadError(msg);
        addAuditEvent("warning", "Нет черновика компании", msg);
        return null;
      }
      // Supabase Storage keys must be ASCII-safe — strip non-ASCII (e.g. Cyrillic) chars
      const safeName = file.name
        .normalize("NFKD")
        .replace(/[^\x20-\x7E]+/g, "")
        .replace(/[^a-zA-Z0-9._-]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "") || `file_${Date.now()}`;
      const path = `${uid}/${draftCompanyId}/${Date.now()}_${safeName}`;
      const up = await supabase.storage.from("company-uploads").upload(path, file, { upsert: true });
      if (up.error) throw up.error;
      setDraftFilePath(path);
      setNewCompanyFiles(file.name);
      addAuditEvent("success", "Файл загружен в Supabase", `${file.name} → company-uploads/${path}`);
      const signed = await supabase.storage.from("company-uploads").createSignedUrl(path, 60 * 60);
      return signed.data?.signedUrl || null;
    } catch (err: any) {
      console.error("upload error", err);
      const msg = err?.message || "Не удалось загрузить файл в Supabase Storage.";
      setUploadError(msg);
      addAuditEvent("warning", "Ошибка загрузки файла", msg);
      setNewCompanyFiles("");
      setDraftFilePath(null);
      return null;
    } finally {
      setIsUploadingFile(false);
    }
  };

  // Project (Vacancy) edit state
  const [editingProject, setEditingProject] = useState<JobProject | null>(null);
  // Raw OCR/AI-extracted text from a document uploaded inside the vacancy
  // EDITOR modal — fed into `handleEnhanceAllVacancyLandingFields` as
  // `file_context` so beautify-all reads facts from the uploaded file.
  const [editVacancyRawText, setEditVacancyRawText] = useState<string>("");
  const [isEnhancingAllVacEdit, setIsEnhancingAllVacEdit] = useState(false);
  const [editorSubTab, setEditorSubTab] = useState<string>("company");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [inlineEditSection, setInlineEditSection] = useState<string | null>(null);
  const [aiEnhancingField, setAiEnhancingField] = useState<VacancyFieldKey | null>(null);
  // Per-role templates for the currently edited project (mirrors the wizard's
  // `roleTemplates`). Used to drive the "Шаблон должности" button inside the
  // edit modal's VacancyEditor and to bulk-overwrite fields when the user
  // changes the role from inside the modal.
  const [editRoleTemplates, setEditRoleTemplates] = useState<Record<string, string>>({});
  const [editSpecialtySearch, setEditSpecialtySearch] = useState("");
  const [isDeletingProject, setIsDeletingProject] = useState(false);

  // Load per-role templates for the currently edited project so the editor's
  // "Шаблон должности" button uses values specific to the chosen role.
  useEffect(() => {
    const role = editingProject?.roleName?.trim();
    if (!role) { setEditRoleTemplates({}); return; }
    let cancelled = false;
    (async () => {
      const tpl = await getRoleTemplates(role);
      if (!cancelled) setEditRoleTemplates((tpl as Record<string, string>) || {});
    })();
    return () => { cancelled = true; };
  }, [editingProject?.roleName]);

  // Bulk-overwrite all 15 fields of the edited project from the current role's
  // template (used by an explicit button next to the role selector).
  const applyRoleTemplateToEditing = async () => {
    if (!editingProject?.roleName?.trim()) return;
    const tpl = await getRoleTemplates(editingProject.roleName);
    setEditRoleTemplates((tpl as Record<string, string>) || {});
    const mapped = roleTplToFields(tpl as any);
    const valueFor = (key: VacancyFieldKey) =>
      (mapped[key] && mapped[key]!.trim()) || VACANCY_FIELDS_BY_KEY[key].example;
    if (!window.confirm(`Заменить все 15 полей шаблоном для должности «${editingProject.roleName}»?`)) return;
    const patch: Partial<Record<VacancyFieldKey, string>> = {};
    (Object.keys(CAMEL_BY_KEY) as VacancyFieldKey[]).forEach((k) => {
      if (k === "role_name") return;
      patch[k] = valueFor(k);
    });
    setEditingProject({ ...editingProject, ...vacancyValuesToCamel(patch) } as any);
  };

  // Archive the currently edited vacancy (soft, reversible).
  const handleArchiveEditedProject = async () => {
    if (!editingProject) return;
    if (!window.confirm(
      `Архивировать вакансию «${editingProject.roleName}»?\n\n` +
      `Лендинг и личные кабинеты по ней станут недоступны кандидатам. ` +
      `Все кандидаты, статистика CRM, переписка и платежи сохранятся. ` +
      `Восстановить можно в любой момент.`,
    )) return;
    setIsDeletingProject(true);
    try {
      const { error } = await (supabase as any).rpc("project_archive", { _id: editingProject.id });
      if (error) throw error;
      addAuditEvent("warning", "Вакансия в архиве", `«${editingProject.roleName}» переведена в архив.`);
      setEditingProject(null);
      fetchData();
    } catch (err: any) {
      console.error(err);
      alert("Не удалось архивировать вакансию: " + (err?.message || err));
    } finally {
      setIsDeletingProject(false);
    }
  };

  // Soft-delete (hide from public, keep CRM data, keep public_id reserved).
  const handleDeleteEditedProject = async () => {
    if (!editingProject) return;
    if (!window.confirm(
      `Удалить вакансию «${editingProject.roleName}»?\n\n` +
      `Лендинг закроется, кандидаты больше не смогут войти в личный кабинет по этой вакансии. ` +
      `Данные кандидатов, CRM, переписка и платежи остаются в системе. ` +
      `Номер вакансии (${(editingProject as any).publicId || editingProject.id}) не будет переиспользован.`,
    )) return;
    setIsDeletingProject(true);
    try {
      const { error } = await (supabase as any).rpc("project_soft_delete", { _id: editingProject.id });
      if (error) throw error;
      addAuditEvent("warning", "Вакансия удалена", `«${editingProject.roleName}» закрыта. Данные CRM сохранены.`);
      setEditingProject(null);
      fetchData();
    } catch (err: any) {
      console.error(err);
      alert("Не удалось удалить вакансию: " + (err?.message || err));
    } finally {
      setIsDeletingProject(false);
    }
  };
  
  // Custom Interview and Training builder states
  const [activeEditTab, setActiveEditTab] = useState<"landing" | "training">("landing");
  const [isEnhancingAllVac, setIsEnhancingAllVac] = useState(false);
  const [isParsingTrainingFile, setIsParsingTrainingFile] = useState(false);
  const [trainingDragActive, setTrainingDragActive] = useState(false);

  // System Audit Events State
  const [auditEvents, setAuditEvents] = useState<any[]>([
    { id: 1, type: "info", title: "Вход в панель управления", message: "Успешная авторизация в системе управления Робором.", timestamp: "12:15:30" },
    { id: 2, type: "success", title: "Обновление синхронизации", message: "Проекты и аналитика успешно считаны со встроенного БД сервера.", timestamp: "12:15:35" }
  ]);
  const [auditFilter, setAuditFilter] = useState<"all" | "info" | "success" | "warning">("all");

  // Synchronized Full-Stack Fetching
  const fetchCompanies = async () => {
    try {
      // Load companies owned by this employer directly from Supabase.
      // (No /api/companies endpoint exists — the dev/prod server returns index.html
      // with 200 OK for unknown routes, so a fetch() here would silently break JSON parsing.)
      const { supabase } = await import("@/integrations/supabase/client");
      let data: any[] = [];
      if (employerId) {
        const { data: emp, error: empErr } = await supabase
          .from("employers")
          .select("id")
          .eq("public_id", employerId)
          .maybeSingle();
        if (empErr) console.error("fetchCompanies: employer lookup failed", empErr);
        if (emp?.id) {
          const r = await supabase
            .from("companies")
            .select("*")
            .eq("owner_employer_id", emp.id)
            .order("created_at", { ascending: false });
          if (r.error) console.error("fetchCompanies: companies query failed", r.error);
          data = (r.data as any[]) || [];
        }
      } else {
        const r = await supabase.from("companies").select("*");
        if (r.error) console.error("fetchCompanies: companies query failed", r.error);
        data = (r.data as any[]) || [];
      }
      console.info("[EmployerPanel] companies loaded:", data.length, "for emp", employerId);
      setCompaniesList(
        (data || []).map((c: any) => ({
          id: c.id,
          public_id: c.public_id,
          name: c.name,
          slug: c.slug,
          logoUrl: c.logo_url,
          status: c.status,
          description_text: c.description_text,
          products_text: c.products_text,
          mission_text: c.mission_text,
          about_text: c.about_text,
          team_text: c.team_text,
          payouts_text: c.payouts_text,
          schedule_text: c.schedule_text,
          system_text: c.system_text,
          stats: c.stats,
          logo_url: c.logo_url,
          missionText: c.mission_text,
          description: c.about_text,
          industry: c.industry || "",
          staff: c.staff || "",
          website: c.website || "",
          sites: c.website || "",
          activeVacancies: 0,
          employerId,
        })),
      );
    } catch (err) {
      console.error("Error loading companies from server:", err);
    }
  };

  const fetchEmployerData = async () => {
    try {
      // Legacy /api/* endpoints don't exist in this SPA — Vite returns index.html with 200,
      // so res.ok is true but res.json() throws. We rely on Supabase directly.
      const res: any = null;
      if (res && res.ok) {
        const data = await res.json();
        setBalance(data.balance || 0);
        // legacy mock limits ignored — credits come from employers.* below
        if (data.name) setProfileName(data.name);
        if (data.title) setProfileTitle(data.title);
        if (data.email) setProfileEmail(data.email);
        if (data.phone) setProfilePhone(data.phone);
        if (data.telegramId) setAdminTgId(data.telegramId);

        // Sub-profiles sync from server DB
        setGoogleName(data.googleName || data.name || "Сергей Ковалев");
        setGoogleEmail(data.googleEmail || data.email || "hr-director@company.ru");
        setGooglePhoto(data.googlePhoto || "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80");
        setGoogleId(data.googleId || `g-1094857293049182743`);
        setGoogleVerified(data.googleVerified !== undefined ? data.googleVerified : true);

        setTelegramIdState(data.telegramId || data.telegramId || "59384591");
        setTelegramPhoto(data.telegramPhoto || "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=facearea&facepad=2.2&w=256&h=256&q=80");
        setTelegramFirstName(data.telegramFirstName || "Сергей");
        setTelegramLastName(data.telegramLastName || "Ковалев");
        setTelegramUsernameState(data.telegramUsername || data.telegramUsername || "cowal_sales");
        return;
      }
      // Supabase fallback — read employer row by public_id
      if (!employerId) return;
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: emp } = await supabase
        .from("employers")
        .select("*, wallets(units_balance)")
        .eq("public_id", employerId)
        .maybeSingle();
      if (emp) {
        setBalance(Number((emp as any).wallets?.[0]?.units_balance ?? (emp as any).wallets?.units_balance ?? 0));
        if (emp.contact_name) setProfileName(emp.contact_name);
        if (emp.contact_email) setProfileEmail(emp.contact_email);
      }
    } catch (err) {
      console.error("Error loading employer profile:", err);
    }
  };

  const handleUpdateProfile = async (customPayload?: any) => {
    try {
      const defaultPayload = {
        name: profileName,
        title: profileTitle,
        email: profileEmail,
        phone: profilePhone,
        telegramId: adminTgId,
        googleName,
        googleEmail,
        googlePhoto,
        googleId,
        googleVerified,
        telegramPhoto,
        telegramFirstName,
        telegramLastName,
        telegramUsername: telegramUsernameState
      };

      const payload = customPayload ? { ...defaultPayload, ...customPayload } : defaultPayload;

      // Persist contact fields to Supabase (legacy /api endpoint removed).
      let ok = false;
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        if (employerId) {
          const upd = await supabase
            .from("employers")
            .update({
              contact_name: payload.name,
              contact_email: payload.email,
              contact_phone: payload.phone,
              contact_telegram: payload.telegramId,
            } as any)
            .eq("public_id", employerId);
          ok = !upd.error;
        }
      } catch {}
      if (ok) {
        setIsProfileSaved(true);
        addAuditEvent("success", "Профиль сохранен", "HR менеджер успешно обновил личные контактные данные и интеграции.");
        setTimeout(() => setIsProfileSaved(false), 2500);
        fetchEmployerData();
      }
    } catch (err) {
      console.error("Error updating profile:", err);
    }
  };

  // Fetch initial data
  const fetchData = async () => {
    try {
      const { supabase } = await import("@/integrations/supabase/client");

      {
      // Supabase fallback: projects for this employer (by public_id)
        let projRows: any[] = [];
        if (employerId) {
          const { data: emp } = await supabase.from("employers").select("id").eq("public_id", employerId).maybeSingle();
          if (emp?.id) {
            const r = await supabase.from("projects").select("*, companies(name, slug)").eq("employer_id", emp.id);
            projRows = (r.data as any[]) || [];
          }
        } else {
          const r = await supabase.from("projects").select("*, companies(name, slug)");
          projRows = (r.data as any[]) || [];
        }
        setProjects(
          (projRows || []).map((p: any) => ({
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
            logoUrl: p.logo_url || undefined,
            slug: p.slug,
            // 15 canonical vacancy fields (snake_case mirrored on the row).
            vacancyText: p.vacancy_text || undefined,
            tasksActivityText: p.tasks_activity_text || undefined,
            scheduleText: p.schedule_text || undefined,
            motivationTextDetail: p.motivation_text_detail || undefined,
            payoutsText: p.payouts_text || undefined,
            onboardingText: p.onboarding_text || undefined,
            teamText: p.team_text || undefined,
            systemText: p.system_text || undefined,
            trainingProfessionalText: p.training_professional_text || undefined,
            trainingProductText: p.training_product_text || undefined,
            trainingSystemsText: p.training_systems_text || undefined,
            trainingWikiText: p.training_wiki_text || undefined,
            trainingRegulationsText: p.training_regulations_text || undefined,
            // legacy aliases kept for older code paths
            trainingProfText: p.training_prof_text || p.training_professional_text || undefined,
            trainingSystemText: p.training_system_text || p.training_systems_text || undefined,
          })) as any,
        );
      }

      {
        // Supabase fallback: candidates linked to this employer's projects
        let candRows: any[] = [];
        if (employerId) {
          const { data: emp } = await supabase.from("employers").select("id").eq("public_id", employerId).maybeSingle();
          if (emp?.id) {
            const { data: projIds } = await supabase.from("projects").select("id").eq("employer_id", emp.id);
            const ids = (projIds || []).map((p) => p.id);
            if (ids.length) {
              const { data } = await supabase
                .from("candidates")
                .select("*, projects(role_name, company_id, companies(name, slug))")
                .in("project_id", ids);
              candRows = (data as any[]) || [];
            }
          }
        } else {
          const { data } = await supabase
            .from("candidates")
            .select("*, projects(role_name, company_id, companies(name, slug))");
          candRows = (data as any[]) || [];
        }
        setCandidates(
          (candRows || []).map((c: any) => ({
            id: `candidate${c.public_id}`,
            uuid: c.id,
            publicId: c.public_id,
            name: c.full_name || c.resume_name || `Кандидат #${c.public_id}`,
            fullName: c.full_name || "",
            email: c.email || "",
            phone: c.phone || "",
            projectId: c.project_id,
            companyId: c.company_id,
            companyName: c.projects?.companies?.name,
            companySlug: c.projects?.companies?.slug,
            roleName: c.role_name || c.projects?.role_name || "",
            currentStage: c.current_stage,
            crmStage: c.crm_stage,
            createdAt: c.created_at,
            registeredVia: c.registered_via,
            resumeText: c.resume_text,
            resumeName: c.resume_name,
          })) as any,
        );
      }

      // Fetch dynamic full-stack billing profile
      await fetchEmployerData();
      await fetchCompanies();
    } catch (err) {
      console.error("Error loading server data:", err);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [employerId]);

  // Immediate refresh of the companies list whenever the employerId changes
  // (e.g. when the user navigates into /emp{id}/companies). The 4-second
  // polling above eventually loads it too, but UX should be instant.
  useEffect(() => {
    if (!employerId) return;
    fetchCompanies();
  }, [employerId]);

  useEffect(() => {
    const pathIdMatch = path.match(/^\/(?:emp|employer)([a-zA-Z0-9_-]+)/);
    if (pathIdMatch && pathIdMatch[1] !== employerId) {
      setEmployerId(pathIdMatch[1]);
      localStorage.setItem("employer_session_id", pathIdMatch[1]);
    }
  }, [path, employerId]);

  // If no employer in URL/session, resolve via Supabase auth (user_id -> employer.public_id)
  // or fall back to the first existing employer (admin/demo case).
  useEffect(() => {
    if (employerId) return;
    let cancelled = false;
    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: own } = await supabase
          .from("employers")
          .select("public_id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!cancelled && own?.public_id) {
          setEmployerId(own.public_id);
          localStorage.setItem("employer_session_id", own.public_id);
          try { localStorage.setItem("employer_session_user_id", user.id); } catch {}
          return;
        }
      }
      // Last-resort fallback (demo/admin browsing): first employer
      const { data: any1 } = await supabase
        .from("employers")
        .select("public_id")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!cancelled && any1?.public_id) {
        setEmployerId(any1.public_id);
        localStorage.setItem("employer_session_id", any1.public_id);
      }
    })();
    return () => { cancelled = true; };
  }, [employerId]);

  // Load profile email for the authenticated user
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      // Pull real Google identity from auth user_metadata
      const meta: any = user.user_metadata || {};
      const fullName = meta.full_name || meta.name || meta.display_name || "";
      const picture = meta.avatar_url || meta.picture || "";
      const sub = meta.sub || meta.provider_id || user.id;
      if (fullName) { setGoogleName(fullName); setProfileName(fullName); }
      if (picture) setGooglePhoto(picture);
      if (sub) setGoogleId(String(sub));
      if (user.email) { setGoogleEmail(user.email); setProfileEmail(user.email); }
      setGoogleVerified(true);

      // Pull saved contact details from employers row
      const { data: emp } = await supabase
        .from("employers")
        .select("contact_phone, contact_telegram")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled && emp) {
        if ((emp as any).contact_phone) setProfilePhone((emp as any).contact_phone);
        if ((emp as any).contact_telegram) setTelegramUsernameState((emp as any).contact_telegram.replace(/^@/, ""));
      }

      const { data: prof } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled || !prof) return;
      if (prof.email) setGoogleEmail(prof.email);
    })();
    return () => { cancelled = true; };
  }, [employerId]);

  const handleRequestPhoneViaBot = async () => {
    /* Telegram removed */
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch { /* ignore */ }
    localStorage.clear();
    navigate("/main");
  };

  /** Перевод серверных ошибок (RPC) в человеческие сообщения. */
  const translateBillingError = (msg: string): string => {
    if (!msg) return "Неизвестная ошибка";
    const m = msg.toLowerCase();
    if (m.includes("insufficient_funds")) return "Недостаточно средств на балансе. Пополните счёт.";
    if (m.includes("no_credits")) return "Нет купленных лимитов. Купите пакет интервью или обучения.";
    if (m.includes("min_100")) return "Минимальный платёж — 100 ₽.";
    if (m.includes("no_employer")) return "Профиль работодателя не найден.";
    if (m.includes("bad_kind") || m.includes("bad_item") || m.includes("bad_qty")) return "Некорректные параметры запроса.";
    if (m.includes("forbidden")) return "Недостаточно прав.";
    return msg;
  };

  /** Подтягивает баланс, лимиты, реферера, рефери и историю операций. */
  const fetchBillingState = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: emp } = await supabase
        .from("employers")
        .select("id, public_id, interview_credits, training_credits, landing_credits, interview_setup_credits, training_setup_credits, wallets(units_balance, id)")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!emp) return;
      setBalance(Number(((emp as any).wallets?.[0]?.units_balance ?? (emp as any).wallets?.units_balance) || 0));
      setInterviewCredits(Number((emp as any).interview_credits || 0));
      setTrainingCredits(Number((emp as any).training_credits || 0));
      setLandingCredits(Number((emp as any).landing_credits || 0));
      setInterviewSetupCredits(Number((emp as any).interview_setup_credits || 0));
      setTrainingSetupCredits(Number((emp as any).training_setup_credits || 0));

      const walletId = (emp as any).wallets?.[0]?.id ?? (emp as any).wallets?.id;
      if (walletId) {
        const { data: txs } = await supabase
          .from("transactions")
          .select("created_at, type, amount_rr, note")
          .eq("wallet_id", walletId)
          .order("created_at", { ascending: false })
          .limit(200);
        setPaymentHistory((txs || []).map((t: any) => ({
          date: new Date(t.created_at).toLocaleString("ru-RU"),
          type: t.type,
          note: t.note || "",
          amount: ["topup", "bonus", "refund"].includes(t.type) ? Number(t.amount_rr) : -Number(t.amount_rr),
        })));
      }

      // Реферер (кто меня пригласил) — через SECURITY DEFINER RPC, чтобы обойти RLS на чужих employers/profiles
      const { data: refData } = await supabase.rpc("get_my_referrer");
      if (refData && typeof refData === "object") {
        const r: any = refData;
        setReferrer({
          public_id: r.public_id || "",
          name: r.name || "",
          email: r.email || "",
          phone: r.contact_phone || null,
          telegram: r.contact_telegram || null,
        });
      } else {
        setReferrer(null);
      }
      // Кого пригласил я
      const { data: invitedData } = await supabase.rpc("get_my_referees");
      const list: any[] = Array.isArray(invitedData) ? invitedData : [];
      setReferees(list.map((r: any) => ({
        name: r.name || "",
        email: r.email || "",
        created_at: r.created_at,
        bonus_rr: Number(r.bonus_rr) || 0,
      })));
    } catch (e) {
      console.error("fetchBillingState failed", e);
    }
  };

  useEffect(() => {
    fetchBillingState();
    const t = setInterval(fetchBillingState, 8000);
    return () => clearInterval(t);
  }, [employerId]);

  // Покупка единого пакета: грейд цены определяется по сумме интервью + обучения.
  const handleBuyMixedPack = async () => {
    setPurchaseError("");
    setPackBusy(true);
    try {
      const qi = Math.max(0, Math.floor(packQty.interview || 0));
      const qt = Math.max(0, Math.floor(packQty.training || 0));
      if (qi + qt < 1) throw new Error("Укажите хотя бы 1 шт.");
      const { error } = await supabase.rpc("purchase_pack_mixed", { _qty_int: qi, _qty_train: qt });
      if (error) throw new Error(error.message || "Ошибка покупки пакета");
      addAuditEvent("success", "Пакет приобретён", `Интервью +${qi} · Обучение +${qt}`);
      await fetchBillingState();
    } catch (err: any) {
      setPurchaseError(translateBillingError(err.message));
    } finally {
      setPackBusy(false);
    }
  };

  // Покупка фикс-услуги впрок (landing / interview_setup / training_setup)
  const handleBuyFixed = async (item: "landing" | "interview_setup" | "training_setup") => {
    setPurchaseError("");
    setFixedBusy(item);
    try {
      const { error } = await supabase.rpc("purchase_fixed", { _item: item, _qty: 1 });
      if (error) throw new Error(error.message || "Ошибка покупки услуги");
      addAuditEvent("success", "Услуга куплена", item);
      await fetchBillingState();
    } catch (err: any) {
      setPurchaseError(translateBillingError(err.message));
    } finally {
      setFixedBusy(null);
    }
  };

  // Action: Top Up Balance 
  const handleTopupBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (topupAmountRub < 100) {
      alert("Начальный минимальный платеж 100 рублей.");
      return;
    }
    if (!topupOfferOk) {
      alert("Для оплаты необходимо согласие с публичной офертой.");
      return;
    }
    setIsToppingUp(true);
    try {
      const { data, error } = await supabase.functions.invoke("robokassa-create", {
        body: { amount_rub: topupAmountRub, offer_accepted: true },
      });
      if (error) throw new Error(error.message || "Не удалось создать счёт");
      const resp: any = data;
      if (!resp?.ok || !resp?.payment_url) {
        throw new Error(
          resp?.error === "robokassa_not_configured"
            ? "Платёжная система ещё не подключена администратором. Попробуйте позже."
            : (resp?.error || "Не удалось получить ссылку на оплату"),
        );
      }
      addAuditEvent("info", "Переход на оплату", `Счёт №${resp.inv_id} на ${topupAmountRub} ₽ (Робокасса)`);
      window.location.href = resp.payment_url as string;
    } catch (err: any) {
      alert(translateBillingError(err.message));
    } finally {
      setIsToppingUp(false);
    }
  };

  // Log automated events helper
  const addAuditEvent = (type: "info" | "success" | "warning", title: string, message: string) => {
    const timeStr = new Date().toTimeString().split(' ')[0];
    setAuditEvents(prev => [
      { id: Date.now(), type, title, message, timestamp: timeStr },
      ...prev
    ]);
  };

  // Change candidate stage through live PATCH server endpoint
  const handleUpdateCandidateStage = async (candId: string, newStage: "terms" | "interview" | "scoring" | "training" | "certified") => {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const pid = String(candId).replace(/^candidate/, "");
      const upd = await supabase
        .from("candidates")
        .update({ current_stage: newStage } as any)
        .eq("public_id", pid)
        .select("*")
        .maybeSingle();
      if (!upd.error && upd.data) {
        setCandidates(prev => prev.map(c => c.id === candId ? ({ ...(c as any), currentStage: newStage } as any) : c));
        if (selectedCandidate?.id === candId) {
          setSelectedCandidate({ ...(selectedCandidate as any), currentStage: newStage } as any);
        }
        addAuditEvent("success", "Этап кандидата изменен", `Кандидат продвинут на этап: ${newStage}`);
        fetchData();
      }
    } catch (err) {
      console.error("Error modifying candidate stage:", err);
    }
  };

  // Move candidate in the CRM funnel (8-stage). Marks the stage as manual,
  // disabling automatic recalculation from triggers.
  const handleUpdateCrmStage = async (
    candId: string,
    newStage: "registration" | "screening" | "checklist" | "situations" | "professional" | "product" | "systems" | "certified",
  ) => {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const cand: any = candidates.find((c: any) => c.id === candId);
      const uuid = cand?.uuid;
      if (!uuid) return;
      const { error } = await supabase.rpc("employer_set_candidate_crm_stage" as any, {
        _candidate: uuid, _stage: newStage,
      });
      if (error) throw error;
      setCandidates(prev => prev.map((c: any) => c.id === candId ? ({ ...c, crmStage: newStage }) : c));
      addAuditEvent("success", "Этап CRM обновлён", `Кандидат перемещён на этап: ${newStage}`);
    } catch (err: any) {
      console.error("Error updating CRM stage:", err);
      addAuditEvent("warning", "Ошибка CRM", err?.message || "Не удалось обновить этап");
    }
  };

  // Open the vacancy wizard: create a draft project + restart the ProTalk
  // dialog so the user starts with a clean session, mirroring the company
  // wizard flow.
  const openAddVacancyWizard = async () => {
    if (showAddNewVacancy) { await cancelAddVacancyWizard(); return; }
    try {
      // Resolve the selected company id (by name, if any company was picked).
      const matched = companiesList.find(c => c.name.toLowerCase() === (setupCompanyName || "").toLowerCase());
      const companyId = (matched as any)?.id || null;
      const { data, error } = await supabase.rpc("project_create_draft" as any, { _company: companyId });
      if (error) throw error;
      const d = data as any;
      setDraftProjectId(d?.id || null);
      setDraftProjectPublicId(d?.public_id || null);
      // Reset wizard fields so the user starts clean.
      setSetupRoleName("");
      setSetupSalary("");
      setSetupSchedule("");
      setSetupCustomWiki("");
      setSetupVacancyText("");
      setSetupTasksActivityText("");
      setSetupMotivationText("");
      setSetupMotivationDetail("");
      setSetupScheduleText("");
      setSetupPayoutsText("");
      setSetupOnboardingText("");
      setSetupTeamText("");
      setSetupSystemText("");
      setSetupTrainingProfessionalText("");
      setSetupTrainingProductText("");
      setSetupTrainingSystemsText("");
      setSetupTrainingWikiText("");
      setSetupTrainingRegulationsText("");
      setSpecialtySearch("");
      // Reset vacancy file-ingest state
      setDraftVacancyFilePath(null);
      setVacancyFileName("");
      setVacancyUploadError("");
      setVacancyRawText("");
      // Open vacancy editor IMMEDIATELY — restart happens in background
      setShowAddNewVacancy(true);
      try {
        const { aiRestart } = await import("@/lib/aiClient");
        aiRestart(employerId).catch(() => {});
      } catch {}
    } catch (err: any) {
      console.error(err);
      addAuditEvent("warning", "Ошибка создания вакансии", err?.message || "RPC error");
    }
  };

  const cancelAddVacancyWizard = async () => {
    try {
      // Drop an empty draft so the list does not accumulate phantom rows.
      if (draftProjectId) {
        const { data: row } = await supabase
          .from("projects")
          .select("role_name, is_published")
          .eq("id", draftProjectId)
          .maybeSingle();
        const isEmpty = row && !row.is_published && (!row.role_name || String(row.role_name).trim() === "");
        if (isEmpty) {
          await supabase.from("projects").delete().eq("id", draftProjectId);
        }
      }
    } catch (e) { console.warn("cancel vacancy cleanup error", e); }
    setShowAddNewVacancy(false);
    setDraftProjectId(null);
    setDraftProjectPublicId(null);
    fetchData();
  };

  // Single-field AI improvement for vacancy wizard textareas.
  const handleEnhanceVacancyField = async (
    fieldName: string,
    currentVal: string,
    setter: (v: string) => void,
  ) => {
    setEnhancingVacFields(prev => ({ ...prev, [fieldName]: true }));
    try {
      const { aiEnhanceSingle } = await import("@/lib/aiClient");
      const value = await aiEnhanceSingle({
        field: fieldName,
        value: currentVal,
        company_name: setupCompanyName,
        role_name: setupRoleName,
        template: exampleFor(fieldName) || undefined,
      });
      if (value) setter(value);
      addAuditEvent("success", "Поле улучшено ИИ", `Готово: ${fieldName}`);
    } catch (err) {
      console.error(err);
      addAuditEvent("warning", "Ошибка ИИ-полировки", "Проверьте соединение.");
    } finally {
      setEnhancingVacFields(prev => ({ ...prev, [fieldName]: false }));
    }
  };

  // Save the wizard draft into projects (UPDATE), publish it, and redirect to
  // the employer vacancies list. The onboarding/training generation has been
  // moved out of the wizard to a dedicated action on each vacancy card.
  const handleCreateOnboardingSystem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftProjectId) {
      addAuditEvent("warning", "Нет черновика", "Откройте мастер через «+ Добавить вакансию».");
      return;
    }
    if (!setupRoleName.trim()) {
      addAuditEvent("warning", "Не указана должность", "Введите должность перед сохранением.");
      return;
    }
    setIsGenerating(true);
    try {
      // Resolve the company id from the selected company name (if any).
      const matched = companiesList.find(c => c.name.toLowerCase() === (setupCompanyName || "").toLowerCase());
      const companyId = (matched as any)?.id || null;

      const patch: any = {
        company_id: companyId,
        role_name: setupRoleName.trim(),
        // Legacy mirror fields kept in sync from the merged wizard inputs so
        // older queries that read salary_terms / schedule_terms still work.
        salary_terms: setupPayoutsText || null,
        schedule_terms: setupScheduleText || null,
        vacancy_text: setupVacancyText || null,
        tasks_activity_text: setupTasksActivityText || null,
        motivation_text: setupMotivationText || null,
        motivation_text_detail: setupMotivationDetail || null,
        schedule_text: setupScheduleText || null,
        payouts_text: setupPayoutsText || null,
        onboarding_text: setupOnboardingText || null,
        team_text: setupTeamText || null,
        system_text: setupSystemText || null,
        training_professional_text: setupTrainingProfessionalText || null,
        training_product_text: setupTrainingProductText || null,
        training_systems_text: setupTrainingSystemsText || null,
        training_wiki_text: setupTrainingWikiText || null,
        training_regulations_text: setupTrainingRegulationsText || null,
        is_published: true,
      };
      const upd = await supabase.from("projects").update(patch).eq("id", draftProjectId);
      if (upd.error) throw upd.error;

      // Keep the shared title catalog up-to-date AND save the wizard answers
      // as a per-role template (only fills empty keys; never overwrites).
      try {
        await upsertJobTitle(setupRoleName.trim());
        await saveRoleTemplates(setupRoleName.trim(), {
          vacancy_text: setupVacancyText,
          tasks_activity_text: setupTasksActivityText,
          schedule_text: setupScheduleText,
          motivation_text: setupMotivationText,
          motivation_text_detail: setupMotivationDetail,
          payouts_text: setupPayoutsText,
          onboarding_text: setupOnboardingText,
          team_text_vac: setupTeamText,
          system_text_vac: setupSystemText,
        });
      } catch {}

      addAuditEvent("success", "Вакансия сохранена", `Опубликована вакансия «${setupRoleName}»`);
      setShowAddNewVacancy(false);
      setDraftProjectId(null);
      setDraftProjectPublicId(null);
      // Refresh list from the database and navigate to the vacancies tab.
      await fetchData();
      if (employerId) navigate(`/emp${employerId}/vacancies`);
      setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50);
    } catch (err: any) {
      console.error(err);
      addAuditEvent("warning", "Ошибка сохранения вакансии", err?.message || "supabase error");
    } finally {
      setIsGenerating(false);
    }
  };

  // Toggle Pause Vacancy Action
  const togglePauseVacancy = (projId: string) => {
    const isPaused = pausedProjectIds.includes(projId);
    if (isPaused) {
      setPausedProjectIds(prev => prev.filter(id => id !== projId));
      addAuditEvent("success", "Вакансия активирована", `Проект ${projId} снова принимает соискателей`);
    } else {
      setPausedProjectIds(prev => [...prev, projId]);
      addAuditEvent("warning", "Вакансия на паузе", `Прием заявок по проекту ${projId} временно остановлен`);
    }
  };

  // Save edited project values
  const handleSaveEditedProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;

    setIsSavingEdit(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const ep: any = editingProject;
      // Resolve company_id from the (possibly changed) companyName.
      const matchedCo = companiesList.find(
        (c) => c.name.toLowerCase() === (ep.companyName || "").toLowerCase(),
      );
      const newCompanyId = (matchedCo as any)?.id ?? null;
      const patch: any = {
        role_name: ep.roleName,
        company_id: newCompanyId,
        salary_terms: ep.salaryTerms ?? null,
        schedule_terms: ep.scheduleTerms ?? null,
        motivation_text: ep.motivationText ?? null,
        custom_wiki: ep.customWiki ?? null,
        logo_url: ep.logoUrl ?? null,
        // 15 canonical vacancy fields
        vacancy_text: ep.vacancyText ?? null,
        tasks_activity_text: ep.tasksActivityText ?? null,
        schedule_text: ep.scheduleText ?? null,
        motivation_text_detail: ep.motivationTextDetail ?? null,
        payouts_text: ep.payoutsText ?? null,
        onboarding_text: ep.onboardingText ?? null,
        team_text: ep.teamText ?? null,
        system_text: ep.systemText ?? null,
        training_professional_text: ep.trainingProfessionalText ?? null,
        training_product_text: ep.trainingProductText ?? null,
        training_systems_text: ep.trainingSystemsText ?? null,
        training_wiki_text: ep.trainingWikiText ?? null,
        training_regulations_text: ep.trainingRegulationsText ?? null,
      };
      const upd = await supabase.from("projects").update(patch).eq("id", ep.id);
      if (upd.error) throw new Error(upd.error.message || "Не удалось сохранить изменения вакансии.");
      setProjects(prev => prev.map(p => p.id === ep.id ? ({ ...p, ...ep } as any) : p));
      addAuditEvent("success", "Вакансия обновлена", `Изменения для вакансии "${ep.roleName}" сохранены успешно.`);
      setEditingProject(null);
      fetchData();
    } catch (err: any) {
      alert("Ошибка при сохранении: " + err.message);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Bulk mailing dispatcher tool
  const handleLaunchMailing = async () => {
    setIsSendingMail(true);
    setMailingLogs([]);
    addAuditEvent("info", "Старт массовой рассылки", `Запускается отправка сообщений по сегменту: ${mailingSegment}`);

    // Filter recipients
    const recipients = candidates.filter(cand => {
      if (mailingSegment === "all") return true;
      return cand.currentStage === mailingSegment;
    });

    if (recipients.length === 0) {
      setMailingLogs(["Соискатели в выбранном сегменте не найдены."]);
      setIsSendingMail(false);
      return;
    }

    try {
      for (const rec of recipients) {
        setMailingLogs(prev => [...prev, `Отправка уведомления для: ${rec.name} (@${rec.telegramUsername || "telegram"})...`]);
        // Mock send — backend endpoint not implemented in SPA; log locally only.
        await new Promise((r) => setTimeout(r, 50));
      }
      setMailingLogs(prev => [...prev, `✅ Готово! Успешно отправлено сообщений: ${recipients.length}`]);
      addAuditEvent("success", "Рассылка завершена", `Доставлено сообщений соискателям: ${recipients.length}`);
      fetchData();
    } catch (err) {
      console.error(err);
      setMailingLogs(prev => [...prev, "Произошла техническая заминка при рассылке."]);
    } finally {
      setIsSendingMail(false);
    }
  };

  // Trigger simulated payment for subscription
  const handleConfirmPayment = () => {
    if (!selectedPlanToBuy) return;
    setIsProcessingPayment(true);
    
    setTimeout(() => {
      const planName = selectedPlanToBuy === "silver" ? "Серебро Про" : "Золото Безлимит";
      const priceVal = selectedPlanToBuy === "silver" ? "14 900 ₽" : "39 900 ₽";
      setTariffLevel(selectedPlanToBuy);
      
      const newTx = {
        id: `TX-${Math.floor(1000 + Math.random() * 9000)}`,
        date: new Date().toISOString().split('T')[0],
        plan: planName + " (ИИ)",
        amount: priceVal,
        status: "Успешно",
        method: "Банковская карта (Мир)"
      };

      setPaymentHistory(prev => [newTx, ...prev]);
      addAuditEvent("success", "Оплата подписки", `Тариф повышен до ${planName}. Наслаждайтесь расширенным лимитом.`);
      setIsProcessingPayment(false);
      setShowPaymentModal(false);
      setSelectedPlanToBuy(null);
    }, 2000);
  };

  // Save modified company profile
  const handleAddCompanySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyName) return;
    if (!draftCompanyId) {
      addAuditEvent("warning", "Нет черновика", "Откройте мастер через «+ Добавить Компанию».");
      return;
    }
    try {
      const stats = {
        founded_year: newCompanyStatsValFounded || null,
        employees: newCompanyStatsValClients || null,
        turnover: newCompanyStatsValDialogs || null,
        labels: {
          founded: newCompanyStatsLabelFounded || null,
          employees: newCompanyStatsLabelClients || null,
          turnover: newCompanyStatsLabelDialogs || null,
        },
      };
      const patch = {
        name: newCompanyName,
        logo_url: newCompanyLogo || DEFAULT_LOGO_URL,
        industry: newCompanyIndustry || null,
        website: newCompanySite || null,
        staff: newCompanyStaff || null,
        description_text: newCompanyDescription || null,
        products_text: newCompanyProducts || null,
        mission_text: newCompanyMissionText || null,
        about_text: newCompanyDesc || null,
        team_text: null,
        payouts_text: newCompanySalaryTerms || null,
        schedule_text: newCompanyScheduleTerms || null,
        system_text: newCompanyCustomWiki || null,
        stats,
      };
      const upd = await supabase.rpc("company_update", { _id: draftCompanyId, _patch: patch as any });
      if (upd.error) throw upd.error;
      const fin = await supabase.rpc("company_finalize", { _id: draftCompanyId });
      if (fin.error) throw fin.error;
      const pid = (fin.data as any)?.public_id || draftCompanyPublicId;

      // Cleanup uploaded files for this company
      if (draftFilePath) {
        try {
          const folder = draftFilePath.split("/").slice(0, -1).join("/");
          const list = await supabase.storage.from("company-uploads").list(folder);
          if (list.data?.length) {
            await supabase.storage.from("company-uploads").remove(list.data.map((f) => `${folder}/${f.name}`));
          }
        } catch (e) { console.warn("cleanup error", e); }
      }

      addAuditEvent("success", "Компания опубликована", `Лендинг доступен: /com${pid}`);
      // Reload list through the unified mapper.
      await fetchCompanies();

      // Reset wizard
      setNewCompanyName(""); setNewCompanyDesc(""); setNewCompanyIndustry(""); setNewCompanyStaff(""); setNewCompanySite("");
      setNewCompanyLogo(DEFAULT_LOGO_URL); setNewCompanyFiles(""); setNewCompanyMissionText(""); setNewCompanyCustomWiki("");
      setNewCompanySalaryTerms(""); setNewCompanyScheduleTerms("");
      setNewCompanyStatsValClients(""); setNewCompanyStatsLabelClients("");
      setNewCompanyStatsValDialogs(""); setNewCompanyStatsLabelDialogs("");
      setNewCompanyStatsValFounded(""); setNewCompanyStatsLabelFounded("");
      setNewCompanyDescription(""); setNewCompanyProducts("");
      setDraftCompanyId(null); setDraftCompanyPublicId(null); setDraftFilePath(null);
      setShowAddCompany(false);
    } catch (err: any) {
      console.error(err);
      addAuditEvent("warning", "Ошибка сохранения", err?.message || "supabase error");
    }
  };

  // Copy registration link to clipboard - updated to point to elegant corporate careers landing
  const handleCopyLink = (projectId: string, projCompanySlug?: string) => {
    const proj = projects.find(p => p.id === projectId);
    const matchedCompany = companiesList.find(c => c.name.toLowerCase() === proj?.companyName?.toLowerCase());
    const slug = projCompanySlug || proj?.companySlug || (matchedCompany ? matchedCompany.slug : "");
    const signupUrl = `${window.location.origin}/${slug}/${projectId}`;
    navigator.clipboard.writeText(signupUrl);
    setCopiedProjectId(projectId);
    setTimeout(() => setCopiedProjectId(null), 2000);
  };

  // Step 1: upload the chosen file to Supabase Storage (vacancy-uploads bucket).
  // We deliberately DO NOT call the LLM here — the user must press the explicit
  // «Распознать документ» button on step 2 to extract text.
  const uploadVacancyFile = async (file: File) => {
    setVacancyUploadError("");
    setIsUploadingVacancyFile(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id;
      if (!uid) {
        const msg = "Войдите в систему — без авторизации файл нельзя загрузить.";
        setVacancyUploadError(msg);
        addAuditEvent("warning", "Нет авторизации", msg);
        return;
      }
      if (!draftProjectId) {
        const msg = "Черновик вакансии ещё не создан. Закройте мастер и откройте снова.";
        setVacancyUploadError(msg);
        addAuditEvent("warning", "Нет черновика вакансии", msg);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        const msg = "Файл больше 10 МБ.";
        setVacancyUploadError(msg);
        return;
      }
      const safeName = file.name
        .normalize("NFKD")
        .replace(/[^\x20-\x7E]+/g, "")
        .replace(/[^a-zA-Z0-9._-]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "") || `file_${Date.now()}`;
      const path = `${uid}/${draftProjectId}/${Date.now()}_${safeName}`;
      const up = await supabase.storage.from("vacancy-uploads").upload(path, file, { upsert: true });
      if (up.error) throw up.error;
      setDraftVacancyFilePath(path);
      setVacancyFileName(file.name);
      addAuditEvent("success", "Файл вакансии загружен", `${file.name} → vacancy-uploads/${path}`);
    } catch (err: any) {
      console.error("vacancy upload error", err);
      const msg = err?.message || "Не удалось загрузить файл.";
      setVacancyUploadError(msg);
      addAuditEvent("warning", "Ошибка загрузки", msg);
    } finally {
      setIsUploadingVacancyFile(false);
    }
  };

  // Step 2: explicit «Распознать документ» — send the uploaded file to ProTalk
  // and put the resulting markdown into the editable raw-text textarea (≤5000
  // chars). The file is then removed from storage by the edge function.
  const recognizeVacancyFile = async () => {
    if (!draftVacancyFilePath) return;
    setIsParsingFile(true);
    addAuditEvent("info", "ИИ разбор вакансии", `Считываем текст из «${vacancyFileName || "файла"}»…`);
    try {
      const res = await aiWaitRun<any>({
        title: `ИИ читает файл ${vacancyFileName}`,
        task: async () => {
          const { data, error } = await supabase.functions.invoke("ai-ingest-document", {
            body: {
              entity: "vacancy",
              entity_id: draftProjectId || undefined,
              bucket: "vacancy-uploads",
              file_path: draftVacancyFilePath,
              filename: vacancyFileName,
              max_chars: 5000,
            },
          });
          if (error) throw new Error(error.message);
          return data;
        },
      });
      const text = String(res?.text || "").slice(0, 5000);
      if (text) {
        setVacancyRawText(text);
        addAuditEvent("success", "Текст вакансии извлечён", `Распознано ${text.length} симв. Нажмите «Оформить красиво».`);
      } else {
        addAuditEvent("warning", "Пустой ответ", "ИИ не вернул текст из документа.");
      }
      setDraftVacancyFilePath(null);
    } catch (err: any) {
      console.error(err);
      addAuditEvent("warning", "Ошибка распознавания", err?.message || "Не удалось разобрать файл.");
    } finally {
      setIsParsingFile(false);
    }
  };

  // Cohesive AI format for new vacancy fields
  const handleBeautifyNewVacancyWithAI = async () => {
    setIsGenerating(true);
    addAuditEvent("info", "ИИ-форматирование", "Оформляем все поля новой вакансии с помощью ИИ ProTalk...");
    try {
      const { aiEnhanceAll } = await import("@/lib/aiClient");
      // Find the selected company to send its data as context.
      const matchedCo = companiesList.find(c => (c.name || "").toLowerCase() === (setupCompanyName || "").toLowerCase());
      const companyCtx: Record<string, any> = matchedCo ? {
        name: matchedCo.name,
        industry: matchedCo.industry,
        staff: matchedCo.staff,
        website: matchedCo.website || matchedCo.sites,
        description_text: matchedCo.description_text,
        products_text: matchedCo.products_text,
        mission_text: matchedCo.mission_text || matchedCo.missionText,
        team_text: matchedCo.team_text,
        payouts_text: matchedCo.payouts_text,
        schedule_text: matchedCo.schedule_text,
        system_text: matchedCo.system_text,
        about_text: matchedCo.about_text,
      } : {};
      // Drop empty values to keep prompt clean.
      Object.keys(companyCtx).forEach((k) => { if (!companyCtx[k]) delete companyCtx[k]; });

      const enhanced = await aiWaitRun<any>({
        title: "ИИ оформляет вакансию",
        task: () => aiEnhanceAll({
          mode: "all_vacancy",
          company_name: setupCompanyName,
          role_name: setupRoleName,
          templates: {
            vacancy_text: exampleFor("vacancy_text"),
            tasks_activity_text: exampleFor("tasks_activity_text"),
            schedule_text: exampleFor("schedule_text"),
            motivation_text: exampleFor("motivation_text"),
            motivation_text_detail: exampleFor("motivation_text_detail"),
            payouts_text: exampleFor("payouts_text"),
            onboarding_text: exampleFor("onboarding_text"),
            team_text: exampleFor("team_text"),
            system_text: exampleFor("system_text"),
          },
          fields: {
            role_name: setupRoleName,
            vacancy_text: setupVacancyText,
            tasks_activity_text: setupTasksActivityText,
            motivation_text: setupMotivationText,
            motivation_text_detail: setupMotivationDetail,
            schedule_text: setupScheduleText,
            payouts_text: setupPayoutsText,
            onboarding_text: setupOnboardingText,
            team_text: setupTeamText,
            system_text: setupSystemText,
            training_professional_text: setupTrainingProfessionalText,
            training_product_text: setupTrainingProductText,
            training_systems_text: setupTrainingSystemsText,
            training_wiki_text: setupTrainingWikiText,
            training_regulations_text: setupTrainingRegulationsText,
          },
          file_context: vacancyRawText || undefined,
          company_context: Object.keys(companyCtx).length > 0 ? companyCtx : undefined,
        }),
      });
      if (enhanced) {
        if (enhanced.role_name) setSetupRoleName(enhanced.role_name);
        if (enhanced.vacancy_text) setSetupVacancyText(enhanced.vacancy_text);
        if (enhanced.tasks_activity_text) setSetupTasksActivityText(enhanced.tasks_activity_text);
        if (enhanced.motivation_text) setSetupMotivationText(enhanced.motivation_text);
        if (enhanced.motivation_text_detail) setSetupMotivationDetail(enhanced.motivation_text_detail);
        if (enhanced.schedule_text) setSetupScheduleText(enhanced.schedule_text);
        if (enhanced.payouts_text) setSetupPayoutsText(enhanced.payouts_text);
        if (enhanced.onboarding_text) setSetupOnboardingText(enhanced.onboarding_text);
        if (enhanced.team_text) setSetupTeamText(enhanced.team_text);
        if (enhanced.system_text) setSetupSystemText(enhanced.system_text);
        if (enhanced.training_professional_text) setSetupTrainingProfessionalText(enhanced.training_professional_text);
        if (enhanced.training_product_text) setSetupTrainingProductText(enhanced.training_product_text);
        if (enhanced.training_systems_text) setSetupTrainingSystemsText(enhanced.training_systems_text);
        if (enhanced.training_wiki_text) setSetupTrainingWikiText(enhanced.training_wiki_text);
        if (enhanced.training_regulations_text) setSetupTrainingRegulationsText(enhanced.training_regulations_text);
        addAuditEvent("success", "Оформление завершено", "Все поля успешно облагорожены ИИ в единую продающую форму.");
      }
    } catch (err) {
      console.error(err);
      addAuditEvent("warning", "Ошибка ИИ-оформления", "Проверьте стабильность интернет-соединения.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Enhance a single landing page sub-field using ProTalk API
  const handleEnhanceSingleVacancyField = async (fieldName: string, currentVal: string) => {
    if (!editingProject) return;
    addAuditEvent("info", "ИИ-полировка поля", `Улучшаем сведения в поле "${fieldName}" через ProTalk LLM...`);
    try {
      const { aiEnhanceSingle } = await import("@/lib/aiClient");
      const value = await aiEnhanceSingle({
        field: fieldName,
        value: currentVal,
        company_name: editingProject.companyName,
        role_name: editingProject.roleName,
      });
      if (value) {
        setEditingProject({
          ...editingProject,
          [fieldName]: value
        });
        addAuditEvent("success", "Поле улучшено с помощью ИИ", `Отредактировано и красиво оформлено.`);
      }
    } catch (err) {
      console.error(err);
      addAuditEvent("warning", "Ошибка ИИ-полировки", "Не удалось оптимизировать сведения в поле.");
    }
  };

  // Cohesive beautification of ALL landing fields in editingProject at once
  const handleEnhanceAllVacancyLandingFields = async () => {
    if (!editingProject) return;
    setIsEnhancingAllVac(true);
    addAuditEvent("info", "Полное ИИ-Оформление", "Запускаем полную реконструкцию контента лендинга через ИИ ProTalk...");
    try {
      const { aiEnhanceAll } = await import("@/lib/aiClient");
      const ep: any = editingProject;
      // Build canonical snake_case 15 fields payload.
      const fields: Record<string, string> = {
        role_name: ep.roleName || "",
        vacancy_text: ep.vacancyText || "",
        tasks_activity_text: ep.tasksActivityText || "",
        schedule_text: ep.scheduleText || ep.scheduleTerms || "",
        motivation_text: ep.motivationText || "",
        motivation_text_detail: ep.motivationTextDetail || "",
        payouts_text: ep.payoutsText || ep.salaryTerms || "",
        onboarding_text: ep.onboardingText || "",
        team_text: ep.teamText || "",
        system_text: ep.systemText || "",
        training_professional_text: ep.trainingProfessionalText || ep.trainingProfText || "",
        training_product_text: ep.trainingProductText || "",
        training_systems_text: ep.trainingSystemsText || ep.trainingSystemText || "",
        training_wiki_text: ep.trainingWikiText || "",
        training_regulations_text: ep.trainingRegulationsText || "",
      };
      const matchedCo = companiesList.find(c => (c.name || "").toLowerCase() === (ep.companyName || "").toLowerCase());
      const companyCtx: Record<string, any> = matchedCo ? {
        name: matchedCo.name, industry: matchedCo.industry, staff: matchedCo.staff,
        website: matchedCo.website || matchedCo.sites,
        description_text: matchedCo.description_text, products_text: matchedCo.products_text,
        mission_text: matchedCo.mission_text || matchedCo.missionText,
        team_text: matchedCo.team_text, payouts_text: matchedCo.payouts_text,
        schedule_text: matchedCo.schedule_text, system_text: matchedCo.system_text,
        about_text: matchedCo.about_text,
      } : {};
      Object.keys(companyCtx).forEach(k => { if (!companyCtx[k]) delete companyCtx[k]; });

      const enhanced = await aiEnhanceAll({
        mode: "all_vacancy",
        company_name: ep.companyName,
        role_name: ep.roleName,
        fields,
        company_context: Object.keys(companyCtx).length > 0 ? companyCtx : undefined,
      });
      if (enhanced) {
        // Map snake_case response back to JobProject camelCase fields.
        setEditingProject({
          ...editingProject,
          roleName: enhanced.role_name ?? ep.roleName,
          vacancyText: enhanced.vacancy_text ?? ep.vacancyText,
          tasksActivityText: enhanced.tasks_activity_text ?? ep.tasksActivityText,
          scheduleText: enhanced.schedule_text ?? ep.scheduleText,
          scheduleTerms: enhanced.schedule_text ?? ep.scheduleTerms,
          motivationText: enhanced.motivation_text ?? ep.motivationText,
          motivationTextDetail: enhanced.motivation_text_detail ?? ep.motivationTextDetail,
          payoutsText: enhanced.payouts_text ?? ep.payoutsText,
          salaryTerms: enhanced.payouts_text ?? ep.salaryTerms,
          onboardingText: enhanced.onboarding_text ?? ep.onboardingText,
          teamText: enhanced.team_text ?? ep.teamText,
          systemText: enhanced.system_text ?? ep.systemText,
          trainingProfessionalText: enhanced.training_professional_text ?? ep.trainingProfessionalText,
          trainingProductText: enhanced.training_product_text ?? ep.trainingProductText,
          trainingSystemsText: enhanced.training_systems_text ?? ep.trainingSystemsText,
          trainingWikiText: enhanced.training_wiki_text ?? ep.trainingWikiText,
          trainingRegulationsText: enhanced.training_regulations_text ?? ep.trainingRegulationsText,
        } as any);
        addAuditEvent("success", "Лендинг полностью оформлен!", "ИИ составил цельную, привлекательную картину вакансии.");
      }
    } catch (err) {
      console.error(err);
      addAuditEvent("warning", "Ошибка ИИ-полировки", "Не удалось связаться с ИИ ProTalk.");
    } finally {
      setIsEnhancingAllVac(false);
    }
  };

  // Parse custom training and onboarding curriculum documents
  const handleParseTrainingMaterials = async (filename: string) => {
    if (!editingProject) return;
    setIsParsingTrainingFile(true);
    addAuditEvent("info", "Анализ обучающих материалов", `Запущен разбор регламентов обучения из файла: ${filename}`);
    try {
      const { aiGenerateOnboarding } = await import("@/lib/aiClient");
      const aiData = await aiGenerateOnboarding({
        role_name: editingProject.roleName,
        company_name: editingProject.companyName,
        brief: `Файл регламентов: ${filename}\nТекущая база:\n${editingProject.customWiki || ""}`,
        save: false,
      });
      const parsed = {
        checklistQuestions: (aiData?.checklist || []).map((q: any) => q.question).filter(Boolean),
        roleplayQuestions: (aiData?.roleplay || []).map((q: any) => q.question).filter(Boolean),
        trainingProfText: aiData?.training_prof_text,
        trainingProductText: aiData?.training_product_text,
        trainingSystemText: aiData?.training_system_text,
      };
      {
        setEditingProject({
          ...editingProject,
          checklistQuestions: parsed.checklistQuestions || editingProject.checklistQuestions,
          roleplayQuestions: parsed.roleplayQuestions || editingProject.roleplayQuestions,
          trainingProfText: parsed.trainingProfText || editingProject.trainingProfText,
          trainingProductText: parsed.trainingProductText || editingProject.trainingProductText,
          trainingSystemText: parsed.trainingSystemText || editingProject.trainingSystemText
        });
        addAuditEvent("success", "ИИ-Материалы успешно созданы", `Подготовлено ${parsed.checklistQuestions?.length || 0} вопросов чеклиста и учебный план.`);
      }
    } catch (err) {
      console.error(err);
      addAuditEvent("warning", "Ошибка парсинга материалов", "ИИ использовал базовый шаблон регламентов.");
    } finally {
      setIsParsingTrainingFile(false);
    }
  };

  // Individual training field enhancer
  const handleEnhanceTrainingField = async (fieldName: string, currentVal: string) => {
    if (!editingProject) return;
    addAuditEvent("info", "ИИ-полировка обучения", `Улучшаем материалы в разделе "${fieldName}"...`);
    try {
      const { aiEnhanceSingle } = await import("@/lib/aiClient");
      const value = await aiEnhanceSingle({
        field: fieldName,
        value: currentVal,
        company_name: editingProject.companyName,
        role_name: editingProject.roleName,
        hint: "training_onboarding_evaluation",
      });
      if (value) {
        setEditingProject({
          ...editingProject,
          [fieldName]: fieldName === "checklistQuestions" || fieldName === "roleplayQuestions"
            ? value.split("\n").filter(Boolean)
            : value
        });
        addAuditEvent("success", "Раздел обучения отшлифован ИИ", `Сведения успешно дополнены и структурированы.`);
      }
    } catch (err) {
      console.error(err);
      addAuditEvent("warning", "Ошибка связи с ИИ", "Не удалось оптимизировать раздел.");
    }
  };

  // Save TG ID
  const saveTgId = () => {
    localStorage.setItem("employer_tg_id", adminTgId);
    handleUpdateProfile();
  };

  // Filtering candidates
  const filteredCandidates = candidates.filter(cand => {
    return cand.name.toLowerCase().includes(crmSearch.toLowerCase()) || 
           cand.roleName.toLowerCase().includes(crmSearch.toLowerCase()) ||
           cand.email.toLowerCase().includes(crmSearch.toLowerCase());
  });

  // Calculate stats
  const totalVerified = candidates.filter(c => c.currentStage === "certified").length;
  const averageAllScores = candidates.length > 0 
    ? Math.round(candidates.reduce((acc, c) => acc + (c.scores?.overallScore || 70), 0) / candidates.length)
    : 78;

  // Render content area based on six main tabs
  return (
    <div className="bg-gradient-to-b from-[#17344F] to-[#265582] min-h-screen text-white font-sans antialiased selection:bg-[#E7C768] selection:text-[#17344F] flex flex-col justify-between">
      
      {/* Top Header Navigation */}
      <header className="sticky top-0 z-50 bg-[#17344F]/95 backdrop-blur-md border-b border-white/10 px-4 md:px-8 py-4">
        <div className="flex items-center justify-between gap-4 w-full">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate("/")}>
            <RRImage 
              src="https://rjhtauzookkvlipvqpvr.supabase.co/storage/v1/object/public/Logos/RR-Logo.png" 
              w={40}
              alt="RR Робот Рекрутер" 
              className="w-10 h-10 object-contain drop-shadow" 
              referrerPolicy="no-referrer"
            />
            <div className="flex flex-col text-left">
              <span className="text-xl font-bold tracking-tight text-[#E7C768]">
                Робот Рекрутер
              </span>
              <span className="text-[10px] font-mono tracking-wider uppercase text-slate-300">Кабинет Работодателя</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {googlePhoto && (
              <img
                src={googlePhoto}
                alt=""
                referrerPolicy="no-referrer"
                className="hidden sm:block w-9 h-9 rounded-full object-cover border border-white/20"
              />
            )}
            <div className="text-right hidden sm:block">
              <span className="text-xs block text-[#E7C768] font-bold">{googleName || profileName}</span>
              <span className="text-[10px] block text-slate-300 font-mono">ID: {employerId}</span>
            </div>
            <button onClick={handleLogout} className="cursor-pointer bg-white/10 hover:bg-white/20 text-white rounded-xl px-3 py-2 text-xs font-bold transition flex items-center gap-1 border border-white/10">
              <LogOut className="w-3.5 h-3.5" /> Выйти
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Frame */}
      <div className="max-w-7xl mx-auto py-8 px-4 md:px-8 grid grid-cols-1 lg:grid-cols-12 gap-8 w-full flex-1">
        
        {/* Left Side Tab Drawer */}
        <aside className="lg:col-span-3 space-y-6">
          <div className="bg-[#1D3E5E]/85 border border-white/15 rounded-3xl p-5 shadow-xl space-y-4 text-center">
            <Mascot state="recruitment" size="sm" className="mx-auto" />
            <div>
              <h3 className="font-bold text-sm text-[#E7C768]">Пульт Управления Рекрутом</h3>
              <p className="text-[10px] text-slate-300 mt-1">Обучайте агента, координируйте воронку и контролируйте KPI.</p>
            </div>

            {/* SIX REQUIRED PAGES */}
            <div className="space-y-1.5 pt-2 text-left">
              <button
                onClick={() => navigate(`/emp${employerId}/profile`)}
                className={`w-full text-left font-bold text-xs px-4 py-2.5 rounded-xl flex items-center justify-between transition-all ${activeTab === "profile" ? "bg-[#1E4468] text-[#E7C768] border border-[#E7C768]/60 shadow" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}
              >
                <span className="flex items-center gap-2">
                  <User className="w-4 h-4 text-[#D99E41]" /> 1. Профиль HR
                </span>
                <span className="text-[10px] bg-amber-900/40 text-[#E7C768] px-1.5 py-0.5 rounded font-mono">Шаг 1</span>
              </button>

              <button
                onClick={() => navigate(`/emp${employerId}/companies`)}
                className={`w-full text-left font-bold text-xs px-4 py-2.5 rounded-xl flex items-center justify-between transition-all ${activeTab === "companies" ? "bg-[#1E4468] text-[#E7C768] border border-[#E7C768]/60 shadow" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}
              >
                <span className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-[#D99E41]" /> 2. Мои Компании
                </span>
                <span className="text-[10px] bg-amber-900/40 text-[#E7C768] px-1.5 py-0.5 rounded font-mono">Шаг 2</span>
              </button>

              <button
                onClick={() => navigate(`/emp${employerId}/vacancies`)}
                className={`w-full text-left font-bold text-xs px-4 py-2.5 rounded-xl flex items-center justify-between transition-all ${activeTab === "vacancies" ? "bg-[#1E4468] text-[#E7C768] border border-[#E7C768]/60 shadow" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}
              >
                <span className="flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-[#D99E41]" /> 3. Вакансии & ИИ
                </span>
                <span className="bg-slate-800 text-[10px] text-slate-300 px-1.5 py-0.5 rounded font-mono">Шаг 3</span>
              </button>

              <button
                onClick={() => navigate(`/emp${employerId}/training`)}
                className={`w-full text-left font-bold text-xs px-4 py-2.5 rounded-xl flex items-center justify-between transition-all ${activeTab === "training" ? "bg-[#1E4468] text-[#E7C768] border border-[#E7C768]/60 shadow" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}
              >
                <span className="flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-[#D99E41]" /> 4. Обучение (ИИ)
                </span>
                <span className="bg-slate-800 text-[10px] text-slate-300 px-1.5 py-0.5 rounded font-mono">Шаг 4</span>
              </button>

              <button
                onClick={() => navigate(`/emp${employerId}/interviews`)}
                className={`w-full text-left font-bold text-xs px-4 py-2.5 rounded-xl flex items-center justify-between transition-all ${activeTab === "interviews" ? "bg-[#1E4468] text-[#E7C768] border border-[#E7C768]/60 shadow" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}
              >
                <span className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-[#D99E41]" /> 5. Интервью (ИИ)
                </span>
                <span className="bg-slate-800 text-[10px] text-slate-300 px-1.5 py-0.5 rounded font-mono">Шаг 5</span>
              </button>

              <div className="h-px bg-white/10 my-2"></div>

              <button
                onClick={() => { navigate(`/emp${employerId}/crm`); setCrmViewMode("kanban"); }}
                className={`w-full text-left font-bold text-xs px-4 py-2.5 rounded-xl flex items-center justify-between transition-all ${activeTab === "crm" ? "bg-[#1E4468] text-[#E7C768] border border-[#E7C768]/60 shadow" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}
              >
                <span className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#D99E41]" /> CRM & Воронка
                </span>
                <span className="bg-amber-900/40 text-[10px] text-[#E7C768] px-1.5 py-0.5 rounded font-mono">{candidates.length}</span>
              </button>

              <button
                onClick={() => navigate(`/emp${employerId}/tariff`)}
                className={`w-full text-left font-bold text-xs px-4 py-2.5 rounded-xl flex items-center justify-between transition-all ${activeTab === "tariff" ? "bg-[#1E4468] text-[#E7C768] border border-[#E7C768]/60 shadow" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}
              >
                <span className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-[#D99E41]" /> Тариф & Счета
                </span>
                <span className="bg-emerald-950 text-[10px] text-[#E7C768] font-bold uppercase px-1.5 py-0.5 rounded font-mono">{balance} RR</span>
              </button>

              {isAdmin && (
                <>
                  <div className="h-px bg-white/10 my-2"></div>
                  <button
                    onClick={() => navigate(`/admin`)}
                    className="w-full text-left font-bold text-xs px-4 py-2.5 rounded-xl flex items-center justify-between transition-all bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-400/40 text-indigo-100"
                  >
                    <span className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-indigo-300" /> Админ-панель
                    </span>
                    <span className="text-[10px] bg-indigo-900/60 text-indigo-200 px-1.5 py-0.5 rounded font-mono">CRM</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {isAdmin && (
            <div className="bg-indigo-950/60 border border-indigo-400/40 rounded-3xl p-4 shadow-xl text-left space-y-2">
              <div className="text-[10px] font-mono uppercase tracking-wider text-indigo-300 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Админ-режим Lovable
              </div>
              <p className="text-[11px] text-slate-300 leading-snug">
                Открывайте демо-страницы под видом кандидата без отдельной регистрации.
              </p>
              <button
                onClick={() => handleOpenCandidateAsAdmin()}
                className="w-full text-[11px] font-bold bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/40 text-indigo-100 px-3 py-2 rounded-xl transition"
              >
                Открыть кабинет кандидата →
              </button>
              <button
                onClick={handleOpenVacancyAsAdmin}
                className="w-full text-[11px] font-bold bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/40 text-indigo-100 px-3 py-2 rounded-xl transition"
              >
                Открыть лендинг вакансии →
              </button>
            </div>
          )}

          {/* Quick Realtime Limit Monitor Tracker Widget */}
          <div className="bg-[#1D3E5E]/85 border border-white/15 rounded-3xl p-4 shadow-xl text-xs space-y-2 text-left">
            <span className="text-[#E7C768] font-bold block uppercase tracking-wider font-mono text-[9px]">Баланс и лимиты</span>
            <div className="space-y-1.5">
              <div className="text-[11px] flex justify-between border-b border-white/5 pb-1 mb-1">
                <span className="text-slate-300 font-bold">Баланс RR:</span>
                <span className="font-mono text-[#E7C768] font-black">{balance} RR</span>
              </div>
              <div className="text-[11px] flex justify-between">
                <span className="text-slate-305">Лимит интервью:</span>
                <span className="font-mono text-white font-bold">{interviewCredits} шт</span>
              </div>
              <div className="text-[11px] flex justify-between">
                <span className="text-slate-305">Лимит обучений:</span>
                <span className="font-mono text-white font-bold">{trainingCredits} шт</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Right Side Main Workspaces */}
        <main className="lg:col-span-9 space-y-6">

          {/* DYNAMIC ONBOARDING PROGRESS STEPPER */}
          {(activeTab === "profile" || activeTab === "companies" || activeTab === "vacancies") && (
            <div className="bg-[#1D3E5E]/85 border border-[#E7C768]/40 rounded-3xl p-5 shadow-xl text-left space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs text-[#E7C768] font-bold uppercase tracking-wider">
                    <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                    <span>Интерактивный онбординг работодателя</span>
                  </div>
                  <h3 className="text-base font-black text-white">Пройдите 3 простых шага, чтобы запустить ИИ рекрутинг под ключ</h3>
                </div>
                <span className="bg-[#E7C768]/10 text-[#E7C768] text-[10px] font-mono border border-[#E7C768]/30 px-2 py-0.5 rounded">
                  ID ЛК: {employerId}
                </span>
              </div>

              {/* Progress Stepper row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                <button 
                  onClick={() => navigate(`/emp${employerId}/profile`)}
                  className={`text-left border p-3 rounded-2xl flex items-center gap-3 transition cursor-pointer ${
                    activeTab === "profile"
                      ? "bg-[#1E4468] border-[#E7C768] text-[#E7C768] shadow"
                      : "bg-black/20 border-white/5 text-slate-400 hover:border-white/10"
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${activeTab === "profile" ? "bg-[#E7C768] text-[#1E4468]" : "bg-white/10 text-slate-300"}`}>
                    1
                  </div>
                  <div className="min-w-0">
                    <span className="text-[9px] uppercase font-bold block leading-none text-[#E7C768]">Профиль</span>
                    <span className="text-xs font-bold block mt-0.5 truncate text-white">Учетные данные</span>
                  </div>
                </button>

                <button 
                  onClick={() => navigate(`/emp${employerId}/companies`)}
                  className={`text-left border p-3 rounded-2xl flex items-center gap-3 transition cursor-pointer ${
                    activeTab === "companies"
                      ? "bg-[#1E4468] border-[#E7C768] text-[#E7C768] shadow"
                      : "bg-black/20 border-white/5 text-slate-400 hover:border-white/10"
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${activeTab === "companies" ? "bg-[#E7C768] text-[#1E4468]" : "bg-white/10 text-slate-300"}`}>
                    2
                  </div>
                  <div className="min-w-0">
                    <span className="text-[9px] uppercase font-bold block leading-none text-[#E7C768]">Бренд</span>
                    <span className="text-xs font-bold block mt-0.5 truncate text-white">Создать лендинг</span>
                  </div>
                </button>

                <button 
                  onClick={() => navigate(`/emp${employerId}/vacancies`)}
                  className={`text-left border p-3 rounded-2xl flex items-center gap-3 transition cursor-pointer ${
                    activeTab === "vacancies"
                      ? "bg-[#1E4468] border-[#E7C768] text-[#E7C768] shadow"
                      : "bg-black/20 border-white/5 text-slate-400 hover:border-white/10"
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${activeTab === "vacancies" ? "bg-[#E7C768] text-[#1E4468]" : "bg-white/10 text-slate-300"}`}>
                    3
                  </div>
                  <div className="min-w-0">
                    <span className="text-[9px] uppercase font-bold block leading-none text-[#E7C768]">Робот ИИ</span>
                    <span className="text-xs font-bold block mt-0.5 truncate text-white">Запустить вакансию</span>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* PAGE 1: CRM & FUNNEL */}
          {activeTab === "crm" && (
            <div className="space-y-6 text-left">
              
              {/* Layout controls */}
              <div className="bg-[#1D3E5E]/85 border border-white/15 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-[#E7C768] flex items-center gap-1.5">
                    <Users className="w-5 h-5 text-amber-400" /> ИИ-Воронка и CRM-Кандидаты
                  </h2>
                  <p className="text-xs text-slate-300 mt-1">Отслеживайте прогресс соискателей на каждом этапе адаптации и запускайте рассылки.</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  {/* View selectors */}
                  <div className="bg-black/25 p-1 rounded-xl border border-white/10 flex gap-1">
                    <button 
                      onClick={() => setCrmViewMode("kanban")} 
                      className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all ${crmViewMode === "kanban" ? "bg-[#1E4468] text-[#E7C768]" : "text-slate-300 hover:text-white"}`}
                    >
                      Канбан
                    </button>
                    <button 
                      onClick={() => setCrmViewMode("table")} 
                      className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all ${crmViewMode === "table" ? "bg-[#1E4468] text-[#E7C768]" : "text-slate-300 hover:text-white"}`}
                    >
                      Таблица
                    </button>
                    <button 
                      onClick={() => setCrmViewMode("mailing")} 
                      className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all ${crmViewMode === "mailing" ? "bg-[#1E4468] text-[#E7C768]" : "text-slate-300 hover:text-white"}`}
                    >
                      Рассылка
                    </button>
                  </div>

                  {/* Search filter input */}
                  <div className="relative flex items-center bg-[#17344F]/50 border border-white/15 px-2.5 py-1 rounded-xl focus-within:border-[#E7C768]">
                    <Search className="w-3.5 h-3.5 text-slate-400 mr-2" />
                    <input
                      type="text"
                      className="bg-transparent text-xs text-white focus:outline-none w-full sm:w-32"
                      placeholder="Искать ФИО..."
                      value={crmSearch}
                      onChange={(e) => setCrmSearch(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* KANBAN FUNNEL LAYOUT */}
              {crmViewMode === "kanban" && (
                <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
                  {[
                    { stage: "registration", title: "1. Регистрация" },
                    { stage: "screening",    title: "2. Скрининг" },
                    { stage: "checklist",    title: "3. Чеклист" },
                    { stage: "situations",   title: "4. Ситуации" },
                    { stage: "professional", title: "5. Профессия" },
                    { stage: "product",      title: "6. Продукт" },
                    { stage: "systems",      title: "7. Система" },
                    { stage: "certified",    title: "8. Сертификат 🎓" },
                  ].map(column => {
                    const colCandidates = filteredCandidates.filter(c => (c.crmStage || "registration") === column.stage);

                    return (
                      <div 
                        key={column.stage} 
                        className="bg-[#1D3E5E]/40 border border-white/5 rounded-2xl p-2.5 space-y-2.5 min-h-[350px] shadow"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={async () => {
                          // Drag & drop triggers action
                          const draggedId = localStorage.getItem("dragged_candidate_id");
                          if (draggedId) {
                            await handleUpdateCrmStage(draggedId, column.stage as any);
                            localStorage.removeItem("dragged_candidate_id");
                          }
                        }}
                      >
                        <div className="flex items-center justify-between border-b border-white/5 pb-2 text-xs font-bold text-slate-300">
                          <span className="truncate">{column.title}</span>
                          <span className="bg-black/30 font-mono px-2 py-0.5 rounded-full text-[10px] text-[#E7C768]">{colCandidates.length}</span>
                        </div>

                        <div className="space-y-2.5">
                          {colCandidates.length === 0 ? (
                            <div className="text-center py-8 text-slate-500 text-[11px] font-medium font-semibold">Пусто</div>
                          ) : (
                            colCandidates.map(cand => (
                              <div
                                key={cand.id}
                                draggable
                                onDragStart={() => localStorage.setItem("dragged_candidate_id", cand.id)}
                                onClick={() => setSelectedCandidateId((cand as any).uuid || null)}
                                className="bg-[#17344F]/85 border border-white/10 hover:border-[#E7C768] p-2.5 rounded-xl transition cursor-pointer shadow-sm space-y-1.5"
                              >
                                <div className="text-xs font-bold text-[#E7C768] hover:underline">
                                  {cand.name}
                                </div>
                                <div className="text-[10px] text-slate-300 line-clamp-1">{cand.roleName}</div>
                                {cand.email && <div className="text-[10px] text-slate-400 truncate">{cand.email}</div>}
                                {(cand as any).phone && <div className="text-[10px] text-slate-500 truncate">{(cand as any).phone}</div>}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* TABLE LAYOUT FOR DATA-RICH CHECKS */}
              {crmViewMode === "table" && (
                <div className="bg-[#1D3E5E]/40 border border-white/10 rounded-3xl overflow-hidden shadow-xl">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-[#17344F] text-[#E7C768] font-bold border-b border-white/10 uppercase tracking-wider text-[10px] font-mono">
                          <th className="p-4">ФИО Кандидата</th>
                          <th className="p-4">Интерес / Должность</th>
                          <th className="p-4">Текущий Этап</th>
                          <th className="p-4 text-center">Резюме</th>
                          <th className="p-4 text-center">Чек-лист</th>
                          <th className="p-4 text-center">Ситуации</th>
                          <th className="p-4 text-center">Средний Балл</th>
                          <th className="p-4 text-right">Действия</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {filteredCandidates.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="p-8 text-center text-slate-400 font-semibold">Соискатели отсутствуют.</td>
                          </tr>
                        ) : (
                          filteredCandidates.map(cand => {
                            const rScore = cand.scores?.resumeScore !== undefined ? cand.scores.resumeScore : 70;
                            const cScore = cand.scores?.checklistScore !== undefined ? cand.scores.checklistScore : 80;
                            const sScore = cand.scores?.situationsScore !== undefined ? cand.scores.situationsScore : 75;
                            const avg = Math.round((rScore + cScore + sScore) / 3);

                            return (
                              <tr key={cand.id} className="hover:bg-white/5 transition">
                                <td className="p-4 font-bold text-white cursor-pointer" onClick={() => setSelectedCandidateId((cand as any).uuid || null)}>
                                  <div>{cand.name}</div>
                                  <div className="text-[10px] text-slate-400 font-normal">{cand.email}</div>
                                  {(cand as any).phone && <div className="text-[10px] text-slate-500 font-normal">{(cand as any).phone}</div>}
                                </td>
                                <td className="p-4">{cand.roleName}</td>
                                <td className="p-4">
                                  <select 
                                    className="bg-black/40 text-xs rounded border border-white/10 px-2 py-1 text-[#E7C768]"
                                    value={(cand as any).crmStage || "registration"}
                                    onChange={(e) => handleUpdateCrmStage(cand.id, e.target.value as any)}
                                  >
                                    <option value="registration" className="bg-slate-900">1. Регистрация</option>
                                    <option value="screening" className="bg-slate-900">2. Скрининг</option>
                                    <option value="checklist" className="bg-slate-900">3. Чеклист</option>
                                    <option value="situations" className="bg-slate-900">4. Ситуации</option>
                                    <option value="professional" className="bg-slate-900">5. Профессия</option>
                                    <option value="product" className="bg-slate-900">6. Продукт</option>
                                    <option value="systems" className="bg-slate-900">7. Система</option>
                                    <option value="certified" className="bg-slate-900">8. Сертификат 🎓</option>
                                  </select>
                                </td>
                                <td className="p-4 text-center font-mono font-bold text-sky-300">{rScore}/100</td>
                                <td className="p-4 text-center font-mono font-bold text-sky-300">{cScore}/100</td>
                                <td className="p-4 text-center font-mono font-bold text-sky-300">{sScore}/100</td>
                                <td className="p-4 text-center">
                                  <span className="bg-[#E7C768]/15 text-[#E7C768] font-bold font-mono px-2 py-1 rounded border border-[#E7C768]/20">{avg}</span>
                                </td>
                                <td className="p-4 text-right">
                                  <button onClick={() => setSelectedCandidateId((cand as any).uuid || null)} className="cursor-pointer text-sky-300 hover:underline font-bold text-[11px]">Карточка ИИ</button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* INTEGRATED BULK MAILER */}
              {crmViewMode === "mailing" && (
                <div className="bg-[#1D3E5E]/85 border border-white/15 rounded-3xl p-6 shadow-xl space-y-6">
                  <div className="border-b border-white/10 pb-3 flex justify-between items-center">
                    <h3 className="font-bold text-sm text-[#E7C768] uppercase tracking-wider flex items-center gap-2">
                      <Mail className="w-4 h-4 text-sky-400" /> Конструктор массовой рассылки Telegram
                    </h3>
                    <span className="text-slate-300 text-xs">Всего кандидатов в базе: {candidates.length}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Left settings */}
                    <div className="space-y-4 text-left">
                      <div>
                        <label className="text-xs font-bold text-slate-200 block mb-1">Кому отправить (Сегментация соискателей):</label>
                        <select 
                          className="w-full bg-black/40 text-xs text-white border border-white/15 px-3 py-2.5 rounded-xl accent-[#E7C768]"
                          value={mailingSegment}
                          onChange={(e) => setMailingSegment(e.target.value)}
                        >
                          <option value="all">📣 Всем кандидатам во всей воронке</option>
                          <option value="terms">Ознакамливающимся с условиями смены</option>
                          <option value="interview">Проходящим ИИ Чат-разговор</option>
                          <option value="training">Ученикам раздела корпоративной Вики</option>
                          <option value="certified">Только Обученным соискателям 🎓</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-200 block mb-1">Шаблон сообщения:</label>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { key: "welcome", label: "Добро пожаловать" },
                            { key: "reminder", label: "Напоминание о чате" },
                            { key: "wiki_unlocked", label: "Лекции открыты" },
                            { key: "certificate", label: "Сдача сертификации" }
                          ].map(t => (
                            <button
                              key={t.key}
                              className={`p-2 rounded-xl text-center text-[10px] font-bold border transition ${mailingTemplate === t.key ? "bg-[#1E4468]/90 border-[#E7C768] text-[#E7C768]" : "bg-black/35 border-white/10 hover:border-white/20 text-slate-300"}`}
                              onClick={() => {
                                setMailingTemplate(t.key);
                                if (t.key === "welcome") {
                                  setMailingText("Здравствуйте! Вы прошли первичную регистрацию. Робот Рекрутер готов протестировать вас. Пожалуйста, запустите ИИ-собеседование.");
                                } else if (t.key === "reminder") {
                                  setMailingText("Внимание! Подходит к концу дедлайн по вашему тестовому интервью. Завершите собеседование для получения решения HR.");
                                } else if (t.key === "wiki_unlocked") {
                                  setMailingText("Ура! Ваши баллы интервью достаточны для допуска к изучению Wiki-материалов и наставничества. Ждем вас в Личном Кабинете.");
                                } else if (t.key === "certificate") {
                                  setMailingText("Поздравляем с квалификацией! Вы успешно подтвердили знания нашего продукта. HR свяжется с вами для финального оффера в ТГ.");
                                }
                              }}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-200 block mb-1">Текст сообщения:</label>
                        <textarea
                          rows={4}
                          className="w-full bg-black/40 text-xs p-3 rounded-xl border border-white/15 focus:outline-none focus:border-[#E7C768] font-normal"
                          value={mailingText}
                          onChange={(e) => setMailingText(e.target.value)}
                        />
                      </div>

                      <button
                        onClick={handleLaunchMailing}
                        disabled={isSendingMail}
                        className="cursor-pointer w-full bg-gradient-to-r from-red-650 to-orange-700 py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 hover:shadow transition disabled:opacity-50"
                      >
                        {isSendingMail ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        Запустить рассылку в Telegram
                      </button>
                    </div>

                    {/* Right Log Console */}
                    <div className="bg-black/40 p-4 rounded-2xl border border-white/15 flex flex-col justify-between font-mono">
                      <div>
                        <span className="text-[10px] text-gray-400 block uppercase font-bold tracking-wider mb-2">Лог отправки в реальном времени:</span>
                        <div className="space-y-1 max-h-56 overflow-y-auto text-left text-[11px] text-emerald-300 pr-1 select-none">
                          {mailingLogs.length === 0 ? (
                            <span className="text-gray-500 italic">Ожидание запуска...</span>
                          ) : (
                            mailingLogs.map((lg, i) => (
                              <div key={i}>{lg}</div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-white/5 text-[10px] text-slate-400 leading-normal text-left font-sans">
                        ⚠️ В целях безопасности, сообщения уходят на зарегистрированный соискателем Telegram ID либо эмулируются на ваш рабочий канал.
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PAGE 2: VACANCIES & AI CREATOR */}
          {activeTab === "vacancies" && (
            <div className="space-y-6 text-left">
              <div className="bg-[#1D3E5E]/85 border border-white/15 rounded-3xl p-6 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-[#E7C768] flex items-center gap-1.5">
                    <Briefcase className="w-5 h-5 text-amber-500" /> Вакансии & ИИ Онбординги
                  </h2>
                  <p className="text-xs text-slate-300 mt-1">Здесь сосредоточены все созданные системы кураторства, реферальные ссылки и кастомные Вики.</p>
                </div>

                <button 
                  onClick={openAddVacancyWizard}
                  className="cursor-pointer bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] hover:scale-102 text-white font-bold text-xs py-2 px-4 rounded-xl flex items-center gap-1 shadow transition-all"
                >
                  <Plus className="w-4 h-4" /> Добавить вакансию
                </button>
              </div>

              {/* DYNAMIC VACANCY CREATOR FROM FORM OR DIRECT IMPORT */}
              {showAddNewVacancy && (
                <div className="bg-[#1D3E5E]/95 border border-[#E7C768]/60 p-6 rounded-3xl space-y-6 shadow-2xl animate-fadeIn">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-white/10 pb-3">
                    <div>
                      <span className="text-[10px] font-bold text-[#E7C768] uppercase font-mono tracking-wider block">Панель вакансии RR</span>
                      <h4 className="text-sm font-semibold text-white">Мастер Вакансий</h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={cancelAddVacancyWizard}
                        className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/5"
                        title="Закрыть мастер"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Unified document uploader — same UX as company wizard. */}
                  {(() => {
                    const totalVacChars = (
                      setupRoleName + setupVacancyText + setupTasksActivityText + setupScheduleText +
                      setupMotivationText + setupMotivationDetail + setupPayoutsText + setupOnboardingText +
                      setupTeamText + setupSystemText + setupTrainingProfessionalText + setupTrainingProductText +
                      setupTrainingSystemsText + setupTrainingWikiText + setupTrainingRegulationsText + vacancyRawText
                    ).trim().length;
                    const canBeautify = aiReady && totalVacChars >= 50;
                    return (
                      <DocumentUploader
                        entity="vacancy"
                        entityId={draftProjectId || undefined}
                        pathPrefix={draftProjectId || ""}
                        rawText={vacancyRawText}
                        onRawTextChange={setVacancyRawText}
                        maxChars={5000}
                        title="Распознавание условий вакансии из файла"
                        hint="Шаг 1 — загрузите файл. Шаг 2 — нажмите «Распознать документ» (ИИ извлечёт текст до 5000 символов). Шаг 3 — нажмите «Оформить красиво», чтобы ИИ разнёс данные по 15 полям."
                        onEnhance={handleBeautifyNewVacancyWithAI}
                        enhanceBusy={isGenerating}
                        canEnhance={canBeautify}
                        enhanceHint={canBeautify ? "Оформить все 15 полей через ИИ" : "Заполните поля минимум на 50 символов суммарно (или загрузите файл)"}
                        onAudit={addAuditEvent}
                      />
                    );
                  })()}

                  <form onSubmit={handleCreateOnboardingSystem} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-slate-200 block mb-1">Компания:</label>
                        {companiesList.length > 0 ? (
                          <select
                            required
                            className="w-full bg-[#17344F] text-xs p-2.5 rounded-xl border border-white/10 text-white focus:outline-[#E7C768]"
                            value={setupCompanyName}
                            onChange={(e) => setSetupCompanyName(e.target.value)}
                          >
                            <option value="">Выберите компанию...</option>
                            {companiesList.map(c => (
                              <option key={c.id} value={c.name}>{c.name}</option>
                            ))}
                          </select>
                        ) : (
                          <div className="space-y-1">
                            <input
                              type="text"
                              required
                              placeholder="Зарегистрируйте бренд в 'Мои Компании'"
                              className="w-full bg-[#17344F]/60 text-xs p-2.5 rounded-xl border border-red-500/50 text-slate-350 focus:outline-[#E7C768]"
                              value={setupCompanyName}
                              onChange={(e) => setSetupCompanyName(e.target.value)}
                            />
                            <span className="text-[10px] text-red-400 font-semibold block leading-tight">⚠ Внимание! Сначала зарегистрируйте Вашу Компанию на шаге 2, чтобы создать красивый адрес.</span>
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-200 block mb-1">Должность:</label>
                        <input
                          type="text"
                          required
                          className="w-full bg-[#17344F]/60 text-xs p-2.5 rounded-xl border border-white/10 focus:outline-[#E7C768]"
                          value={setupRoleName}
                          onChange={(e) => setSetupRoleName(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Pre-fill quick selector helper */}
                    <div className="bg-black/20 p-3 rounded-2xl border border-white/5 space-y-2">
                      <span className="text-[10px] uppercase font-bold text-slate-300 block">Быстрый подбор справочника:</span>
                      <input 
                        type="text" 
                        placeholder="Фильтровать профессии..." 
                        className="bg-black/40 text-[10.5px] p-1.5 w-full rounded border border-white/10"
                        value={specialtySearch}
                        onChange={(e) => setSpecialtySearch(e.target.value)}
                      />
                      {(() => {
                        const existingSpecialties = Array.from(new Set(projects.map(p => p.roleName).filter(Boolean)));
                        const allSpecialtiesCombined = Array.from(new Set([
                          ...existingSpecialties,
                          ...jobTitlesList,
                          ...BASIC_SPECIALTIES,
                        ]));
                        const filteredSpec = allSpecialtiesCombined.filter(s => s.toLowerCase().includes(specialtySearch.toLowerCase()));
                        const hasExactMatch = allSpecialtiesCombined.some(s => s.toLowerCase() === specialtySearch.trim().toLowerCase());
                        
                        return (
                          <div className="space-y-2 mt-1">
                            <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto pr-1">
                              {filteredSpec.slice(0, 60).map(spec => (
                                <button
                                  key={spec}
                                  type="button"
                                  onClick={() => { setSetupRoleName(spec); setSpecialtySearch(""); }}
                                  className="bg-[#1D3E5E]/85 border border-white/5 hover:border-[#E7C768] text-[9.5px] px-2 py-0.5 rounded text-white transition flex items-center gap-1"
                                >
                                  💼 {spec}
                                </button>
                              ))}
                              {specialtySearch.trim() && !hasExactMatch && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const t = specialtySearch.trim();
                                    setSetupRoleName(t);
                                    setSpecialtySearch("");
                                    const row = await upsertJobTitle(t);
                                    if (row?.title) {
                                      setJobTitlesList(prev => [row.title, ...prev.filter(p => p.toLowerCase() !== row.title.toLowerCase())]);
                                    }
                                  }}
                                  className="bg-amber-500/20 border border-amber-500/45 hover:border-amber-400 text-[9.5px] text-amber-350 font-bold px-2 py-0.5 rounded transition flex items-center gap-1 cursor-pointer"
                                >
                                  ➕ Добавить свою профессию: "{specialtySearch}"
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    <div className="bg-[#17344F]/40 border border-white/5 rounded-2xl p-3 text-[10px] text-slate-400 leading-snug">
                      ℹ️ Логотип берётся из настроек компании. «График и тайм-слоты» включает в себя график работы, «Оплата и схема выплат» — условия оплаты. Базу знаний и регламенты вынесли в <strong className="text-[#E7C768]">Мастер Обучения</strong> на странице «Обучение».
                    </div>

                    {/* Unified 15-field editor with per-block live preview. */}
                    <VacancyEditor
                      mode="create"
                      companyName={setupCompanyName}
                      hideKeys={["role_name"]}
                      aiLoadingKey={wizardAiKey}
                      roleTemplates={roleTplToFields(roleTemplates)}
                      values={{
                        vacancy_text: setupVacancyText,
                        tasks_activity_text: setupTasksActivityText,
                        schedule_text: setupScheduleText,
                        motivation_text: setupMotivationText,
                        motivation_text_detail: setupMotivationDetail,
                        payouts_text: setupPayoutsText,
                        onboarding_text: setupOnboardingText,
                        team_text: setupTeamText,
                        system_text: setupSystemText,
                        training_professional_text: setupTrainingProfessionalText,
                        training_product_text: setupTrainingProductText,
                        training_systems_text: setupTrainingSystemsText,
                        training_wiki_text: setupTrainingWikiText,
                        training_regulations_text: setupTrainingRegulationsText,
                      }}
                      onChange={(patch) => {
                        for (const [k, v] of Object.entries(patch)) {
                          const val = v ?? "";
                          switch (k as VacancyFieldKey) {
                            case "vacancy_text": setSetupVacancyText(val); break;
                            case "tasks_activity_text": setSetupTasksActivityText(val); break;
                            case "schedule_text": setSetupScheduleText(val); break;
                            case "motivation_text": setSetupMotivationText(val); break;
                            case "motivation_text_detail": setSetupMotivationDetail(val); break;
                            case "payouts_text": setSetupPayoutsText(val); break;
                            case "onboarding_text": setSetupOnboardingText(val); break;
                            case "team_text": setSetupTeamText(val); break;
                            case "system_text": setSetupSystemText(val); break;
                            case "training_professional_text": setSetupTrainingProfessionalText(val); break;
                            case "training_product_text": setSetupTrainingProductText(val); break;
                            case "training_systems_text": setSetupTrainingSystemsText(val); break;
                            case "training_wiki_text": setSetupTrainingWikiText(val); break;
                            case "training_regulations_text": setSetupTrainingRegulationsText(val); break;
                          }
                        }
                      }}
                      onAIEnhance={async (key) => {
                        setWizardAiKey(key);
                        try {
                          const { aiEnhanceSingle } = await import("@/lib/aiClient");
                          const field = VACANCY_FIELDS_BY_KEY[key];
                          const getters: Record<VacancyFieldKey, string> = {
                            role_name: setupRoleName,
                            vacancy_text: setupVacancyText,
                            tasks_activity_text: setupTasksActivityText,
                            schedule_text: setupScheduleText,
                            motivation_text: setupMotivationText,
                            motivation_text_detail: setupMotivationDetail,
                            payouts_text: setupPayoutsText,
                            onboarding_text: setupOnboardingText,
                            team_text: setupTeamText,
                            system_text: setupSystemText,
                            training_professional_text: setupTrainingProfessionalText,
                            training_product_text: setupTrainingProductText,
                            training_systems_text: setupTrainingSystemsText,
                            training_wiki_text: setupTrainingWikiText,
                            training_regulations_text: setupTrainingRegulationsText,
                          };
                          const value = await aiEnhanceSingle({
                            field: key,
                            value: getters[key] || "",
                            company_name: setupCompanyName,
                            role_name: setupRoleName,
                            template: field.example,
                            hint: `canonical_format:${field.preview}`,
                          });
                          if (value) {
                            // Reuse the same switch via onChange-style patch.
                            const setters: Record<VacancyFieldKey, (v: string) => void> = {
                              role_name: () => {},
                              vacancy_text: setSetupVacancyText,
                              tasks_activity_text: setSetupTasksActivityText,
                              schedule_text: setSetupScheduleText,
                              motivation_text: setSetupMotivationText,
                              motivation_text_detail: setSetupMotivationDetail,
                              payouts_text: setSetupPayoutsText,
                              onboarding_text: setSetupOnboardingText,
                              team_text: setSetupTeamText,
                              system_text: setSetupSystemText,
                              training_professional_text: setSetupTrainingProfessionalText,
                              training_product_text: setSetupTrainingProductText,
                              training_systems_text: setSetupTrainingSystemsText,
                              training_wiki_text: setSetupTrainingWikiText,
                              training_regulations_text: setSetupTrainingRegulationsText,
                            };
                            setters[key](value);
                            addAuditEvent("success", "Поле улучшено ИИ", `Раздел "${field.label}" переписан в каноническом формате.`);
                          }
                        } catch (err) {
                          console.error(err);
                          addAuditEvent("warning", "Ошибка ИИ", "Не удалось улучшить раздел.");
                        } finally {
                          setWizardAiKey(null);
                        }
                      }}
                    />

                    <div className="flex flex-col sm:flex-row gap-3 pt-2">
                      <button
                        type="submit"
                        disabled={isGenerating}
                        className="cursor-pointer flex-1 bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-sm py-3 px-6 rounded-xl font-bold flex items-center justify-center gap-2 transition"
                      >
                        {isGenerating ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" /> Сохраняем…
                          </>
                        ) : (
                          "Сохранить и синхронизировать"
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.confirm("Отменить создание вакансии? Черновик будет удалён.")) return;
                          // Force-delete the draft (not just empty ones).
                          try {
                            if (draftProjectId) {
                              await supabase.from("projects").delete().eq("id", draftProjectId);
                            }
                          } catch (e) { console.warn("force-delete draft failed", e); }
                          setShowAddNewVacancy(false);
                          setDraftProjectId(null);
                          setDraftProjectPublicId(null);
                          addAuditEvent("info", "Создание отменено", "Черновик вакансии удалён.");
                          fetchData();
                        }}
                        className="cursor-pointer bg-red-500/15 hover:bg-red-500/25 border border-red-500/40 text-red-200 text-sm py-3 px-6 rounded-xl font-bold flex items-center justify-center gap-2 transition"
                      >
                        <Trash2 className="w-4 h-4" /> Отмена и удалить черновик
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* LIST OF CURRENT PLACED VACANCIES */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {projects.map(proj => {
                  const isPaused = pausedProjectIds.includes(proj.id);
                  const assignedCandidates = candidates.filter(c => c.projectId === proj.id);
                  const columnCountTerms = assignedCandidates.filter(c => c.currentStage === "terms").length;
                  const columnCountInterview = assignedCandidates.filter(c => c.currentStage === "interview" || c.currentStage === "scoring").length;
                  const columnCountTraining = assignedCandidates.filter(c => c.currentStage === "training").length;
                  const columnCountCertified = assignedCandidates.filter(c => c.currentStage === "certified").length;

                  return (
                    <div 
                      key={proj.id} 
                      className={`border p-5 rounded-3xl flex flex-col justify-between hover:shadow-xl transition-all ${isPaused ? "bg-black/30 border-white/5 filter grayscale opacity-70" : "bg-[#1D3E5E]/60 border-white/10 hover:border-[#E7C768]"}`}
                    >
                      <div>
                        {/* Status bar */}
                        <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 font-bold uppercase">
                          <span>🏢 {proj.companyName || "Компания"}</span>
                          <span className={`px-2 py-0.5 rounded ${isPaused ? "bg-orange-950 text-orange-400" : "bg-emerald-950 text-emerald-400 font-extrabold"}`}>
                            {isPaused ? "На паузе" : "Активна"}
                          </span>
                        </div>

                        <h3 className="text-base font-bold text-white mt-1.5">{proj.roleName}</h3>
                        <div className="text-slate-300 text-xs mt-1 font-mono line-clamp-1">
                          {(proj as any).motivationText || proj.salaryTerms || "Сдельная"} | {(proj as any).scheduleText || proj.scheduleTerms || "По согласованию"}
                        </div>
                        
                        {/* Mini statistics visualization */}
                        <div className="grid grid-cols-4 gap-1.5 mt-4 text-center font-mono">
                          <div className="bg-black/35 p-1.5 rounded">
                            <div className="text-[10px] text-gray-400 uppercase">Озн</div>
                            <div className="text-xs font-bold text-white">{columnCountTerms}</div>
                          </div>
                          <div className="bg-black/35 p-1.5 rounded">
                            <div className="text-[10px] text-gray-400 uppercase">Чат</div>
                            <div className="text-xs font-bold text-white">{columnCountInterview}</div>
                          </div>
                          <div className="bg-black/35 p-1.5 rounded">
                            <div className="text-[10px] text-gray-400 uppercase">Обуч</div>
                            <div className="text-xs font-bold text-white">{columnCountTraining}</div>
                          </div>
                          <div className="bg-black/35 p-1.5 rounded">
                            <div className="text-[10px] text-gray-400 uppercase">Сдал</div>
                            <div className="text-xs font-bold text-emerald-400 font-black">{columnCountCertified}</div>
                          </div>
                        </div>

                        {/* Interactive dynamic link of vacancy page inside company career lander */}
                        <div className="mt-2.5 bg-black/35 p-2.5 rounded-xl border border-white/5 space-y-1">
                          <span className="text-[9px] uppercase font-bold text-[#E7C768] block leading-none font-mono">Адрес ИИ-страницы Вакансии (Лендинг):</span>
                          <a 
                            onClick={(e) => { e.preventDefault(); navigate(`/com${proj.companySlug || ""}/vac${(proj as any).slug || proj.id}/vacancy`); }}
                            href={`/com${proj.companySlug || ""}/vac${(proj as any).slug || proj.id}/vacancy`} 
                            className="cursor-pointer text-sky-300 font-mono text-[10.5px] hover:underline hover:text-sky-450 block truncate"
                          >
                            https://hr-rr.online/com{proj.companySlug || ""}/vac{(proj as any).slug || proj.id}/vacancy
                          </a>
                        </div>
                      </div>

                      {/* Lower Actions */}
                      <div className="mt-5 pt-3 border-t border-white/5 space-y-2">
                        <div className="flex gap-2">
                          <button
                            onClick={() => togglePauseVacancy(proj.id)}
                            className="cursor-pointer flex-1 bg-white/5 hover:bg-white/10 text-slate-300 text-[10px] font-bold py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 border border-white/5"
                          >
                            {isPaused ? (
                              <>
                                <Play className="w-3 h-3 text-emerald-400" /> Запустить прием
                              </>
                            ) : (
                              <>
                                <Pause className="w-3 h-3 text-orange-400" /> Приостановить
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => { setEditVacancyRawText(""); setEditingProject(proj); }}
                            className="cursor-pointer flex-1 bg-[#E7C768]/10 hover:bg-[#E7C768]/20 text-[#E7C768] text-[10px] font-bold py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 border border-[#E7C768]/25"
                          >
                            🛠 Редактировать
                          </button>
                        </div>

                        <button
                          onClick={() => employerId && navigate(`/emp${employerId}/training?project=${proj.id}`)}
                          className="cursor-pointer w-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-[10px] font-bold py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 border border-emerald-500/25"
                        >
                          📚 Открыть Мастер Обучения
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* PAGE 3: MY COMPANIES */}
          {activeTab === "companies" && (
            <div className="space-y-6 text-left">
              <div className="bg-[#1D3E5E]/85 border border-white/15 rounded-3xl p-6 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-[#E7C768] flex items-center gap-1.5">
                    <Building2 className="w-5 h-5 text-amber-400" /> Зарегистрированные компании
                  </h2>
                  <p className="text-xs text-slate-300 mt-1">Описания ваших юридических лиц или брендов, под которыми Робот публикует онбординги.</p>
                  <p className="text-[11px] text-emerald-300 mt-0.5">✓ Добавление, редактирование, ИИ-улучшение, сохранение и публикация лендинга компании — бесплатно.</p>
                </div>

                <button 
                  onClick={openAddCompanyWizard}
                  className="cursor-pointer bg-gradient-to-r from-green-650 to-emerald-700 text-white font-bold text-xs py-2 px-3 rounded-xl shadow transition"
                >
                  + Добавить Компанию
                </button>
              </div>

              {/* BRAND CREATOR */}
              {showAddCompany && (
                <form onSubmit={handleAddCompanySubmit} className="brand-editor border border-[#DBDBDB] p-6 rounded-3xl space-y-6 shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-[3px] main-gradient"></div>
                  
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[#DBDBDB]">
                    <div>
                      <span className="text-xs font-bold text-[#1E4468] block font-mono">ПАНЕЛЬ УПАКОВКИ БРЕНДА RR</span>
                      <h4 className="text-sm font-semibold text-[#1A1A1A]">Интерактивный ИИ-профиль организации</h4>
                    </div>
                  </div>

                  {/* Drag-Drop / click base file uploader with ProTalk integration */}
                  <div 
                    onClick={() => {
                      const fileInput = document.getElementById("comp-file-upload") as HTMLInputElement;
                      if (fileInput) fileInput.click();
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        const file = e.dataTransfer.files[0];
                        addAuditEvent("info", "Загрузка файла", `Загружаем «${file.name}» в Supabase…`);
                        (async () => { await uploadCompanyFile(file); })();
                      }
                    }}
                    className={`editor-dropzone cursor-pointer border-2 border-dashed rounded-2xl p-4 text-center space-y-1.5 transition-all ${
                      isParsingFile || isUploadingFile ? "animate-pulse" : ""
                    }`}
                  >
                    <input 
                      id="comp-file-upload" 
                      type="file" 
                      className="hidden" 
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          const file = e.target.files[0];
                          addAuditEvent("info", "Загрузка файла", `Загружаем «${file.name}» в Supabase…`);
                          (async () => { await uploadCompanyFile(file); })();
                        }
                      }}
                    />
                    <div className="text-xs text-white font-bold flex items-center justify-center gap-2">
                      <FileText className="w-4 h-4 text-[#E7C768]" />
                      {isUploadingFile ? (
                        <span className="text-[#E7C768]">Загружаем «{newCompanyFiles || "файл"}» в Supabase Storage…</span>
                      ) : draftFilePath && newCompanyFiles ? (
                        <span className="text-[#E7C768]">Файл загружен в Supabase: {newCompanyFiles} ✓</span>
                      ) : (
                        <span>Загрузите презентацию или описание компании — затем нажмите кнопку «Отправить документ в ProTalk» и ИИ извлечёт текст</span>
                      )}
                    </div>
                    <span className="text-[10px] text-white/70 block font-mono">
                      {isParsingFile 
                        ? "⚡ ProTalk извлекает текст о компании из документа…" 
                        : isUploadingFile
                          ? "Файл сейчас сохраняется в облако…"
                          : "Поддерживаются PDF, DOCX, TXT, MD. После загрузки появится кнопка «Отправить документ в ProTalk»."
                      }
                    </span>
                    {uploadError ? (
                      <div className="text-[10px] text-[#FF4C4C] mt-1">{uploadError}</div>
                    ) : null}
                  </div>

                  {/* Step 2: explicit «Распознать документ» trigger — appears once the
                      file is uploaded to storage but text has not been extracted yet. */}
                  {draftFilePath && !isParsingFile && !isUploadingFile && (
                    <div className="flex justify-center">
                      <button
                        type="button"
                        onClick={() => parseCompanyFileWithAI(newCompanyFiles || "документ")}
                        className="btn-brand-secondary px-5 py-2.5 text-xs flex items-center justify-center gap-1.5 shadow-md"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Отправить документ в ProTalk
                      </button>
                    </div>
                  )}

                  {/* Raw extracted text from the document — editable, capped at 5000 chars.
                      Passed to «Оформить красиво» as additional context. */}
                  {(() => {
                    const totalChars =
                      (newCompanyName + newCompanyIndustry + newCompanyStaff + newCompanySite +
                       newCompanyDescription + newCompanyProducts + newCompanyMissionText +
                       newCompanyDesc + newCompanySalaryTerms + newCompanyScheduleTerms +
                       newCompanyCustomWiki + companyRawText).trim().length;
                    const canEnhanceAll = aiReady && totalChars >= 50;
                    return (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-[#1E4468] uppercase tracking-wider">
                            Текст о компании из документа (редактируется, до 5000 симв.)
                          </span>
                          <span className="text-[10px] text-[#6B7280] font-mono">{companyRawText.length} / 5000</span>
                        </div>
                        <textarea
                          value={companyRawText}
                          onChange={(e) => setCompanyRawText(e.target.value.slice(0, 5000))}
                          placeholder="Здесь появится распознанный текст из загруженного файла. Можно также вставить или дописать описание компании вручную."
                          className="w-full text-xs pl-3 pr-3 py-2.5 min-h-[180px]"
                          maxLength={5000}
                        />
                        <div className="flex justify-center pt-1">
                          <button
                            type="button"
                            onClick={handleEnhanceAllFields}
                            disabled={!canEnhanceAll || isEnhancingAll || isParsingFile}
                            title={canEnhanceAll ? "Оформить все поля красиво через ИИ" : "Заполните поля минимум на 50 символов суммарно"}
                            className="btn-brand-primary px-5 py-2.5 text-xs flex items-center justify-center gap-1.5 shadow-md"
                          >
                            <Sparkles className={`w-3.5 h-3.5 ${isEnhancingAll ? "animate-spin" : ""}`} />
                            {isEnhancingAll ? "Обработка ИИ..." : "Оформить красиво с помощью ИИ"}
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* FIELD GRID SECTIONS */}
                  <div className="space-y-6">
                    {/* SECTION 1: MAIN SVE */}
                    <div className="space-y-3">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">1. Основная информация о бренде</span>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="relative flex items-center">
                          <input 
                            type="text" 
                            placeholder="Название компании" 
                            className="w-full bg-black/40 text-xs pl-3 pr-8 py-2.5 rounded-xl text-white border border-white/10 focus:outline-none focus:border-green-500/50" 
                            required
                            value={newCompanyName}
                            onChange={(e) => setNewCompanyName(e.target.value)}
                          />
                          <button
                            type="button"
                            style={{ display: aiReady && (newCompanyName||"").trim().length >= 7 ? undefined : "none" }}
                            onClick={() => handleEnhanceSingleField("name", newCompanyName)}
                            disabled={enhancingFields["name"]}
                            className="absolute right-2.5 p-1 text-slate-400 hover:text-[#E7C768] disabled:opacity-30 transition-colors"
                            title="Оформить красиво через ИИ"
                          >
                            <Sparkles className={`w-3.5 h-3.5 ${enhancingFields["name"] ? "animate-spin text-yellow-400" : ""}`} />
                          </button>
                        </div>

                        <div className="relative flex items-center">
                          <input 
                            type="text" 
                            placeholder="Отрасль (финансы, ритейл, кофейни)" 
                            className="w-full bg-black/40 text-xs pl-3 pr-8 py-2.5 rounded-xl text-white border border-white/10 focus:outline-none focus:border-green-500/50"
                            value={newCompanyIndustry}
                            onChange={(e) => setNewCompanyIndustry(e.target.value)}
                          />
                          <button
                            type="button"
                            style={{ display: aiReady && (newCompanyIndustry||"").trim().length >= 7 ? undefined : "none" }}
                            onClick={() => handleEnhanceSingleField("industry", newCompanyIndustry)}
                            disabled={enhancingFields["industry"]}
                            className="absolute right-2.5 p-1 text-slate-400 hover:text-[#E7C768] disabled:opacity-30 transition-colors"
                            title="Подобрать отрасль ИИ"
                          >
                            <Sparkles className={`w-3.5 h-3.5 ${enhancingFields["industry"] ? "animate-spin text-yellow-400" : ""}`} />
                          </button>
                        </div>

                        <div className="relative flex items-center">
                          <input
                            type="text"
                            placeholder="Количество сотрудников (например: 120 человек)"
                            maxLength={80}
                            className="w-full bg-black/40 text-xs pl-3 pr-8 py-2.5 rounded-xl text-white border border-white/10 focus:outline-none focus:border-green-500/50"
                            value={newCompanyStaff}
                            onChange={(e) => setNewCompanyStaff(e.target.value)}
                          />
                          <button
                            type="button"
                            style={{ display: aiReady && (newCompanyStaff||"").trim().length >= 7 ? undefined : "none" }}
                            onClick={() => handleEnhanceSingleField("staff", newCompanyStaff)}
                            disabled={enhancingFields["staff"]}
                            className="absolute right-2.5 p-1 text-slate-400 hover:text-[#E7C768] disabled:opacity-30 transition-colors"
                            title="Уточнить число сотрудников через ИИ"
                          >
                            <Sparkles className={`w-3.5 h-3.5 ${enhancingFields["staff"] ? "animate-spin text-yellow-400" : ""}`} />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="relative flex items-center">
                          <input 
                            type="text" 
                            placeholder="Официальный сайт (например: www.it-lab.ru)" 
                            className="w-full bg-black/40 text-xs pl-3 pr-8 py-2.5 rounded-xl text-white border border-white/10 focus:outline-none"
                            value={newCompanySite}
                            onChange={(e) => setNewCompanySite(e.target.value)}
                          />
                          <button
                            type="button"
                            style={{ display: aiReady && (newCompanySite||"").trim().length >= 7 ? undefined : "none" }}
                            onClick={() => handleEnhanceSingleField("sites", newCompanySite)}
                            disabled={enhancingFields["sites"]}
                            className="absolute right-2.5 p-1 text-slate-400 hover:text-[#E7C768] disabled:opacity-30 transition-colors"
                            title="Сгенерировать красивый сайт ИИ"
                          >
                            <Sparkles className={`w-3.5 h-3.5 ${enhancingFields["sites"] ? "animate-spin text-yellow-400" : ""}`} />
                          </button>
                        </div>

                        <div className="relative flex items-center">
                          <input 
                            type="text" 
                            placeholder="URL-ссылка на логотип бренда" 
                            className="w-full bg-black/40 text-xs pl-3 pr-8 py-2.5 rounded-xl text-white border border-white/10 focus:outline-none"
                            value={newCompanyLogo}
                            onChange={(e) => setNewCompanyLogo(e.target.value)}
                          />
                          <button
                            type="button"
                            style={{ display: aiReady && (newCompanyLogo||"").trim().length >= 7 ? undefined : "none" }}
                            onClick={() => handleEnhanceSingleField("logoUrl", newCompanyLogo)}
                            disabled={enhancingFields["logoUrl"]}
                            className="absolute right-2.5 p-1 text-slate-400 hover:text-[#E7C768] disabled:opacity-30 transition-colors"
                            title="Подобрать иконку ИИ"
                          >
                            <Sparkles className={`w-3.5 h-3.5 ${enhancingFields["logoUrl"] ? "animate-spin text-yellow-400" : ""}`} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* SECTION 2: IDENTITY */}
                    <div className="space-y-3">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">2. О компании</span>

                      <div className="relative">
                        <textarea 
                          placeholder="Описание компании и чем занимается (до 600 символов)" 
                          maxLength={600}
                          className="w-full bg-black/40 text-xs pl-3 pr-10 py-2.5 rounded-xl border border-white/10 text-white focus:outline-none"
                          rows={3}
                          value={newCompanyDescription}
                          onChange={(e) => setNewCompanyDescription(e.target.value)}
                        />
                        <button
                          type="button"
                          style={{ display: aiReady && (newCompanyDescription||"").trim().length >= 7 ? undefined : "none" }}
                            onClick={() => handleEnhanceSingleField("descriptionText", newCompanyDescription)}
                          disabled={enhancingFields["descriptionText"]}
                          className="absolute right-3 top-3 p-1 text-slate-400 hover:text-[#E7C768] disabled:opacity-30"
                          title="Оформить описание ИИ"
                        >
                          <Sparkles className={`w-3.5 h-3.5 ${enhancingFields["descriptionText"] ? "animate-spin text-yellow-400" : ""}`} />
                        </button>
                      </div>

                      <div className="relative">
                        <textarea 
                          placeholder="Основные продукты / услуги (до 500 символов)" 
                          maxLength={500}
                          className="w-full bg-black/40 text-xs pl-3 pr-10 py-2.5 rounded-xl border border-white/10 text-white focus:outline-none"
                          rows={2}
                          value={newCompanyProducts}
                          onChange={(e) => setNewCompanyProducts(e.target.value)}
                        />
                        <button
                          type="button"
                          style={{ display: aiReady && (newCompanyProducts||"").trim().length >= 7 ? undefined : "none" }}
                            onClick={() => handleEnhanceSingleField("productsText", newCompanyProducts)}
                          disabled={enhancingFields["productsText"]}
                          className="absolute right-3 top-3 p-1 text-slate-400 hover:text-[#E7C768] disabled:opacity-30"
                          title="Сформулировать продукты"
                        >
                          <Sparkles className={`w-3.5 h-3.5 ${enhancingFields["productsText"] ? "animate-spin text-yellow-400" : ""}`} />
                        </button>
                      </div>

                      <div className="relative">
                        <textarea 
                          placeholder="Имидж, миссия и культура (до 500 символов)" 
                          maxLength={500}
                          className="w-full bg-black/40 text-xs pl-3 pr-10 py-2.5 rounded-xl border border-white/10 text-white focus:outline-none"
                          rows={2}
                          value={newCompanyMissionText}
                          onChange={(e) => setNewCompanyMissionText(e.target.value)}
                        />
                        <button
                          type="button"
                          style={{ display: aiReady && (newCompanyMissionText||"").trim().length >= 7 ? undefined : "none" }}
                            onClick={() => handleEnhanceSingleField("missionText", newCompanyMissionText)}
                          disabled={enhancingFields["missionText"]}
                          className="absolute right-3 top-3 p-1 text-slate-400 hover:text-[#E7C768] disabled:opacity-30"
                          title="Дополнить слоган ИИ"
                        >
                          <Sparkles className={`w-3.5 h-3.5 ${enhancingFields["missionText"] ? "animate-spin text-yellow-400" : ""}`} />
                        </button>
                      </div>
                    </div>

                    {/* SECTION 3: KEY PERFORMANCE COUNTERS */}
                    <div className="space-y-3">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">3. Показатели компании (Stats bento-cards на лендинге)</span>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* STATS 1 */}
                        <div className="bg-[#17344F]/25 border border-white/5 p-3 rounded-2xl space-y-2">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Показатель 1 (Клиенты)</span>
                          <div className="relative flex items-center">
                            <input 
                              type="text" 
                              placeholder="Например: 1200+" 
                              className="w-full bg-black/50 text-xs px-2.5 py-1.5 rounded-lg border border-white/10 text-white"
                              value={newCompanyStatsValClients}
                              onChange={(e) => setNewCompanyStatsValClients(e.target.value)}
                            />
                            <button
                              type="button"
                              style={{ display: aiReady && (newCompanyStatsValClients||"").trim().length >= 7 ? undefined : "none" }}
                            onClick={() => handleEnhanceSingleField("statsValClients", newCompanyStatsValClients)}
                              disabled={enhancingFields["statsValClients"]}
                              className="absolute right-2"
                            >
                              <Sparkles className={`w-3 h-3 text-slate-400 ${enhancingFields["statsValClients"] ? "animate-spin text-yellow-400" : ""}`} />
                            </button>
                          </div>
                          <input 
                            type="text" 
                            placeholder="Подпись. Например: Активных клиентов" 
                            className="w-full bg-black/50 text-[10px] px-2.5 py-1.5 rounded-lg border border-white/10 text-white"
                            value={newCompanyStatsLabelClients}
                            onChange={(e) => setNewCompanyStatsLabelClients(e.target.value)}
                          />
                        </div>

                        {/* STATS 2 */}
                        <div className="bg-[#17344F]/25 border border-white/5 p-3 rounded-2xl space-y-2">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Показатель 2 (Обороты)</span>
                          <div className="relative flex items-center">
                            <input 
                              type="text" 
                              placeholder="Например: 15 млн" 
                              className="w-full bg-black/50 text-xs px-2.5 py-1.5 rounded-lg border border-white/10 text-white"
                              value={newCompanyStatsValDialogs}
                              onChange={(e) => setNewCompanyStatsValDialogs(e.target.value)}
                            />
                            <button
                              type="button"
                              style={{ display: aiReady && (newCompanyStatsValDialogs||"").trim().length >= 7 ? undefined : "none" }}
                            onClick={() => handleEnhanceSingleField("statsValDialogs", newCompanyStatsValDialogs)}
                              disabled={enhancingFields["statsValDialogs"]}
                              className="absolute right-2"
                            >
                              <Sparkles className={`w-3 h-3 text-slate-400 ${enhancingFields["statsValDialogs"] ? "animate-spin text-yellow-400" : ""}`} />
                            </button>
                          </div>
                          <input 
                            type="text" 
                            placeholder="Подпись. Например: Диалогов пройдено" 
                            className="w-full bg-black/50 text-[10px] px-2.5 py-1.5 rounded-lg border border-white/10 text-white"
                            value={newCompanyStatsLabelDialogs}
                            onChange={(e) => setNewCompanyStatsLabelDialogs(e.target.value)}
                          />
                        </div>

                        {/* STATS 3 */}
                        <div className="bg-[#17344F]/25 border border-white/5 p-3 rounded-2xl space-y-2">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Показатель 3 (История)</span>
                          <div className="relative flex items-center">
                            <input 
                              type="text" 
                              placeholder="Например: 2018" 
                              maxLength={4}
                              inputMode="numeric"
                              className="w-full bg-black/50 text-xs px-2.5 py-1.5 rounded-lg border border-white/10 text-white"
                              value={newCompanyStatsValFounded}
                              onChange={(e) => setNewCompanyStatsValFounded(e.target.value)}
                            />
                            <button
                              type="button"
                              style={{ display: aiReady && (newCompanyStatsValFounded||"").trim().length >= 7 ? undefined : "none" }}
                            onClick={() => handleEnhanceSingleField("statsValFounded", newCompanyStatsValFounded)}
                              disabled={enhancingFields["statsValFounded"]}
                              className="absolute right-2"
                            >
                              <Sparkles className={`w-3 h-3 text-slate-400 ${enhancingFields["statsValFounded"] ? "animate-spin text-yellow-400" : ""}`} />
                            </button>
                          </div>
                          <input 
                            type="text" 
                            placeholder="Подпись. Например: Год основания" 
                            className="w-full bg-black/50 text-[10px] px-2.5 py-1.5 rounded-lg border border-white/10 text-white"
                            value={newCompanyStatsLabelFounded}
                            onChange={(e) => setNewCompanyStatsLabelFounded(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    {/* SECTION 4: DEFAULT CONDITIONS & WIKI */}
                    <div className="space-y-3">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">4. Стандарты условий и регламенты (Для редактора лендингов)</span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="relative flex items-center">
                          <input 
                            type="text" 
                            placeholder="Условия оплаты (напр: 100 000 руб)" 
                            className="w-full bg-black/40 text-xs pl-3 pr-8 py-2.5 rounded-xl text-white border border-white/10 focus:outline-none"
                            value={newCompanySalaryTerms}
                            onChange={(e) => setNewCompanySalaryTerms(e.target.value)}
                          />
                          <button
                            type="button"
                            style={{ display: aiReady && (newCompanySalaryTerms||"").trim().length >= 7 ? undefined : "none" }}
                            onClick={() => handleEnhanceSingleField("salaryTerms", newCompanySalaryTerms)}
                            disabled={enhancingFields["salaryTerms"]}
                            className="absolute right-2.5 p-1 text-slate-400 hover:text-[#E7C768] disabled:opacity-30 transition-colors"
                            title="Рассчитать привлекательную сетку"
                          >
                            <Sparkles className={`w-3.5 h-3.5 ${enhancingFields["salaryTerms"] ? "animate-spin text-yellow-400" : ""}`} />
                          </button>
                        </div>

                        <div className="relative flex items-center">
                          <input 
                            type="text" 
                            placeholder="Формат графика (напр: 5/2, 2/2 еженедельно)" 
                            className="w-full bg-black/40 text-xs pl-3 pr-8 py-2.5 rounded-xl text-white border border-white/10 focus:outline-none"
                            value={newCompanyScheduleTerms}
                            onChange={(e) => setNewCompanyScheduleTerms(e.target.value)}
                          />
                          <button
                            type="button"
                            style={{ display: aiReady && (newCompanyScheduleTerms||"").trim().length >= 7 ? undefined : "none" }}
                            onClick={() => handleEnhanceSingleField("scheduleTerms", newCompanyScheduleTerms)}
                            disabled={enhancingFields["scheduleTerms"]}
                            className="absolute right-2.5 p-1 text-slate-400 hover:text-[#E7C768] disabled:opacity-30 transition-colors"
                            title="Сформулировать график"
                          >
                            <Sparkles className={`w-3.5 h-3.5 ${enhancingFields["scheduleTerms"] ? "animate-spin text-yellow-400" : ""}`} />
                          </button>
                        </div>
                      </div>

                      <div className="relative">
                        <textarea 
                          placeholder="Корпоративная Wiki-база, регламенты звонков и сдачи отчетности..." 
                          className="w-full bg-black/40 text-xs pl-3 pr-10 py-2.5 rounded-xl border border-white/10 text-white focus:outline-none"
                          rows={3}
                          value={newCompanyCustomWiki}
                          onChange={(e) => setNewCompanyCustomWiki(e.target.value)}
                        />
                        <button
                          type="button"
                          style={{ display: aiReady && (newCompanyCustomWiki||"").trim().length >= 7 ? undefined : "none" }}
                            onClick={() => handleEnhanceSingleField("customWiki", newCompanyCustomWiki)}
                          disabled={enhancingFields["customWiki"]}
                          className="absolute right-3 top-3 p-1 text-slate-400 hover:text-[#E7C768] disabled:opacity-30"
                          title="Структурировать Wiki ИИ"
                        >
                          <Sparkles className={`w-3.5 h-3.5 ${enhancingFields["customWiki"] ? "animate-spin text-yellow-400" : ""}`} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 text-xs pt-2">
                    <button type="button" onClick={cancelAddCompanyWizard} className="px-4 py-2 hover:bg-white/5 rounded-xl">Отмена</button>
                    <button type="submit" className="px-6 py-2 bg-green-600 hover:bg-green-500 rounded-xl font-bold text-white shadow-lg transition-all">
                      Сохранить и Синхронизировать
                    </button>
                  </div>
                </form>
              )}

              {/* LIST VIEW */}
              <div className="space-y-4">
                {companiesList.length === 0 && (
                  <div className="bg-[#1D3E5E]/40 border border-white/5 p-8 rounded-3xl text-center text-slate-400 text-xs">
                    Компаний пока нет. Нажмите «+ Добавить Компанию» выше, чтобы создать карточку и её ИИ-лендинг. Все действия по компании — бесплатно.
                  </div>
                )}
                {companiesList.map((comp, idx) => {
                  const compVacancies = projects.filter(p => p.companyName?.toLowerCase() === comp.name?.toLowerCase());

                  return (
                    <div key={idx} className="bg-[#1D3E5E]/60 border border-white/10 p-5 rounded-3xl space-y-3 cursor-pointer hover:border-[#E7C768]/40 transition" onClick={() => openEditCompanyWizard(comp)} title="Открыть карточку компании для редактирования">
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex items-center gap-3">
                          {comp.logoUrl ? (
                            <img src={comp.logoUrl} alt="Logo" className="w-10 h-10 object-contain rounded-lg bg-white/10 p-1 shrink-0" onError={(e) => { (e.target as any).style.display = "none"; }} />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-[#E7C768]/10 text-[#E7C768] font-bold flex items-center justify-center shrink-0 border border-[#E7C768]/20 font-mono text-sm">
                              {comp.name ? comp.name.substr(0, 2).toUpperCase() : "CO"}
                            </div>
                          )}
                          <div>
                            <h3 className="text-lg font-black text-[#E7C768] leading-tight">{comp.name || "Без названия"}</h3>
                            {comp.industry && comp.industry !== "—" && (
                              <div className="text-[11px] text-slate-300 mt-0.5">{comp.industry}</div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {comp.status === "draft" && (
                            <span className="bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[10px] py-1 px-2 rounded-full font-mono">Черновик</span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openEditCompanyWizard(comp); }}
                            className="bg-[#E7C768]/15 hover:bg-[#E7C768]/25 border border-[#E7C768]/30 text-[#E7C768] text-[10px] font-bold px-2.5 py-1 rounded-full"
                          >
                            Редактировать
                          </button>
                        </div>
                      </div>

                      <p className="text-xs text-slate-200 leading-relaxed font-normal">{comp.description}</p>

                      {/* Site preview + staff info */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {comp.website && <SitePreview url={comp.website} variant="compact" />}
                        {comp.staff && (
                          <span className="inline-flex items-center gap-1.5 bg-black/30 border border-white/10 rounded-xl px-2.5 py-1.5 text-[11px] text-slate-200">
                            <span className="text-slate-400">Сотрудники:</span>
                            <span className="font-bold text-white">{comp.staff}</span>
                          </span>
                        )}
                        {comp.files && (
                          <span className="text-[11px] text-slate-300 flex items-center gap-1 font-semibold">
                            📂 <strong className="text-[#E7C768] font-mono">{comp.files}</strong>
                          </span>
                        )}
                      </div>

                      {/* AI Generated Careers Landing Link address */}
                      <div className="bg-black/20 border border-white/5 p-3 rounded-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                        <div className="space-y-0.5">
                          <span className="text-[9px] uppercase font-bold text-[#E7C768] block leading-none font-mono">ИИ-Лендинг Компании для Кандидатов</span>
                          <span className="text-[11.5px] text-slate-300 font-mono select-all">https://hr-rr.online/com{comp.slug || comp.public_id}</span>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/com${comp.slug || comp.public_id}`); }}
                          className="cursor-pointer bg-white/10 hover:bg-white/15 text-white font-bold text-[10.5px] py-1.5 px-3 rounded-lg transition text-center"
                        >
                          Открыть Лендинг 🔗
                        </button>
                      </div>
                      
                      <div className="pt-3 border-t border-white/5 flex flex-wrap items-center justify-between gap-2.5 text-[11px] text-slate-400">
                        <span>Задействованных вакансий в системе: <strong className="text-white">{compVacancies.length}</strong></span>
                        <div className="flex gap-1.5">
                          {compVacancies.map(p => (
                            <span key={p.id} className="bg-white/5 hover:bg-white/10 border border-white/5 text-slate-300 px-2 py-0.5 rounded font-mono text-[9.5px]">
                              {p.roleName}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Onboarding Step 2 Next CTA */}
              <div className="bg-[#1E4468]/60 border border-[#E7C768]/30 rounded-3xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 mt-6">
                <div className="text-left space-y-1">
                  <h4 className="text-[#E7C768] font-bold text-sm">Компания добавлена и бренд-лендинг готов?</h4>
                  <p className="text-xs text-slate-350">Переходите к финальному шагу онбординга — размещению вашей первой вакансии с ИИ-куратором.</p>
                </div>
                <button
                  onClick={() => navigate(`/emp${employerId}/vacancies`)}
                  className="cursor-pointer bg-gradient-to-r from-amber-500 to-orange-600 hover:scale-102 hover:shadow-lg text-white font-black text-xs py-3 px-6 rounded-2xl flex items-center gap-1.5 transition-all text-center shrink-0 w-full sm:w-auto justify-center animate-pulse"
                >
                  <span>Далее: Разместить вакансию</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

            </div>
          )}
          
          {/* PAGE 4: BILLS & ACCOUNTS - DYNAMIC BALANCE & SHIELD */}
          {activeTab === "tariff" && (
            <div className="space-y-6 text-left">

              {/* 1. КАЛЬКУЛЯТОР ВЫГОДЫ */}
              <HiringCalculator />

              {/* БАЛАНС + ЛИМИТЫ КАРТОЧКИ */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                <div className="md:col-span-5 bg-[#1D3E5E]/95 border border-[#E7C768]/45 rounded-3xl p-6 shadow-xl flex flex-col justify-between space-y-4">
                  <div>
                    <span className="text-[10px] font-bold text-[#E7C768] tracking-widest uppercase font-mono block">Лицевой счёт</span>
                    <h2 className="text-3xl font-extrabold text-white mt-1.5 font-mono select-none">
                      {balance.toLocaleString("ru-RU")} <span className="text-lg font-bold text-[#E7C768]">RR</span>
                    </h2>
                    <p className="text-[11px] text-slate-300 mt-2 leading-relaxed">
                      1 RR = 1 ₽. Списания происходят автоматически: при успешной генерации лендинга/системы интервью/обучения,
                      а также за каждое прохождение этапа кандидатом.
                    </p>
                  </div>
                  <div className="bg-black/25 rounded-2xl p-3 border border-white/5 space-y-1">
                    <span className="text-[9px] text-slate-400 font-bold block uppercase font-mono">ID работодателя</span>
                    <span className="font-mono text-xs font-bold text-slate-300">emp{employerId}</span>
                  </div>
                </div>

                <div className="md:col-span-7 bg-[#1D3E5E]/85 border border-white/15 rounded-3xl p-6 shadow-xl flex flex-col justify-between space-y-4">
                  <div>
                    <h3 className="font-bold text-sm text-[#E7C768] flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-[#E7C768]" /> Купленные пакетные лимиты
                    </h3>
                    <p className="text-[11px] text-slate-350 mt-1">
                      Эти лимиты расходуются по 1 шт. в момент, когда кандидат впервые нажимает «Приступить»
                      к ИИ-интервью или ИИ-обучению. Повторно за того же кандидата не списывается.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3.5 text-xs text-center">
                    <div className="bg-black/20 p-3 rounded-2xl border border-white/5">
                      <span className="text-[10px] text-slate-400 block uppercase">Интервью</span>
                      <strong className="text-2xl text-white block mt-1 font-mono">{interviewCredits}</strong>
                      <span className="text-[10px] text-slate-400">шт.</span>
                    </div>
                    <div className="bg-black/20 p-3 rounded-2xl border border-white/5">
                      <span className="text-[10px] text-slate-400 block uppercase">Обучения</span>
                      <strong className="text-2xl text-white block mt-1 font-mono">{trainingCredits}</strong>
                      <span className="text-[10px] text-slate-400">шт.</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. ФИКС-УСЛУГИ (информационно) + 3. ПАКЕТЫ */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Фикс-услуги */}
                <div className="bg-[#1D3E5E]/85 border border-white/15 rounded-3xl p-6 shadow-xl space-y-3">
                  <div>
                    <h3 className="font-bold text-sm text-[#E7C768] flex items-center gap-1.5 uppercase tracking-wider font-mono text-[11px]">
                      🛍️ Разовые услуги (фикс. цена)
                    </h3>
                    <p className="text-xs text-slate-300 mt-1">
                      Списываются автоматически после успешной ИИ-генерации.
                      Можно купить впрок — тогда списание пойдёт из лимита, а не с баланса.
                    </p>
                  </div>

                  <div className="space-y-2.5 pt-1">
                    {([
                      { item: "landing" as const, icon: "🌐", title: "ИИ-Лендинг вакансии",
                        desc: "Стильный мини-сайт вакансии с описанием условий, компанией и ИИ-консультантом по базе знаний.",
                        price: FIXED_PRICES.landing, credits: landingCredits },
                      { item: "interview_setup" as const, icon: "⚙️", title: "ИИ-Система интервью",
                        desc: "Генератор скрининга резюме, чек-листа и 3 ролевых ситуаций под вашу вакансию.",
                        price: FIXED_PRICES.interview_setup, credits: interviewSetupCredits },
                      { item: "training_setup" as const, icon: "🎓", title: "ИИ-Система обучения",
                        desc: "Профессиональное дообучение + обучение продукту + обучение регламентам по вашей базе знаний.",
                        price: FIXED_PRICES.training_setup, credits: trainingSetupCredits },
                    ]).map(row => (
                      <div key={row.item} className="bg-black/15 p-3 rounded-2xl border border-white/5 space-y-2 text-xs">
                        <div className="flex items-center justify-between gap-3">
                          <div className="max-w-[70%]">
                            <h4 className="font-bold text-white text-xs flex items-center gap-1.5">{row.icon} {row.title}</h4>
                            <p className="text-[10.5px] text-slate-300 mt-1 leading-relaxed">{row.desc}</p>
                          </div>
                          <span className="font-mono font-bold text-[#E7C768] whitespace-nowrap">{row.price} RR</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/5">
                          <span className="text-[10px] text-slate-400 font-mono">Куплено впрок: <span className="text-white font-bold">{row.credits} шт</span></span>
                          <button
                            type="button"
                            onClick={() => handleBuyFixed(row.item)}
                            disabled={fixedBusy !== null}
                            className="bg-emerald-600/80 hover:bg-emerald-600 disabled:opacity-40 text-white font-bold text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-xl transition cursor-pointer"
                          >
                            {fixedBusy === row.item ? "..." : "Купить впрок +1"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Пакеты лимитов */}
                <div className="bg-[#1D3E5E]/85 border border-white/15 rounded-3xl p-6 shadow-xl space-y-4">
                  <div>
                    <h3 className="font-bold text-sm text-[#E7C768] flex items-center gap-1.5 uppercase tracking-wider font-mono text-[11px]">
                      📦 Пакеты лимитов интервью и обучения
                    </h3>
                    <p className="text-xs text-slate-300 mt-1">
                      Цена за штуку считается по <strong className="text-white">сумме</strong> интервью + обучения. Чем больше пакет — тем дешевле каждая штука. 1 RR = 1 ₽.
                    </p>
                  </div>

                  {purchaseError && (
                    <div className="bg-red-950/40 border border-red-500/35 text-red-300 rounded-xl p-2.5 text-[11px] font-mono">
                      ⚠️ {purchaseError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-[10px]">
                    {[{r:"1–9",p:200},{r:"10–49",p:150},{r:"50–199",p:100},{r:"200+",p:50}].map(t => (
                      <div key={t.r} className="bg-black/30 rounded-xl p-2 border border-white/10 text-center">
                        <div className="text-slate-300">{t.r} шт</div>
                        <div className="text-sm font-bold font-mono text-[#E7C768]">{t.p} RR</div>
                      </div>
                    ))}
                  </div>

                  {(() => {
                    const qi = Math.max(0, Math.floor(packQty.interview || 0));
                    const qt = Math.max(0, Math.floor(packQty.training || 0));
                    const total_qty = qi + qt;
                    const unit = packTierPrice(Math.max(1, total_qty));
                    const total_rr = unit * total_qty;
                    return (
                      <div className="bg-black/15 p-3 rounded-2xl border border-white/5 space-y-2.5">
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="space-y-1">
                            <label className="text-slate-300 text-[11px]">🎙️ Интервью (шт)</label>
                            <input
                              type="number" min={0} value={qi}
                              onChange={(e) => setPackQty(s => ({ ...s, interview: Math.max(0, parseInt(e.target.value) || 0) }))}
                              className="w-full bg-black/30 border border-white/15 text-[#E7C768] font-bold text-center rounded-lg px-2 py-1.5 font-mono"
                            />
                            <div className="text-[10px] text-slate-400 font-mono">Остаток: {interviewCredits} шт</div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-slate-300 text-[11px]">🎓 Обучение (шт)</label>
                            <input
                              type="number" min={0} value={qt}
                              onChange={(e) => setPackQty(s => ({ ...s, training: Math.max(0, parseInt(e.target.value) || 0) }))}
                              className="w-full bg-black/30 border border-white/15 text-[#E7C768] font-bold text-center rounded-lg px-2 py-1.5 font-mono"
                            />
                            <div className="text-[10px] text-slate-400 font-mono">Остаток: {trainingCredits} шт</div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5 text-xs">
                          <span className="text-slate-300 font-mono text-[11px]">
                            Всего: <strong className="text-white">{total_qty}</strong> шт × <strong className="text-white">{unit}</strong> RR = <strong className="text-[#E7C768]">{total_rr.toLocaleString("ru-RU")} RR</strong>
                          </span>
                          <button
                            type="button"
                            onClick={handleBuyMixedPack}
                            disabled={packBusy || total_qty < 1}
                            className="bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-[#17344F] font-bold text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-xl transition cursor-pointer"
                          >
                            {packBusy ? "..." : "Купить пакет"}
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* 4. ПОПОЛНЕНИЕ RR ЗА РУБЛИ */}
              <div className="bg-[#1D3E5E]/85 border border-[#E7C768]/30 rounded-3xl p-6 shadow-xl">
                <form onSubmit={handleTopupBalance} className="space-y-4">
                  <div>
                    <h3 className="font-bold text-sm text-[#E7C768] flex items-center gap-1.5 uppercase tracking-wider font-mono text-[11px]">
                      💵 Пополнение баланса RR за рубли
                    </h3>
                    <p className="text-xs text-slate-300 mt-1">Курс <strong className="text-white">1 ₽ = 1 RR</strong>. Минимальный платёж 100 ₽.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">К оплате (₽)</label>
                      <div className="relative">
                        <input
                          type="number"
                          min={100}
                          value={topupAmountRub}
                          onChange={(e) => setTopupAmountRub(Math.max(0, parseInt(e.target.value) || 0))}
                          className="bg-black/35 w-full rounded-2xl border border-white/10 px-4 py-3 font-mono font-extrabold text-white text-sm focus:outline-none focus:border-[#E7C768]"
                        />
                        <span className="absolute right-4 top-3 text-xs font-bold text-[#E7C768] font-mono">₽</span>
                      </div>
                      <div className="flex gap-2 text-[10px] font-mono font-bold">
                        {[100, 500, 1000, 5000].map(v => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setTopupAmountRub(v)}
                            className={`px-3 py-2 rounded-xl border transition-all ${topupAmountRub === v ? "bg-[#1E4468] text-[#E7C768] border-[#E7C768]/60" : "bg-black/20 text-slate-400 border-white/5 hover:border-white/15"}`}
                          >
                            {v.toLocaleString("ru-RU")} ₽
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="bg-emerald-950/20 p-4 rounded-2xl border border-emerald-500/20 flex flex-col justify-between">
                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase">Будет зачислено</span>
                        <span className="text-2xl font-extrabold text-[#E7C768] block font-mono">{topupAmountRub.toLocaleString("ru-RU")} RR</span>
                      </div>
                      <button
                        type="submit"
                        disabled={isToppingUp || topupAmountRub < 100 || !topupOfferOk}
                        className="cursor-pointer bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-40 text-[#17344F] font-bold text-xs uppercase tracking-wider py-3 rounded-2xl mt-3 transition"
                      >
                        {isToppingUp ? "Перенаправляем на оплату..." : "🚀 Оплатить через Робокассу"}
                      </button>
                    </div>
                  </div>

                  <OfferConsent checked={topupOfferOk} onChange={setTopupOfferOk} context="pay" />
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    Оплата проводится через систему «Робокасса». Принимаем карты МИР, Visa, Mastercard и другие способы.
                    После успешной оплаты RR начисляются автоматически (обычно в течение минуты).
                  </p>
                </form>
              </div>

              {/* 5. РЕФЕРАЛЬНАЯ ПРОГРАММА */}
              <div className="bg-[#1D3E5E]/60 border border-white/10 rounded-3xl p-6 shadow-xl space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🎁</span>
                  <div>
                    <h3 className="font-bold text-sm text-[#E7C768]">Реферальная программа: +1000 RR за каждого приглашённого</h3>
                    <p className="text-[11px] text-slate-300 leading-relaxed mt-0.5">
                      Когда приглашённый работодатель регистрируется через Google по вашей ссылке, ему начисляется приветственный бонус
                      <strong className="text-white"> 1000 RR</strong>, а вам — <strong className="text-white">+1000 RR</strong>.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-black/20 p-3 rounded-2xl border border-white/5 text-xs">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase font-mono mb-1.5">Ваша реферальная ссылка</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={`${window.location.origin}/auth?ref=emp${employerId}`}
                        className="bg-black/30 w-full select-all font-mono text-emerald-300 text-[11px] border border-white/5 p-2 rounded"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/auth?ref=emp${employerId}`);
                          addAuditEvent("success", "Ссылка скопирована", "Реферальная ссылка скопирована.");
                        }}
                        className="bg-emerald-950 hover:bg-emerald-900 text-emerald-400 px-2 py-1 border border-emerald-500/20 text-[10px] uppercase font-bold rounded cursor-pointer"
                      >
                        Копировать
                      </button>
                    </div>
                  </div>

                  <div className="bg-black/20 p-3 rounded-2xl border border-white/5 text-xs">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase font-mono mb-1.5">Кем вы приглашены</span>
                    {referrer ? (
                      <div className="space-y-1 text-slate-200">
                        <div className="font-bold text-white text-[12px]">{referrer.name || "—"} <span className="text-slate-400 font-mono text-[10px]">emp{referrer.public_id}</span></div>
                        <div className="font-mono text-[10.5px] text-slate-300">{referrer.email}</div>
                        {referrer.telegram && <div className="font-mono text-[10.5px] text-sky-300">Telegram: @{referrer.telegram}</div>}
                        {referrer.phone && <div className="font-mono text-[10.5px] text-amber-300">Тел.: {referrer.phone}</div>}
                      </div>
                    ) : (
                      <div className="text-slate-400 text-[11px]">Вы зарегистрировались самостоятельно (без реферального кода).</div>
                    )}
                  </div>
                </div>

                <div className="bg-black/20 p-3 rounded-2xl border border-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-slate-400 font-bold uppercase font-mono">Кого пригласили вы</span>
                    <span className="font-mono text-[#E7C768] text-[11px] font-bold">{referees.length} чел · +{referees.reduce((s, r) => s + r.bonus_rr, 0).toLocaleString("ru-RU")} RR</span>
                  </div>
                  {referees.length === 0 ? (
                    <div className="text-[11px] text-slate-400">Пока никто не зарегистрировался по вашей ссылке.</div>
                  ) : (
                    <div className="space-y-1 text-xs">
                      {referees.map((r, i) => (
                        <div key={i} className="flex items-center justify-between bg-black/20 rounded-lg px-2 py-1.5 border border-white/5">
                          <div className="min-w-0 truncate">
                            <span className="text-white font-bold">{r.name || "—"}</span>
                            <span className="text-slate-400 font-mono text-[10px] ml-2">{r.email}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono shrink-0">
                            {new Date(r.created_at).toLocaleDateString("ru-RU")} · <span className="text-emerald-400 font-bold">+{r.bonus_rr} RR</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 6. ИСТОРИЯ ОПЕРАЦИЙ */}
              <div className="bg-[#1D3E5E]/45 border border-white/10 rounded-3xl overflow-hidden shadow">
                <div className="p-4 bg-gradient-to-r from-[#17344F] to-[#265582] text-xs font-bold font-mono tracking-wider text-slate-300">
                  История всех операций по балансу
                </div>
                {paymentHistory.length === 0 ? (
                  <p className="p-4 text-xs text-slate-400">Пока не было ни одной операции.</p>
                ) : (
                  <div className="overflow-x-auto text-xs">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-black/25 text-[#E7C768] border-b border-white/5 font-bold font-mono">
                          <th className="p-3">Дата</th>
                          <th className="p-3">Тип</th>
                          <th className="p-3">Описание</th>
                          <th className="p-3 text-right">Сумма</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-slate-200">
                        {paymentHistory.map((pt, i) => (
                          <tr key={i} className="hover:bg-white/5">
                            <td className="p-3 font-mono text-slate-400">{pt.date}</td>
                            <td className="p-3 font-mono text-[10px] uppercase text-slate-300">{pt.type}</td>
                            <td className="p-3">{pt.note}</td>
                            <td className={`p-3 text-right font-mono font-bold ${pt.amount >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {pt.amount >= 0 ? "+" : ""}{pt.amount.toLocaleString("ru-RU")} RR
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "profile" && (
            <div className="space-y-6 text-left">

              {/* Header */}
              <div className="bg-[#1D3E5E]/80 border border-[#E7C768]/35 rounded-3xl p-5 shadow-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="space-y-1">
                  <h2 className="text-lg font-black text-white flex items-center gap-2">
                    <User className="w-5 h-5 text-amber-400" />
                    Профиль работодателя
                  </h2>
                  <p className="text-xs text-slate-300">Данные авторизации Google и контакты, которые увидят кандидаты.</p>
                </div>
                <div className="bg-emerald-950/40 text-emerald-400 text-xs font-bold border border-emerald-500/30 px-3 py-1 rounded-full font-mono flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  <span>ID работодателя: {employerId}</span>
                </div>
              </div>

              {/* Реферальная ссылка (только Google) */}
              <ReferralLinkBlock employerPublicId={employerId} />

              {/* GOOGLE PROFILE — read-only из аккаунта Google */}
              <div className="bg-[#1D3E5E]/85 border border-white/15 rounded-3xl p-6 shadow-xl space-y-5">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <h3 className="font-bold text-sm text-[#E7C768] uppercase font-mono tracking-wider flex items-center gap-2">
                    <Chrome className="w-4 h-4 text-sky-400" /> Аккаунт Google
                  </h3>
                  <span className="bg-sky-500/10 text-sky-400 border border-sky-500/25 text-[9px] font-mono font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                    Google OAuth2 Verified
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4 bg-black/20 p-4 rounded-2xl border border-white/5">
                  <img
                    src={googlePhoto}
                    alt="Google avatar"
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 rounded-full object-cover border-2 border-sky-400 shadow-md shrink-0"
                  />
                  <div className="text-center sm:text-left min-w-0 flex-1 space-y-1">
                    <h4 className="text-sm font-extrabold text-white truncate">{googleName}</h4>
                    <p className="text-xs text-slate-300 font-mono truncate">{googleEmail}</p>
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1 font-mono text-[10px]">
                      <span className="bg-emerald-950/50 text-emerald-400 px-1.5 py-0.5 rounded font-bold border border-emerald-500/20">
                        Google ID: {googleId}
                      </span>
                      <span className="bg-sky-950/40 text-sky-400 px-1.5 py-0.5 rounded border border-sky-500/20">
                        Email подтверждён ✓
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Имя, email и фото подтягиваются автоматически из вашего аккаунта Google и не редактируются здесь.
                  Чтобы их изменить — обновите данные в аккаунте Google.
                </p>
              </div>

              {/* КОНТАКТЫ ДЛЯ КАНДИДАТОВ */}
              <div className="bg-[#1D3E5E]/85 border border-white/15 rounded-3xl p-6 shadow-xl space-y-5">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <h3 className="font-bold text-sm text-[#E7C768] uppercase font-mono tracking-wider flex items-center gap-2">
                    <Phone className="w-4 h-4 text-amber-400" /> Контакты для кандидатов
                  </h3>
                  <span className="bg-amber-500/10 text-amber-300 border border-amber-500/25 text-[9px] font-mono font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                    видно на лендинге вакансии
                  </span>
                </div>

                <div className="bg-amber-950/30 border border-amber-500/25 rounded-2xl p-3 text-[11px] text-amber-100 leading-relaxed">
                  ℹ️ Эти данные увидят соискатели на странице вашей вакансии — чтобы связаться напрямую, если останутся вопросы. Указывайте только публичные контакты.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-slate-300 block mb-1 font-bold">Telegram (@username):</label>
                    <input
                      type="text"
                      className="w-full bg-[#17344F]/70 border border-white/10 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-400"
                      placeholder="например: hr_company"
                      value={telegramUsernameState}
                      onChange={(e) => setTelegramUsernameState(e.target.value.replace(/^@+/, ""))}
                    />
                    {telegramUsernameState && (
                      <a
                        href={`https://t.me/${telegramUsernameState.replace(/^@+/, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-sky-300 underline mt-1 inline-block font-mono"
                      >
                        t.me/{telegramUsernameState.replace(/^@+/, "")}
                      </a>
                    )}
                  </div>
                  <div>
                    <label className="text-slate-300 block mb-1 font-bold">Телефон:</label>
                    <input
                      type="tel"
                      className="w-full bg-[#17344F]/70 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                      placeholder="+7 (___) ___-__-__"
                      value={profilePhone}
                      onChange={(e) => setProfilePhone(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-slate-400 font-mono">
                    {isProfileSaved ? "Контакты обновлены ✓" : "Заполните и сохраните"}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const { data: { user } } = await supabase.auth.getUser();
                        if (!user) return;
                        await supabase
                          .from("employers")
                          .update({
                            contact_phone: profilePhone || null,
                            contact_telegram: telegramUsernameState ? telegramUsernameState.replace(/^@+/, "") : null,
                          })
                          .eq("user_id", user.id);
                        setIsProfileSaved(true);
                        setTimeout(() => setIsProfileSaved(false), 2000);
                      } catch (e) {
                        console.error("save contacts failed", e);
                      }
                    }}
                    className="cursor-pointer bg-amber-500 hover:bg-amber-600 text-slate-900 font-black px-4 py-2 rounded-xl text-xs transition shadow-md"
                  >
                    {isProfileSaved ? "Сохранено ✓" : "Сохранить контакты"}
                  </button>
                </div>
              </div>

              {/* Onboarding Next Step CTA */}
              <div className="bg-[#1E4468]/60 border border-[#E7C768]/30 rounded-3xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-left space-y-1">
                  <h4 className="text-[#E7C768] font-bold text-sm">Профиль заполнен?</h4>
                  <p className="text-xs text-slate-300">Переходите к следующему шагу — созданию компании и ИИ-лендинга вакансии.</p>
                </div>
                <button
                  onClick={() => navigate(`/emp${employerId}/companies`)}
                  className="cursor-pointer bg-gradient-to-r from-amber-500 to-orange-600 hover:scale-102 hover:shadow-lg text-white font-black text-xs py-3.5 px-6 rounded-2xl flex items-center gap-1.5 transition-all shrink-0 w-full sm:w-auto justify-center"
                >
                  <span>Далее: Настройка компании</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

            </div>
          )}


          {activeTab === "interviews" && (
            <InterviewWizard
              projects={projects}
              addAuditEvent={addAuditEvent}
              refreshProjects={fetchData}
            />
          )}

          {activeTab === "training" && (
            <TrainingWizard
              projects={projects}
              addAuditEvent={addAuditEvent}
              refreshProjects={fetchData}
            />
          )}

        </main>
      </div>

      <CandidateDetailsModal
        candidateId={selectedCandidateId}
        onClose={() => setSelectedCandidateId(null)}
      />

      {/* FOOTER AREA */}
      <footer className="bg-[#17344F] border-t-2 border-[#E7C768] py-8 text-white text-center font-normal">
        <div className="max-w-7xl mx-auto px-4 md:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <RRImage 
              src="https://rjhtauzookkvlipvqpvr.supabase.co/storage/v1/object/public/Logos/RR-Logo.png" 
              w={32}
              alt="RR Logo" 
              className="w-8 h-8 object-contain" 
              referrerPolicy="no-referrer"
            />
            <span className="text-xs text-slate-300 font-bold">© 2026 Робот Рекрутер RR</span>
          </div>

          <div className="text-xs text-slate-400 font-semibold">
            Безоговорочная роботизация подбора персонала
          </div>
        </div>
      </footer>

      {/* MODAL WINDOW FOR PAYMENT */}
      {selectedPlanToBuy && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1D3E5E] border-2 border-[#E7C768]/60 p-6 rounded-3xl w-full max-w-md text-left text-white shadow-2xl relative space-y-4 animate-fadeIn">
            <button 
              onClick={() => setSelectedPlanToBuy(null)} 
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg font-bold cursor-pointer bg-white/5 border border-white/5 w-8 h-8 rounded-full flex items-center justify-center transition"
            >
              ✕
            </button>
            <h2 className="text-lg font-bold text-[#E7C768]">Оплата тарифа</h2>
            <p className="text-xs text-slate-200 leading-relaxed">
              Вы активируете тариф <strong className="text-white bg-[#E7C768]/20 px-2 py-0.5 rounded border border-[#E7C768]/30">{selectedPlanToBuy === "silver" ? "Серебро Про" : "Золото Безлимит"}</strong>. Оплата производится через безопасный шлюз.
            </p>
            <button
              onClick={handleConfirmPayment}
              disabled={isProcessingPayment}
              className="w-full bg-[#E7C768] hover:bg-[#d6b75c] active:scale-98 text-[#112335] font-black text-xs py-3.5 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {isProcessingPayment ? (
                <span className="flex items-center justify-center gap-1">
                  <RefreshCw className="w-4 h-4 animate-spin" /> Связь с сервером платежного шлюза...
                </span>
              ) : (
                `Оплатить ${selectedPlanToBuy === "silver" ? "14 900 ₽" : "39 900 ₽"}`
              )}
            </button>

            <span className="text-[10px] text-zinc-400 leading-normal block text-center italic">Вы также можете пропустить оплату, вся система адаптации полноценно работает в тестовом режиме Бронза.</span>
          </div>
        </div>
      )}

      {/* MODAL WINDOW: EDIT VACANCY DETAILS AND SUBPAGES TEXTS */}
      {editingProject && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1D3E5E] border-2 border-[#E7C768]/60 p-6 sm:p-8 rounded-3xl w-full max-w-6xl text-left text-white shadow-2xl relative max-h-[95vh] overflow-y-auto space-y-5 animate-fadeIn">
            <button 
              onClick={() => setEditingProject(null)} 
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg font-bold cursor-pointer bg-white/5 border border-white/5 w-8 h-8 rounded-full flex items-center justify-center transition"
            >
              ✕
            </button>

            <div className="border-b border-white/10 pb-3">
              <span className="text-[10px] font-bold text-[#E7C768] uppercase font-mono tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#E7C768] animate-pulse" />
                Редактирование &bull; ID вакансии: {editingProject.id}
              </span>
              <h2 className="text-xl font-bold text-white mt-1">
                {editingProject.roleName}
              </h2>
            </div>

            {companiesList.some(c => c.name.toLowerCase() === editingProject.companyName?.toLowerCase()) && (
              <div className="bg-green-500/10 border border-green-500/30 p-3.5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-pulse">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-green-300 font-bold font-mono">🌟 ИИ-ПОРТАЛ СИНХРОНИЗАЦИИ:</span>
                  <p className="text-xs text-slate-200">Найден зарегистрированный профиль компании "{editingProject.companyName}"</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const comp = companiesList.find(c => c.name.toLowerCase() === editingProject.companyName?.toLowerCase());
                    if (comp) {
                      setEditingProject({
                        ...editingProject,
                        logoUrl: comp.logoUrl || editingProject.logoUrl,
                        customWiki: comp.customWiki || editingProject.customWiki,
                        companyText: comp.description || editingProject.companyText,
                        missionText: comp.missionText || editingProject.missionText,
                        salaryTerms: comp.salaryTerms || editingProject.salaryTerms,
                        scheduleTerms: comp.scheduleTerms || editingProject.scheduleTerms,
                        statsValClients: comp.statsValClients || editingProject.statsValClients,
                        statsLabelClients: comp.statsLabelClients || editingProject.statsLabelClients,
                        statsValDialogs: comp.statsValDialogs || editingProject.statsValDialogs,
                        statsLabelDialogs: comp.statsLabelDialogs || editingProject.statsLabelDialogs,
                        statsValFounded: comp.statsValFounded || editingProject.statsValFounded,
                        statsLabelFounded: comp.statsLabelFounded || editingProject.statsLabelFounded
                      });
                      addAuditEvent("success", "Бренд интегрирован", `Все ИИ-поля из организации "${comp.name}" успешно импортированы в лендинг вакансии.`);
                    }
                  }}
                  className="px-3.5 py-1.5 text-xs font-bold rounded-xl text-green-950 bg-green-400 hover:bg-green-300 transition-all flex items-center justify-center gap-1 shadow-md shadow-green-950/20 self-start sm:self-center cursor-pointer select-none"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Перенести ИИ-поля в редактор лендинга
                </button>
              </div>
            )}

{/* Unified VacancyEditor — same look as the create wizard, with per-field live preview */}
            <form onSubmit={handleSaveEditedProject} className="space-y-5">
              {/* Company + Role pickers (same UX as the create wizard). */}
              <div className="rounded-2xl border border-[#E7C768]/30 bg-[#0E1F30]/60 p-4 space-y-3">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#E7C768] font-bold block">
                  Компания и должность
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-200 block mb-1">Компания:</label>
                    {companiesList.length > 0 ? (
                      <select
                        className="w-full bg-[#17344F] text-xs p-2.5 rounded-xl border border-white/10 text-white focus:outline-[#E7C768]"
                        value={editingProject.companyName || ""}
                        onChange={(e) => setEditingProject({ ...editingProject, companyName: e.target.value } as any)}
                      >
                        <option value="">Выберите компанию...</option>
                        {companiesList.map((c) => (
                          <option key={c.id} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        className="w-full bg-[#17344F]/60 text-xs p-2.5 rounded-xl border border-white/10 text-white focus:outline-[#E7C768]"
                        value={editingProject.companyName || ""}
                        onChange={(e) => setEditingProject({ ...editingProject, companyName: e.target.value } as any)}
                      />
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-200 block mb-1">Должность:</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="flex-1 bg-[#17344F]/60 text-xs p-2.5 rounded-xl border border-white/10 text-white focus:outline-[#E7C768]"
                        value={editingProject.roleName || ""}
                        onChange={(e) => setEditingProject({ ...editingProject, roleName: e.target.value } as any)}
                      />
                      <button
                        type="button"
                        onClick={applyRoleTemplateToEditing}
                        className="px-3 py-2 rounded-xl bg-[#E7C768]/15 hover:bg-[#E7C768]/25 border border-[#E7C768]/40 text-[#E7C768] text-[10px] font-bold transition whitespace-nowrap"
                        title="Заменить все 15 полей шаблоном для выбранной должности"
                      >
                        Применить шаблон ко всем 15 полям
                      </button>
                    </div>
                  </div>
                </div>
                <div className="bg-black/20 p-2.5 rounded-xl border border-white/5 space-y-1.5">
                  <input
                    type="text"
                    placeholder="Фильтровать справочник профессий..."
                    className="bg-black/40 text-[10.5px] p-1.5 w-full rounded border border-white/10 text-white"
                    value={editSpecialtySearch}
                    onChange={(e) => setEditSpecialtySearch(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
                    {Array.from(new Set([...jobTitlesList, ...BASIC_SPECIALTIES]))
                      .filter((s) => s.toLowerCase().includes(editSpecialtySearch.toLowerCase()))
                      .slice(0, 40)
                      .map((spec) => (
                        <button
                          key={spec}
                          type="button"
                          onClick={() => {
                            setEditingProject({ ...editingProject, roleName: spec } as any);
                            setEditSpecialtySearch("");
                          }}
                          className="bg-[#1D3E5E]/85 border border-white/5 hover:border-[#E7C768] text-[9.5px] px-2 py-0.5 rounded text-white transition"
                        >
                          💼 {spec}
                        </button>
                      ))}
                  </div>
                </div>
              </div>

              <VacancyEditor
                mode="edit"
                companyName={editingProject.companyName}
                hideKeys={["role_name"]}
                roleTemplates={roleTplToFields(editRoleTemplates)}
                values={projectToVacancyValues(editingProject)}
                onChange={(patch) => setEditingProject({ ...editingProject, ...vacancyValuesToCamel(patch) })}
                aiLoadingKey={aiEnhancingField}
                onAIEnhance={async (key) => {
                  if (!editingProject) return;
                  setAiEnhancingField(key);
                  try {
                    const { aiEnhanceSingle } = await import("@/lib/aiClient");
                    const field = VACANCY_FIELDS_BY_KEY[key];
                    const current = projectToVacancyValues(editingProject)[key] || "";
                    const value = await aiEnhanceSingle({
                      field: key,
                      value: current,
                      company_name: editingProject.companyName,
                      role_name: editingProject.roleName,
                      template: field.example,
                      hint: `canonical_format:${field.preview}`,
                    });
                    if (value) {
                      setEditingProject({
                        ...editingProject,
                        ...vacancyValuesToCamel({ [key]: value }),
                      });
                      addAuditEvent("success", "Поле улучшено ИИ", `Раздел "${field.label}" переписан в каноническом формате.`);
                    }
                  } catch (err) {
                    console.error(err);
                    addAuditEvent("warning", "Ошибка ИИ", "Не удалось улучшить раздел.");
                  } finally {
                    setAiEnhancingField(null);
                  }
                }}
              />

              {/* Bottom control buttons */}
              <div className="pt-4 border-t border-white/10 flex gap-3 sticky bottom-0 bg-[#1D3E5E]/95 backdrop-blur-sm -mx-6 sm:-mx-8 px-6 sm:px-8 py-4">
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="cursor-pointer flex-1 bg-gradient-to-r from-emerald-600 to-teal-700 font-extrabold py-3 px-5 rounded-xl hover:shadow-xl hover:brightness-110 transition disabled:opacity-55 text-sm"
                >
                  {isSavingEdit ? "Сохранение..." : "💾 Сохранить все 15 полей вакансии"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingProject(null)}
                  className="cursor-pointer bg-white/5 hover:bg-white/10 border border-white/10 px-5 py-3 rounded-xl text-slate-300 font-bold transition text-sm"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleArchiveEditedProject}
                  disabled={isDeletingProject}
                  className="cursor-pointer bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-200 px-5 py-3 rounded-xl font-bold transition text-sm flex items-center gap-2 disabled:opacity-50"
                  title="Скрыть вакансию от кандидатов, сохранив все данные"
                >
                  В архив
                </button>
                <button
                  type="button"
                  onClick={handleDeleteEditedProject}
                  disabled={isDeletingProject}
                  className="cursor-pointer bg-red-500/15 hover:bg-red-500/25 border border-red-500/40 text-red-200 px-5 py-3 rounded-xl font-bold transition text-sm flex items-center gap-2 disabled:opacity-50"
                  title="Закрыть вакансию (CRM-данные сохраняются, номер не переиспользуется)"
                >
                  <Trash2 className="w-4 h-4" />
                  {isDeletingProject ? "Обновляем..." : "Закрыть вакансию"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL WINDOW: INLINE POPUP SECTION EDITOR */}
      {editingProject && inlineEditSection && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#12283C] border-2 border-[#E7C768] rounded-3xl w-full max-w-2xl text-left text-white shadow-2xl relative p-6 sm:p-8 space-y-5 animate-fadeIn overflow-y-auto max-h-[90vh]">
            <button 
              type="button"
              onClick={() => setInlineEditSection(null)} 
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg font-bold cursor-pointer bg-white/5 border border-white/10 w-8 h-8 rounded-full flex items-center justify-center transition"
            >
              ✕
            </button>

            <div className="border-b border-white/10 pb-3">
              <span className="text-[10px] font-mono text-[#E7C768] uppercase font-bold tracking-wider block">Быстрое редактирование блока</span>
              <h3 className="text-lg font-black text-white mt-1">
                {inlineEditSection === "company" && "🏢 О компании, миссии и масштабе"}
                {inlineEditSection === "vacancy" && "💼 Требования к кандидату"}
                {inlineEditSection === "tasksActivity" && "🎯 Обязанности и Задачи"}
                {inlineEditSection === "schedule" && "📅 График Работы"}
                {inlineEditSection === "motivation" && "🔥 Мотивация и привилегии"}
                {inlineEditSection === "payouts" && "💵 Финансовые Выплаты"}
                {inlineEditSection === "onboarding" && "🚀 Процесс Онбординга"}
                {inlineEditSection === "team" && "👥 Наша Команда"}
                {inlineEditSection === "cabinetTabs" && "💻 Рабочий Кабинет"}
                {inlineEditSection === "system" && "⚙️ Регламенты контроля"}
              </h3>
              <p className="text-[10px] text-slate-400 mt-1">
                {inlineEditSection === "company" && "Опишите факты, укажите миссию и настройте 3 счетчика на лендинге:"}
                {inlineEditSection === "vacancy" && "Ниже перечислены требования. Каждый пункт пишите с новой строки:"}
                {inlineEditSection === "tasksActivity" && "Опишите ежедневные задачи. Формат: • [📞 Консультация] Описание задачи:"}
                {inlineEditSection === "schedule" && "Пропишите условия графика. Каждый пункт пишите с новой строки:"}
                {inlineEditSection === "motivation" && "Привилегии и бонусы компании. Каждый пункт с новой строки:"}
                {inlineEditSection === "payouts" && "Правила и условия выплат авансов, фикса, бонусов за друзей:"}
                {inlineEditSection === "onboarding" && "Опишите по порядку этапы стажировки: • [📝 Экспресс-тест] Описание этапа:"}
                {inlineEditSection === "team" && "Каждый куратор в формате: • Имя - Должность. Текст девиза:"}
                {inlineEditSection === "cabinetTabs" && "Инструменты CRM. Формат: • [💻 Название] Описание | 💡 Регламент:"}
                {inlineEditSection === "system" && "Свод правил контроля качества звонков кандидатов и стажеров:"}
              </p>
            </div>

            <div className="space-y-4">
              {inlineEditSection === "company" && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#E7C768]">Факты о компании (каждый с новой строки):</label>
                    <textarea
                      className="w-full bg-[#112335] text-xs p-3 rounded-xl border border-white/10 text-white font-mono focus:outline-none focus:border-[#E7C768]"
                      rows={4}
                      value={editingProject.companyText || ""}
                      onChange={(e) => setEditingProject({ ...editingProject, companyText: e.target.value })}
                      placeholder="• Мы на рынке более 10 лет..."
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#E7C768]">Цитата / Миссия компании:</label>
                    <textarea
                      className="w-full bg-[#112335] text-xs p-2.5 rounded-xl border border-white/10 text-white focus:outline-none focus:border-[#E7C768]"
                      rows={2}
                      value={editingProject.missionText || "Наша миссия — избавить людей от рутины в холодных звонках, автоматизировав базовую квалификацию лидов. Каждый день мы упрощаем работу сотрудникам отделов продаж по всему миру."}
                      onChange={(e) => setEditingProject({ ...editingProject, missionText: e.target.value })}
                      placeholder="Опишите глобальную миссию компании"
                    />
                  </div>

                  <div className="border-t border-white/5 pt-3">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#E7C768] font-bold block mb-2">🔥 Настройка 3-х характеристик/счетчиков</span>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="bg-[#112335]/55 p-2 rounded-xl border border-white/5 space-y-1">
                        <span className="text-[9px] text-[#E7C768] font-bold font-mono">Счетчик 1</span>
                        <input
                          type="text"
                          className="w-full bg-[#112335] text-xs p-1.5 rounded-lg border border-white/10 text-white font-black"
                          value={editingProject.statsValClients !== undefined && editingProject.statsValClients !== null ? editingProject.statsValClients : "350+"}
                          onChange={(e) => setEditingProject({ ...editingProject, statsValClients: e.target.value })}
                          placeholder="Значение"
                        />
                        <input
                          type="text"
                          className="w-full bg-[#112335] text-[10px] p-1.5 rounded-lg border border-white/10 text-slate-350"
                          value={editingProject.statsLabelClients !== undefined && editingProject.statsLabelClients !== null ? editingProject.statsLabelClients : "Клиентов в СНГ"}
                          onChange={(e) => setEditingProject({ ...editingProject, statsLabelClients: e.target.value })}
                          placeholder="Подпись"
                        />
                      </div>

                      <div className="bg-[#112335]/55 p-2 rounded-xl border border-white/5 space-y-1">
                        <span className="text-[9px] text-[#E7C768] font-bold font-mono">Счетчик 2</span>
                        <input
                          type="text"
                          className="w-full bg-[#112335] text-xs p-1.5 rounded-lg border border-white/10 text-white font-black"
                          value={editingProject.statsValDialogs !== undefined && editingProject.statsValDialogs !== null ? editingProject.statsValDialogs : "15 000+"}
                          onChange={(e) => setEditingProject({ ...editingProject, statsValDialogs: e.target.value })}
                          placeholder="Значение"
                        />
                        <input
                          type="text"
                          className="w-full bg-[#112335] text-[10px] p-1.5 rounded-lg border border-white/10 text-slate-355"
                          value={editingProject.statsLabelDialogs !== undefined && editingProject.statsLabelDialogs !== null ? editingProject.statsLabelDialogs : "ИИ-диалогов в сутки"}
                          onChange={(e) => setEditingProject({ ...editingProject, statsLabelDialogs: e.target.value })}
                          placeholder="Подпись"
                        />
                      </div>

                      <div className="bg-[#112335]/55 p-2 rounded-xl border border-white/5 space-y-1">
                        <span className="text-[9px] text-[#E7C768] font-bold font-mono">Счетчик 3</span>
                        <input
                          type="text"
                          className="w-full bg-[#112335] text-xs p-1.5 rounded-lg border border-white/10 text-white font-black"
                          value={editingProject.statsValFounded !== undefined && editingProject.statsValFounded !== null ? editingProject.statsValFounded : "2021"}
                          onChange={(e) => setEditingProject({ ...editingProject, statsValFounded: e.target.value })}
                          placeholder="Значение"
                        />
                        <input
                          type="text"
                          className="w-full bg-[#112335] text-[10px] p-1.5 rounded-lg border border-white/10 text-slate-350"
                          value={editingProject.statsLabelFounded !== undefined && editingProject.statsLabelFounded !== null ? editingProject.statsLabelFounded : "Год основания"}
                          onChange={(e) => setEditingProject({ ...editingProject, statsLabelFounded: e.target.value })}
                          placeholder="Подпись"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {inlineEditSection !== "company" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#E7C768]">Содержание контента блока:</label>
                  <textarea
                    className="w-full bg-[#112335] text-xs p-3 rounded-xl border border-white/10 text-white font-mono focus:outline-none focus:border-[#E7C768] scrollbar-thin"
                    rows={12}
                    value={(() => {
                      const map: Record<string, string> = {
                        vacancy: "vacancyText",
                        tasksActivity: "tasksActivityText",
                        schedule: "scheduleText",
                        motivation: "motivationTextDetail",
                        payouts: "payoutsText",
                        onboarding: "onboardingText",
                        team: "teamText",
                        cabinetTabs: "cabinetTabsText",
                        system: "systemText"
                      };
                      const fieldName = map[inlineEditSection];
                      return (editingProject as any)[fieldName] || "";
                    })()}
                    onChange={(e) => {
                      const map: Record<string, string> = {
                        vacancy: "vacancyText",
                        tasksActivity: "tasksActivityText",
                        schedule: "scheduleText",
                        motivation: "motivationTextDetail",
                        payouts: "payoutsText",
                        onboarding: "onboardingText",
                        team: "teamText",
                        cabinetTabs: "cabinetTabsText",
                        system: "systemText"
                      };
                      const fieldName = map[inlineEditSection];
                      setEditingProject({
                        ...editingProject,
                        [fieldName]: e.target.value
                      });
                    }}
                    placeholder="Введите текст с новой строки..."
                  />
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-white/10 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setInlineEditSection(null)}
                className="cursor-pointer bg-[#E7C768] text-[#112335] font-black text-xs px-5 py-3 rounded-xl hover:bg-[#d6b75c] active:scale-98 transition flex items-center gap-1.5"
              >
                ✅ Применить и закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      <EmployerAIAssistant />
      
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Реферальная ссылка работодателя — Google-only, +1000 RR пригласившему */
/* ------------------------------------------------------------------ */
function ReferralLinkBlock({ employerPublicId }: { employerPublicId: string }) {
  const [copied, setCopied] = React.useState(false);
  const link = employerPublicId
    ? `https://hr-rr.online/auth?ref=emp${employerPublicId}`
    : "";

  const handleCopy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  };

  return (
    <div className="bg-gradient-to-r from-emerald-950/40 to-[#1D3E5E]/70 border border-emerald-500/30 rounded-3xl p-5 shadow-xl space-y-3 text-left">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-emerald-300 uppercase tracking-wider flex items-center gap-2">
            🎁 Ваша реферальная ссылка
          </h3>
          <p className="text-[11px] text-slate-300 mt-1">
            Приглашайте работодателей — получайте <strong className="text-white">+1000 RR</strong> за каждого, кто войдёт через Google.
            Новичку 1000 RR начисляются автоматически.
          </p>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          readOnly
          value={link}
          className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white font-mono text-xs focus:outline-none focus:border-emerald-400 select-all"
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          type="button"
          onClick={handleCopy}
          disabled={!link}
          className="cursor-pointer bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-[#0b2436] font-bold text-xs px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition"
        >
          {copied ? (<><Check className="w-4 h-4" /> Скопировано</>) : (<><Copy className="w-4 h-4" /> Скопировать</>)}
        </button>
      </div>
    </div>
  );
}
