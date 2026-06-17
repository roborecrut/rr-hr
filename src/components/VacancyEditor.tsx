import React, { useMemo, useState } from "react";
import {
  CheckCircle2,
  Sparkles,
  Calendar,
  Wallet,
  Briefcase,
  Users,
  Cpu,
  GraduationCap,
  BookOpen,
  ListChecks,
  RotateCcw,
  Wand2,
  Eraser,
  ChevronDown,
  Eye,
  EyeOff,
} from "lucide-react";
import { useAIReady } from "../lib/aiReady";
import FieldHelp from "./FieldHelp";
import FieldActionsMenu from "./FieldActionsMenu";
import {
  VACANCY_FIELDS,
  VACANCY_FIELDS_BY_KEY,
  VACANCY_FIELD_GROUPS,
  type VacancyField,
  type VacancyFieldKey,
} from "../lib/fieldFormats";

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export type VacancyFormValues = Partial<Record<VacancyFieldKey, string>>;

export interface VacancyEditorProps {
  values: VacancyFormValues;
  onChange: (patch: VacancyFormValues) => void;
  /** Optional per-field AI enhance callback ("magic wand"). */
  onAIEnhance?: (key: VacancyFieldKey) => void | Promise<void>;
  /** Disabled while an AI request is in flight for a specific field. */
  aiLoadingKey?: VacancyFieldKey | null;
  /** create = editor inside the wizard; edit = editor inside the modal. */
  mode?: "create" | "edit";
  /** Optional company name for the page title in preview (visual only). */
  companyName?: string;
  /** Skip rendering these field keys (e.g. when role_name is shown elsewhere). */
  hideKeys?: VacancyFieldKey[];
  /** Per-role template values (from job_titles.field_templates). Used by the
   *  "Шаблон" button — if a per-role template is available, prefer it over the
   *  generic `field.example`. */
  roleTemplates?: Partial<Record<VacancyFieldKey, string>>;
}

// ----------------------------------------------------------------------------
// Per-field preview renderers (mirror the production landing block-by-block)
// ----------------------------------------------------------------------------

const parseBullets = (raw: string): string[] =>
  (raw || "")
    .split("\n")
    .map((l) => l.replace(/^[•\s\-*]+/, "").trim())
    .filter(Boolean);

const parseTagged = (raw: string): { title: string; desc: string }[] =>
  parseBullets(raw).map((l) => {
    const m = l.match(/^\[(.*?)\]\s*(.*)$/);
    return m ? { title: m[1].trim(), desc: m[2].trim() } : { title: "", desc: l };
  });

const PreviewShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mt-3 rounded-2xl border border-dashed border-[#E7C768]/35 bg-white/5 p-4">
    <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#E7C768]/80">
      <Sparkles className="h-3 w-3" /> Превью на лендинге
    </div>
    {children}
  </div>
);

const EmptyPreview: React.FC = () => (
  <p className="text-[11px] italic text-slate-500">
    Поле пустое — блок не появится на лендинге.
  </p>
);

export function renderFieldPreview(
  field: VacancyField,
  value: string,
): React.ReactNode {
  const v = (value || "").trim();

  if (!v) return <EmptyPreview />;

  switch (field.preview) {
    case "plain":
      return (
        <p className="whitespace-pre-line text-xs leading-relaxed text-slate-200">
          {v}
        </p>
      );

    case "bullets": {
      const items = parseBullets(v);
      if (items.length === 0) return <EmptyPreview />;
      return (
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-xs leading-relaxed text-slate-200"
            >
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
              <span>{it}</span>
            </li>
          ))}
        </ul>
      );
    }

    case "bullets-tagged":
    case "stages": {
      const items = parseTagged(v);
      if (items.length === 0) return <EmptyPreview />;
      return (
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-xs leading-relaxed text-slate-200"
            >
              {it.title && (
                <span className="inline-flex shrink-0 items-center rounded-md border border-[#E7C768]/30 bg-[#E7C768]/10 px-2 py-0.5 text-[10px] font-bold text-[#E7C768]">
                  {it.title}
                </span>
              )}
              <span>{it.desc}</span>
            </li>
          ))}
        </ul>
      );
    }

    case "schedule":
      return (
        <div className="flex items-start gap-2 text-xs leading-relaxed text-slate-200">
          <Calendar className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-400" />
          <span className="whitespace-pre-line">{v}</span>
        </div>
      );

    case "payouts":
      return (
        <div className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-relaxed text-amber-100">
          <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <span className="whitespace-pre-line">{v}</span>
        </div>
      );
  }
}

