import React, { useState } from "react";
import { Cpu, Check } from "lucide-react";

/**
 * Brand-styled tabbed block that parses lines in the format:
 *   [Tag] description | optional tip
 * Lines without [Tag] are rendered as a checklist below the tabs.
 * Reused on the public vacancy landing and inside the candidate cabinet
 * (terms/vacancy, terms/onboarding, terms/team, terms/system).
 */
export interface TabbedChecklistBlockProps {
  text: string;
  /** Header above the tabbed block. */
  tabsHeader?: string;
  /** Header above the checklist block. */
  checklistHeader?: string;
  /** Shown when both lists are empty. */
  emptyHint?: string;
}

export const TabbedChecklistBlock: React.FC<TabbedChecklistBlockProps> = ({
  text,
  tabsHeader = "Интерактивный кабинет: ключевые блоки",
  checklistHeader = "Чек-лист по разделу",
  emptyHint = "Сведения по этому разделу пока не заполнены.",
}) => {
  const allLines = (text || "")
    .split("\n")
    .map((l) => l.replace(/^[•\s\-*]+/, "").trim())
    .filter(Boolean);

  const tabs: { id: string; title: string; desc: string; tip: string }[] = [];
  const plain: string[] = [];
  allLines.forEach((l, idx) => {
    const m = l.match(/^\[(.*?)\]\s*(.*)$/);
    if (m) {
      const parts = m[2].split("|");
      tabs.push({
        id: `tab_${idx}`,
        title: m[1].trim(),
        desc: (parts[0] || "").trim(),
        tip: (parts[1] || "").trim(),
      });
    } else {
      plain.push(l);
    }
  });

  const [active, setActive] = useState(0);
  const activeTab = tabs[active] || tabs[0];

  if (tabs.length === 0 && plain.length === 0) {
    return (
      <div className="bg-white/5 border border-white/10 p-4 rounded-xl text-xs text-slate-200 italic">
        {emptyHint}
      </div>
    );
  }

  return (
    <div className="space-y-5 text-left">
      {tabs.length > 0 && activeTab && (
        <div className="bg-gradient-to-br from-[#17344F] to-[#265582] border-2 border-amber-500/25 rounded-2xl p-4 sm:p-5 space-y-4 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-2.5 pb-2.5 border-b border-white/10">
            <Cpu className="w-5 h-5 text-amber-300 animate-pulse" />
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300">
                {tabsHeader}
              </h4>
              <p className="text-[10px] text-slate-300 block mt-0.5">
                Кликните по вкладке, чтобы изучить подробнее.
              </p>
            </div>
          </div>

          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${Math.min(tabs.length, 3)}, minmax(0, 1fr))` }}
          >
            {tabs.map((tab, idx) => {
              const isActive = active === idx;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActive(idx)}
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

          <div className="bg-white/10 backdrop-blur-sm border border-[#E7C768]/25 p-4 rounded-xl space-y-2.5 min-h-[120px] flex flex-col justify-between">
            <div className="space-y-2">
              <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-widest block">
                {activeTab.title}
              </span>
              <p className="text-xs text-white leading-relaxed font-sans whitespace-pre-wrap">
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

      {plain.length > 0 && (
        <div className="bg-gradient-to-br from-[#17344F] to-[#265582] border border-white/10 p-4 rounded-xl space-y-3.5">
          <span className="text-[10px] font-mono text-amber-300 block uppercase tracking-widest">
            {checklistHeader}
          </span>
          <div className="space-y-2.5">
            {plain.map((row, i) => (
              <div key={i} className="flex items-start gap-2.5 text-xs text-white">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span className="whitespace-pre-wrap">{row}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TabbedChecklistBlock;