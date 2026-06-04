/**
 * Сравнительный калькулятор: Робот RR vs Человек HR.
 * Используется на лендинге и на странице "Тарифы" в кабинете.
 */
import { useState } from "react";

const HR_HOURLY = 80000 / 160; // 500 RR/час

function round(n: number, d = 0) {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

/** Тарифная сетка: цена за 1 ИИ-интервью или 1 ИИ-обучение в RR в зависимости от объёма пакета. */
function tierPrice(qty: number): number {
  if (qty <= 9) return 200;
  if (qty <= 49) return 150;
  if (qty <= 199) return 100;
  return 50;
}

function tierLabel(qty: number): string {
  if (qty <= 9) return "1–9 шт";
  if (qty <= 49) return "10–49 шт";
  if (qty <= 199) return "50–199 шт";
  return "200+ шт";
}

export default function HiringCalculator() {
  const [n, setN] = useState(5);

  // Робот RR (масштабируется от ТЗ при N=5)
  const regCount = n * 10;          // зарегистрировалось
  const intCount = n * 6;           // прошло интервью
  const intPrice = tierPrice(intCount);
  const intRR = intCount * intPrice;
  const okCount = round(n * 2.4, 1);
  const trnCount = n * 2;           // вышли на обучение
  const trnPrice = tierPrice(trnCount);
  const trnRR = trnCount * trnPrice;
  const passCount = n;              // прошли обучение
  const totalRR = intRR + trnRR;
  const totalMin = regCount + intCount + Math.round(okCount) + trnCount + passCount;
  const perUnitRR = round(totalRR / n);

  // Человек HR (часы)
  const hrInvited = n * 12;
  const hrInvitedH = round(hrInvited * 0.05, 1);  // 3 минуты на приглашение
  const hrShowH = intCount;             // 1 час на интервью
  const hrTrnH = trnCount;
  const hrPassH = passCount;
  const hrTotalH = round(hrInvitedH + hrShowH + hrTrnH + hrPassH, 1);
  const hrCost = round(hrTotalH * HR_HOURLY);
  const hrPerUnit = round(hrCost / n);

  const ratioMoney = round(hrPerUnit / Math.max(perUnitRR, 1), 1);
  const ratioTime = round((hrTotalH * 60) / Math.max(totalMin, 1), 0);

  return (
    <div className="bg-[#1D3E5E]/85 border-2 border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl text-left space-y-6">
      <div className="text-center space-y-2">
        <h3 className="text-xl md:text-2xl font-bold text-white">
          Калькулятор «Робот vs HR»
        </h3>
        <p className="text-slate-300 text-sm">
          Выберите, сколько готовых обученных сотрудников вам нужно
        </p>
      </div>

      {/* Slider */}
      <div className="space-y-2 max-w-xl mx-auto">
        <div className="flex justify-between items-center text-sm">
          <span className="font-bold text-slate-200">Нужно сотрудников на выходе:</span>
          <input
            type="number"
            min={1}
            max={50}
            value={n}
            onChange={(e) => setN(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
            className="w-20 bg-black/30 border border-white/15 text-[#E7C768] font-bold text-center rounded-lg px-2 py-1"
          />
        </div>
        <input
          type="range"
          min={1}
          max={50}
          step={1}
          value={n}
          onChange={(e) => setN(Number(e.target.value))}
          className="w-full accent-[#E7C768] cursor-pointer bg-white/10 h-1.5 rounded-lg appearance-none"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* RR */}
        <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-2xl p-5 space-y-2.5 text-sm">
          <div className="font-bold text-emerald-300 text-base flex items-center gap-2 pb-2 border-b border-emerald-500/20">
            🤖 Робот RR
          </div>
          <Row label="Зарегистрировалось" value={`${regCount}`} sub={`${regCount} мин`} />
          <Row label="Прошло интервью" value={`${intCount}`} sub={`${intCount}×${intPrice} = ${intRR.toLocaleString()} RR · ${intCount} мин`} />
          <Row label="Успешно" value={`${okCount}`} />
          <Row label="Вышли на обучение" value={`${trnCount}`} sub={`${trnCount}×${trnPrice} = ${trnRR.toLocaleString()} RR · ${trnCount} мин`} />
          <Row label="Прошли обучение" value={`${passCount}`} sub={`${passCount} мин`} />
          <div className="pt-3 mt-2 border-t border-emerald-500/30 space-y-1">
            <div className="flex justify-between text-emerald-300 font-bold">
              <span>Итого:</span>
              <span className="font-mono">{totalRR.toLocaleString()} RR · {totalMin} мин</span>
            </div>
            <div className="flex justify-between text-xs text-emerald-200">
              <span>За одного готового сотрудника:</span>
              <span className="font-mono font-bold">{perUnitRR.toLocaleString()} RR</span>
            </div>
            <div className="flex justify-between text-[10px] text-emerald-200/70">
              <span>Тариф интервью / обучения:</span>
              <span className="font-mono">{tierLabel(intCount)} · {intPrice} / {tierLabel(trnCount)} · {trnPrice} RR</span>
            </div>
          </div>
        </div>

        {/* HR */}
        <div className="bg-rose-950/30 border border-rose-500/30 rounded-2xl p-5 space-y-2.5 text-sm">
          <div className="font-bold text-rose-300 text-base flex items-center gap-2 pb-2 border-b border-rose-500/20">
            👤 Человек HR
          </div>
          <Row label="Пригласили на интервью" value={`${hrInvited}`} sub={`${hrInvitedH} ч`} />
          <Row label="Пришло на интервью" value={`${intCount}`} sub={`${hrShowH} ч`} />
          <Row label="Успешно" value={`${okCount}`} />
          <Row label="Вышли на обучение" value={`${trnCount}`} sub={`${hrTrnH} ч`} />
          <Row label="Прошли обучение" value={`${passCount}`} sub={`${hrPassH} ч`} />
          <div className="pt-3 mt-2 border-t border-rose-500/30 space-y-1">
            <div className="flex justify-between text-rose-300 font-bold">
              <span>Итого:</span>
              <span className="font-mono">{hrTotalH} ч · {hrCost.toLocaleString()} RR</span>
            </div>
            <div className="flex justify-between text-xs text-rose-200">
              <span>За одного готового сотрудника:</span>
              <span className="font-mono font-bold">{hrPerUnit.toLocaleString()} RR</span>
            </div>
            <div className="text-[10px] text-rose-200/70 pt-1">
              * HR со средней зарплатой 80&nbsp;000 RR за 160 часов в месяц
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-gradient-to-r from-[#E7C768]/15 to-emerald-500/10 border-2 border-[#E7C768]/40 rounded-2xl p-5 text-center space-y-2">
        <div className="text-xs text-slate-300 font-mono">
          {hrPerUnit.toLocaleString()} RR / {perUnitRR.toLocaleString()} RR = <span className="text-[#E7C768] font-bold">×{ratioMoney}</span> по деньгам
          {" · "}
          {hrTotalH}×60 / {totalMin} = <span className="text-[#E7C768] font-bold">×{ratioTime}</span> по времени
        </div>
        <div className="text-2xl md:text-3xl font-extrabold text-[#E7C768]">
          В {ratioMoney} раза дешевле и в {ratioTime} раз производительнее
        </div>
        <p className="text-sm text-slate-200">
          С нашими ценами ИИ в <strong className="text-emerald-300">{ratioMoney} раз дешевле</strong> человека и требует
          <strong className="text-emerald-300"> в {ratioTime} раз меньше времени</strong>.
        </p>
        <p className="text-xs text-slate-300 leading-relaxed pt-1">
          HR может вырасти в производительности до <strong className="text-white">×{ratioTime}</strong>, а за ту же зарплату приводить
          в <strong className="text-white">×{ratioMoney}</strong> больше людей. Кадровые агентства снижают стоимость найма
          в {ratioMoney} раз и могут продавать готовых сотрудников с маржой ×10 — за {(perUnitRR * 10).toLocaleString()} RR за голову.
        </p>
      </div>

      {/* Pricing tiers */}
      <div className="bg-[#17344F]/60 border border-white/10 rounded-2xl p-5 space-y-3">
        <div className="text-sm font-bold text-[#E7C768] uppercase tracking-wider">
          Тарифы — цена за каждое интервью или обучение
        </div>
        <p className="text-xs text-slate-300">
          Цена за единицу зависит от количества: чем больше пакет интервью или обучений — тем дешевле каждая штука.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
          {[
            { range: "1–9", price: 200 },
            { range: "10–49", price: 150 },
            { range: "50–199", price: 100 },
            { range: "200+", price: 50 },
          ].map((t) => (
            <div key={t.range} className="bg-black/30 rounded-xl p-3 border border-white/10 text-center">
              <div className="text-slate-300">{t.range} шт</div>
              <div className="text-lg font-bold font-mono text-[#E7C768]">{t.price} RR</div>
              <div className="text-[10px] text-slate-400">за единицу</div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-400">1 RR = 1 ₽. Списание происходит при старте интервью или старте обучения. Лимиты задаются в настройках вакансии.</p>
        <div className="pt-2 border-t border-white/10 space-y-1 text-xs text-slate-300">
          <div className="font-bold text-white mb-1">Разовые услуги при создании вакансии:</div>
          <div className="flex justify-between"><span>🌐 ИИ-Лендинг вакансии</span><span className="font-mono text-white">500 RR</span></div>
          <div className="flex justify-between"><span>⚙️ ИИ-Система Интервью</span><span className="font-mono text-white">200 RR</span></div>
          <div className="flex justify-between"><span>🎓 ИИ-Система Обучения</span><span className="font-mono text-white">300 RR</span></div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex justify-between items-baseline gap-3">
      <span className="text-slate-200">{label}:</span>
      <span className="text-right">
        <span className="font-mono font-bold text-white">{value}</span>
        {sub && <span className="text-[10px] text-slate-400 ml-2">{sub}</span>}
      </span>
    </div>
  );
}