// ----------------------------------------------------------------------------
// Group icon
// ----------------------------------------------------------------------------

const GROUP_ICON: Record<VacancyField["group"], React.ReactNode> = {
  main: <Briefcase className="h-4 w-4" />,
  motivation: <Wallet className="h-4 w-4" />,
  team: <Users className="h-4 w-4" />,
  training: <GraduationCap className="h-4 w-4" />,
};

// ----------------------------------------------------------------------------
// VacancyEditor
// ----------------------------------------------------------------------------

export const VacancyEditor: React.FC<VacancyEditorProps> = ({
  values,
  onChange,
  onAIEnhance,
  aiLoadingKey,
  mode = "edit",
  companyName,
  hideKeys,
  roleTemplates,
}) => {
  const groups = useMemo(
    () =>
      VACANCY_FIELD_GROUPS.map((g) => ({
        ...g,
        fields: VACANCY_FIELDS.filter(
          (f) => f.group === g.id && !(hideKeys ?? []).includes(f.key),
        ),
      })).filter((g) => g.fields.length > 0),
    [hideKeys],
  );

  const set = (key: VacancyFieldKey, val: string) => onChange({ [key]: val });

  const applyTemplate = (key: VacancyFieldKey) => {
    const f = VACANCY_FIELDS_BY_KEY[key];
    const tpl = (roleTemplates?.[key] || "").trim();
    set(key, tpl || f.example);
  };

  const clearField = (key: VacancyFieldKey) => set(key, "");

  // По умолчанию открыта первая группа; остальные свёрнуты — меньше шума.
  const [openGroup, setOpenGroup] = useState<string>(groups[0]?.id || "");

  return (
    <div className="brand-editor space-y-6 rounded-3xl bg-gradient-to-br from-[#17344F] to-[#265582]">
      {mode === "create" && (
        <div className="rounded-2xl border border-[#E7C768]/30 bg-[#E7C768]/5 px-4 py-3 text-sm text-slate-200">
          <strong className="text-[#E7C768]">15 полей</strong> — заполните то,
          что важно. Пустые блоки на лендинге{companyName ? ` «${companyName}»` : ""} не появятся.
        </div>
      )}

      <div className="space-y-3">
        {groups.map((g) => {
          const filled = g.fields.filter((f) => (values[f.key] || "").trim().length > 0).length;
          const total = g.fields.length;
          const isOpen = openGroup === g.id;
          return (
            <section
              key={g.id}
              className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
            >
              <button
                type="button"
                onClick={() => setOpenGroup(isOpen ? "" : g.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.05]"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#E7C768]/10 text-[#E7C768]">
                  {GROUP_ICON[g.id]}
                </span>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold tracking-wide text-[#E7C768]">
                    {g.label}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Заполнено {filled} из {total}
                  </p>
                </div>
                <ChevronDown
                  className={`h-5 w-5 text-slate-300 transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>
              {isOpen && (
                <div className="space-y-4 border-t border-white/10 p-4">
                  {g.fields.map((f) => (
                    <FieldRow
                      key={f.key}
                      field={f}
                      value={values[f.key] ?? ""}
                      onChange={(v) => set(f.key, v)}
                      onAIEnhance={onAIEnhance ? () => onAIEnhance(f.key) : undefined}
                      aiLoading={aiLoadingKey === f.key}
                      onApplyTemplate={() => applyTemplate(f.key)}
                      onClear={() => clearField(f.key)}
                      hasRoleTemplate={Boolean((roleTemplates?.[f.key] || "").trim())}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------------
// FieldRow
// ----------------------------------------------------------------------------

interface FieldRowProps {
  field: VacancyField;
  value: string;
  onChange: (v: string) => void;
  onAIEnhance?: () => void;
  aiLoading?: boolean;
  onApplyTemplate: () => void;
  onClear: () => void;
  hasRoleTemplate?: boolean;
}

const FieldRow: React.FC<FieldRowProps> = ({
  field,
  value,
  onChange,
  onAIEnhance,
  aiLoading,
  onApplyTemplate,
  onClear,
  hasRoleTemplate,
}) => {
  const aiReady = useAIReady();
  const [showPreview, setShowPreview] = useState(false);
  return (
    <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <label className="block text-sm font-bold text-slate-100 inline-flex items-center">
            {field.label}
            <FieldHelp
              section="vacancies"
              fieldKey={field.key}
              fallbackTitle={field.label}
              fallbackBody={`${field.hint || ""}${field.example ? `\n\n**Пример:**\n\n${field.example}` : ""}`}
            />
          </label>
          <p className="mt-1 text-xs text-slate-400">{field.hint}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {onAIEnhance && aiReady && (value || "").trim().length >= 7 && (
            <button
              type="button"
              onClick={onAIEnhance}
              disabled={aiLoading}
              className="flex items-center gap-1 rounded-lg border border-[#E7C768]/30 bg-[#E7C768]/10 px-2.5 py-1.5 text-xs font-bold text-[#E7C768] transition hover:bg-[#E7C768]/20 disabled:opacity-50"
              title="ИИ-улучшение этого поля в каноническом формате (доступно от 7 символов)"
            >
              <Wand2 className="h-3.5 w-3.5" />
              {aiLoading ? "..." : "AI"}
            </button>
          )}
          <FieldActionsMenu
            ariaLabel="Действия с полем"
            actions={[
              {
                icon: <RotateCcw className="h-4 w-4" />,
                label: hasRoleTemplate ? "Шаблон должности" : "Подставить шаблон",
                onClick: onApplyTemplate,
              },
              {
                icon: showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />,
                label: showPreview ? "Скрыть превью" : "Показать превью",
                onClick: () => setShowPreview((v) => !v),
              },
              {
                icon: <Eraser className="h-4 w-4" />,
                label: "Очистить поле",
                onClick: onClear,
                disabled: !value,
                danger: true,
                separatorAbove: true,
              },
            ]}
          />
        </div>
      </div>

      <div className="mt-3">
        {field.multiline ? (
          <textarea
            className="w-full rounded-xl border border-white/15 bg-white/10 p-3 text-sm leading-relaxed text-white focus:outline-[#E7C768]"
            rows={field.rows ?? 4}
            maxLength={field.max}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.example}
          />
        ) : (
          <input
            type="text"
            className="w-full rounded-xl border border-white/15 bg-white/10 p-3 text-sm text-white focus:outline-[#E7C768]"
            maxLength={field.max}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.example}
          />
        )}
        {field.max && (
          <div className="mt-1 text-right text-[11px] text-slate-500">
            {value.length}/{field.max}
          </div>
        )}
      </div>

      {showPreview && <PreviewShell>{renderFieldPreview(field, value)}</PreviewShell>}
    </div>
  );
};

// ----------------------------------------------------------------------------
// Compact landing renderer — pure-data version usable on the public landing
// once VacancySections is migrated to consume only the 15 canonical fields.
// ----------------------------------------------------------------------------

export const VacancyLandingBlocks: React.FC<{ values: VacancyFormValues }> = ({
  values,
}) => {
  const present = VACANCY_FIELDS.filter(
    (f) => f.key !== "role_name" && (values[f.key] || "").trim().length > 0,
  );

  if (present.length === 0) {
    return (
      <p className="text-sm italic text-slate-400">
        Лендинг пока пуст — заполните хотя бы одно поле в редакторе вакансии.
      </p>
    );
  }

  const ICON: Record<VacancyField["group"], React.ReactNode> = {
    main: <ListChecks className="h-4 w-4" />,
    motivation: <Wallet className="h-4 w-4" />,
    team: <Cpu className="h-4 w-4" />,
    training: <BookOpen className="h-4 w-4" />,
  };

  return (
    <div className="space-y-5">
      {present.map((f) => (
        <section
          key={f.key}
          className="rounded-2xl border border-white/10 bg-[#1E4468]/80 p-5"
        >
          <header className="mb-3 flex items-center gap-2 border-b border-white/10 pb-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#E7C768]/10 text-[#E7C768]">
              {ICON[f.group]}
            </span>
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#E7C768]">
              {f.label}
            </h3>
          </header>
          {renderFieldPreview(f, values[f.key] ?? "")}
        </section>
      ))}
    </div>
  );
};

export default VacancyEditor;