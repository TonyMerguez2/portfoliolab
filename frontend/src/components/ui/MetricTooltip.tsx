"use client";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

interface Props { metric: string; lang?: string; }

const DEFINITIONS: Record<string, Record<string, { title: string; definition: string; importance: string; interpretation: string; example: string }>> = {
  totalReturn: {
    fr: { title: "Rendement Total", definition: "La variation totale de la valeur de votre portefeuille sur toute la période analysée.", importance: "C'est la mesure la plus directe de ce qu'a rapporté votre investissement.", interpretation: "Un rendement de +50% signifie que 10 000 € sont devenus 15 000 €.", example: "10 000 € investis → 14 500 € = +45% de rendement total." },
    en: { title: "Total Return", definition: "The total change in value of your portfolio over the entire analysis period.", importance: "The most direct measure of what your investment returned.", interpretation: "+50% return means €10,000 became €15,000.", example: "€10,000 invested → €14,500 = +45% total return." },
    es: { title: "Rendimiento Total", definition: "La variación total del valor de su cartera.", importance: "La medida más directa del rendimiento.", interpretation: "+50% significa que 10.000 € se convirtieron en 15.000 €.", example: "10.000 € → 14.500 € = +45%." },
    de: { title: "Gesamtrendite", definition: "Die gesamte Wertveränderung Ihres Portfolios.", importance: "Das direkteste Maß für die Investitionsrendite.", interpretation: "+50% bedeutet aus 10.000 € wurden 15.000 €.", example: "10.000 € → 14.500 € = +45%." },
    zh: { title: "总回报", definition: "投资组合的总价值变化。", importance: "衡量投资回报最直接的指标。", interpretation: "+50%意味着10,000€变成了15,000€。", example: "10,000€ → 14,500€ = +45%。" },
  },
  cagr: {
    fr: { title: "TCAC — Taux de Croissance Annuel Composé", definition: "Le rendement annuel moyen en supposant que les gains sont réinvestis chaque année.", importance: "Permet de comparer des investissements sur des durées différentes.", interpretation: "TCAC de 10% = croissance moyenne de 10% par an.", example: "10 000 € × 1,1⁵ = 16 105 € en 5 ans à 10% de TCAC." },
    en: { title: "CAGR — Compound Annual Growth Rate", definition: "Average annual return assuming gains are reinvested each year.", importance: "Allows fair comparison across different time periods.", interpretation: "10% CAGR = 10% average growth per year.", example: "€10,000 × 1.1⁵ = €16,105 over 5 years at 10% CAGR." },
    es: { title: "TCAC", definition: "Rendimiento anual promedio reinvirtiendo ganancias.", importance: "Comparación justa entre diferentes períodos.", interpretation: "TCAC 10% = crecimiento promedio del 10% anual.", example: "10.000 € × 1,1⁵ = 16.105 € en 5 años." },
    de: { title: "KAGR", definition: "Durchschnittliche Jahresrendite mit Reinvestition.", importance: "Fairer Vergleich über verschiedene Zeiträume.", interpretation: "10% KAGR = 10% durchschnittliches Wachstum pro Jahr.", example: "10.000 € × 1,1⁵ = 16.105 € in 5 Jahren." },
    zh: { title: "年化复合增长率", definition: "假设收益再投资的平均年回报率。", importance: "公平比较不同时间段。", interpretation: "10% CAGR = 平均每年增长10%。", example: "10,000€ × 1.1⁵ = 16,105€（5年）。" },
  },
  volatility: {
    fr: { title: "Volatilité Annualisée", definition: "Amplitude des fluctuations quotidiennes du portefeuille, en % annuel.", importance: "Indique le niveau de risque et d'incertitude.", interpretation: "< 10% : faible | 10–20% : modéré | > 25% : élevé", example: "Volatilité 15% : le portefeuille peut varier de ±15% autour de sa tendance annuelle." },
    en: { title: "Annualized Volatility", definition: "Amplitude of daily portfolio fluctuations, as annual %.", importance: "Indicates risk and uncertainty level.", interpretation: "< 10%: low | 10–20%: moderate | > 25%: high", example: "15% volatility: portfolio can vary ±15% around annual trend." },
    es: { title: "Volatilidad Anualizada", definition: "Amplitud de las fluctuaciones diarias en % anual.", importance: "Indica el nivel de riesgo.", interpretation: "< 10%: bajo | 10–20%: moderado | > 25%: alto", example: "15%: la cartera puede variar ±15% alrededor de la tendencia." },
    de: { title: "Annualisierte Volatilität", definition: "Amplitude täglicher Schwankungen als Jahresprozentsatz.", importance: "Zeigt Risiko- und Unsicherheitsniveau.", interpretation: "< 10%: niedrig | 10–20%: moderat | > 25%: hoch", example: "15%: Portfolio kann ±15% um den Jahrestrend schwanken." },
    zh: { title: "年化波动率", definition: "日常波动幅度，以年化百分比表示。", importance: "表明风险和不确定性水平。", interpretation: "< 10%：低 | 10–20%：中 | > 25%：高", example: "15%波动率：组合可在年度趋势附近波动±15%。" },
  },
  maxDrawdown: {
    fr: { title: "Drawdown Maximum", definition: "La plus grande baisse entre un pic et un creux sur toute la période.", importance: "Le pire scénario que vous auriez vécu comme investisseur.", interpretation: "MDD -30% : le portefeuille avait perdu 30% depuis son sommet.", example: "100 000 € → 70 000 € = MDD -30%. Besoin de +43% pour récupérer." },
    en: { title: "Maximum Drawdown", definition: "Largest decline between a peak and a trough over the period.", importance: "The worst scenario you would have experienced as an investor.", interpretation: "MDD -30%: portfolio once lost 30% from its peak.", example: "€100,000 → €70,000 = MDD -30%. Needs +43% to recover." },
    es: { title: "Drawdown Máximo", definition: "Mayor caída entre un pico y un mínimo.", importance: "El peor escenario como inversor.", interpretation: "MDD -30%: la cartera perdió 30% desde su máximo.", example: "100.000 € → 70.000 € = -30%. Necesita +43% para recuperarse." },
    de: { title: "Maximaler Drawdown", definition: "Größter Rückgang zwischen Hoch und Tief.", importance: "Das schlimmste Szenario als Investor.", interpretation: "MDD -30%: Portfolio verlor 30% von seinem Höchststand.", example: "100.000 € → 70.000 € = -30%. Braucht +43% zur Erholung." },
    zh: { title: "最大回撤", definition: "从峰值到谷值的最大下降。", importance: "您作为投资者经历的最坏情况。", interpretation: "MDD -30%：投资组合曾从峰值损失30%。", example: "100,000€ → 70,000€ = -30%。需要+43%才能恢复。" },
  },
  sharpe: {
    fr: { title: "Ratio de Sharpe", definition: "Rendement obtenu par unité de risque, au-delà du taux sans risque.", importance: "Indique si le rendement compense vraiment le risque pris.", interpretation: "< 0.5 : faible | 0.5–1 : acceptable | 1–2 : bon | > 2 : excellent", example: "Sharpe 1.2 : pour 1% de risque, vous obtenez 1.2% de rendement supplémentaire." },
    en: { title: "Sharpe Ratio", definition: "Return per unit of risk taken, above risk-free rate.", importance: "Whether return truly compensates for risk.", interpretation: "< 0.5: poor | 0.5–1: ok | 1–2: good | > 2: excellent", example: "Sharpe 1.2: for 1% risk, you get 1.2% extra return." },
    es: { title: "Ratio de Sharpe", definition: "Rendimiento por unidad de riesgo.", importance: "Si el rendimiento compensa el riesgo.", interpretation: "< 0.5: bajo | 0.5–1: aceptable | 1–2: bueno | > 2: excelente", example: "Sharpe 1.2: por 1% de riesgo, 1.2% de rendimiento extra." },
    de: { title: "Sharpe-Ratio", definition: "Rendite pro Risikoeinheit über dem risikofreien Zinssatz.", importance: "Ob Rendite das Risiko wirklich kompensiert.", interpretation: "< 0.5: schwach | 0.5–1: ok | 1–2: gut | > 2: ausgezeichnet", example: "Sharpe 1.2: für 1% Risiko 1.2% Mehrrendite." },
    zh: { title: "夏普比率", definition: "超过无风险利率的每单位风险回报。", importance: "回报是否真正补偿风险。", interpretation: "< 0.5：差 | 0.5–1：可以 | 1–2：好 | > 2：优秀", example: "夏普1.2：每1%风险获得1.2%额外回报。" },
  },
  sortino: {
    fr: { title: "Ratio de Sortino", definition: "Comme le Sharpe, mais ne pénalise que la volatilité à la baisse.", importance: "Plus juste pour les portefeuilles avec des rendements asymétriques.", interpretation: "Sortino élevé : monte souvent, baisse peu.", example: "Un fonds régulier avec rares chutes aura un Sortino bien supérieur au Sharpe." },
    en: { title: "Sortino Ratio", definition: "Like Sharpe, but only penalizes downside volatility.", importance: "Fairer for asymmetric return portfolios.", interpretation: "High Sortino: rises often, falls little.", example: "A steady fund with rare drops has Sortino much higher than Sharpe." },
    es: { title: "Ratio de Sortino", definition: "Como Sharpe pero solo penaliza caídas.", importance: "Más justo para rendimientos asimétricos.", interpretation: "Alto Sortino: sube a menudo, baja poco.", example: "Fondo estable con pocas caídas: Sortino > Sharpe." },
    de: { title: "Sortino-Ratio", definition: "Wie Sharpe, aber nur Abwärtsvolatilität.", importance: "Fairer für asymmetrische Renditen.", interpretation: "Hohes Sortino: steigt oft, fällt wenig.", example: "Stabiler Fonds mit seltenen Rückgängen: Sortino > Sharpe." },
    zh: { title: "索提诺比率", definition: "类似夏普，但只惩罚下行波动。", importance: "对不对称回报更公平。", interpretation: "高索提诺：经常上涨，很少下跌。", example: "稳定基金很少下跌：索提诺>夏普。" },
  },
  calmar: {
    fr: { title: "Ratio de Calmar", definition: "Rapport entre le TCAC et la valeur absolue du drawdown maximum.", importance: "Mesure le rendement par rapport au pire risque subi.", interpretation: "Calmar > 1 : bon. Le rendement annuel dépasse le pire drawdown.", example: "TCAC 15% / MDD 20% = Calmar 0.75 | TCAC 20% / MDD 15% = Calmar 1.33" },
    en: { title: "Calmar Ratio", definition: "CAGR divided by absolute maximum drawdown.", importance: "Return relative to worst risk experienced.", interpretation: "Calmar > 1 is good: annual return exceeds worst drawdown.", example: "15% CAGR / 20% MDD = 0.75 | 20% CAGR / 15% MDD = 1.33" },
    es: { title: "Ratio de Calmar", definition: "TCAC dividido por el drawdown máximo absoluto.", importance: "Rendimiento relativo al peor riesgo.", interpretation: "Calmar > 1 es bueno.", example: "TCAC 15% / MDD 20% = 0.75 | TCAC 20% / MDD 15% = 1.33" },
    de: { title: "Calmar-Ratio", definition: "KAGR geteilt durch absoluten maximalen Drawdown.", importance: "Rendite im Verhältnis zum schlimmsten Risiko.", interpretation: "Calmar > 1 ist gut.", example: "15% KAGR / 20% MDD = 0,75 | 20% KAGR / 15% MDD = 1,33" },
    zh: { title: "卡玛比率", definition: "CAGR除以最大回撤绝对值。", importance: "相对于最坏风险的回报。", interpretation: "卡玛>1是好的。", example: "CAGR 15% / MDD 20% = 0.75 | CAGR 20% / MDD 15% = 1.33" },
  },
  var95: {
    fr: { title: "Value at Risk (VaR 95%)", definition: "La perte maximale quotidienne dans 95% des cas.", importance: "Idée concrète du risque de perte sur une journée normale.", interpretation: "VaR -1.5% : 95% du temps, perte quotidienne < 1.5%.", example: "Sur 100 jours, 5 jours la perte pourra dépasser la VaR." },
    en: { title: "Value at Risk (VaR 95%)", definition: "Maximum daily loss in 95% of cases.", importance: "Concrete loss risk on a normal trading day.", interpretation: "VaR -1.5%: 95% of days, loss under 1.5%.", example: "Over 100 days, 5 days loss may exceed VaR." },
    es: { title: "Valor en Riesgo (VaR 95%)", definition: "Pérdida diaria máxima en el 95% de los casos.", importance: "Riesgo concreto en un día normal.", interpretation: "VaR -1.5%: el 95% del tiempo, pérdida < 1.5%.", example: "En 100 días, en 5 la pérdida puede superar el VaR." },
    de: { title: "Value at Risk (VaR 95%)", definition: "Maximaler täglicher Verlust in 95% der Fälle.", importance: "Konkretes Verlustrisiko an einem normalen Tag.", interpretation: "VaR -1.5%: 95% der Zeit Verlust unter 1.5%.", example: "Über 100 Tage: an 5 Tagen kann Verlust VaR überschreiten." },
    zh: { title: "风险价值 (VaR 95%)", definition: "95%情况下的最大日损失。", importance: "正常交易日具体损失风险。", interpretation: "VaR -1.5%：95%的时间日损失低于1.5%。", example: "100个交易日中，5天损失可能超过VaR。" },
  },
};

