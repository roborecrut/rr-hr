import React, { useState } from "react";
import { 
  Briefcase, Sparkles, Building2, Rocket, DollarSign, Calendar, Users, Cpu,
  CheckCircle2, Clock, Award, PhoneCall, Check, UserCheck, Play, ArrowRight,
  TrendingUp, ShieldCheck, HeartHandshake, HelpCircle, Eye, CalendarDays, BarChart2,
  Calculator
} from "lucide-react";
import { JobProject } from "../types";

interface SectionProps {
  project: JobProject;
  onChangeText?: (field: string, val: string) => void;
  isEditable?: boolean;
}

// -------------------------------------------------------------
// 1. 💼 VACANCY VIEW
// -------------------------------------------------------------
export const VacancyView: React.FC<SectionProps> = ({ project, onChangeText, isEditable }) => {
  const [activeTaskIndex, setActiveTaskIndex] = useState(0);
  const text = project.vacancyText || "• Ведение переговоров с клиентами по готовой базе\n• Внесение информации в простую CRM\n• Консультирование по тарифам\n• Быстрый и вежливый отклик\n• Уверенный пользователь ПК\n• Базовые навыки общения";

  // Parse lines
  const lines = text.split("\n").map(l => l.replace(/^[•\s-*]+/, "").trim()).filter(Boolean);
  const tasks = lines.slice(0, Math.ceil(lines.length / 2));
  const requirements = lines.slice(Math.ceil(lines.length / 1.8));

  // Dynamic Activity Tabs parser
  const activityText = project.tasksActivityText || "• [📞 Консультация] Клиент интересуется возможностью автоматизации рекламы. Ваша задача - открыть Wiki и направить ссылку на тариф.\n• [📝 Ведение CRM] Добавить краткую заметку по итогам звонка. Например: 'Интерес подтвержден, ждет ссылку на оплату'.\n• [🤝 Возражения] Если клиент говорит 'Дорого', объяснить ценность окупаемости ИИ-сервисов за первый месяц работы.";
  const activityLines = activityText.split("\n").map(l => l.replace(/^[•\s-*]+/, "").trim()).filter(Boolean);

  const parsedActivities = activityLines.map((l, idx) => {
    const match = l.match(/^\[(.*?)\]\s*(.*)$/);
    if (match) {
      return {
        title: match[1],
        desc: match[2]
      };
    }
    const defaultActivities = [
      { title: "📞 Консультация", desc: l },
      { title: "📝 Ведение CRM", desc: l },
      { title: "🤝 Возражения", desc: l }
    ];
    return defaultActivities[idx % defaultActivities.length] || { title: `Задача ${idx + 1}`, desc: l };
  });

  const activeActivity = parsedActivities[activeTaskIndex] || parsedActivities[0] || { title: "Задача", desc: "Описание настраивается..." };

  return (
    <div className="space-y-6">
      {isEditable && (
        <div className="space-y-3 bg-[#1E4468]/80 border border-white/5 rounded-2xl p-4 text-left">
          <div className="flex justify-between items-center">
            <label className="text-xs font-bold text-amber-300 block">Раздел &quot;Чем вы будете заниматься&quot; (Табы и содержание):</label>
            <span className="text-[10px] text-slate-400">Формат: [Название Таба] Описание задачи</span>
          </div>
          <textarea
            className="w-full bg-[#17344F]/90 text-xs p-3 rounded-xl border border-white/10 text-white font-mono focus:outline-[#E7C768]"
            rows={5}
            value={activityText}
            onChange={(e) => onChangeText?.("tasksActivityText", e.target.value)}
            placeholder="Каждая вкладка с новой строки в формате: [Вкладка] Описание"
          />
          <div className="text-[10px] text-slate-350 bg-white/5 p-2 rounded-xl border border-white/5 font-sans leading-relaxed">
            💡 Напишите <strong>[📞 Консультация] Описание задачи</strong> для кастомизации табов в режиме превью.
          </div>
        </div>
      )}

      {/* Dynamic Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        
        {/* Main Responsibilities Block */}
        <div className="bg-[#1E4468]/85 border border-[#E7C768]/15 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-white/5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <Briefcase className="w-4 h-4" />
            </div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-300">Пул Ключевых Задач</h4>
          </div>

          {isEditable ? (
            <textarea
              className="w-full bg-[#17344F]/90 text-xs p-3 rounded-xl border border-white/10 text-white font-mono focus:outline-[#E7C768]"
              rows={5}
              value={text}
              onChange={(e) => onChangeText?.("vacancyText", e.target.value)}
              placeholder="Каждая строка с новой строки"
            />
          ) : (
            <div className="space-y-3 text-left">
              {tasks.map((task, idx) => (
                <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-200">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 text-[10px] font-bold">
                    {idx + 1}
                  </span>
                  <span className="leading-relaxed">{task}</span>
                </div>
              ))}
              {tasks.length === 0 && <span className="text-slate-400 italic">Задачи не указаны</span>}
            </div>
          )}
        </div>

        {/* Requirements Block */}
        <div className="bg-[#1E4468]/85 border border-[#E7C768]/15 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-white/5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
              <Award className="w-4 h-4" />
            </div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300">Требования к кандидату</h4>
          </div>

          {isEditable ? (
            <p className="text-[10px] text-slate-400 italic text-left">Редактируется в поле слева в общей форме, разбивается автоматически по строкам для визуализации требований.</p>
          ) : (
            <div className="space-y-3 text-left">
              {requirements.map((req, idx) => (
                <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-200">
                  <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{req}</span>
                </div>
              ))}
              {requirements.length === 0 && (
                <div className="space-y-3">
                  <div className="flex items-start gap-2.5 text-xs text-slate-200"><CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" /> Хорошая дикция и вежливый тон</div>
                  <div className="flex items-start gap-2.5 text-xs text-slate-200"><CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" /> Наличие гарнитуры и ПК</div>
                </div>
              )}
            </div>
          )}
        </div>

      </div>

      {/* Interactive Activity Tab System */}
      {parsedActivities.length > 0 && (
        <div className="bg-black/20 border border-white/5 rounded-2xl p-4 sm:p-5 text-left">
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#E7C768] mb-3 flex items-center gap-1.5 font-bold">
            <Eye className="w-3.5 h-3.5 animate-pulse text-[#E7C768]" /> Чем вы будете Заниматься: Ежедневный процесс
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
            {parsedActivities.map((t, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveTaskIndex(idx)}
                className={`transition text-[10px] sm:text-xs font-bold p-2.5 rounded-xl border text-center cursor-pointer ${
                  activeTaskIndex === idx 
                    ? "bg-[#E7C768] text-[#17344F] border-[#E7C768] shadow-md" 
                    : "bg-[#17344F]/70 text-slate-300 border-white/5 hover:bg-white/5"
                }`}
              >
                {t.title}
              </button>
            ))}
          </div>
          <div className="bg-[#17344F] border border-[#E7C768]/10 p-3.5 rounded-xl block min-h-[50px]">
            <p className="text-xs text-slate-350 leading-relaxed font-sans">{activeActivity.desc}</p>
            <div className="mt-3 flex items-center gap-1 text-[10px] text-[#E7C768] font-mono font-bold">
              <CheckCircle2 className="w-3.5 h-3.5 inline text-emerald-400" /> Все необходимые регламенты и подсказки будут доступны в ИИ-Кабинете!
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// -------------------------------------------------------------
// 2. 🔥 MOTIVATION VIEW
// -------------------------------------------------------------
export const MotivationView: React.FC<SectionProps> = ({ project, onChangeText, isEditable }) => {
  const detailText = project.motivationTextDetail || "• Премии до 30% за высокую скорость заполнения карточек CRM\n• Еженедельные выплаты за успешные звонки\n• Компенсация затрат на интернет\n• Обучение за счет компании и кураторство";
  const bannerText = project.motivationText || "";
  const points = detailText.split("\n").map(l => l.replace(/^[•\s-*]+/, "").trim()).filter(Boolean);

  return (
    <div className="space-y-6">
      {isEditable ? (
        <div className="space-y-3 bg-[#1E4468]/80 border border-white/5 rounded-2xl p-5">
          <label className="text-xs font-bold text-amber-300 block">Краткая мотивация (баннер):</label>
          <textarea
            className="w-full bg-[#17344F]/90 text-xs p-3 rounded-xl border border-white/10 text-white font-mono focus:outline-[#E7C768]"
            rows={2}
            value={bannerText}
            onChange={(e) => onChangeText?.("motivationText", e.target.value)}
            placeholder="Одно-два предложения для верхнего блока"
          />
          <label className="text-xs font-bold text-amber-300 block">Полный текст мотивации и льгот:</label>
          <textarea
            className="w-full bg-[#17344F]/90 text-xs p-3 rounded-xl border border-white/10 text-white font-mono focus:outline-[#E7C768]"
            rows={5}
            value={detailText}
            onChange={(e) => onChangeText?.("motivationTextDetail", e.target.value)}
            placeholder="Каждое преимущество пишите с новой строки для генерации анимированных карточек"
          />
        </div>
      ) : (
        <div className="space-y-5">
          {bannerText && (
            <div className="bg-gradient-to-r from-[#1E4468] to-[#265582] border-l-4 border-[#E7C768] p-4 rounded-r-2xl text-left">
              <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-widest block mb-1">Главное о мотивации</span>
              <p className="text-xs text-white font-medium leading-relaxed">{bannerText}</p>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {points.map((pt, i) => (
            <div key={i} className="bg-gradient-to-br from-[#1E4468] to-[#265582] border border-white/5 hover:border-amber-500/20 p-4 rounded-2xl flex items-start gap-3 transition hover:shadow-lg">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 shrink-0">
                {i % 2 === 0 ? <Sparkles className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
              </div>
              <div>
                <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-widest block">Бонус {i + 1}</span>
                <p className="text-xs text-white font-medium leading-relaxed mt-1">{pt}</p>
              </div>
            </div>
          ))}
          {points.length === 0 && (
            <span className="text-xs text-slate-400 italic">Специальные льготы пока не описаны. Вы можете отредактировать их в кабинете работодателя.</span>
          )}
          </div>
        </div>
      )}
    </div>
  );
};

// -------------------------------------------------------------
// 3. 🏢 COMPANY VIEW
// -------------------------------------------------------------
export const CompanyView: React.FC<SectionProps> = ({ project, onChangeText, isEditable }) => {
  const text = project.companyText || "• Мы поставляем автоматизированные скрипты и голосовых помощников на рынке СНГ.\n• Создали более 15 крупных интеграций года.\n• Горизонтальная структура команды - у вас всегда есть прямой доступ к лидерам проекта.";
  const bullets = text.split("\n").map(l => l.replace(/^[•\s-*]+/, "").trim()).filter(Boolean);

  const stats = [
    { label: project.statsLabelClients || "Клиентов в СНГ", value: project.statsValClients || "350+" },
    { label: project.statsLabelDialogs || "ИИ-диалогов в сутки", value: project.statsValDialogs || "15 000+" },
    { label: project.statsLabelFounded || "Год основания", value: project.statsValFounded || "2021" }
  ];

  const mission = project.missionText || "Наша миссия — избавить людей от рутины в холодных звонках, автоматизировав базовую квалификацию лидов. Каждый день мы упрощаем работу сотрудникам отделов продаж по всему миру.";

  return (
    <div className="space-y-6">
      {isEditable ? (
        <div className="space-y-4 bg-[#1E4468]/80 border border-white/5 rounded-2xl p-5">
          <div className="space-y-2">
            <label className="text-xs font-bold text-amber-300 block">Презентация компании на лендинге:</label>
            <textarea
              className="w-full bg-[#17344F]/90 text-xs p-3 rounded-xl border border-white/10 text-white font-mono focus:outline-[#E7C768]"
              rows={4}
              value={text}
              onChange={(e) => onChangeText?.("companyText", e.target.value)}
              placeholder="Каждый факт о масштабе пишите с новой строки для красивой верстки"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-amber-300 block">Цитата / Миссия компании:</label>
            <textarea
              className="w-full bg-[#17344F]/90 text-xs p-2.5 rounded-xl border border-white/10 text-white focus:outline-[#E7C768]"
              rows={2}
              value={mission}
              onChange={(e) => onChangeText?.("missionText", e.target.value)}
              placeholder="Опишите глобальную миссию компании"
            />
          </div>

          <div className="border-t border-white/5 pt-3">
            <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold block mb-2">🔥 Настройка 3-х счетчиков/характеристик</span>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-[#17344F]/50 p-2.5 border border-white/5 rounded-xl space-y-1.5">
                <span className="text-[9px] text-slate-400 block font-bold">Счетчик 1 (Клиенты):</span>
                <input
                  type="text"
                  className="w-full bg-[#17344F] text-xs p-1.5 rounded-lg border border-white/10 text-white font-bold"
                  value={project.statsValClients !== undefined && project.statsValClients !== null ? project.statsValClients : "350+"}
                  onChange={(e) => onChangeText?.("statsValClients", e.target.value)}
                  placeholder="Значение"
                />
                <input
                  type="text"
                  className="w-full bg-[#17344F] text-[10px] p-1.5 rounded-lg border border-white/10 text-slate-350"
                  value={project.statsLabelClients !== undefined && project.statsLabelClients !== null ? project.statsLabelClients : "Клиентов в СНГ"}
                  onChange={(e) => onChangeText?.("statsLabelClients", e.target.value)}
                  placeholder="Подпись"
                />
              </div>

              <div className="bg-[#17344F]/50 p-2.5 border border-white/5 rounded-xl space-y-1.5">
                <span className="text-[9px] text-slate-400 block font-bold">Счетчик 2 (ИИ диалоги):</span>
                <input
                  type="text"
                  className="w-full bg-[#17344F] text-xs p-1.5 rounded-lg border border-white/10 text-white font-bold"
                  value={project.statsValDialogs !== undefined && project.statsValDialogs !== null ? project.statsValDialogs : "15 000+"}
                  onChange={(e) => onChangeText?.("statsValDialogs", e.target.value)}
                  placeholder="Значение"
                />
                <input
                  type="text"
                  className="w-full bg-[#17344F] text-[10px] p-1.5 rounded-lg border border-white/10 text-slate-350"
                  value={project.statsLabelDialogs !== undefined && project.statsLabelDialogs !== null ? project.statsLabelDialogs : "ИИ-диалогов в сутки"}
                  onChange={(e) => onChangeText?.("statsLabelDialogs", e.target.value)}
                  placeholder="Подпись"
                />
              </div>

              <div className="bg-[#17344F]/50 p-2.5 border border-white/5 rounded-xl space-y-1.5">
                <span className="text-[9px] text-slate-400 block font-bold">Счетчик 3 (Основание):</span>
                <input
                  type="text"
                  className="w-full bg-[#17344F] text-xs p-1.5 rounded-lg border border-white/10 text-white font-bold"
                  value={project.statsValFounded !== undefined && project.statsValFounded !== null ? project.statsValFounded : "2021"}
                  onChange={(e) => onChangeText?.("statsValFounded", e.target.value)}
                  placeholder="Значение"
                />
                <input
                  type="text"
                  className="w-full bg-[#17344F] text-[10px] p-1.5 rounded-lg border border-white/10 text-slate-350"
                  value={project.statsLabelFounded !== undefined && project.statsLabelFounded !== null ? project.statsLabelFounded : "Год основания"}
                  onChange={(e) => onChangeText?.("statsLabelFounded", e.target.value)}
                  placeholder="Подпись"
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Quote Block */}
          <div className="bg-gradient-to-r from-[#1E4468] to-[#265582] border-l-4 border-[#E7C768] p-4 rounded-r-2xl text-left">
            <span className="text-2xl font-serif text-[#E7C768] leading-none select-none">“</span>
            <p className="text-xs italic text-slate-200 mt-1 font-sans leading-relaxed">
              {mission}
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-2.5">
            {stats.map((st, i) => (
              <div key={i} className="bg-black/20 border border-white/5 p-3 rounded-xl text-center">
                <span className="text-sm font-black text-[#E7C768] block">{st.value}</span>
                <span className="text-[9px] text-slate-400 mt-0.5 block leading-tight">{st.label}</span>
              </div>
            ))}
          </div>

          {/* Bullet points fact checklist */}
          <div className="bg-[#1E4468]/50 border border-white/5 p-4 rounded-xl space-y-3 text-left">
            <h5 className="text-[10px] font-bold text-[#E7C768] uppercase font-mono tracking-wider">Факты о компании:</h5>
            <div className="space-y-2.5">
              {bullets.map((b, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-slate-200">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{b}</span>
                </div>
              ))}
              {bullets.length === 0 && <span className="text-slate-400 italic">Сведения отсутствуют</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// -------------------------------------------------------------
// 4. 🚀 ONBOARDING VIEW
// -------------------------------------------------------------
export const OnboardingView: React.FC<SectionProps> = ({ project, onChangeText, isEditable }) => {
  const text = project.onboardingText || "• [📝 Экспресс-тест] Быстрое тестирование навыков через ИИ-Режим\n• [📚 Изучение Wiki] Ознакомление с Wiki базой знаний\n• [🤖 ИИ-Разговор] Первые симуляционные звонки с подсказками ИИ\n• [✍️ Оформление] Подписание договора (ГПХ или Самозанятость) за 1 день";
  const steps = text.split("\n").map(l => l.replace(/^[•\s-*]+/, "").trim()).filter(Boolean);

  const [viewStep, setViewStep] = useState(0);

  const parsedSteps = steps.map((l, idx) => {
    const match = l.match(/^\[(.*?)\]\s*(.*)$/);
    if (match) {
      return {
        title: match[1],
        desc: match[2]
      };
    }
    const defaultTitles = [
      "📝 Экспресс-тест",
      "📚 Изучение Wiki",
      "🤖 ИИ-Разговор",
      "✍️ Оформление"
    ];
    return {
      title: defaultTitles[idx] || `Шаг ${idx + 1}`,
      desc: l
    };
  });

  const activeStep = parsedSteps[viewStep] || parsedSteps[0] || { title: "Шаг", desc: "Сведения подгружаются..." };

  return (
    <div className="space-y-6">
      {isEditable ? (
        <div className="space-y-3 bg-[#1E4468]/80 border border-white/5 rounded-2xl p-5">
          <div className="flex justify-between items-center">
            <label className="text-xs font-bold text-amber-300 block">Этапы ввода в должность и оформления:</label>
            <span className="text-[10px] text-slate-400">Формат: [Заголовок] Описание</span>
          </div>
          <textarea
            className="w-full bg-[#17344F]/90 text-xs p-3 rounded-xl border border-white/10 text-white font-mono focus:outline-[#E7C768]"
            rows={6}
            value={text}
            onChange={(e) => onChangeText?.("onboardingText", e.target.value)}
            placeholder="Каждый шаг с новой строки для отрисовки красивой интерактивного таймлайна"
          />
          <div className="text-[10px] text-slate-350 bg-white/5 p-2 rounded-xl border border-white/5 font-sans">
            💡 Напишите <strong>[📝 Экспресс-тест] Описание этапа</strong>, чтобы кастомизировать заголовки кнопок и табов.
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#E7C768] font-mono">ЭТАПЫ АДАПТАЦИИ:</span>
          </div>

          {/* Stepper Header Navigation */}
          {parsedSteps.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {parsedSteps.map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setViewStep(idx)}
                  className={`transition p-2 rounded-xl text-center border font-bold text-[9px] sm:text-xs cursor-pointer ${
                    viewStep === idx
                      ? "bg-[#E7C768] text-[#17344F] border-[#E7C768]"
                      : "bg-[#17344F]/40 text-slate-300 border-white/5 hover:bg-white/5"
                  }`}
                >
                  {s.title}
                </button>
              ))}
            </div>
          )}

          {/* Stepper body display */}
          <div className="bg-[#1E4468] p-4 sm:p-5 rounded-2xl border border-white/10 text-left relative overflow-hidden">
            <div className="absolute right-3 top-3 text-[50px] font-serif font-black select-none text-white/5">
              0{viewStep + 1}
            </div>

            <div className="space-y-2 relative z-10">
              <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider block">
                {activeStep.title}
              </span>
              <p className="text-xs text-white leading-relaxed font-sans font-medium">
                {activeStep.desc}
              </p>
              <div className="mt-4 pt-3.5 border-t border-white/5 flex items-center justify-between">
                <span className="text-[10px] text-emerald-400 font-mono font-bold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Вся процедура полностью автоматизирована
                </span>
                <span className="text-[10px] text-slate-400 leading-none">Шаг {viewStep + 1} из {parsedSteps.length}</span>
              </div>
            </div>
          </div>

          {/* Interactive Flow visual list */}
          <div className="border border-white/5 rounded-xl bg-black/10 p-3 space-y-2 text-left">
            <span className="text-[9px] text-[#E7C768] font-mono block">ПОЛНЫЙ ПУТЬ СОИСКАТЕЛЯ:</span>
            <div className="space-y-2.5">
              {parsedSteps.map((st, idx) => (
                <div key={idx} className="flex items-center gap-2.5 text-xs">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 ${viewStep === idx ? "bg-[#E7C768] text-black" : "bg-white/15 text-white"}`}>
                    {idx + 1}
                  </div>
                  <span className={`text-xs leading-relaxed ${viewStep === idx ? "text-white font-bold" : "text-slate-400"}`}>
                    <strong className="text-[#E7C768]/80 font-mono text-[10px] mr-1">[{st.title}]</strong> {st.desc}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// -------------------------------------------------------------
// 5. 💵 PAYOUTS VIEW
// -------------------------------------------------------------
export const PayoutsView: React.FC<SectionProps> = ({ project, onChangeText, isEditable }) => {
  const text = project.payoutsText || "• Фиксированная оплата за каждый пройденный качественный звонок (от 120 р).\n• Выплаты дважды в месяц без задержек (10 и 25 числа).\n• Официальные начисления на карту любого банка.\n• Бонус за приглашенных друзей - 5000 рублей.";
  const payoutLines = text.split("\n").map(l => l.replace(/^[•\s-*]+/, "").trim()).filter(Boolean);

  return (
    <div className="space-y-6">
      {isEditable ? (
        <div className="space-y-3 bg-[#1E4468]/80 border border-white/5 rounded-2xl p-5">
          <label className="text-xs font-bold text-amber-300 block">Условия выплат и премий:</label>
          <textarea
            className="w-full bg-[#17344F]/90 text-xs p-3 rounded-xl border border-white/10 text-white font-mono focus:outline-[#E7C768]"
            rows={5}
            value={text}
            onChange={(e) => onChangeText?.("payoutsText", e.target.value)}
            placeholder="Каждая строка текста с новой строки"
          />
        </div>
      ) : (
        <div className="space-y-5">
          
          {/* Visual Payout parameters from database */}
          <div className="bg-black/10 border border-white/5 p-4 rounded-xl space-y-3.5 text-left">
            <span className="text-[10px] font-mono text-slate-300 block uppercase tracking-wider">💳 Детали начислений и вознаграждения:</span>
            <div className="space-y-2.5">
              {payoutLines.map((pay, i) => (
                <div key={i} className="flex items-start gap-2.5 text-xs text-slate-200">
                  <span className="w-5 h-5 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 text-[10px] font-bold font-mono">
                    {i + 1}
                  </span>
                  <span>{pay}</span>
                </div>
              ))}
              {payoutLines.length === 0 && <span className="text-slate-400 italic">Сведения пока отсутствуют.</span>}
            </div>
          </div>

        </div>
      )}
    </div>
  );
};

// -------------------------------------------------------------
// 6. 📅 SCHEDULE VIEW
// -------------------------------------------------------------
export const ScheduleView: React.FC<SectionProps> = ({ project, onChangeText, isEditable }) => {
  const text = project.scheduleText || "• Гибкие смены от 4 часов в день во временном интервале с 09:00 до 21:00.\n• Возможность брать выходные в любой день недели.\n• Вы заходите в систему ИИ тогда, когда вам это удобно.";
  const lines = text.split("\n").map(l => l.replace(/^[•\s-*]+/, "").trim()).filter(Boolean);

  return (
    <div className="space-y-6">
      {isEditable ? (
        <div className="space-y-3 bg-[#1E4468]/80 border border-white/5 rounded-2xl p-5">
          <label className="text-xs font-bold text-amber-300 block">Разъяснение графика смен:</label>
          <textarea
            className="w-full bg-[#17344F]/90 text-xs p-3 rounded-xl border border-white/10 text-white font-mono focus:outline-[#E7C768]"
            rows={5}
            value={text}
            onChange={(e) => onChangeText?.("scheduleText", e.target.value)}
            placeholder="Пишите каждую ключевую деталь о сменах с новой строки"
          />
        </div>
      ) : (
        <div className="space-y-5">
          
          {/* List parameters from DB */}
          <div className="bg-black/10 border border-white/5 p-4 rounded-xl space-y-3 text-left">
            <span className="text-[10px] font-mono text-slate-300 block uppercase tracking-widest">📅 Параметры гибкости и смен:</span>
            <div className="space-y-2.5">
              {lines.map((l, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-slate-200">
                  <div className="w-2.5 h-2.5 rounded-full bg-sky-500 shrink-0 mt-1" />
                  <span>{l}</span>
                </div>
              ))}
              {lines.length === 0 && <span className="text-slate-400 italic">Сведения уточняются при звонке.</span>}
            </div>
          </div>

        </div>
      )}
    </div>
  );
};

// -------------------------------------------------------------
// 7. 👥 TEAM VIEW (MEET THE LECTURERS & MENTORS)
// -------------------------------------------------------------
export const TeamView: React.FC<SectionProps> = ({ project, onChangeText, isEditable }) => {
  const text = project.teamText || "• [Отдел] Отдел телефонных продаж CRM\n• Дмитрий - Тимлид команды. Автор продающих сценариев в Wiki.\n• Ольга - HR куратор. Сопровождает подписание ГПХ договоров.\n• [Отдел] Отдел контроля качества\n• Мария - Специфика обучения. Поможет войти в ритм ИИ-ассистента в первые часы.";
  const lines = text.split("\n").map(l => l.replace(/^[•\s-*]+/, "").trim()).filter(Boolean);

  const defaultMentors = [
    { title: "Дмитрий", subtitle: "Тимлид проектов", text: "Составил идеальные Wiki-разборы, проходя по которым легко закрыть любое возражение за секунду.", email: "dmitry-sales@company.ru" },
    { title: "Ольга", subtitle: "HR куратор", text: "Отвечает за регистрацию договоров в базе, выдачу документов и автоматизированные начисления.", email: "olga-hr@company.ru" },
    { title: "Мария", subtitle: "Обучение кадров", text: "Поможет сдать тестовый разговор в ИИ-режиме с первой попытки без лишнего стресса.", email: "maria-study@company.ru" }
  ];

  // Parse departments and employee lists
  const parsedGroups: { department: string; members: { title: string; subtitle: string; text: string }[] }[] = [];
  let currentDept = "Отдел адаптации соискателей";
  let activeMembers: { title: string; subtitle: string; text: string }[] = [];

  lines.forEach((l, idx) => {
    const isDept = l.startsWith("[Отдел]") || l.startsWith("Отдел:") || l.startsWith("[Департамент]");
    if (isDept) {
      if (activeMembers.length > 0) {
        parsedGroups.push({ department: currentDept, members: activeMembers });
      }
      currentDept = l.replace(/^(\[Отдел\]|Отдел:|\[Департамент\])\s*/i, "").trim();
      activeMembers = [];
    } else {
      // Try format: "[Tag] Name — Role/desc"  or  "[Tag] Name - Role/desc"
      const tagMatch = l.match(/^\[([^\]]+)\]\s*(.+)$/);
      if (tagMatch) {
        const tag = tagMatch[1].trim();
        const rest = tagMatch[2].trim();
        const sepMatch = rest.match(/\s+[—–-]\s+/);
        if (sepMatch) {
          const sepIx = rest.indexOf(sepMatch[0]);
          const name = rest.substring(0, sepIx).trim();
          const desc = rest.substring(sepIx + sepMatch[0].length).trim();
          activeMembers.push({ title: name, subtitle: tag, text: desc });
        } else {
          activeMembers.push({ title: rest, subtitle: tag, text: rest });
        }
      } else {
        // Fallback format: "Name - Role. Description"
        const sepMatch = l.match(/\s+[—–-]\s+/);
        if (sepMatch) {
          const sepIx = l.indexOf(sepMatch[0]);
          const name = l.substring(0, sepIx).trim();
          const rest = l.substring(sepIx + sepMatch[0].length).trim();
          const dotIx = rest.indexOf(".");
          const role = dotIx !== -1 ? rest.substring(0, dotIx).trim() : "Куратор";
          const desc = dotIx !== -1 ? rest.substring(dotIx + 1).trim() : rest;
          activeMembers.push({ title: name, subtitle: role, text: desc });
        } else {
          const fallback = defaultMentors[idx % defaultMentors.length] || { title: "Сотрудник", subtitle: "Куратор новичков", text: l };
          activeMembers.push({ title: fallback.title, subtitle: fallback.subtitle, text: l });
        }
      }
    }
  });

  if (activeMembers.length > 0 || parsedGroups.length === 0) {
    parsedGroups.push({ department: currentDept, members: activeMembers });
  }

  return (
    <div className="space-y-6">
      {isEditable ? (
        <div className="space-y-3 bg-[#1E4468]/80 border border-white/5 rounded-2xl p-5">
          <div className="flex justify-between items-center">
            <label className="text-xs font-bold text-amber-300 block">Команда адаптации соискателей по отделам:</label>
            <span className="text-[10px] text-slate-400">Формат: [Отдел] Название ИЛИ Имя - Роль. Текст.</span>
          </div>
          <textarea
            className="w-full bg-[#17344F]/90 text-xs p-3 rounded-xl border border-white/10 text-white font-mono focus:outline-[#E7C768]"
            rows={7}
            value={text}
            onChange={(e) => onChangeText?.("teamText", e.target.value)}
            placeholder="[Отдел] Название отдела&#10;Имя - Должность. Описание сотрудника"
          />
          <div className="text-[10px] text-slate-350 bg-white/5 p-2 rounded-xl border border-white/5 font-sans">
            💡 Напишите <strong>[Отдел] Отдел продаж</strong>, чтобы разбить сотрудников на соответствующие подразделения.
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <span className="text-[10px] font-mono text-slate-300 block uppercase tracking-widest text-left">👥 Структура отделов и наставники компании:</span>
          
          <div className="space-y-6">
            {parsedGroups.map((group, groupIdx) => (
              <div key={groupIdx} className="space-y-3.5 text-left">
                <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                  <div className="w-1.5 h-3.5 bg-[#E7C768] rounded-full animate-pulse" />
                  <h4 className="text-[11px] font-extrabold text-[#E7C768] uppercase tracking-wider">{group.department}</h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {group.members.map((m, i) => (
                    <div key={i} className="bg-gradient-to-b from-[#1E4468] to-[#265582] border border-white/15 p-4 rounded-2xl text-left space-y-2.5 relative hover:border-amber-500/20 transition hover:shadow-lg">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-full bg-[#E7C768]/10 text-[#E7C768] flex items-center justify-center font-bold text-sm border border-[#E7C768]/20 select-none">
                          {m.title.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <h5 className="text-xs font-black text-white">{m.title}</h5>
                          <span className="text-[9px] text-amber-300 font-mono font-bold uppercase tracking-wider leading-none mt-0.5 block">{m.subtitle}</span>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-300 leading-normal font-sans pt-1">
                        &ldquo;{m.text}&rdquo;
                      </p>

                      <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[9px] text-slate-400 font-mono">
                        <span>Консультирует 24/7</span>
                        <span className="text-emerald-400">В сети</span>
                      </div>
                    </div>
                  ))}
                  {group.members.length === 0 && (
                    <span className="text-slate-400 italic text-[11px]">В данном отделе кураторы не распределены.</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-[#1E4468]/60 border border-white/10 p-4 rounded-2xl text-left flex items-start gap-3">
            <HeartHandshake className="w-5 h-5 text-[#E7C768] shrink-0 mt-0.5" />
            <div>
              <h5 className="text-xs font-black text-white">Всегда на связи в Telegram</h5>
              <p className="text-[10px] text-slate-300 leading-relaxed mt-0.5">После успешной сдачи ИИ-собеседования вас автоматически подключат к чату адаптации вашей группы.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// -------------------------------------------------------------
// 8. ⚙️ SYSTEM VIEW (DAILY WORKFLOW & CRM PLATFORMS DETAIL)
// -------------------------------------------------------------
export const SystemView: React.FC<SectionProps> = ({ project, onChangeText, isEditable }) => {
  const text = project.systemText || "";
  const allLines = text.split("\n").map(l => l.replace(/^[•\s\-*]+/, "").trim()).filter(Boolean);

  // Lines like "[Tag] description | optional tip" become tabs.
  // Lines without [Tag] become a checklist below.
  const taggedLines: { id: string; title: string; desc: string; tip: string }[] = [];
  const plainLines: string[] = [];
  allLines.forEach((l, idx) => {
    const m = l.match(/^\[(.*?)\]\s*(.*)$/);
    if (m) {
      const parts = m[2].split("|");
      taggedLines.push({
        id: `tab_${idx}`,
        title: m[1].trim(),
        desc: (parts[0] || "").trim(),
        tip: (parts[1] || "").trim(),
      });
    } else {
      plainLines.push(l);
    }
  });

  // Optional separate cabinet tabs text (legacy). Only used if explicitly set.
  const rawCabinetText = project.cabinetTabsText || "";
  const cabinetLines = rawCabinetText.split("\n").map(l => l.replace(/^[•\s\-*]+/, "").trim()).filter(Boolean);
  const parsedExtraTabs = cabinetLines.map((l, idx) => {
    const m = l.match(/^\[(.*?)\]\s*(.*)$/);
    const title = m ? m[1].trim() : `Платформа ${idx + 1}`;
    const rest = m ? m[2] : l;
    const parts = rest.split("|");
    return {
      id: `ext_${idx}`,
      title,
      desc: (parts[0] || "").trim(),
      tip: (parts[1] || "").trim(),
    };
  });

  const allTabs = [...parsedExtraTabs, ...taggedLines];
  const [activeSystemIndex, setActiveSystemIndex] = useState(0);
  const activeTab = allTabs[activeSystemIndex] || allTabs[0];

  return (
    <div className="space-y-6 text-left">
      {isEditable ? (
        <div className="space-y-4 bg-[#1E4468]/80 border border-white/5 rounded-2xl p-5">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-amber-300 block">Интерактивный кабинет: Вкладки рабочих платформ:</label>
              <span className="text-[10px] text-slate-400">Формат: [Таб] Описание | Секретный совет</span>
            </div>
            <textarea
              className="w-full bg-[#17344F]/90 text-xs p-3 rounded-xl border border-white/10 text-white font-mono focus:outline-[#E7C768]"
              rows={7}
              value={rawCabinetText}
              onChange={(e) => onChangeText?.("cabinetTabsText", e.target.value)}
              placeholder="Каждая вкладка с новой строки"
            />
          </div>

          <div className="pt-2 border-t border-white/5 space-y-2">
            <label className="text-xs font-bold text-amber-300 block">Ежедневная система регламентов и чек-лист отчетности (список):</label>
            <textarea
              className="w-full bg-[#17344F]/90 text-xs p-3 rounded-xl border border-white/10 text-white font-mono focus:outline-[#E7C768]"
              rows={5}
              value={text}
              onChange={(e) => onChangeText?.("systemText", e.target.value)}
              placeholder="Опишите регламент ежедневной работы по одной строке на пункт"
            />
          </div>
          <div className="text-[10px] text-slate-350 bg-white/5 p-2 rounded-xl border border-white/5 font-sans leading-relaxed">
            💡 Кастомизируйте вкладки разделяя девиз символом <strong>|</strong>, например: <code>[💻 amoCRM] Описание таба | 💡 Подсказка-регламент</code>
          </div>
        </div>
      ) : (
        <div className="space-y-5">

          {/* Interactive Work Tools Dashboard Panel — only if we have tagged tabs */}
          {allTabs.length > 0 && activeTab && (
          <div className="bg-gradient-to-br from-[#17344F] to-[#265582] border-2 border-amber-500/25 rounded-2xl p-4 sm:p-5 text-left space-y-4 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.5)]">
            <div className="flex items-center gap-2.5 pb-2.5 border-b border-white/10">
              <Cpu className="w-5 h-5 text-amber-300 animate-pulse" />
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300">Интерактивный кабинет: Рабочие платформы</h4>
                <p className="text-[10px] text-slate-400 block mt-0.5">Кликните по вкладке, чтобы подробно изучить ежедневные инструменты:</p>
              </div>
            </div>

            {/* Platform selection tabs */}
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(allTabs.length, 3)}, minmax(0, 1fr))` }}>
              {allTabs.map((tab, idx) => {
                  const isActive = activeSystemIndex === idx;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveSystemIndex(idx)}
                      className={`transition text-[10px] sm:text-xs font-bold p-2 rounded-xl border text-center cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis ${
                        isActive 
                          ? "bg-[#E7C768] text-[#17344F] border-[#E7C768] shadow-md" 
                          : "bg-white/10 text-white border-white/15 hover:bg-white/20"
                      }`}
                    >
                      {tab.title}
                    </button>
                  );
                })}
            </div>

            {/* Platform workflow description block */}
            <div className="bg-white/10 backdrop-blur-sm border border-[#E7C768]/25 p-4 rounded-xl space-y-2.5 min-h-[140px] flex flex-col justify-between">
              <div className="space-y-2">
                <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-widest block">
                  {activeTab.title}
                </span>
                <p className="text-xs text-white leading-relaxed font-sans">
                  {activeTab.desc}
                </p>
              </div>
              {activeTab.tip && (
                <div className="text-[10px] bg-amber-500/15 border border-amber-500/30 p-2 rounded-lg text-amber-200 font-mono font-medium leading-tight mt-2.5">
                  {activeTab.tip}
                </div>
              )}
            </div>
          </div>
          )}

          {/* Core Daily Workflow Criteria Checklist */}
          {plainLines.length > 0 && (
          <div className="bg-gradient-to-br from-[#17344F] to-[#265582] border border-white/10 p-4 rounded-xl space-y-3.5 text-left">
            <span className="text-[10px] font-mono text-amber-300 block uppercase tracking-widest">⚙️ Ежедневная система регламентов и отчетности:</span>
            <div className="space-y-2.5">
              {plainLines.map((crt, i) => (
                <div key={i} className="flex items-start gap-2.5 text-xs text-white">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{crt}</span>
                </div>
              ))}
            </div>
          </div>
          )}

          {allTabs.length === 0 && plainLines.length === 0 && (
            <div className="bg-white/5 border border-white/10 p-4 rounded-xl text-xs text-slate-200 italic">
              Сведения о системе работы пока не заполнены.
            </div>
          )}

        </div>
      )}
    </div>
  );
};
