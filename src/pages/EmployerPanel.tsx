/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { useRouter } from "../components/RouterContext";
import Mascot from "../components/Mascot";
import EmployerAIAssistant from "../components/EmployerAIAssistant";
import HiringCalculator from "../components/HiringCalculator";
import { JobProject, Candidate, BASIC_SPECIALTIES } from "../types";
import { supabase } from "@/integrations/supabase/client";
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
  ChevronRight
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

export default function EmployerPanel() {
  const { path, navigate } = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Derive active tab from subroute PATH
  let activeTab: "crm" | "vacancies" | "companies" | "tariff" | "profile" | "events" = "crm";
  if (path.includes("/vacancies")) {
    activeTab = "vacancies";
  } else if (path.includes("/companies")) {
    activeTab = "companies";
  } else if (path.includes("/tariff") || path.includes("/billing") || path.includes("/invoice") || path.includes("/payment") || path.includes("/accounts")) {
    activeTab = "tariff";
  } else if (path.includes("/profile")) {
    activeTab = "profile";
  } else if (path.includes("/events")) {
    activeTab = "events";
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
  const [setupLogoUrl, setSetupLogoUrl] = useState("https://i.ibb.co/WWRbtPq0/RR-Logo.png");
  const [specialtySearch, setSpecialtySearch] = useState("");
  const [showAddNewVacancy, setShowAddNewVacancy] = useState(false);

  // Profile States
  const [adminTgId, setAdminTgId] = useState(() => localStorage.getItem("employer_tg_id") || "59384591");
  const [profileName, setProfileName] = useState("Сергей Ковалев");
  const [profileTitle, setProfileTitle] = useState("Директор по персоналу");
  const [profileEmail, setProfileEmail] = useState("hr-director@company.ru");
  const [profilePhone, setProfilePhone] = useState("+7 (926) 012-34-56");
  const [isProfileSaved, setIsProfileSaved] = useState(false);

  // High-fidelity Google and Telegram profile states
  const [googleName, setGoogleName] = useState("Сергей Ковалев");
  const [googleEmail, setGoogleEmail] = useState("hr-director@company.ru");
  const [googlePhoto, setGooglePhoto] = useState("https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80");
  const [googleId, setGoogleId] = useState("g-1094857293049182743");
  const [googleVerified, setGoogleVerified] = useState(true);

  const [telegramIdState, setTelegramIdState] = useState("59384591");
  const [telegramPhoto, setTelegramPhoto] = useState("https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=facearea&facepad=2.2&w=256&h=256&q=80");
  const [telegramFirstName, setTelegramFirstName] = useState("Сергей");
  const [telegramLastName, setTelegramLastName] = useState("Ковалев");
  const [telegramUsernameState, setTelegramUsernameState] = useState("cowal_sales");
  const [telegramPhone, setTelegramPhone] = useState<string>("");
  const [isRequestingPhone, setIsRequestingPhone] = useState(false);
  const [referralStats, setReferralStats] = useState<{ count: number; rr: number }>({ count: 0, rr: 0 });

  // Billing & Tariff States
  const [employerId, setEmployerId] = useState<string>(
    () => localStorage.getItem("employer_session_id") || "",
  );

  const [balance, setBalance] = useState<number>(1000);
  const [limits, setLimits] = useState({
    interviews: 2,
    trainings: 2,
    landings: 1,
    interviewSystems: 1,
    trainingSystems: 1
  });

  const [topupAmountRub, setTopupAmountRub] = useState<number>(100);
  const [purchaseError, setPurchaseError] = useState<string>("");
  const [isBuying, setIsBuying] = useState<string | null>(null);
  const [isToppingUp, setIsToppingUp] = useState(false);

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
  const [newCompanyStaff, setNewCompanyStaff] = useState("10-50 человек");
  const [newCompanyDesc, setNewCompanyDesc] = useState("");
  const [newCompanySite, setNewCompanySite] = useState("");
  const [newCompanyLogo, setNewCompanyLogo] = useState("");
  const [newCompanyFiles, setNewCompanyFiles] = useState("");
  const [isParsingFile, setIsParsingFile] = useState(false);

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
      const res = await fetch("/api/enhance-single-field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fieldName,
          fieldVal: currentVal,
          context: {
            name: newCompanyName,
            industry: newCompanyIndustry,
            staff: newCompanyStaff,
            description: newCompanyDesc,
            site: newCompanySite,
            missionText: newCompanyMissionText,
          }
        })
      });
      if (res.ok) {
        const data = await res.json();
        const newVal = data.value;
        if (fieldName === "name") setNewCompanyName(newVal);
        else if (fieldName === "industry") setNewCompanyIndustry(newVal);
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

        addAuditEvent("success", "ИИ Улучшение поля", `Поле успешно улучшено ИИ!`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setEnhancingFields(prev => ({ ...prev, [fieldName]: false }));
    }
  };

  const handleEnhanceAllFields = async () => {
    setIsEnhancingAll(true);
    addAuditEvent("info", "ИИ Настройка", "ИИ-аналитик RR комплексно оформляет ваш бренд...");
    try {
      const res = await fetch("/api/enhance-all-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCompanyName,
          industry: newCompanyIndustry,
          staff: newCompanyStaff,
          description: newCompanyDesc,
          sites: newCompanySite,
          logoUrl: newCompanyLogo,
          files: newCompanyFiles,
          missionText: newCompanyMissionText,
          customWiki: newCompanyCustomWiki,
          salaryTerms: newCompanySalaryTerms,
          scheduleTerms: newCompanyScheduleTerms,
          statsValClients: newCompanyStatsValClients,
          statsLabelClients: newCompanyStatsLabelClients,
          statsValDialogs: newCompanyStatsValDialogs,
          statsLabelDialogs: newCompanyStatsLabelDialogs,
          statsValFounded: newCompanyStatsValFounded,
          statsLabelFounded: newCompanyStatsLabelFounded
        })
      });
      if (res.ok) {
        const enriched = await res.json();
        if (enriched.name) setNewCompanyName(enriched.name);
        if (enriched.industry) setNewCompanyIndustry(enriched.industry);
        if (enriched.staff) setNewCompanyStaff(enriched.staff);
        if (enriched.description) setNewCompanyDesc(enriched.description);
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
    } finally {
      setIsEnhancingAll(false);
    }
  };

  const parseCompanyFileWithAI = async (filename: string) => {
    setIsParsingFile(true);
    addAuditEvent("info", "ИИ разбор регламента", `ИИ-Копирайтер ProTalk считывает и структурирует файл: ${filename}...`);
    try {
      const res = await fetch("/api/parse-company-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: filename })
      });
      if (res.ok) {
        const payload = await res.json();
        if (payload.name) setNewCompanyName(payload.name);
        if (payload.industry) setNewCompanyIndustry(payload.industry);
        if (payload.staff) setNewCompanyStaff(payload.staff);
        if (payload.description) setNewCompanyDesc(payload.description);
        if (payload.sites) setNewCompanySite(payload.sites);
        if (payload.logoUrl) setNewCompanyLogo(payload.logoUrl);
        if (payload.missionText) setNewCompanyMissionText(payload.missionText);
        if (payload.customWiki) setNewCompanyCustomWiki(payload.customWiki);
        if (payload.salaryTerms) setNewCompanySalaryTerms(payload.salaryTerms);
        if (payload.scheduleTerms) setNewCompanyScheduleTerms(payload.scheduleTerms);
        if (payload.statsValClients) setNewCompanyStatsValClients(payload.statsValClients);
        if (payload.statsLabelClients) setNewCompanyStatsLabelClients(payload.statsLabelClients);
        if (payload.statsValDialogs) setNewCompanyStatsValDialogs(payload.statsValDialogs);
        if (payload.statsLabelDialogs) setNewCompanyStatsLabelDialogs(payload.statsLabelDialogs);
        if (payload.statsValFounded) setNewCompanyStatsValFounded(payload.statsValFounded);
        if (payload.statsLabelFounded) setNewCompanyStatsLabelFounded(payload.statsLabelFounded);

        addAuditEvent("success", "ИИ разбор завершен", `Корпоративный профиль автоматически предзаполнен из документа ${filename}!`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsParsingFile(false);
    }
  };

  // Project (Vacancy) edit state
  const [editingProject, setEditingProject] = useState<JobProject | null>(null);
  const [editorSubTab, setEditorSubTab] = useState<string>("company");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [inlineEditSection, setInlineEditSection] = useState<string | null>(null);
  
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
      const res = await fetch("/api/companies").catch(() => null as any);
      if (res && res.ok) {
        setCompaniesList(await res.json());
        return;
      }
      // Supabase fallback — list companies owned by this employer (by public_id)
      const { supabase } = await import("@/integrations/supabase/client");
      let data: any[] = [];
      if (employerId) {
        const { data: emp } = await supabase
          .from("employers")
          .select("id")
          .eq("public_id", employerId)
          .maybeSingle();
        if (emp?.id) {
          const r = await supabase.from("companies").select("*").eq("owner_employer_id", emp.id);
          data = (r.data as any[]) || [];
        }
      } else {
        const r = await supabase.from("companies").select("*");
        data = (r.data as any[]) || [];
      }
      setCompaniesList(
        (data || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          logoUrl: c.logo_url,
          missionText: c.mission_text,
          description: c.about_text,
          industry: "—",
          staff: "—",
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
      const res = await fetch(`/api/employers/${employerId}`).catch(() => null as any);
      if (res && res.ok) {
        const data = await res.json();
        setBalance(data.balance || 0);
        if (data.limits) {
          setLimits(data.limits);
        }
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

      const res = await fetch(`/api/employers/${employerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
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

      const resProjects = await fetch("/api/projects").catch(() => null as any);
      if (resProjects && resProjects.ok) {
        setProjects(await resProjects.json());
      } else {
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
          })) as any,
        );
      }

      const resCand = await fetch("/api/candidates").catch(() => null as any);
      if (resCand && resCand.ok) {
        setCandidates(await resCand.json());
      } else {
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
            publicId: c.public_id,
            name: c.resume_name || `Кандидат #${c.public_id}`,
            email: "",
            projectId: c.project_id,
            roleName: c.role_name || c.projects?.role_name || "",
            currentStage: c.current_stage,
            createdAt: c.created_at,
            registeredVia: c.registered_via,
          })) as any,
        );
      }

      // Load TG logs from server
      const resTgLogs = await fetch("/api/telegram-logs").catch(() => null as any);
      if (resTgLogs && resTgLogs.ok) setTgMsgLog(await resTgLogs.json());

      // Check Gemini availability
      const resAiStatus = await fetch("/api/ai-status").catch(() => null as any);
      if (resAiStatus && resAiStatus.ok) setAiStatus(await resAiStatus.json());

      // Fetch dynamic full-stack billing profile
      await fetchEmployerData();
      await fetchCompanies();

      // Mirror transactions from backend to payments listing
      const resPayments = await fetch("/api/admin/payments").catch(() => null as any);
      if (resPayments && resPayments.ok) {
        const paymentsData = await resPayments.json();
        const mappedHistory = paymentsData
          .filter((p: any) => p.companyName.includes(employerId) || p.companyName.includes(profileEmail))
          .map((p: any) => ({
            id: p.id,
            date: p.createdAt ? p.createdAt.split("T")[0] : "2026-05-30",
            plan: p.itemName,
            amount: p.itemType.startsWith("purchase_") ? `-${p.amount} RR` : `+${p.amount} RR`,
            status: "Успешно",
            method: p.itemType === "topup" ? "Карта/Калькулятор" : p.itemType === "referral_reward" ? "Реферал" : "Баланс RR"
          }));
        setPaymentHistory(mappedHistory);
      }
    } catch (err) {
      console.error("Error loading server data:", err);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
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
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
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

  // Action: Buy Service Limits via Balance RR
  const handlePurchaseItem = async (itemType: "interview" | "training" | "landing" | "system_interview" | "system_training") => {
    setPurchaseError("");
    setIsBuying(itemType);
    try {
      const res = await fetch(`/api/employers/${employerId}/purchase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemType })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Ошибка при списании баланса.");
      }
      setBalance(data.balance);
      if (data.limits) setLimits(data.limits);
      addAuditEvent("success", "Услуга приобретена", `Успешно куплено: ${itemType}`);
      fetchData();
    } catch (err: any) {
      setPurchaseError(err.message);
    } finally {
      setIsBuying(null);
    }
  };

  // Action: Top Up Balance 
  const handleTopupBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (topupAmountRub < 100) {
      alert("Начальный минимальный платеж 100 рублей.");
      return;
    }
    setIsToppingUp(true);
    try {
      const res = await fetch(`/api/employers/${employerId}/topup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountRubles: topupAmountRub })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Не удалось пополнить баланс.");
      }
      setBalance(data.balance);
      addAuditEvent("success", "Баланс пополнен", `Зачислено: +${topupAmountRub} RR`);
      fetchData();
    } catch (err: any) {
      alert(err.message);
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
      const res = await fetch(`/api/candidates/${candId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentStage: newStage })
      });

      if (res.ok) {
        const updated = await res.json();
        setCandidates(prev => prev.map(c => c.id === candId ? updated : c));
        if (selectedCandidate?.id === candId) {
          setSelectedCandidate(updated);
        }
        addAuditEvent("success", "Этап кандидата изменен", `Кандидат продвинут на этап: ${newStage}`);
        fetchData();
      }
    } catch (err) {
      console.error("Error modifying candidate stage:", err);
    }
  };

  // Submit dynamic system generation via server Gemini API
  const handleCreateOnboardingSystem = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    addAuditEvent("info", "Старт ИИ Генерации", `Запуск ИИ-сборки онбординга для вакансии: ${setupRoleName}`);

    const matchedCompany = companiesList.find(c => c.name.toLowerCase() === setupCompanyName.toLowerCase());
    const companySlug = matchedCompany ? matchedCompany.slug : setupCompanyName.toLowerCase()
      .replace(/[^а-яёa-z0-9\s-]/gi, "")
      .trim()
      .replace(/\s+/g, "-");

    try {
      const res = await fetch("/api/generate-project-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: setupCompanyName,
          companySlug,
          employerId,
          roleName: setupRoleName,
          salaryTerms: setupSalary,
          scheduleTerms: setupSchedule,
          customWiki: setupCustomWiki,
          logoUrl: setupLogoUrl
        })
      });

      if (!res.ok) throw new Error("Не удалось создать структуру.");

      const newProjectData = await res.json();
      setProjects(prev => [...prev, newProjectData]);
      
      // Notify Telegram Bot mock
      await fetch("/api/telegram-mock-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: adminTgId,
          message: `🤖 Настроена новая система адаптации Робота Рекрутера!\n🏢 Компания: ${setupCompanyName}\n💼 Должность: ${setupRoleName}`
        })
      });

      // Insert new company into local listing if unique
      if (!companiesList.some(comp => comp.name.toLowerCase() === setupCompanyName.toLowerCase())) {
        setCompaniesList(prev => [
          ...prev,
          { 
            name: setupCompanyName, 
            slug: companySlug,
            industry: "Услуги / Производство", 
            staff: "10-25 человек", 
            description: "Интегрированная новая компания в экосистему адаптации сотрудников.", 
            activeVacancies: 1,
            employerId
          }
        ]);
      }

      addAuditEvent("success", "ИИ-Блок онбординга собран", `Программа лекций, ситуационных вопросов создана для ${setupRoleName}`);
      setShowAddNewVacancy(false);
      navigate(`/emp${employerId}/vacancies`);
      fetchData();
    } catch (err: any) {
      alert("Ошибка при генерации: " + err.message);
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
      const res = await fetch(`/api/projects/${editingProject.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingProject)
      });

      if (!res.ok) throw new Error("Не удалось сохранить изменения вакансии.");

      const updatedProj = await res.json();
      setProjects(prev => prev.map(p => p.id === updatedProj.id ? updatedProj : p));
      addAuditEvent("success", "Вакансия обновлена", `Изменения для вакансии "${updatedProj.roleName}" сохранены успешно.`);
      setEditingProject(null);
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
        await fetch("/api/telegram-mock-send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId: rec.telegramId || adminTgId,
            message: `📣 СООБЩЕНИЕ ОТ РАБОТОДАТЕЛЯ:\n\n${mailingText}\n\n🤖 Пожалуйста, продолжите в панели соискателя!`
          })
        });
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

    // Transliterate to generate slug as requested: "Лендинг будет иметь адрес /ooo-roga-i-kopyta"
    const rus = "абвгдеёжзийклмнопрстуфхцчшщъыьэюя";
    const lat = ["a","b","v","g","d","e","yo","zh","z","i","y","k","l","m","n","o","p","r","s","t","u","f","kh","ts","ch","sh","shch","","y","","e","yu","ya"];
    const slug = newCompanyName.toLowerCase()
      .replace(/[^а-яёa-z0-9\s-]/gi, "")
      .trim()
      .split("")
      .map(char => {
        const idx = rus.indexOf(char);
        return idx > -1 ? lat[idx] : char;
      })
      .join("")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");

    const payload = {
      name: newCompanyName,
      slug,
      industry: newCompanyIndustry || "Производство",
      staff: newCompanyStaff,
      description: newCompanyDesc || "Компания осуществляет подбор перспективных кадров.",
      sites: newCompanySite || "",
      logoUrl: newCompanyLogo || "",
      files: newCompanyFiles || "",
      employerId,
      missionText: newCompanyMissionText,
      customWiki: newCompanyCustomWiki,
      salaryTerms: newCompanySalaryTerms,
      scheduleTerms: newCompanyScheduleTerms,
      statsValClients: newCompanyStatsValClients,
      statsLabelClients: newCompanyStatsLabelClients,
      statsValDialogs: newCompanyStatsValDialogs,
      statsLabelDialogs: newCompanyStatsLabelDialogs,
      statsValFounded: newCompanyStatsValFounded,
      statsLabelFounded: newCompanyStatsLabelFounded
    };

    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const saved = await res.json();
        setCompaniesList(prev => {
          // If already exists, replace it, otherwise append
          const exists = prev.some(c => c.slug === saved.slug);
          if (exists) {
            return prev.map(c => c.slug === saved.slug ? saved : c);
          }
          return [...prev, saved];
        });
        addAuditEvent("success", "Компания зарегистрирована", `Бренд "${newCompanyName}" сохранен со всеми ИИ-сведениями.`);
        
        // Reset inputs
        setNewCompanyName("");
        setNewCompanyDesc("");
        setNewCompanyIndustry("");
        setNewCompanySite("");
        setNewCompanyLogo("");
        setNewCompanyFiles("");
        setNewCompanyMissionText("");
        setNewCompanyCustomWiki("");
        setNewCompanySalaryTerms("");
        setNewCompanyScheduleTerms("");
        setNewCompanyStatsValClients("");
        setNewCompanyStatsLabelClients("");
        setNewCompanyStatsValDialogs("");
        setNewCompanyStatsLabelDialogs("");
        setNewCompanyStatsValFounded("");
        setNewCompanyStatsLabelFounded("");
        setShowAddCompany(false);
      }
    } catch (err) {
      console.error("Failed to add company on server:", err);
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

  // Auto-recognize file for job vacancy conditions using ProTalk LLM
  const handleAutoRecognizeFile = async (filename: string) => {
    setIsParsingFile(true);
    addAuditEvent("info", "Анализ файла вакансии", `Запущен разбор вакансии из файла: ${filename}`);
    
    try {
      const res = await fetch("/api/parse-vacancy-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: filename, companyName: setupCompanyName })
      });
      if (!res.ok) throw new Error("Сервер не смог распарсить файл.");
      const parsed = await res.json();
      
      if (parsed.roleName) setSetupRoleName(parsed.roleName);
      if (parsed.salaryTerms) setSetupSalary(parsed.salaryTerms);
      if (parsed.scheduleTerms) setSetupSchedule(parsed.scheduleTerms);
      if (parsed.customWiki) setSetupCustomWiki(parsed.customWiki);
      if (parsed.logoUrl) setSetupLogoUrl(parsed.logoUrl);
      
      addAuditEvent("success", "Файл вакансии распознан", `ИИ ProTalk успешно выгрузил все условия для "${parsed.roleName || "вакансии"}".`);
    } catch (err: any) {
      console.error(err);
      addAuditEvent("warning", "Ошибка распознавания", "Использованы правила автозаполнения.");
      // Fallback
      setSetupRoleName("Инженер по тестированию (QA)");
      setSetupSalary("95 000 - 130 000 руб");
      setSetupSchedule("Полный день, гибрид в Москве");
      setSetupCustomWiki(`Обязанности сотрудника компании:
- Проведение ручного и автоматизированного тестирования веб-приложений.
- Заведение багов в корпоративную систему таск-трекера.
- Подготовка тестовых сценариев и чек-листов.
- Взаимодействие с командой разработчиков.`);
    } finally {
      setIsParsingFile(false);
    }
  };

  // Cohesive AI format for new vacancy fields
  const handleBeautifyNewVacancyWithAI = async () => {
    setIsGenerating(true);
    addAuditEvent("info", "ИИ-форматирование", "Оформляем все поля новой вакансии с помощью ИИ ProTalk...");
    try {
      const res = await fetch("/api/enhance-all-vacancy-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: setupCompanyName,
          roleName: setupRoleName,
          salaryTerms: setupSalary,
          scheduleTerms: setupSchedule,
          customWiki: setupCustomWiki,
          logoUrl: setupLogoUrl
        })
      });
      if (res.ok) {
        const enhanced = await res.json();
        if (enhanced.roleName) setSetupRoleName(enhanced.roleName);
        if (enhanced.salaryTerms) setSetupSalary(enhanced.salaryTerms);
        if (enhanced.scheduleTerms) setSetupSchedule(enhanced.scheduleTerms);
        if (enhanced.customWiki) setSetupCustomWiki(enhanced.customWiki);
        if (enhanced.logoUrl) setSetupLogoUrl(enhanced.logoUrl);
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
      const res = await fetch("/api/enhance-single-field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fieldName,
          fieldVal: currentVal,
          context: {
            companyName: editingProject.companyName,
            roleName: editingProject.roleName
          }
        })
      });
      if (res.ok) {
        const data = await res.json();
        setEditingProject({
          ...editingProject,
          [fieldName]: data.value
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
      const res = await fetch("/api/enhance-all-vacancy-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingProject)
      });
      if (res.ok) {
        const enhanced = await res.json();
        setEditingProject({
          ...editingProject,
          ...enhanced
        });
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
      const res = await fetch("/api/parse-training-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: filename,
          companyName: editingProject.companyName,
          roleName: editingProject.roleName
        })
      });
      if (res.ok) {
        const parsed = await res.json();
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
      const res = await fetch("/api/enhance-single-field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fieldName,
          fieldVal: currentVal,
          context: {
            companyName: editingProject.companyName,
            roleName: editingProject.roleName,
            purpose: "training_onboarding_evaluation"
          }
        })
      });
      if (res.ok) {
        const data = await res.json();
        setEditingProject({
          ...editingProject,
          [fieldName]: fieldName === "checklistQuestions" || fieldName === "roleplayQuestions"
            ? (typeof data.value === "string" ? data.value.split("\n").filter(Boolean) : data.value)
            : data.value
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
            <img 
              src="https://i.ibb.co/WWRbtPq0/RR-Logo.png" 
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

          <nav className="hidden md:flex items-center justify-center gap-2 md:gap-4 text-xs md:text-sm font-semibold">
            <button onClick={() => navigate("/main")} className="transition px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10">
              Главная
            </button>
            <button onClick={() => navigate("/vacancy")} className="transition px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10">
              Каталог Профессий
            </button>
            <button onClick={() => navigate("/employer/crm")} className="transition px-3 py-2 rounded-xl text-[#E7C768] bg-white/10 border border-[#E7C768]/20">
              Панель Работодателя 💼
            </button>
            <button onClick={() => navigate("/candidate")} className="transition px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 bg-white/5 border border-white/10">
              Кабинет Соискателя 🎓
            </button>
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <div className="text-right">
              <span className="text-xs block text-[#E7C768] font-bold">{profileName}</span>
              <span className="text-[10px] block text-slate-300 font-mono">{profileEmail}</span>
            </div>
            <button onClick={handleLogout} className="cursor-pointer bg-white/10 hover:bg-white/20 text-white rounded-xl px-3 py-2 text-xs font-bold transition flex items-center gap-1 border border-white/10">
              <LogOut className="w-3.5 h-3.5" /> Выйти
            </button>
          </div>

          <button className="md:hidden flex items-center justify-center p-2 rounded-xl hover:bg-white/10 text-white transition-all" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X className="w-6 h-6 text-[#E7C768]" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-4 pt-4 border-t border-white/10 flex flex-col gap-3 font-semibold">
            <button onClick={() => { navigate("/main"); setMobileMenuOpen(false); }} className="transition text-left w-full px-4 py-3 rounded-xl text-slate-300 hover:text-white hover:bg-white/5">Главная</button>
            <button onClick={() => { navigate("/vacancy"); setMobileMenuOpen(false); }} className="transition text-left w-full px-4 py-3 rounded-xl text-slate-300 hover:text-white hover:bg-white/5">Каталог Профессий</button>
            <button onClick={() => { navigate("/employer/crm"); setMobileMenuOpen(false); }} className="transition text-left w-full px-4 py-3 rounded-xl text-[#E7C768] bg-white/10">Панель Работодателя</button>
            <button onClick={() => { navigate("/candidate"); setMobileMenuOpen(false); }} className="transition text-left w-full px-4 py-3 rounded-xl text-slate-300 hover:text-white hover:bg-white/5">Кабинет Соискателя</button>
            <button onClick={() => { handleLogout(); setMobileMenuOpen(false); }} className="transition text-left w-full px-4 py-3 rounded-xl text-red-300 hover:bg-red-950/25">Выйти из кабинета</button>
          </div>
        )}
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
                onClick={() => { navigate(`/emp${employerId}/crm`); setCrmViewMode("kanban"); }}
                className={`w-full text-left font-bold text-xs px-4 py-2.5 rounded-xl flex items-center justify-between transition-all ${activeTab === "crm" ? "bg-[#1E4468] text-[#E7C768] border border-[#E7C768]/60 shadow" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}
              >
                <span className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#D99E41]" /> 4. CRM & Воронка
                </span>
                <span className="bg-amber-900/40 text-[10px] text-[#E7C768] px-1.5 py-0.5 rounded font-mono">{candidates.length}</span>
              </button>

              <button
                onClick={() => navigate(`/emp${employerId}/tariff`)}
                className={`w-full text-left font-bold text-xs px-4 py-2.5 rounded-xl flex items-center justify-between transition-all ${activeTab === "tariff" ? "bg-[#1E4468] text-[#E7C768] border border-[#E7C768]/60 shadow" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}
              >
                <span className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-[#D99E41]" /> 5. Тариф & Счета
                </span>
                <span className="bg-emerald-950 text-[10px] text-[#E7C768] font-bold uppercase px-1.5 py-0.5 rounded font-mono">{balance} RR</span>
              </button>

              <button
                onClick={() => navigate(`/emp${employerId}/events`)}
                className={`w-full text-left font-bold text-xs px-4 py-2.5 rounded-xl flex items-center justify-between transition-all ${activeTab === "events" ? "bg-[#1E4468] text-[#E7C768] border border-[#E7C768]/60 shadow" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}
              >
                <span className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#D99E41]" /> 6. События & Логи
                </span>
              </button>
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
            <span className="text-[#E7C768] font-bold block uppercase tracking-wider font-mono text-[9px]">Текущие ИИ-Лимиты</span>
            <div className="space-y-1.5">
              <div className="text-[11px] flex justify-between border-b border-white/5 pb-1 mb-1">
                <span className="text-slate-300 font-bold">Баланс RR:</span>
                <span className="font-mono text-[#E7C768] font-black">{balance} RR</span>
              </div>
              <div className="text-[11px] flex justify-between">
                <span className="text-slate-305">ИИ-Интервью:</span>
                <span className="font-mono text-white font-bold">{limits.interviews} шт</span>
              </div>
              <div className="text-[11px] flex justify-between">
                <span className="text-slate-305">ИИ-Обучение:</span>
                <span className="font-mono text-white font-bold">{limits.trainings} шт</span>
              </div>
              <div className="text-[11px] flex justify-between">
                <span className="text-slate-305">ИИ-Лендинги:</span>
                <span className="font-mono text-white font-bold">{limits.landings} шт</span>
              </div>
              <div className="text-[11px] flex justify-between">
                <span className="text-slate-305">Систем интервью:</span>
                <span className="font-mono text-white font-bold">{limits.interviewSystems} шт</span>
              </div>
              <div className="text-[11px] flex justify-between">
                <span className="text-slate-305">Систем Обучения:</span>
                <span className="font-mono text-white font-bold">{limits.trainingSystems} шт</span>
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
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {[
                    { stage: "terms", title: "1. Ознакомление", bg: "bg-blue-650/40 border-blue-500/20" },
                    { stage: "interview", title: "2. Собеседование (ИИ)", bg: "bg-amber-650/40 border-amber-500/20" },
                    { stage: "training", title: "3. Обучение Wiki", bg: "bg-sky-650/40 border-sky-500/20" },
                    { stage: "certified", title: "4. Сдал & Обучен 🎓", bg: "bg-emerald-650/40 border-emerald-500/20" }
                  ].map(column => {
                    const colCandidates = filteredCandidates.filter(c => {
                      if (column.stage === "interview") {
                        return c.currentStage === "interview" || c.currentStage === "scoring";
                      }
                      return c.currentStage === column.stage;
                    });

                    return (
                      <div 
                        key={column.stage} 
                        className={`bg-[#1D3E5E]/40 border border-white/5 rounded-2xl p-3 space-y-3 min-h-[350px] shadow`}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          // Drag & drop triggers action
                          const draggedId = localStorage.getItem("dragged_candidate_id");
                          if (draggedId) {
                            handleUpdateCandidateStage(draggedId, column.stage as any);
                            localStorage.removeItem("dragged_candidate_id");
                          }
                        }}
                      >
                        <div className="flex items-center justify-between border-b border-white/5 pb-2 text-xs font-bold text-slate-300">
                          <span>{column.title}</span>
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
                                className="bg-[#17344F]/85 border border-white/10 hover:border-[#E7C768] p-3 rounded-xl transition cursor-grab shadow-sm active:cursor-grabbing space-y-2"
                              >
                                <div className="text-xs font-bold text-[#E7C768] hover:underline" onClick={() => setSelectedCandidate(cand)}>
                                  {cand.name}
                                </div>
                                <div className="text-[10px] text-slate-300 line-clamp-1">{cand.roleName}</div>

                                {/* Dynamic Score Indicator if interview has elements */}
                                {cand.scores && (
                                  <div className="flex justify-between items-center text-[10px] bg-black/40 p-1.5 rounded border border-white/5 font-mono">
                                    <span className="text-slate-400">Балл ИИ:</span>
                                    <span className="text-[#E7C768] font-bold">
                                      {Math.round(((cand.scores.resumeScore || 70) + (cand.scores.checklistScore || 80) + (cand.scores.situationsScore || 75)) / 3)}/100
                                    </span>
                                  </div>
                                )}

                                {/* Interactive Stage Promotional arrows */}
                                <div className="flex justify-between gap-1 pt-1 border-t border-white/5">
                                  <button
                                    disabled={cand.currentStage === "terms"}
                                    onClick={() => {
                                      const prevStageMap: Record<string, any> = { "interview": "terms", "scoring": "interview", "training": "interview", "certified": "training" };
                                      handleUpdateCandidateStage(cand.id, prevStageMap[cand.currentStage] || "terms");
                                    }}
                                    className="cursor-pointer bg-white/5 hover:bg-white/15 px-1 py-0.5 rounded text-[9px] text-gray-300 font-bold disabled:opacity-30"
                                    title="На уровень назад"
                                  >
                                    ◀
                                  </button>
                                  <button
                                    onClick={() => setSelectedCandidate(cand)}
                                    className="cursor-pointer text-[10px] text-sky-300 hover:text-white font-bold"
                                  >
                                    Инфо
                                  </button>
                                  <button
                                    disabled={cand.currentStage === "certified"}
                                    onClick={() => {
                                      const nextStageMap: Record<string, any> = { "terms": "interview", "interview": "training", "scoring": "training", "training": "certified" };
                                      handleUpdateCandidateStage(cand.id, nextStageMap[cand.currentStage] || "certified");
                                    }}
                                    className="cursor-pointer bg-gradient-to-r from-emerald-600 to-teal-700 hover:shadow py-0.5 px-2 rounded text-[9px] text-white font-black"
                                    title="Продвинуть кандидата вперед"
                                  >
                                    ▶
                                  </button>
                                </div>
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
                                <td className="p-4 font-bold text-white">
                                  <div>{cand.name}</div>
                                  <div className="text-[10px] text-slate-400 font-normal">{cand.email}</div>
                                </td>
                                <td className="p-4">{cand.roleName}</td>
                                <td className="p-4">
                                  <select 
                                    className="bg-black/40 text-xs rounded border border-white/10 px-2 py-1 text-[#E7C768]"
                                    value={cand.currentStage}
                                    onChange={(e) => handleUpdateCandidateStage(cand.id, e.target.value as any)}
                                  >
                                    <option value="terms" className="bg-slate-900">Ознакомление</option>
                                    <option value="interview" className="bg-slate-900">ИИ Интервью</option>
                                    <option value="training" className="bg-slate-900">Обучение</option>
                                    <option value="certified" className="bg-slate-900">Обучен 🎓</option>
                                  </select>
                                </td>
                                <td className="p-4 text-center font-mono font-bold text-sky-300">{rScore}/100</td>
                                <td className="p-4 text-center font-mono font-bold text-sky-300">{cScore}/100</td>
                                <td className="p-4 text-center font-mono font-bold text-sky-300">{sScore}/100</td>
                                <td className="p-4 text-center">
                                  <span className="bg-[#E7C768]/15 text-[#E7C768] font-bold font-mono px-2 py-1 rounded border border-[#E7C768]/20">{avg}</span>
                                </td>
                                <td className="p-4 text-right">
                                  <button onClick={() => setSelectedCandidate(cand)} className="cursor-pointer text-sky-300 hover:underline font-bold text-[11px]">Карточка ИИ</button>
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
                  onClick={() => setShowAddNewVacancy(!showAddNewVacancy)}
                  className="cursor-pointer bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] hover:scale-102 text-white font-bold text-xs py-2 px-4 rounded-xl flex items-center gap-1 shadow transition-all"
                >
                  <Plus className="w-4 h-4" /> Добавить вакансию
                </button>
              </div>

              {/* DYNAMIC VACANCY CREATOR FROM FORM OR DIRECT IMPORT */}
              {showAddNewVacancy && (
                <div className="bg-[#1D3E5E]/95 border border-[#E7C768]/60 p-6 rounded-3xl space-y-6 shadow-2xl animate-fadeIn">
                  <div className="flex justify-between items-center border-b border-white/10 pb-2">
                    <span className="text-xs font-bold text-[#E7C768] uppercase font-mono tracking-wider block">Конструктор вакансии с поддержкой Gemini API</span>
                    <button onClick={() => setShowAddNewVacancy(false)} className="text-slate-400 hover:text-white">✕ Close</button>
                  </div>

                  {/* File intelligent import block */}
                  <div className="bg-black/25 p-4 rounded-3xl border border-white/10 space-y-3">
                    <span className="text-xs font-bold text-[#E7C768] block">Распознавание условий вакансии из файла</span>
                    <p className="text-[10.5px] text-slate-300">Перетащите сюда документ с традиционным описанием вакансии (PDF, DOC/DOCX, TXT) или нажмите для выбора — ИИ автоматически выкачает условия и обязанности.</p>
                    
                    <div 
                      onClick={() => {
                        const fInput = document.getElementById("vac-file-import") as HTMLInputElement;
                        if (fInput) fInput.click();
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                          handleAutoRecognizeFile(e.dataTransfer.files[0].name);
                        }
                      }}
                      className="cursor-pointer border-2 border-dashed border-[#E7C768]/30 bg-[#1D3E5E]/40 hover:bg-[#1D3E5E]/70 rounded-2xl p-4 text-center space-y-1 transition text-white"
                    >
                      <input 
                        id="vac-file-import" 
                        type="file" 
                        className="hidden" 
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleAutoRecognizeFile(e.target.files[0].name);
                          }
                        }}
                      />
                      {isParsingFile ? (
                        <div className="flex flex-col items-center justify-center gap-1 text-[#E7C768] font-bold text-xs py-2">
                          <RefreshCw className="w-5 h-5 animate-spin" />
                          <span>ИИ распознает файлы... Выделение условий работы...</span>
                        </div>
                      ) : (
                        <div className="text-xs font-semibold text-slate-300">
                          Кликните или перетащите файл с описанием вакансии 📂
                        </div>
                      )}
                      <span className="text-[9.5px] text-slate-400 block font-mono">Поддерживаются .pdf, .docx, .txt файлы</span>
                    </div>
                  </div>

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
                        const allSpecialtiesCombined = Array.from(new Set([...existingSpecialties, ...BASIC_SPECIALTIES]));
                        const filteredSpec = allSpecialtiesCombined.filter(s => s.toLowerCase().includes(specialtySearch.toLowerCase()));
                        const hasExactMatch = allSpecialtiesCombined.some(s => s.toLowerCase() === specialtySearch.trim().toLowerCase());
                        
                        return (
                          <div className="space-y-2 mt-1">
                            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-1">
                              {filteredSpec.slice(0, 12).map(spec => (
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
                                  onClick={() => {
                                    setSetupRoleName(specialtySearch.trim());
                                    setSpecialtySearch("");
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-slate-200 block mb-1">Условия оплаты:</label>
                        <input
                          type="text"
                          className="w-full bg-[#17344F]/60 text-xs p-2.5 rounded-xl border border-white/10 focus:outline-[#E7C768]"
                          value={setupSalary}
                          onChange={(e) => setSetupSalary(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-200 block mb-1">График работы:</label>
                        <input
                          type="text"
                          className="w-full bg-[#17344F]/60 text-xs p-2.5 rounded-xl border border-white/10 focus:outline-[#E7C768]"
                          value={setupSchedule}
                          onChange={(e) => setSetupSchedule(e.target.value)}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-200 block mb-1">Регламенты и база Wiki для обучения кандидата:</label>
                      <textarea
                        rows={3}
                        className="w-full bg-[#17344F]/60 text-xs p-2.5 rounded-xl border border-white/10 focus:outline-[#E7C768]"
                        value={setupCustomWiki}
                        onChange={(e) => setSetupCustomWiki(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-200 block mb-1">Картинка логотипа вакансии (ссылка или файл):</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          className="flex-1 bg-[#17344F]/60 text-xs p-2.5 rounded-xl border border-white/10 focus:outline-[#E7C768]"
                          value={setupLogoUrl}
                          onChange={(e) => setSetupLogoUrl(e.target.value)}
                          placeholder="https://i.ibb.co/WWRbtPq0/RR-Logo.png"
                        />
                        <label className="cursor-pointer bg-[#1D3E5E] border border-white/10 hover:border-[#E7C768] text-xs px-3.5 py-2.5 rounded-xl text-white font-bold select-none text-center flex items-center shrink-0">
                          <span>📂 Загрузить файл</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                  if (typeof reader.result === "string") {
                                    setSetupLogoUrl(reader.result);
                                  }
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                          />
                        </label>
                      </div>
                      {setupLogoUrl && (
                        <div className="mt-2 flex items-center gap-2 bg-black/15 p-2 rounded-xl border border-white/5">
                          <img src={setupLogoUrl} alt="Logo Preview" className="w-8 h-8 object-contain rounded" referrerPolicy="no-referrer" />
                          <span className="text-[10px] text-gray-400 truncate max-w-xs">{setupLogoUrl}</span>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={isGenerating || isParsingFile}
                      onClick={handleBeautifyNewVacancyWithAI}
                      className="cursor-pointer w-full bg-[#17344F] border border-[#E7C768]/60 hover:border-[#E7C768] text-xs py-2.5 px-4 rounded-xl text-slate-100 font-bold flex items-center justify-center gap-1.5 transition select-none"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[#E7C768]" />
                      <span>✨ Оформить красиво через ИИ (оптимизировать все условия)</span>
                    </button>

                    <button
                      type="submit"
                      disabled={isGenerating}
                      className="cursor-pointer w-full bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-sm py-3 px-6 rounded-xl font-bold flex items-center justify-center gap-2 transition"
                    >
                      {isGenerating ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" /> Генерация лекций и ситуаций при помощи ИИ Gemini...
                        </>
                      ) : (
                        "Создать систему адаптации и форму соискателя"
                      )}
                    </button>
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
                        <div className="text-slate-300 text-xs mt-1 font-mono">{proj.salaryTerms || "Сдельная"} | {proj.scheduleTerms || "По согласованию"}</div>
                        
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

                        {/* Attached custom Wiki display toggle */}
                        <div className="mt-2.5 bg-black/20 p-2.5 rounded-xl text-[11px] font-mono whitespace-pre-wrap leading-tight text-slate-300 line-clamp-2">
                          <strong>Инструкция/База Wiki:</strong> {proj.customWiki || "Пока пустая корпоративная вики."}
                        </div>

                        {/* Interactive dynamic link of vacancy page inside company career lander */}
                        <div className="mt-2.5 bg-black/35 p-2.5 rounded-xl border border-white/5 space-y-1">
                          <span className="text-[9px] uppercase font-bold text-[#E7C768] block leading-none font-mono">Адрес ИИ-страницы Вакансии (Лендинг):</span>
                          <a 
                            onClick={(e) => { e.preventDefault(); navigate(`/${proj.companySlug || ""}/${(proj as any).slug || proj.id}`); }}
                            href={`/${proj.companySlug || ""}/${(proj as any).slug || proj.id}`} 
                            className="cursor-pointer text-sky-300 font-mono text-[10.5px] hover:underline hover:text-sky-450 block truncate"
                          >
                            https://hr-rr.online/com{proj.companySlug || ""}/vac{(proj as any).slug || proj.id}
                          </a>
                        </div>
                      </div>

                      {/* Lower Actions */}
                      <div className="mt-5 pt-3 border-t border-white/5 space-y-2">
                        <button
                          onClick={() => handleCopyLink(proj.id, proj.companySlug)}
                          className="cursor-pointer w-full bg-gradient-to-r from-red-650 to-orange-600 hover:shadow-md text-white text-[11px] font-bold py-2 px-3 rounded-xl flex items-center justify-center gap-1.5"
                        >
                          {copiedProjectId === proj.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-white" /> Ссылка скопирована
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-[#E7C768]" /> Скопировать реф-ссылку соискателя
                            </>
                          )}
                        </button>

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
                            onClick={() => setEditingProject(proj)}
                            className="cursor-pointer flex-1 bg-[#E7C768]/10 hover:bg-[#E7C768]/20 text-[#E7C768] text-[10px] font-bold py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 border border-[#E7C768]/25"
                          >
                            🛠 Редактировать
                          </button>
                        </div>
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
                </div>

                <button 
                  onClick={() => setShowAddCompany(!showAddCompany)} 
                  className="cursor-pointer bg-gradient-to-r from-green-650 to-emerald-700 text-white font-bold text-xs py-2 px-3 rounded-xl shadow transition"
                >
                  Регистрация бренда
                </button>
              </div>

              {/* BRAND CREATOR */}
              {showAddCompany && (
                <form onSubmit={handleAddCompanySubmit} className="bg-black/45 border border-green-500/30 p-6 rounded-3xl space-y-6 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-green-500 via-yellow-400 to-purple-500"></div>
                  
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-white/5">
                    <div>
                      <span className="text-xs font-bold text-green-300 block font-mono">ПАНЕЛЬ УПАКОВКИ БРЕНДА RR</span>
                      <h4 className="text-sm font-semibold text-white">Интерактивный ИИ-профиль организации</h4>
                    </div>
                    
                    <button
                      type="button"
                      onClick={handleEnhanceAllFields}
                      disabled={isEnhancingAll || isParsingFile}
                      className="px-4 py-2 text-xs font-bold rounded-xl text-white bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 transition-all shadow-md shadow-indigo-900/30 flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${isEnhancingAll ? "animate-spin" : ""}`} />
                      {isEnhancingAll ? "Обработка ИИ..." : "Оформить красиво с помощью ИИ"}
                    </button>
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
                        setNewCompanyFiles(file.name);
                        addAuditEvent("info", "Файл загружен", `Прикреплен регламент: ${file.name}`);
                        parseCompanyFileWithAI(file.name);
                      }
                    }}
                    className={`cursor-pointer border-2 border-dashed rounded-2xl p-4 text-center space-y-1.5 transition-all ${
                      isParsingFile 
                        ? "border-yellow-500 bg-yellow-500/5 animate-pulse" 
                        : "border-white/10 bg-slate-900/40 hover:bg-slate-900/60"
                    }`}
                  >
                    <input 
                      id="comp-file-upload" 
                      type="file" 
                      className="hidden" 
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          const file = e.target.files[0];
                          setNewCompanyFiles(file.name);
                          addAuditEvent("info", "Файл загружен", `Прикреплен файл: ${file.name}`);
                          parseCompanyFileWithAI(file.name);
                        }
                      }}
                    />
                    <div className="text-xs text-slate-300 font-bold flex items-center justify-center gap-2">
                      <FileText className="w-4 h-4 text-green-400" />
                      {newCompanyFiles ? (
                        <span className="text-yellow-400">Документ загружен: {newCompanyFiles} ✓</span>
                      ) : (
                        <span>Загрузить регламент / вакансию для автозаполнения ИИ</span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 block font-mono">
                      {isParsingFile 
                        ? "⚡ ИИ от ProTalk анализирует регламент, заполняет все поля..." 
                        : "ИИ автоматически разберет файл и заполнит ВСЕ поля ниже через структурированный JSON"
                      }
                    </span>
                  </div>

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
                            onClick={() => handleEnhanceSingleField("industry", newCompanyIndustry)}
                            disabled={enhancingFields["industry"]}
                            className="absolute right-2.5 p-1 text-slate-400 hover:text-[#E7C768] disabled:opacity-30 transition-colors"
                            title="Подобрать отрасль ИИ"
                          >
                            <Sparkles className={`w-3.5 h-3.5 ${enhancingFields["industry"] ? "animate-spin text-yellow-400" : ""}`} />
                          </button>
                        </div>

                        <select 
                          className="bg-[#17344F] text-xs px-3 py-2.5 rounded-xl text-white border border-white/10 focus:outline-none"
                          value={newCompanyStaff}
                          onChange={(e) => setNewCompanyStaff(e.target.value)}
                        >
                          <option value="менее 10 сотрудников">До 10 сотрудников</option>
                          <option value="10-50 человек">10 - 50 сотрудников</option>
                          <option value="50-250 человек">50 - 250 сотрудников</option>
                          <option value="свыше 250 сотрудников">Более 250 человек</option>
                        </select>
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
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">2. Имидж, миссия и культура</span>
                      
                      <div className="relative">
                        <textarea 
                          placeholder="Описание философии, бренда, основных продуктов компании..." 
                          className="w-full bg-black/40 text-xs pl-3 pr-10 py-2.5 rounded-xl border border-white/10 text-white focus:outline-none"
                          rows={2}
                          value={newCompanyDesc}
                          onChange={(e) => setNewCompanyDesc(e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => handleEnhanceSingleField("description", newCompanyDesc)}
                          disabled={enhancingFields["description"]}
                          className="absolute right-3 top-3 p-1 text-slate-400 hover:text-[#E7C768] disabled:opacity-30"
                          title="Оформить миссию красиво"
                        >
                          <Sparkles className={`w-3.5 h-3.5 ${enhancingFields["description"] ? "animate-spin text-yellow-400" : ""}`} />
                        </button>
                      </div>

                      <div className="relative">
                        <textarea 
                          placeholder="Миссия или слоган бренда (будет ярко выведена на лендинге)..." 
                          className="w-full bg-black/40 text-xs pl-3 pr-10 py-2.5 rounded-xl border border-white/10 text-white focus:outline-none"
                          rows={2}
                          value={newCompanyMissionText}
                          onChange={(e) => setNewCompanyMissionText(e.target.value)}
                        />
                        <button
                          type="button"
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
                              className="w-full bg-black/50 text-xs px-2.5 py-1.5 rounded-lg border border-white/10 text-white"
                              value={newCompanyStatsValFounded}
                              onChange={(e) => setNewCompanyStatsValFounded(e.target.value)}
                            />
                            <button
                              type="button"
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
                    <button type="button" onClick={() => setShowAddCompany(false)} className="px-4 py-2 hover:bg-white/5 rounded-xl">Отмена</button>
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
                    Компаний пока нет. Нажмите кнопку "Регистрация бренда" выше, чтобы добавить компанию и создать её ИИ-лендинг.
                  </div>
                )}
                {companiesList.map((comp, idx) => {
                  const compVacancies = projects.filter(p => p.companyName?.toLowerCase() === comp.name?.toLowerCase());

                  return (
                    <div key={idx} className="bg-[#1D3E5E]/60 border border-white/10 p-5 rounded-3xl space-y-3">
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
                            <span className="text-[10px] text-[#E7C768] font-bold tracking-wide uppercase font-mono">{comp.industry}</span>
                            <h3 className="text-base font-bold text-white mt-0.5">{comp.name}</h3>
                          </div>
                        </div>
                        <span className="bg-white/5 border border-white/5 text-[10px] text-slate-350 py-1 px-2.5 rounded-full font-mono">Штат: {comp.staff}</span>
                      </div>

                      <p className="text-xs text-slate-200 leading-relaxed font-normal">{comp.description}</p>
                      
                      {/* Expanded sites, files links */}
                      <div className="flex flex-wrap items-center gap-4 text-xs pt-1">
                        {comp.sites && (
                          <a 
                            href={comp.sites.startsWith("http") ? comp.sites : `https://${comp.sites}`} 
                            target="_blank" 
                            rel="noreferrer"
                            className="text-[#E7C768] hover:underline font-bold flex items-center gap-1"
                          >
                            🔗 Сайт: {comp.sites}
                          </a>
                        )}
                        {comp.files && (
                          <span className="text-slate-300 flex items-center gap-1 font-semibold">
                            📂 Регламент: <strong className="text-[#E7C768] font-mono">{comp.files}</strong> (Распознан ИИ)
                          </span>
                        )}
                      </div>

                      {/* AI Generated Careers Landing Link address */}
                      <div className="bg-black/20 border border-white/5 p-3 rounded-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                        <div className="space-y-0.5">
                          <span className="text-[9px] uppercase font-bold text-[#E7C768] block leading-none font-mono">ИИ-Лендинг Компании для Кандидатов</span>
                          <span className="text-[11.5px] text-slate-300 font-mono select-all">https://hr-rr.online/com{comp.slug}</span>
                        </div>
                        <button
                          onClick={() => navigate(`/${comp.slug}`)}
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

              {/* Hiring Calculator + new pricing */}
              <HiringCalculator />
              
              {/* BALANCE SUMMARY PANEL CARD */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 font-medium">
                <div className="md:col-span-4 bg-[#1D3E5E]/95 border border-[#E7C768]/45 rounded-3xl p-6 shadow-xl flex flex-col justify-between space-y-4">
                  <div>
                    <span className="text-[10px] font-bold text-[#E7C768] tracking-widest uppercase font-mono block">Лицевой счет счета</span>
                    <h2 className="text-3xl font-extrabold text-white mt-1.5 font-mono select-none">{balance} <span className="text-lg font-bold text-[#E7C768]">RR</span></h2>
                    <p className="text-[11px] text-slate-300 mt-2 leading-relaxed">
                      У вас бессрочный баланс. Оплата списывается исключительно за фактически приобретенные пакетные лимиты ИИ.
                    </p>
                  </div>
                  <div className="bg-black/25 rounded-2xl p-3 border border-white/5 space-y-1">
                    <span className="text-[9px] text-slate-400 font-bold block uppercase font-mono">Ваш ID аккаунта</span>
                    <span className="font-mono text-xs font-bold text-slate-300">{employerId}</span>
                  </div>
                </div>

                {/* LIMITS INSTRUCTION SHIELD */}
                <div className="md:col-span-8 bg-[#1D3E5E]/85 border border-white/15 rounded-3xl p-6 shadow-xl space-y-4 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-[#E7C768] flex items-center gap-1.5 leading-snug">
                      <Award className="w-4 h-4 text-[#E7C768]" /> Текущие ИИ-Лимиты на балансе
                    </h3>
                    <p className="text-[11px] text-slate-350 mt-1">
                      Лимиты расходуются соискателями при прохождении ИИ-интервью, ИИ-обучения и создании новых адаптационных материалов.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5 text-xs text-center py-2">
                    <div className="bg-black/20 p-2.5 rounded-2xl border border-white/5 hover:border-white/10 transition">
                      <span className="text-[10px] text-slate-400 block font-normal leading-tight">ИИ-Интервью</span>
                      <strong className="text-base text-white block mt-1 font-mono">
                        {limits.interviews} <span className="text-[10px] font-sans font-light text-slate-400 font-normal">шт</span>
                      </strong>
                    </div>
                    <div className="bg-black/20 p-2.5 rounded-2xl border border-white/5 hover:border-white/10 transition">
                      <span className="text-[10px] text-slate-400 block font-normal leading-tight">ИИ-Обучение</span>
                      <strong className="text-base text-white block mt-1 font-mono">
                        {limits.trainings} <span className="text-[10px] font-sans font-light text-slate-400 font-normal">шт</span>
                      </strong>
                    </div>
                    <div className="bg-black/20 p-2.5 rounded-2xl border border-white/5 hover:border-white/10 transition">
                      <span className="text-[10px] text-slate-400 block font-normal leading-tight">ИИ-Лендинги</span>
                      <strong className="text-base text-white block mt-1 font-mono">
                        {limits.landings} <span className="text-[10px] font-sans font-light text-slate-400 font-normal">шт</span>
                      </strong>
                    </div>
                    <div className="bg-black/20 p-2.5 rounded-2xl border border-white/5 hover:border-white/10 transition">
                      <span className="text-[10px] text-slate-400 block font-normal leading-tight">Систем интервью</span>
                      <strong className="text-base text-white block mt-1 font-mono">
                        {limits.interviewSystems} <span className="text-[10px] font-sans font-light text-slate-400 font-normal">шт</span>
                      </strong>
                    </div>
                    <div className="bg-black/20 p-2.5 rounded-2xl border border-white/5 hover:border-white/10 transition">
                      <span className="text-[10px] text-slate-400 block font-normal leading-tight">Систем обучения</span>
                      <strong className="text-base text-white block mt-1 font-mono">
                        {limits.trainingSystems} <span className="text-[10px] font-sans font-light text-slate-400 font-normal">шт</span>
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* PURCHASING MARKETPLACE TABLE AND CALCULATOR ROW */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* 1. PURCHASE SERVICES DIRECTLY TABLE */}
                <div className="bg-[#1D3E5E]/85 border border-white/15 rounded-3xl p-6 shadow-xl space-y-4 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-[#E7C768] flex items-center gap-1.5 uppercase tracking-wider font-mono text-[11px]">
                      🛍️ Купить лимиты ИИ услуг за RR
                    </h3>
                    <p className="text-xs text-slate-300">
                      Лимиты активируются мгновенно и не имеют срока давности.
                    </p>
                    
                    {purchaseError && (
                      <div className="bg-red-950/40 border border-red-500/35 text-red-300 rounded-xl p-2.5 text-[11px] mt-2 font-mono">
                        ⚠️ {purchaseError}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2.5 pt-2">
                    {/* Item 1: Interview */}
                    <div className="bg-black/15 p-3 rounded-2xl border border-white/5 flex items-center justify-between gap-3 text-xs font-normal">
                      <div className="max-w-[70%]">
                        <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                          <span className="text-amber-400">🎙️</span> ИИ Собеседование соискателя
                        </h4>
                        <p className="text-[10.5px] text-slate-300 mt-1 leading-relaxed">
                          <strong className="text-amber-400/90 font-semibold font-mono text-[9.5px]">Включает:</strong> ИИ Скрининг резюме + ИИ чек-лист по опыту и навыкам + ИИ ролевая игра с 3 ситуациями.
                        </p>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono font-bold text-[#E7C768]">100 RR</span>
                        <button
                          onClick={(e) => handlePurchaseItem("interview")}
                          disabled={isBuying !== null}
                          className="bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-[#17344F] font-bold text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-xl transition cursor-pointer"
                        >
                          {isBuying === "interview" ? "Куплю..." : "Купить"}
                        </button>
                      </div>
                    </div>

                    {/* Item 2: AI Training */}
                    <div className="bg-black/15 p-3 rounded-2xl border border-white/5 flex items-center justify-between gap-3 text-xs font-normal">
                      <div className="max-w-[70%]">
                        <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                          <span className="text-amber-400">🎓</span> Интерактивное ИИ Обучение соискателя
                        </h4>
                        <p className="text-[10.5px] text-slate-300 mt-1 leading-relaxed">
                          <strong className="text-amber-400/90 font-semibold font-mono text-[9.5px]">Включает:</strong> Профессиональное ИИ дообучение после интервью + ИИ обучение продукту + ИИ обучение системе работы и условиям.
                        </p>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono font-bold text-[#E7C768]">100 RR</span>
                        <button
                          onClick={(e) => handlePurchaseItem("training")}
                          disabled={isBuying !== null}
                          className="bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-[#17344F] font-bold text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-xl transition cursor-pointer"
                        >
                          {isBuying === "training" ? "Куплю..." : "Купить"}
                        </button>
                      </div>
                    </div>

                    {/* Item 3: Job AI Landing page */}
                    <div className="bg-black/15 p-3 rounded-2xl border border-white/5 flex items-center justify-between gap-3 text-xs font-normal">
                      <div className="max-w-[70%]">
                        <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                          <span className="text-amber-400">🌐</span> ИИ Лендинг созданной вакансии
                        </h4>
                        <p className="text-[10.5px] text-slate-300 mt-1 leading-relaxed">
                          <strong className="text-amber-400/90 font-semibold font-mono text-[9.5px]">Описание:</strong> Создание стильного внешнего мини-сайта для регистрации ваших кандидатов в системе с описанием вакансии, условий и информации о компании с ИИ консультантом по базе знаний.
                        </p>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono font-bold text-[#E7C768]">500 RR</span>
                        <button
                          onClick={(e) => handlePurchaseItem("landing")}
                          disabled={isBuying !== null}
                          className="bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-[#17344F] font-bold text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-xl transition cursor-pointer"
                        >
                          {isBuying === "landing" ? "Куплю..." : "Купить"}
                        </button>
                      </div>
                    </div>

                    {/* Item 4: AI Interview System creation */}
                    <div className="bg-black/15 p-3 rounded-2xl border border-white/5 flex items-center justify-between gap-3 text-xs font-normal">
                      <div className="max-w-[70%]">
                        <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                          <span className="text-amber-400">⚙️</span> ИИ Система Интервью
                        </h4>
                        <p className="text-[10.5px] text-slate-300 mt-1 leading-relaxed">
                          <strong className="text-amber-400/90 font-semibold font-mono text-[9.5px]">Описание:</strong> Генератор сценариев с тестами под вашу специальность и вакансию.
                        </p>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono font-bold text-[#E7C768]">300 RR</span>
                        <button
                          onClick={(e) => handlePurchaseItem("system_interview")}
                          disabled={isBuying !== null}
                          className="bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-[#17344F] font-bold text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-xl transition cursor-pointer"
                        >
                          {isBuying === "system_interview" ? "Куплю..." : "Купить"}
                        </button>
                      </div>
                    </div>

                    {/* Item 5: AI Training System creation */}
                    <div className="bg-black/15 p-3 rounded-2xl border border-white/5 flex items-center justify-between gap-3 text-xs font-normal">
                      <div className="max-w-[70%]">
                        <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                          <span className="text-amber-400">👁️‍🗨️</span> ИИ Система Обучения
                        </h4>
                        <p className="text-[10.5px] text-slate-300 mt-1 leading-relaxed">
                          <strong className="text-amber-400/90 font-semibold font-mono text-[9.5px]">Описание:</strong> ИИ создает Продвинутую индивидуальную тренажерную симуляцию для персонала, для аттестаций новых сотрудников, переаттестаций текущих и для быстрого онбординга.
                        </p>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono font-bold text-[#E7C768]">200 RR</span>
                        <button
                          onClick={(e) => handlePurchaseItem("system_training")}
                          disabled={isBuying !== null}
                          className="bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-[#17344F] font-bold text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-xl transition cursor-pointer"
                        >
                          {isBuying === "system_training" ? "Куплю..." : "Купить"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. TOP UP BILLING CALCULATOR CARD */}
                <div className="bg-[#1D3E5E]/85 border border-[#E7C768]/30 rounded-3xl p-6 shadow-xl space-y-4 flex flex-col justify-between">
                  <form onSubmit={handleTopupBalance} className="space-y-4 flex flex-col justify-between h-full">
                    <div>
                      <h3 className="font-bold text-sm text-[#E7C768] flex items-center gap-1.5 uppercase tracking-wider font-mono text-[11px]">
                        💵 Калькулятор пополнения баланса
                      </h3>
                      <p className="text-xs text-slate-300 mt-1">
                        Выгодный курс: **1 рубль = 1 RR**. Начальный минимальный платеж 100 рублей.
                      </p>
                    </div>

                    <div className="space-y-3.5 my-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                          Вы вносите к оплате (в рублях):
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min="100"
                            value={topupAmountRub}
                            onChange={(e) => setTopupAmountRub(Math.max(0, parseInt(e.target.value) || 0))}
                            className="bg-black/35 w-full rounded-2xl border border-white/10 px-4 py-3 font-mono font-extrabold text-white text-sm focus:outline-none focus:border-[#E7C768]"
                          />
                          <span className="absolute right-4 top-3 text-xs font-bold text-[#E7C768] font-mono">₽ (RUB)</span>
                        </div>
                        {topupAmountRub < 100 && (
                          <span className="text-[10px] text-amber-400 block mt-1 font-mono">⚠️ Минимум 100 рублей</span>
                        )}
                      </div>

                      {/* Quick pick templates */}
                      <div className="flex gap-2 text-[10px] font-mono font-bold leading-none">
                        <button
                          type="button"
                          onClick={() => setTopupAmountRub(100)}
                          className={`px-3 py-2 rounded-xl transition-all border ${topupAmountRub === 100 ? "bg-[#1E4468] text-[#E7C768] border-[#E7C768]/60 font-bold" : "bg-black/20 text-slate-400 border-white/5 hover:border-white/15 font-normal"}`}
                        >
                          100 ₽
                        </button>
                        <button
                          type="button"
                          onClick={() => setTopupAmountRub(500)}
                          className={`px-3 py-2 rounded-xl transition-all border ${topupAmountRub === 500 ? "bg-[#1E4468] text-[#E7C768] border-[#E7C768]/60 font-bold" : "bg-black/20 text-slate-400 border-white/5 hover:border-white/15 font-normal"}`}
                        >
                          500 ₽
                        </button>
                        <button
                          type="button"
                          onClick={() => setTopupAmountRub(1000)}
                          className={`px-3 py-2 rounded-xl transition-all border ${topupAmountRub === 1000 ? "bg-[#1E4468] text-[#E7C768] border-[#E7C768]/60 font-bold" : "bg-black/20 text-slate-400 border-white/5 hover:border-white/15 font-normal"}`}
                        >
                          1 000 ₽
                        </button>
                      </div>

                      {/* Equivalent calculation block */}
                      <div className="bg-emerald-950/20 p-3.5 rounded-2xl border border-emerald-500/20 text-xs flex justify-between items-center bg-black/20">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-normal">Будет начислено на счет баланса:</span>
                          <span className="text-sm font-extrabold text-[#E7C768] block mt-1 font-mono">
                            {topupAmountRub} RR
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 bg-white/5 hover:bg-white/10 transition px-2.5 py-1 rounded-full font-mono font-bold uppercase tracking-wider">
                          Курс 1:1
                        </span>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isToppingUp || topupAmountRub < 100}
                      className="cursor-pointer bg-gradient-to-r from-emerald-500 to-teal-650 hover:from-emerald-600 hover:to-teal-700 disabled:opacity-40 text-[#17344F] font-bold text-xs uppercase tracking-wider py-3.5 rounded-2xl w-full transition flex items-center justify-center gap-1.5"
                    >
                      {isToppingUp ? "Обработка шлюза..." : "🚀 Пополнить Баланс"}
                    </button>
                  </form>
                </div>
              </div>

              {/* REFERRAL PROGRAM CARD */}
              <div className="bg-[#1D3E5E]/60 border border-white/10 rounded-3xl p-6 shadow-xl space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl select-none">🎁</span>
                  <div>
                    <h3 className="font-bold text-sm text-[#E7C768]">Зарабатывайте 1000 RR за рекомендацию друга!</h3>
                    <p className="text-[11px] text-slate-300 leading-relaxed font-normal mt-0.5">
                      Пригласите другого руководителя или HR-менеджера. Когда они заригистрируются по вашей ссылке через Google или Telegram,
                      вам мгновенно зачислится бонус **1000 RR**, а приглашенный друг получит приветственные **1000 RR** на баланс!
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className="bg-black/15 p-3 rounded-2xl border border-white/5 space-y-1.5 text-xs text-left">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase font-mono">Официальная реферальная ссылка:</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={`https://hr-rr.online?ref=${employerId}`}
                        className="bg-black/30 w-full select-all font-mono font-normal text-slate-300 text-[11px] border border-white/5 p-1.5 rounded"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(`https://hr-rr.online?ref=${employerId}`);
                          addAuditEvent("success", "Ссылка скопирована", "Официальная ссылка скопирована в буфер обмена.");
                          alert("Официальная ссылка скопирована!");
                        }}
                        className="bg-white/10 hover:bg-white/20 text-[#E7C768] px-2 py-1 border border-white/5 text-[10px] uppercase font-bold rounded cursor-pointer"
                      >
                        Копировать
                      </button>
                    </div>
                  </div>

                  <div className="bg-black/15 p-3 rounded-2xl border border-white/5 space-y-1.5 text-xs text-left">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase font-mono">Тестирование в Песочнице (Для проверки):</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={`${window.location.origin}/auth?ref=${employerId}`}
                        className="bg-black/30 w-full select-all font-mono font-normal text-emerald-400 text-[11px] border border-white/5 p-1.5 rounded"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/auth?ref=${employerId}`);
                          addAuditEvent("success", "Ссылка скопирована", "Песочная тестовая ссылка скопирована.");
                          alert("Ссылка для тестирования скопирована!");
                        }}
                        className="bg-emerald-950 hover:bg-emerald-900 text-emerald-400 px-2 py-1 border border-emerald-500/20 text-[10px] uppercase font-bold rounded cursor-pointer"
                      >
                        Копировать
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* PAYMENT TRANSACTIONS RECEIPT REGISTRY FOR EMPOWERED TRACKING */}
              <div className="bg-[#1D3E5E]/45 border border-white/10 rounded-3xl overflow-hidden shadow">
                <div className="p-4 bg-gradient-to-r from-[#17344F] to-[#265582] text-xs font-bold font-mono tracking-wider text-slate-300">
                  История Платежей, Списаний & Бонусов счета
                </div>
                {paymentHistory.length === 0 ? (
                  <p className="p-4 text-xs text-slate-400 font-normal">Пока не зафиксировано ни одной операции по данному работодателю.</p>
                ) : (
                  <div className="overflow-x-auto text-xs font-mono">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-black/25 text-[#E7C768] border-b border-white/5 font-bold">
                          <th className="p-3">ID Операции</th>
                          <th className="p-3">Дата операции</th>
                          <th className="p-3">Название операции / наименование услуги</th>
                          <th className="p-3 text-right">Начислено / Списано</th>
                          <th className="p-3 text-right">Метод</th>
                          <th className="p-3 text-right">Статус</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-slate-200 font-normal">
                        {paymentHistory.map((pt, i) => (
                          <tr key={i} className="hover:bg-white/5">
                            <td className="p-3 font-semibold text-slate-400">{pt.id}</td>
                            <td className="p-3">{pt.date}</td>
                            <td className="p-3 font-sans font-medium text-white">{pt.plan}</td>
                            <td className="p-3 text-right font-bold font-mono">
                              <span className={pt.amount.startsWith("-") ? "text-red-450" : "text-emerald-400"}>
                                {pt.amount}
                              </span>
                            </td>
                            <td className="p-3 text-right font-sans text-slate-300">{pt.method}</td>
                            <td className="p-3 text-right font-sans">
                              <span className="bg-emerald-950/80 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-bold text-[10px]">{pt.status}</span>
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

          {/* PAGE 5: PROFILE & TELEGRAM PORTAL */}
          {activeTab === "profile" && (
            <div className="space-y-6 text-left">
              
              {/* Dynamic Header */}
              <div className="bg-[#1D3E5E]/80 border border-[#E7C768]/35 rounded-3xl p-5 shadow-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="space-y-1">
                  <h2 className="text-lg font-black text-white flex items-center gap-2">
                    <User className="w-5 h-5 text-amber-400" />
                    Мульти-профиль HR Администратора
                  </h2>
                  <p className="text-xs text-slate-300">Авторизованные аккаунты Google и Telegram для интеграций ИИ-рекрутинга.</p>
                </div>
                <div className="bg-emerald-950/40 text-emerald-400 text-xs font-bold border border-emerald-500/30 px-3 py-1 rounded-full font-mono flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  <span>Сессия ID: {employerId}</span>
                </div>
              </div>

              {/* REFERRAL LINK BLOCK */}
              <ReferralLinkBlock employerPublicId={employerId} />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* GOOGLE PROFILE ACCOUNT BLOCK */}
                <div className="bg-[#1D3E5E]/85 border border-white/15 rounded-3xl p-6 shadow-xl space-y-5">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <h3 className="font-bold text-sm text-[#E7C768] uppercase font-mono tracking-wider flex items-center gap-2">
                      <Chrome className="w-4 h-4 text-sky-400" /> 1. Профиль Google
                    </h3>
                    <span className="bg-sky-500/10 text-sky-400 border border-sky-500/25 text-[9px] font-mono font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                      Google OAuth2 Verified
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-4 bg-black/20 p-4 rounded-2xl border border-white/5">
                    <div className="relative shrink-0">
                      <img 
                        src={googlePhoto} 
                        alt="Google avatar" 
                        className="w-16 h-16 rounded-full object-cover border-2 border-sky-400 shadow-md referrerPolicy='no-referrer'"
                        onError={(e) => {
                          (e.target as any).src = "https://lh3.googleusercontent.com/a/default-user=s96-c";
                        }}
                      />
                      <span className="absolute bottom-0 right-0 bg-emerald-500 w-4 h-4 rounded-full border-2 border-[#1E4468] flex items-center justify-center text-[8px] text-white font-bold" title="Синхронизировано">✓</span>
                    </div>

                    <div className="text-center sm:text-left min-w-0 flex-1 space-y-1">
                      <h4 className="text-sm font-extrabold text-white truncate">{googleName}</h4>
                      <p className="text-xs text-slate-350 font-mono truncate">{googleEmail}</p>
                      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1 font-mono text-[10px]">
                        <span className="bg-emerald-950/50 text-emerald-400 px-1.5 py-0.5 rounded font-bold border border-emerald-500/20">
                          ID: {googleId}
                        </span>
                        {googleVerified && (
                          <span className="bg-sky-950/40 text-sky-400 px-1.5 py-0.5 rounded border border-sky-500/20">
                            Gmail Verified ✓
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Form for Google info editing */}
                  <div className="space-y-3.5 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-slate-300 block mb-1 font-bold">Имя в аккаунте:</label>
                        <input 
                          type="text" 
                          className="w-full bg-[#17344F]/70 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-sky-400" 
                          value={googleName}
                          onChange={(e) => {
                            setGoogleName(e.target.value);
                            setProfileName(e.target.value);
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-slate-300 block mb-1 font-bold">Email аккаунта:</label>
                        <input 
                          type="email" 
                          className="w-full bg-[#17344F]/70 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-sky-400" 
                          value={googleEmail}
                          onChange={(e) => {
                            setGoogleEmail(e.target.value);
                            setProfileEmail(e.target.value);
                          }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-slate-300 block mb-1 font-bold">Google ID:</label>
                        <input 
                          type="text" 
                          className="w-full bg-[#17344F]/70 border border-white/10 rounded-xl px-3 py-2 text-white font-mono" 
                          value={googleId}
                          onChange={(e) => setGoogleId(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-slate-300 block mb-1 font-bold">Ссылка на фото Google:</label>
                        <input 
                          type="text" 
                          className="w-full bg-[#17344F]/70 border border-white/10 rounded-xl px-3 py-2 text-white text-[11px]" 
                          placeholder="Медиа URL"
                          value={googlePhoto}
                          onChange={(e) => setGooglePhoto(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="pt-2 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400 font-mono">Последняя синхронизация Google: Сегодня</span>
                      <button 
                        type="button" 
                        onClick={() => handleUpdateProfile({
                          googleName,
                          googleEmail,
                          googlePhoto,
                          googleId,
                          googleVerified
                        })}
                        className="cursor-pointer bg-sky-600 hover:bg-sky-500 text-white font-bold px-4 py-2 rounded-xl text-xs transition duration-150 shadow-md"
                      >
                        {isProfileSaved ? "Сохранено! ✓" : "Сохранить Google"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* TELEGRAM PROFILE BLOCK */}
                <div className="bg-[#1D3E5E]/85 border border-white/15 rounded-3xl p-6 shadow-xl space-y-5">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <h3 className="font-bold text-sm text-[#E7C768] uppercase font-mono tracking-wider flex items-center gap-2">
                      <Send className="w-4 h-4 text-sky-400" /> 2. Профиль Telegram
                    </h3>
                    <span className="bg-[#E7C768]/15 text-[#E7C768] border border-[#E7C768]/30 text-[9px] font-mono font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                      TG Bot Active
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-4 bg-black/20 p-4 rounded-2xl border border-white/5">
                    <div className="relative shrink-0">
                      <img 
                        src={telegramPhoto} 
                        alt="Telegram avatar" 
                        className="w-16 h-16 rounded-full object-cover border-2 border-amber-400 shadow-md"
                        onError={(e) => {
                          (e.target as any).src = "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=facearea&facepad=2.2&w=256&h=256&q=80";
                        }}
                      />
                      <span className="absolute bottom-0 right-0 bg-amber-500 w-4 h-4 rounded-full border-2 border-[#1E4468] flex items-center justify-center text-[8px] text-white font-bold" title="Telegram Бот на связи">✓</span>
                    </div>

                    <div className="text-center sm:text-left min-w-0 flex-1 space-y-1">
                      <h4 className="text-sm font-extrabold text-white truncate">
                        {telegramFirstName} {telegramLastName}
                      </h4>
                      
                      {/* Clickable Username Link */}
                      <div className="text-xs font-semibold">
                        <span className="text-slate-400 mr-1.5 font-normal">Никнейм:</span>
                        <a 
                          href={telegramUsernameState ? `https://t.me/${telegramUsernameState.replace("@", "")}` : "https://t.me/HR_RRbot"} 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-sky-305 hover:underline font-mono text-sm inline-flex items-center gap-1 font-black bg-sky-950/40 hover:bg-sky-950/60 transition px-2 py-0.5 rounded"
                        >
                          @{telegramUsernameState ? telegramUsernameState.replace("@", "") : "cowal_sales"} 🔗
                        </a>
                      </div>

                      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1 font-mono text-[10px]">
                        <span className="bg-amber-950/60 text-[#E7C768] px-1.5 py-0.5 rounded font-bold border border-amber-500/25">
                          ID: {telegramIdState || adminTgId}
                        </span>
                        <span className="bg-emerald-950/40 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20">
                          Уведомления ВКЛ ✅
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Form for Telegram info editing */}
                  <div className="space-y-3.5 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-slate-300 block mb-1 font-bold">Имя (First Name):</label>
                        <input 
                          type="text" 
                          className="w-full bg-[#17344F]/70 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400" 
                          value={telegramFirstName}
                          onChange={(e) => setTelegramFirstName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-slate-300 block mb-1 font-bold">Фамилия (Last Name):</label>
                        <input 
                          type="text" 
                          className="w-full bg-[#17344F]/70 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400" 
                          value={telegramLastName}
                          onChange={(e) => setTelegramLastName(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-slate-300 block mb-1 font-bold">Никнейм @username:</label>
                        <input 
                          type="text" 
                          className="w-full bg-[#17344F]/70 border border-white/10 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-400" 
                          placeholder="например: active_hr"
                          value={telegramUsernameState}
                          onChange={(e) => setTelegramUsernameState(e.target.value.replace("@", ""))}
                        />
                      </div>
                      <div>
                        <label className="text-slate-300 block mb-1 font-bold">Telegram ID (Цифры):</label>
                        <div className="flex gap-1.5">
                          <input 
                            type="text" 
                            className="w-full bg-[#17344F]/70 border border-white/10 rounded-xl px-3 py-2 text-white font-mono text-center focus:outline-none focus:border-amber-400" 
                            placeholder="например: 59384591"
                            value={telegramIdState}
                            onChange={(e) => {
                              setTelegramIdState(e.target.value);
                              setAdminTgId(e.target.value);
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              saveTgId();
                              handleUpdateProfile({
                                telegramId: telegramIdState,
                                telegramPhoto,
                                telegramFirstName,
                                telegramLastName,
                                telegramUsername: telegramUsernameState
                              });
                            }}
                            className="bg-amber-600 hover:bg-amber-500 font-bold px-3 py-2 text-white rounded-xl text-[10px]"
                          >
                            Привязать
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 flex items-center justify-between gap-2.5">
                      <div className="bg-black/25 text-[9.5px] px-2.5 py-1.5 rounded-lg border border-white/5 text-slate-400 font-mono flex-1 leading-normal">
                        🤖 Для синхронизации ID напишите команду <strong className="text-[#E7C768]">/start</strong> боту <a href="https://t.me/HR_RRbot" target="_blank" rel="noreferrer" className="text-sky-305 underline">@HR_RRbot</a>
                      </div>
                      <button 
                        type="button" 
                        onClick={() => handleUpdateProfile({
                          telegramId: telegramIdState,
                          telegramPhoto,
                          telegramFirstName,
                          telegramLastName,
                          telegramUsername: telegramUsernameState
                        })}
                        className="cursor-pointer bg-amber-500 hover:bg-amber-600 text-slate-900 font-black px-4 py-2 rounded-xl text-xs transition duration-150 shadow-md shrink-0"
                      >
                        {isProfileSaved ? "Сохранено! ✓" : "Сохранить TG"}
                      </button>
                    </div>

                    {/* Phone block (request via bot) */}
                    <div className="pt-3 mt-2 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                      <div>
                        <label className="text-slate-300 block mb-1 font-bold">Номер телефона из Telegram:</label>
                        {telegramPhone ? (
                          <a href={`tel:${telegramPhone}`} className="block w-full bg-emerald-950/40 border border-emerald-500/30 rounded-xl px-3 py-2 text-emerald-300 font-mono hover:bg-emerald-950/60 transition">
                            {telegramPhone}
                          </a>
                        ) : (
                          <div className="w-full bg-[#17344F]/70 border border-white/10 rounded-xl px-3 py-2 text-slate-400 italic">
                            Не привязан
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={handleRequestPhoneViaBot}
                        disabled={isRequestingPhone}
                        className="cursor-pointer bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white font-bold px-4 py-2 rounded-xl text-xs transition duration-150 shadow-md"
                      >
                        {isRequestingPhone ? "Отправка…" : telegramPhone ? "Обновить через бота" : "Запросить телефон через бота"}
                      </button>
                    </div>

                    {/* Direct profile link fallback */}
                    <div className="text-[10.5px] text-slate-400 font-mono pt-2">
                      Прямая ссылка на профиль:&nbsp;
                      {telegramUsernameState ? (
                        <a href={`https://t.me/${telegramUsernameState.replace(/^@+/, "")}`} target="_blank" rel="noreferrer" className="text-sky-300 underline">
                          t.me/{telegramUsernameState.replace(/^@+/, "")}
                        </a>
                      ) : telegramIdState ? (
                        <a href={`tg://user?id=${telegramIdState}`} className="text-sky-300 underline">tg://user?id={telegramIdState}</a>
                      ) : "—"}
                    </div>
                  </div>
                </div>

              </div>

              {/* REFERRAL SYSTEM SECTION INTEGRATION INSIDE PROFILE TAB */}
              <div className="bg-[#1D3E5E]/85 border border-[#E7C768]/40 rounded-3xl p-6 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-white/10 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl select-none">🎁</span>
                    <div>
                      <h3 className="font-extrabold text-white text-sm">Ваша персональная реферальная программа</h3>
                      <p className="text-[11px] text-slate-300 leading-normal font-normal">
                        Зарабатывайте рекрутинговые мили **1,000 RR** бонуса за каждого приглашенного HR-директора или работодателя!
                      </p>
                    </div>
                  </div>
                  <span className="bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 text-[10.5px] font-mono font-bold px-3 py-1 rounded-full uppercase">
                    Награда 1000 RR
                  </span>
                </div>

                <p className="text-xs text-slate-200 leading-normal font-normal">
                  Когда ваши коллеги регистрируют Личный Кабинет работодателя через Telegram по реферальной ссылке ниже, вашему кабинету начисляется <strong className="text-emerald-300">1000 RR</strong>, и вашему другу-работодателю также <strong className="text-emerald-300">1000 RR</strong> (поверх стартового бонуса +1000 RR).
                </p>

                <div className="grid grid-cols-2 gap-3 text-center text-xs font-mono">
                  <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-2xl p-3">
                    <span className="block text-[10px] text-slate-400 uppercase">Приглашено</span>
                    <strong className="text-emerald-300 text-lg">{referralStats.count}</strong>
                  </div>
                  <div className="bg-amber-950/30 border border-amber-500/20 rounded-2xl p-3">
                    <span className="block text-[10px] text-slate-400 uppercase">Начислено RR</span>
                    <strong className="text-[#E7C768] text-lg">{referralStats.rr}</strong>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className="bg-black/25 p-4 rounded-2xl border border-white/5 space-y-2 text-xs text-left">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase font-mono tracking-wider">🔗 Реферальная ссылка Telegram Mini App:</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={`https://hr-rr.online/auth?ref=emp${employerId}`}
                        className="bg-black/40 w-full select-all font-mono font-normal text-[#E7C768] text-[11px] border border-white/10 p-2 rounded-xl focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const url = `https://hr-rr.online/auth?ref=emp${employerId}`;
                          navigator.clipboard.writeText(url);
                          addAuditEvent("success", "Реф-ссылка скопирована", "Telegram Mini App реф-ссылка скопирована в буфер обмена.");
                          alert("Telegram реферальная ссылка скопирована!\n\n" + url);
                        }}
                        className="bg-white/10 hover:bg-white/15 text-[#E7C768] px-3.5 py-2.5 border border-white/5 text-[10.5px] uppercase font-bold rounded-xl cursor-pointer shrink-0"
                      >
                        Копировать
                      </button>
                    </div>
                  </div>

                  <div className="bg-black/25 p-4 rounded-2xl border border-white/5 space-y-2 text-xs text-left">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase font-mono tracking-wider">🌐 Альтернативная веб-ссылка (Login Widget):</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={`https://hr-rr.online/auth?ref=emp${employerId}`}
                        className="bg-black/40 w-full select-all font-mono font-normal text-emerald-400 text-[11px] border border-white/10 p-2 rounded-xl focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(`https://hr-rr.online/auth?ref=emp${employerId}`);
                          addAuditEvent("success", "Web реф-ссылка скопирована", "Веб-реф-ссылка скопирована в буфер обмена.");
                          alert("Веб-реф-ссылка скопирована!");
                        }}
                        className="bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-400 px-3.5 py-2.5 border border-emerald-500/20 text-[10.5px] uppercase font-bold rounded-xl cursor-pointer shrink-0"
                      >
                        Копировать
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Onboarding Next Step CTA */}
              <div className="bg-[#1E4468]/60 border border-[#E7C768]/30 rounded-3xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-left space-y-1">
                  <h4 className="text-[#E7C768] font-bold text-sm">Профиль заполнен и проверен?</h4>
                  <p className="text-xs text-slate-350">Переходите к следующему шагу — созданию вашей первой компании и ИИ-лендинга.</p>
                </div>
                <button
                  onClick={() => navigate(`/emp${employerId}/companies`)}
                  className="cursor-pointer bg-gradient-to-r from-amber-500 to-orange-600 hover:scale-102 hover:shadow-lg text-white font-black text-xs py-3.5 px-6 rounded-2xl flex items-center gap-1.5 transition-all text-center shrink-0 w-full sm:w-auto justify-center"
                >
                  <span>Далее: Настройка компании</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

            </div>
          )}

          {/* PAGE 6: EVENTS & LOGGER HISTORY LOG */}
          {activeTab === "events" && (
            <div className="bg-[#1D3E5E]/85 border border-white/15 rounded-3xl p-6 shadow-xl space-y-5 text-left">
              
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between border-b border-white/10 pb-3 gap-3">
                <div>
                  <h2 className="text-lg font-bold text-[#E7C768] flex items-center gap-2">
                    <Activity className="w-5 h-5 text-amber-400 animate-pulse" />
                    Журнал Событий и Кандидат Логи
                  </h2>
                  <p className="text-xs text-slate-300 mt-1">Системные логи изменения соискателей, ИИ начислений баллов и триггеров бота оповещений.</p>
                </div>

                <div className="flex gap-2 font-bold font-mono">
                  <select 
                    className="bg-black/45 text-[11px] text-slate-300 px-2 py-1 rounded border border-white/10 focus:outline-none"
                    value={auditFilter}
                    onChange={(e) => setAuditFilter(e.target.value as any)}
                  >
                    <option value="all">Все события</option>
                    <option value="info">Инфо ℹ️</option>
                    <option value="success">Успех ✅</option>
                    <option value="warning">Пауза ⚠️</option>
                  </select>

                  <button onClick={fetchData} className="bg-white/5 border border-white/10 rounded px-2.5 py-1 hover:bg-white/10 transition flex items-center gap-1">
                    <RefreshCw className="w-3.5 h-3.5 text-[#E7C768]" /> Свежие
                  </button>
                </div>
              </div>

              {/* STATS LOGGER SUMMARIZER PRE-CARD */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center font-mono text-xs">
                <div className="bg-black/25 p-3 rounded-2xl border border-white/5">
                  <span className="text-[10px] text-gray-400 block pb-1">Успешных сертификаций</span>
                  <strong className="text-[#E7C768] text-base font-black uppercase font-sans">{totalVerified}</strong>
                </div>
                <div className="bg-black/25 p-3 rounded-2xl border border-white/5">
                  <span className="text-[10px] text-gray-400 block pb-1">Средний балл воронки</span>
                  <strong className="text-sky-300 text-base font-black uppercase font-sans">{averageAllScores}/100</strong>
                </div>
                <div className="bg-black/25 p-3 rounded-2xl border border-white/5">
                  <span className="text-[10px] text-gray-400 block pb-1">Активность Gemini</span>
                  <strong className="text-emerald-400 text-base font-black uppercase font-sans">100% ONLINE</strong>
                </div>
              </div>

              {/* STREAM CONTAINER LIST */}
              <div className="space-y-4">
                
                {/* 1. Audit events stream merged with real-time fetch logs */}
                <div className="space-y-2.5">
                  <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider font-mono">1. Журнал Действий Администратора:</span>
                  {auditEvents.filter(ev => {
                    if (auditFilter === "all") return true;
                    return ev.type === auditFilter;
                  }).map(ev => {
                    return (
                      <div key={ev.id} className="bg-[#17344F]/40 border border-white/5 rounded-xl p-3 flex items-start gap-3 text-xs leading-relaxed font-mono">
                        <span className="text-gray-400 font-bold select-none whitespace-nowrap">[{ev.timestamp}]</span>
                        <div className="space-y-0.5">
                          <strong className={`font-bold block font-sans ${ev.type === "success" ? "text-emerald-400" : ev.type === "warning" ? "text-amber-400" : "text-sky-300"}`}>
                            {ev.type === "success" ? "✓" : ev.type === "warning" ? "⚠" : "ℹ"} {ev.title}
                          </strong>
                          <span className="text-slate-300 text-[11px] block">{ev.message}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 2. Telegram message logger stream */}
                <div className="space-y-2.5 pt-2">
                  <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider font-mono">2. Журнал Оповещения в Телеграм-канале бота:</span>
                  {tgMsgLog.length === 0 ? (
                    <div className="text-xs text-slate-500 italic py-6 text-center select-none bg-black/10 rounded-2xl border border-white/5">Пока нет отправленных Rest API уведомлений.</div>
                  ) : (
                    tgMsgLog.slice(0, 15).map(lg => (
                      <div key={lg.id} className="bg-black/45 border border-white/5 rounded-xl p-3 flex items-start gap-2 text-xs font-mono select-none">
                        <span className="text-slate-400 font-bold whitespace-nowrap">[{lg.timestamp}]</span>
                        <div className="flex-1 space-y-1">
                          <span className="bg-sky-950 text-sky-400 text-[9px] px-1.5 py-0.2 rounded font-bold">API TG-Bot</span>
                          <span className="text-slate-200 block text-[11px] leading-tight whitespace-pre-wrap">{lg.message}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

              </div>
            </div>
          )}

        </main>
      </div>

      {/* FOOTER AREA */}
      <footer className="bg-[#17344F] border-t-2 border-[#E7C768] py-8 text-white text-center font-normal">
        <div className="max-w-7xl mx-auto px-4 md:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img 
              src="https://i.ibb.co/WWRbtPq0/RR-Logo.png" 
              alt="RR Logo" 
              className="w-8 h-8 object-contain" 
              referrerPolicy="no-referrer"
            />
            <span className="text-xs text-slate-300 font-bold">© 2026 Робот Рекрутер RR</span>
          </div>

          <div className="flex gap-4 text-xs text-slate-400 font-semibold">
            <button onClick={() => navigate("/main")} className="hover:text-white transition">Главная</button>
            <button onClick={() => navigate("/vacancy")} className="hover:text-white transition">Каталог</button>
            <button onClick={() => navigate("/employer/crm")} className="hover:text-white transition">Панель CRM</button>
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

            {/* HIGH-FIDELITY ACTIVE CONSTRUCTOR TAB SWITCHER */}
            <div className="flex border-b border-white/10 pb-1 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveEditTab("landing")}
                className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all cursor-pointer select-none flex items-center gap-1.5 ${
                  activeEditTab === "landing"
                    ? "bg-[#112335] text-[#E7C768] border-t-2 border-[#E7C768] shadow-md shadow-black/30"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                🗺️ Конструктор Лендинга Вкладышей
              </button>
              <button
                type="button"
                onClick={() => setActiveEditTab("training")}
                className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all cursor-pointer select-none flex items-center gap-1.5 ${
                  activeEditTab === "training"
                    ? "bg-[#112335] text-[#E7C768] border-t-2 border-[#E7C768] shadow-md shadow-black/30"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                🎓 Конструктор Отбора и Обучения ИИ
              </button>
            </div>

            <form onSubmit={handleSaveEditedProject} className="space-y-5">
              
              {/* Top part: General Vacancy Parameters */}
              <div className="bg-black/25 p-4 rounded-2xl border border-white/5 space-y-4">
                <h3 className="text-xs font-mono uppercase tracking-wider text-[#E7C768] border-b border-white/5 pb-2">
                  📋 Основная информация (постоянная часть)
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[11px] font-bold text-slate-200 block mb-1">Название должности:</label>
                    <input
                      type="text"
                      required
                      className="w-full bg-[#112335] text-xs p-2.5 rounded-xl border border-white/10 text-white focus:outline-[#E7C768]"
                      value={editingProject.roleName}
                      onChange={(e) => setEditingProject({ ...editingProject, roleName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-200 block mb-1">Оплата (кратко на баннер):</label>
                    <input
                      type="text"
                      className="w-full bg-[#112335] text-xs p-2.5 rounded-xl border border-white/10 text-white focus:outline-[#E7C768]"
                      value={editingProject.salaryTerms || ""}
                      onChange={(e) => setEditingProject({ ...editingProject, salaryTerms: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-200 block mb-1">График (кратко на баннер):</label>
                    <input
                      type="text"
                      className="w-full bg-[#112335] text-xs p-2.5 rounded-xl border border-white/10 text-white focus:outline-[#E7C768]"
                      value={editingProject.scheduleTerms || ""}
                      onChange={(e) => setEditingProject({ ...editingProject, scheduleTerms: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[11px] font-bold text-slate-200 block mb-1">Условия мотивации (кратко):</label>
                    <input
                      type="text"
                      className="w-full bg-[#112335] text-xs p-2.5 rounded-xl border border-white/10 text-white focus:outline-[#E7C768]"
                      value={editingProject.motivationText || ""}
                      onChange={(e) => setEditingProject({ ...editingProject, motivationText: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-200 block mb-1">База знаний Wiki (регламент):</label>
                    <input
                      type="text"
                      className="w-full bg-[#112335] text-xs p-2.5 rounded-xl border border-white/10 text-white focus:outline-[#E7C768]"
                      value={editingProject.customWiki || ""}
                      onChange={(e) => setEditingProject({ ...editingProject, customWiki: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-200 block mb-1">Логотип вакансии (ссылка или файл):</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="flex-1 bg-[#112335] text-xs p-2.5 rounded-xl border border-white/10 text-white focus:outline-[#E7C768]"
                        value={editingProject.logoUrl || ""}
                        onChange={(e) => setEditingProject({ ...editingProject, logoUrl: e.target.value })}
                        placeholder="https://i.ibb.co/WWRbtPq0/RR-Logo.png"
                      />
                      <label className="cursor-pointer bg-white/5 border border-white/10 hover:border-[#E7C768] text-xs px-2.5 py-2.5 rounded-xl text-white font-bold select-none text-center flex items-center shrink-0">
                        <span>📂 Файл</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onloadend = () => {
                                if (typeof reader.result === "string") {
                                  setEditingProject({ ...editingProject, logoUrl: reader.result });
                                }
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Middle Section: Switcher of the Interactive Subpages */}
              {activeEditTab === "landing" ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2 border-b border-white/10">
                    <span className="text-xs font-mono uppercase tracking-wider text-[#E7C768]">
                      🛠️ Тексты и живой предпросмотр подстраниц
                    </span>
                    <button
                      type="button"
                      disabled={isEnhancingAllVac}
                      onClick={handleEnhanceAllVacancyLandingFields}
                      className="bg-[#E7C768] hover:bg-amber-300 disabled:opacity-50 text-slate-950 font-extrabold text-[10.5px] px-4 py-1.5 rounded-xl transition-all flex items-center gap-1.5 shadow-lg shadow-amber-950/20 cursor-pointer select-none border-none"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-slate-950 animate-pulse" />
                      <span>{isEnhancingAllVac ? "ИИ Оформляет все блоки..." : "✨ Оформить красиво все блоки лендинга через ИИ"}</span>
                    </button>
                  </div>

                 {/* Subpage Selectors Button Bar */}
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { key: "company", label: "🏢 Компания" },
                    { key: "vacancy", label: "💼 Требования" },
                    { key: "tasksActivity", label: "🎯 Обязанности (Табы)" },
                    { key: "schedule", label: "📅 График" },
                    { key: "motivation", label: "🔥 Мотивация" },
                    { key: "payouts", label: "💵 Выплаты" },
                    { key: "onboarding", label: "🚀 Этапы адаптации" },
                    { key: "team", label: "👥 Команда" },
                    { key: "cabinetTabs", label: "💻 Кабинет (Табы)" },
                    { key: "system", label: "⚙️ Регламенты" }
                  ].map((btn) => {
                    const isActive = editorSubTab === btn.key;
                    return (
                      <button
                        key={btn.key}
                        type="button"
                        onClick={() => setEditorSubTab(btn.key)}
                        className={`transition px-3 py-2 text-xs font-bold rounded-xl border cursor-pointer select-none ${
                          isActive
                            ? "bg-[#E7C768] text-[#112335] border-[#E7C768] shadow-md"
                            : "bg-[#112335]/70 text-slate-300 border-white/5 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        {btn.label}
                      </button>
                    );
                  })}
                </div>

                {/* Split Workspace Column Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-1.5 font-sans">
                  
                  {/* Left Column: Vertical stack of ALL editable fields */}
                  <div className="lg:col-span-5 bg-black/15 p-4 rounded-2xl border border-white/5 space-y-4 max-h-[660px] overflow-y-auto scrollbar-thin">
                    <div className="flex justify-between items-center bg-white/5 p-2 rounded-xl border border-white/5">
                      <span className="text-[10px] font-mono text-emerald-400 uppercase font-bold">Поля редактирования блока</span>
                      <span className="text-[9px] text-slate-400">Кликните по предпросмотру или кнопкам выше</span>
                    </div>

                    {[
                      {
                        key: "company",
                        label: "🏢 О компании и масштабе",
                        hint: "Основные факты, масштаб и достижения компании по строкам:",
                        field: "companyText"
                      },
                      {
                        key: "vacancy",
                        label: "💼 Требования к кандидату",
                        hint: "Опишите требования и базовый пул задач (каждый пункт пишите с новой строки):",
                        field: "vacancyText"
                      },
                      {
                        key: "tasksActivity",
                        label: "🎯 Чем вы будете Заниматься (Табы)",
                        hint: "Раздел интерактивных вкладок задач. Формат: [📞 Название таба] Описание задачи. Каждый пункт с новой строки:",
                        field: "tasksActivityText"
                      },
                      {
                        key: "schedule",
                        label: "📅 График Работы",
                        hint: "Разъясните гибкость смен, тайм-слоты и минимальные часы по строкам:",
                        field: "scheduleText"
                      },
                      {
                        key: "motivation",
                        label: "🔥 Мотивация и привилегии",
                        hint: "Каждый бонус или карьерную опцию пишите с новой строки:",
                        field: "motivationTextDetail"
                      },
                      {
                        key: "payouts",
                        label: "💵 Финансовые Выплаты",
                        hint: "Опишите фикс, сроки аванса и регулярность выплат по строкам:",
                        field: "payoutsText"
                      },
                      {
                        key: "onboarding",
                        label: "🚀 Этапы адаптации",
                        hint: "Каждая вкладка этапа с новой строки в формате: [📝 Название этапа] Подробное описание:",
                        field: "onboardingText"
                      },
                      {
                        key: "team",
                        label: "👥 Наша Команда (Отделы и кураторы)",
                        hint: "Формат: [Отдел] Название и ниже кураторы в формате Имя - Должность. Описание сотрудника:",
                        field: "teamText"
                      },
                      {
                        key: "cabinetTabs",
                        label: "💻 Интерактивный Кабинет (Табы)",
                        hint: "Вкладки рабочих платформ кандидата. Формат: [💻 Название] Описание вкладки | 💡 Регламент:",
                        field: "cabinetTabsText"
                      },
                      {
                        key: "system",
                        label: "⚙️ Регламенты ежедневной отчетности",
                        hint: "Опишите правила и контрольные критерии ежедневного зачета и отчетности по строкам:",
                        field: "systemText"
                      }
                    ].map((item) => {
                      const isActive = editorSubTab === item.key;
                      const getDefaultValue = (k: string) => {
                        if (k === "company") return "• Мы поставляем автоматизированные скрипты и голосовых помощников на рынке СНГ.\n• Создали более 15 крупных интеграций года.\n• Горизонтальная структура команды - у вас всегда есть прямой доступ к лидерам проекта.";
                        if (k === "vacancy") return "• Ведение переговоров с клиентами по готовой базе\n• Внесение информации в простую CRM\n• Консультирование по тарифам\n• Быстрый и вежливый отклик\n• Уверенный пользователь ПК\n• Базовые навыки общения";
                        if (k === "tasksActivity") return "• [📞 Консультация] Клиент интересуется возможностью автоматизации рекламы. Ваша задача - открыть Wiki и направить ссылку на тариф.\n• [📝 CRM Система] Добавить краткую заметку по итогам звонка в карточку сделки.\n• [🤝 Отработка возражений] Помощь клиентам при возникновении сомнений, используя интерактивные скрипты.";
                        if (k === "schedule") return "• Гибкие смены от 4 часов в день во временном интервале с 10:00 до 19:00.\n• Возможность брать выходные в любой день недели.\n• Вы заходите в систему ИИ тогда, когда вам это удобно.";
                        if (k === "motivation") return "• Премии до 30% за высокую скорость заполнения карточек CRM\n• Еженедельные выплаты за успешные звонки\n• Компенсация затрат на интернет\n• Обучение за счет компании и кураторство";
                        if (k === "payouts") return "• Фиксированная оплата за каждый пройденный качественный звонок (от 120 р).\n• Выплаты дважды в месяц без задержек (10 и 25 числа).\n• Официальные начисления на карту любого банка.\n• Бонус за приглашенных друзей - 5000 рублей.";
                        if (k === "onboarding") return "• [📝 Экспресс-тест] Быстрое тестирование навыков через ИИ-Режим\n• [📚 Изучение Wiki] Ознакомление с Wiki базой знаний со всеми регламентами работы\n• [🤖 ИИ-Разговор] Первые симуляционные звонки с качественными подсказками наставника\n• [✍️ Оформление] Подписание официального договора (ГПХ или Самозанятость) за 1 рабочий день";
                        if (k === "team") return "• [Отдел] Отдел телефонных продаж CRM\n• Дмитрий - Тимлид команды. Автор продающих сценариев в Wiki.\n• Ольга - HR куратор. Сопровождает подписание ГПХ договоров.\n• [Отдел] Отдел контроля качества\n• Мария - Специфика обучения. Поможет войти в ритм ИИ-ассистента в первые часы.";
                        if (k === "cabinetTabs") return "• [💻 Панель amoCRM] Вся база клиентов находится в структурированной воронке продаж. При звонке карточка открывается автоматически. Вам нужно зафиксировать этап сделки (например, 'Квалифицирован', 'Отправлено КП' или 'Отказ') и написать краткий комментарий по звонку. Система автоматически напомнит о следующем контакте. | 💡 Регламент: Любое изменение статуса контрагента должно сопровождаться комментарием не менее 4-х слов.\n• [📊 Google Таблицы] Форма ежедневного планового зачета звонков и выполненных задач. Сюда заносится количество совершенных эффективных контактов за смену, отправленные коммерческие предложения и планируемые сделки на завтра. | 💡 Ежедневная отчетность должна заполняться до 20:30 МСК текущего рабочего дня.\n• [📞 IP-Телефония] Набор номеров клиентов происходит прямо со встроенного софтфона в один клик. Нет необходимости вводить номера вручную. Все разговоры автоматически записываются и архивируются. | 💡 Требуется гарнитура с шумоподавлением и стабильное интернет-соединение.";
                        if (k === "system") return "• Ведение клиентской базы в amoCRM: своевременная смена этапов сделок, фиксация договоренностей и комментариев.\n• Google Таблицы: ежедневное заполнение оперативной отчетности в конце своего рабочего дня.\n• IP-Телефония: звонки клиентам в один клик прямо из CRM.\n• Использование интерактивной Wiki для быстрой отработки сложных вопросов.";
                        return "";
                      };
                      return (
                        <div
                          key={item.key}
                          id={`editor-card-${item.key}`}
                          className={`p-3.5 rounded-xl border transition-all duration-300 space-y-2 text-left cursor-pointer ${
                            isActive
                              ? "bg-[#E7C768]/15 border-[#E7C768] shadow-lg ring-1 ring-[#E7C768]/30 scale-[1.01]"
                              : "bg-black/20 border-white/10 hover:border-white/20"
                          }`}
                          onClick={() => setEditorSubTab(item.key)}
                        >
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-[#E7C768]">{item.label}</span>
                            <div className="flex items-center gap-1.5 select-none">
                              <button
                                type="button"
                                title="Оформить блок красиво с ИИ ProTalk"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const currentVal = (editingProject as any)[item.field] !== undefined && (editingProject as any)[item.field] !== null && (editingProject as any)[item.field] !== "" 
                                    ? (editingProject as any)[item.field] 
                                    : getDefaultValue(item.key);
                                  await handleEnhanceSingleVacancyField(item.field, currentVal);
                                }}
                                className="bg-[#E7C768] hover:bg-amber-300 text-slate-950 px-2 py-0.5 rounded-md font-mono text-[9px] font-extrabold shadow-sm flex items-center gap-1 transition-all cursor-pointer"
                              >
                                <Sparkles className="w-2.5 h-2.5" />
                                <span>Полировка ИИ</span>
                              </button>
                              {isActive && (
                                <span className="text-[8px] bg-[#E7C768] text-[#112335] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                                  Выбран
                                </span>
                              )}
                            </div>
                          </div>
                          <p className="text-[9px] text-slate-400 leading-tight">{item.hint}</p>
                          <textarea
                            rows={4}
                            className="w-full bg-[#112335] text-xs p-2 rounded-lg border border-white/10 text-white font-mono focus:outline-none focus:border-[#E7C768] transition scrollbar-thin"
                            value={(editingProject as any)[item.field] !== undefined && (editingProject as any)[item.field] !== null && (editingProject as any)[item.field] !== "" ? (editingProject as any)[item.field] : getDefaultValue(item.key)}
                            onChange={(e) => {
                              setEditingProject({
                                ...editingProject,
                                [item.field]: e.target.value
                              });
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditorSubTab(item.key);
                            }}
                          />
                        </div>
                      );
                    })}

                    <div className="bg-emerald-500/10 border border-emerald-500/25 p-2.5 rounded-xl text-[10px] text-emerald-400 leading-tight">
                      ℹ️ Изменения на правой панели предпросмотра обновляются мгновенно в реальном времени. Нажмите кнопку сохранить внизу для записи.
                    </div>
                  </div>

                  {/* Right Column: Beautiful Live Scroll preview of all blocks with interactive targeting click events */}
                  <div className="lg:col-span-7 bg-[#112335] border border-white/10 rounded-2xl p-4 md:p-5 max-h-[660px] overflow-y-auto scrollbar-thin space-y-6">
                    <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2">
                      <div className="flex items-center gap-1.5 text-xs text-[#E7C768] font-mono font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#E7C768] animate-pulse" />
                        ИНТЕРАКТИВНЫЙ ПРЕДПРОСМОТР (КЛИКНИТЕ НА БЛОК ДЛЯ РЕДАКТИРОВАНИЯ)
                      </div>
                      <span className="text-[8px] text-slate-350">Клик по блоку прокрутит к полю на левой панели!</span>
                    </div>

                    {[
                      { key: "company", label: "🏢 О компании", component: <CompanyView project={editingProject} /> },
                      { key: "vacancy", label: "💼 Требования", component: <VacancyView project={editingProject} /> },
                      { key: "tasksActivity", label: "🎯 Обязанности (Табы)", component: <VacancyView project={editingProject} /> },
                      { key: "schedule", label: "📅 График Работы", component: <ScheduleView project={editingProject} /> },
                      { key: "motivation", label: "🔥 Мотивация и привилегии", component: <MotivationView project={editingProject} /> },
                      { key: "payouts", label: "💵 Финансовые Выплаты", component: <PayoutsView project={editingProject} /> },
                      { key: "onboarding", label: "🚀 Этапы адаптации", component: <OnboardingView project={editingProject} /> },
                      { key: "team", label: "👥 Наша Команда", component: <TeamView project={editingProject} /> },
                      { key: "cabinetTabs", label: "💻 Кабинет (Табы)", component: <SystemView project={editingProject} /> },
                      { key: "system", label: "⚙️ Регламенты", component: <SystemView project={editingProject} /> }
                    ].map((section) => {
                      const isActive = editorSubTab === section.key;
                      return (
                        <div
                          key={section.key}
                          onClick={() => {
                            setEditorSubTab(section.key);
                            setInlineEditSection(section.key);
                            const element = document.getElementById(`editor-card-${section.key}`);
                            if (element) {
                              element.scrollIntoView({ behavior: "smooth", block: "nearest" });
                            }
                          }}
                          className={`cursor-pointer transition-all duration-300 border rounded-2xl p-4 bg-black/15 text-left relative group select-none hover:shadow-md ${
                            isActive
                              ? "border-[#E7C768] ring-2 ring-[#E7C768]/20 bg-[#E7C768]/5 opacity-100"
                              : "border-white/5 opacity-85 hover:border-white/15 hover:opacity-100"
                          }`}
                        >
                          <div className="absolute top-2 right-3 flex items-center gap-1.5 z-10">
                            <span className="text-[8px] bg-sky-500/10 text-sky-400 px-1.5 py-0.5 rounded font-mono font-bold hidden group-hover:inline-block animate-pulse">
                              ✏️ Кликните для редактирования в поп-ап
                            </span>
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                              isActive ? "bg-[#E7C768] text-[#112335]" : "bg-white/5 text-slate-400 group-hover:bg-[#E7C768]/10 group-hover:text-[#E7C768]"
                            }`}>
                              {section.label}
                            </span>
                          </div>
                          
                          <div className="pt-2">
                            {section.component}
                          </div>
                        </div>
                      );
                    })}

                    <div className="text-[9px] text-slate-500 text-right font-mono mt-2 select-none border-t border-white/5 pt-1.5">
                      Режим Интерактивного Конструктора Лендинга Включен
                    </div>
                  </div>

                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Drag-and-drop training files */}
                  <div className="bg-black/25 p-5 rounded-3xl border border-white/10 space-y-3 animate-fadeIn">
                    <span className="text-xs font-bold text-[#E7C768] flex items-center gap-1.5 uppercase font-mono tracking-wider">
                      <Sparkles className="w-4 h-4 text-[#E7C768] animate-pulse" /> Закачать регламенты компании и обучающие материалы
                    </span>
                    <p className="text-[10.5px] text-slate-300 leading-relaxed font-sans">
                      Перетащите сюда файлы с Вашими внутренними регламентами, инструкциями, описанием продукта или скриптами продаж. ИИ ProTalk расшифрует документы, выявит ключевые требования для отбора и автоматически составит учебные материалы соискателя прямо в систему.
                    </p>
                    
                    <div 
                      onClick={() => {
                        const fileInput = document.getElementById("training-materials-file") as HTMLInputElement;
                        if (fileInput) fileInput.click();
                      }}
                      onDragOver={(e) => { e.preventDefault(); setTrainingDragActive(true); }}
                      onDragLeave={() => setTrainingDragActive(false)}
                      onDrop={async (e) => {
                        e.preventDefault();
                        setTrainingDragActive(false);
                        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                          await handleParseTrainingMaterials(e.dataTransfer.files[0].name);
                        }
                      }}
                      className={`cursor-pointer border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
                        trainingDragActive 
                          ? "border-[#E7C768] bg-[#112335]/85 scale-[1.01]" 
                          : "border-white/10 bg-black/15 hover:bg-[#112335]/35"
                      }`}
                    >
                      <input 
                        id="training-materials-file"
                        type="file"
                        className="hidden"
                        onChange={async (e) => {
                          if (e.target.files && e.target.files[0]) {
                            await handleParseTrainingMaterials(e.target.files[0].name);
                          }
                        }}
                      />
                      {isParsingTrainingFile ? (
                        <div className="flex flex-col items-center justify-center gap-1.5 text-[#E7C768] font-bold text-xs py-2">
                          <RefreshCw className="w-5 h-5 animate-spin" />
                          <span>ИИ ProTalk анализирует регламенты и формирует базы знаний...</span>
                        </div>
                      ) : (
                        <div className="space-y-1 font-sans">
                          <div className="text-xs font-bold text-slate-200">
                            Кликните или перетащите регламент для обучения соискателей 📂
                          </div>
                          <p className="text-[9.5px] text-zinc-400">Поддерживаются форматы PDF, DOCX, TXT объёмом до 32 МБ</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-sans">
                    {/* Column 1: СУПЕР-ОТБОР (Интервью чек-лист и ролевая игра роли) */}
                    <div className="bg-black/15 p-5 rounded-2xl border border-white/5 space-y-6 text-left">
                      <div>
                        <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
                          <h4 className="text-xs font-bold text-[#E7C768] uppercase font-mono tracking-wider flex items-center gap-1">
                            📝 ИИ-Чеклист телефонного собеседования
                          </h4>
                          <button
                            type="button"
                            onClick={() => {
                              const listText = (editingProject.checklistQuestions || []).join("\n");
                              handleEnhanceTrainingField("checklistQuestions", listText);
                            }}
                            className="bg-[#E7C768] hover:bg-[#d6b75c] text-slate-950 font-bold text-[9.5px] px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer border-none"
                          >
                            <Sparkles className="w-3 h-3 text-slate-950" />
                            <span>Дополнить ИИ</span>
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-400 mb-2 leading-relaxed">
                          Критерии зачета, по которым Робот-Рекрутер оценивает кандидата на этапе звонка-интервью. Введите каждый критерий с новой строки:
                        </p>
                        <textarea
                          rows={6}
                          className="w-full bg-[#112335] text-xs p-3 rounded-xl border border-white/10 text-white font-mono focus:outline-none focus:border-[#E7C768] transition"
                          value={(editingProject.checklistQuestions || []).join("\n")}
                          onChange={(e) => {
                            setEditingProject({
                              ...editingProject,
                              checklistQuestions: e.target.value.split("\n")
                            });
                          }}
                          placeholder="Пример:&#10;Опыт работы в CRM от 1 года&#10;Грамотная устная русская речь&#10;Готовность к холодным звонкам"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
                          <h4 className="text-xs font-bold text-[#E7C768] uppercase font-mono tracking-wider flex items-center gap-1">
                            🎭 ИИ-Сценарий Ролевой игры / Тренажер
                          </h4>
                          <button
                            type="button"
                            onClick={() => {
                              const scText = (editingProject.roleplayQuestions || []).join("\n");
                              handleEnhanceTrainingField("roleplayQuestions", scText);
                            }}
                            className="bg-[#E7C768] hover:bg-[#d6b75c] text-slate-950 font-bold text-[9.5px] px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer border-none"
                          >
                            <Sparkles className="w-3 h-3 text-slate-950" />
                            <span>Улучшить игру</span>
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-400 mb-2 leading-relaxed">
                          Ситуации возражений и ролевые кейсы, которые Робот сыграет с соискателем в реальном времени. Введите каждую симуляцию с новой строки:
                        </p>
                        <textarea
                          rows={6}
                          className="w-full bg-[#112335] text-xs p-3 rounded-xl border border-white/10 text-white font-mono focus:outline-none focus:border-[#E7C768] transition"
                          value={(editingProject.roleplayQuestions || []).join("\n")}
                          onChange={(e) => {
                            setEditingProject({
                              ...editingProject,
                              roleplayQuestions: e.target.value.split("\n")
                            });
                          }}
                          placeholder="Пример:&#10;Клиент: 'Я передумал покупать ваш скрипт, дорого'. Отработать удержание.&#10;Клиент: 'У меня уже есть amoCRM, зачем мне ассистент?' Отработать ценность."
                        />
                      </div>
                    </div>

                    {/* Column 2: ИНТЕРАКТИВНОЕ ОБУЧЕНИЕ */}
                    <div className="bg-black/15 p-5 rounded-2xl border border-white/5 space-y-4 text-left font-sans">
                      <div className="flex justify-between items-center border-b border-white/10 pb-2">
                        <h4 className="text-xs font-bold text-[#E7C768] uppercase font-mono tracking-wider">
                          📚 Содержание трех учебных разделов ИИ-Обучения
                        </h4>
                      </div>

                      {/* Prof block */}
                      <div className="space-y-1.5 mt-2">
                        <div className="flex justify-between items-center bg-white/5 p-1 rounded-lg">
                          <span className="text-[11px] font-bold text-slate-200">1. Профессиональное обучение (техники, регламенты):</span>
                          <button
                            type="button"
                            onClick={() => handleEnhanceTrainingField("trainingProfText", editingProject.trainingProfText || "")}
                            className="text-[9.5px] bg-[#E7C768] hover:bg-amber-300 text-slate-950 font-bold px-2.5 py-0.5 rounded-md transition-all flex items-center gap-1 cursor-pointer border-none"
                          >
                            <Sparkles className="w-2.5 h-2.5" /> Красиво структурировать
                          </button>
                        </div>
                        <textarea
                          rows={3}
                          className="w-full bg-[#112335] text-xs p-2.5 rounded-xl border border-white/10 text-white focus:outline-none focus:border-[#E7C768] transition"
                          value={editingProject.trainingProfText || ""}
                          onChange={(e) => setEditingProject({ ...editingProject, trainingProfText: e.target.value })}
                          placeholder="Учебный материал по навыкам продаж, обработки возражений, коммуникативным правилам..."
                        />
                      </div>

                      {/* Product block */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center bg-white/5 p-1 rounded-lg">
                          <span className="text-[11px] font-bold text-slate-200">2. Обучение продукту и услугам компании:</span>
                          <button
                            type="button"
                            onClick={() => handleEnhanceTrainingField("trainingProductText", editingProject.trainingProductText || "")}
                            className="text-[9.5px] bg-[#E7C768] hover:bg-amber-300 text-slate-950 font-bold px-2.5 py-0.5 rounded-md transition-all flex items-center gap-1 cursor-pointer border-none"
                          >
                            <Sparkles className="w-2.5 h-2.5" /> Сделать продающим
                          </button>
                        </div>
                        <textarea
                          rows={3}
                          className="w-full bg-[#112335] text-xs p-2.5 rounded-xl border border-white/10 text-white focus:outline-none focus:border-[#E7C768] transition"
                          value={editingProject.trainingProductText || ""}
                          onChange={(e) => setEditingProject({ ...editingProject, trainingProductText: e.target.value })}
                          placeholder="Информация о тарифах, продуктовой линейке, преимуществах для клиентов компании..."
                        />
                      </div>

                      {/* System block */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center bg-white/5 p-1 rounded-lg">
                          <span className="text-[11px] font-bold text-slate-200">3. Обучение процессам и системе сдачи отчетов:</span>
                          <button
                            type="button"
                            onClick={() => handleEnhanceTrainingField("trainingSystemText", editingProject.trainingSystemText || "")}
                            className="text-[9.5px] bg-[#E7C768] hover:bg-amber-300 text-slate-950 font-bold px-2.5 py-0.5 rounded-md transition-all flex items-center gap-1 cursor-pointer border-none"
                          >
                            <Sparkles className="w-2.5 h-2.5" /> Переоформить по пунктам
                          </button>
                        </div>
                        <textarea
                          rows={3}
                          className="w-full bg-[#112335] text-xs p-2.5 rounded-xl border border-white/10 text-white focus:outline-none focus:border-[#E7C768] transition"
                          value={editingProject.trainingSystemText || ""}
                          onChange={(e) => setEditingProject({ ...editingProject, trainingSystemText: e.target.value })}
                          placeholder="Правила ведения CRM сделок, временные интервалы смен, стандарты сдачи вечерних Excel/Google отчетов..."
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Botton control buttons */}
              <div className="pt-4 border-t border-white/10 flex gap-3">
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="cursor-pointer flex-1 bg-gradient-to-r from-emerald-600 to-teal-700 font-extrabold py-3 px-5 rounded-xl hover:shadow-xl hover:brightness-110 transition disabled:opacity-55 text-sm"
                >
                  {isSavingEdit ? "Сохранение изменений в БД..." : "💾 Сохранить изменения вакансии"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingProject(null)}
                  className="cursor-pointer bg-white/5 hover:bg-white/10 border border-white/10 px-5 py-3 rounded-xl text-slate-300 font-bold transition text-sm"
                >
                  Отмена
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