export default function MetricTooltip({ metric, lang = "en" }: Props) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const def = DEFINITIONS[metric]?.[lang] ?? DEFINITIONS[metric]?.["en"];

  const handleOpen = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const tooltipWidth = 288;
      let left = rect.right + 8;
      if (left + tooltipWidth > window.innerWidth - 16) {
        left = rect.left - tooltipWidth - 8;
      }
      const tooltipHeight = 320;
      const top = rect.bottom + tooltipHeight > window.innerHeight
        ? rect.top + window.scrollY - tooltipHeight
        : rect.top + window.scrollY - 8;
      setCoords({ top, left });
    }
    setOpen(p => !p);
  };

  if (!def) return null;

  return (
    <span className="relative inline-block ml-1">
      <button ref={btnRef} onClick={handleOpen}
        className="w-4 h-4 rounded-full bg-slate-200 hover:bg-indigo-200 text-slate-500 hover:text-indigo-600
                   text-xs font-bold inline-flex items-center justify-center transition-colors leading-none"
        aria-label={`Aide`}>?
      </button>
      {open && typeof window !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)}/>
          <div className="fixed z-50 w-72 bg-white border border-slate-200 rounded-xl shadow-xl p-4 text-left"
               style={{ top: coords.top, left: coords.left }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-slate-800">{def.title}</p>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 text-lg leading-none ml-2">×</button>
            </div>
            <div className="space-y-2.5">
              <div>
                <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-1">Définition</p>
                <p className="text-xs text-slate-600 leading-relaxed">{def.definition}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-1">Importance</p>
                <p className="text-xs text-slate-600 leading-relaxed">{def.importance}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-1">Interprétation</p>
                <p className="text-xs text-slate-600 leading-relaxed">{def.interpretation}</p>
              </div>
              <div className="bg-indigo-50 rounded-lg p-2.5">
                <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-1">Exemple</p>
                <p className="text-xs text-slate-600 leading-relaxed">{def.example}</p>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}
    </span>
  );
}
