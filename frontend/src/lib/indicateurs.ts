/**
 * Indicateurs calculés sur une série de cours.
 *
 * Extraits de la page graphique, où ils vivaient parmi deux mille lignes de
 * JSX. Ils y étaient intestables — non par principe, mais parce qu'un module
 * de test qui les aurait importés aurait entraîné toute la page avec eux.
 *
 * C'est la famille de code la plus dangereuse d'une application financière :
 * une volatilité ou un Sharpe faux ne plante pas, il affiche un nombre
 * plausible. Le reste du projet met déjà sa logique pure ici pour cette raison.
 */

export type Point = { date: string; value: number };

/** La date d'il y a `days` jours, au format ISO court. */
export function getCutoffDate(days: number, aujourdhui = new Date()): string {
  const d = new Date(aujourdhui);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Repli depuis le plus haut atteint, en pourcentage.
 *
 * Le sommet ne redescend jamais : c'est ce qui distingue un repli d'une simple
 * variation. Une valeur nouvelle plus haute remet le compteur à zéro.
 */
export function computeDrawdownFromPrices(data: Point[]): Point[] {
  let peak = -Infinity;
  return data.map(p => {
    if (p.value > peak) peak = p.value;
    const dd = peak > 0 ? ((p.value - peak) / peak) * 100 : 0;
    return { date: p.date, value: dd };
  });
}

/**
 * Ramène une série intrajournalière à une clôture par jour.
 *
 * Le dernier point de la journée fait la clôture ; les extrêmes sont conservés
 * sur l'ensemble des points du jour, et non sur le seul dernier.
 */
export function toDailyClose(
  data: { date: string; value: number; high?: number; low?: number }[],
): { date: string; value: number; high?: number; low?: number }[] {
  const byDate = new Map<string, { date: string; value: number; high: number; low: number }>();
  for (const p of data) {
    const d = p.date.slice(0, 10);
    const ex = byDate.get(d);
    byDate.set(d, ex
      ? { date: d, value: p.value, high: Math.max(ex.high, p.high ?? p.value), low: Math.min(ex.low, p.low ?? p.value) }
      : { date: d, value: p.value, high: p.high ?? p.value, low: p.low ?? p.value });
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Volatilité glissante, annualisée, en pourcentage.
 *
 * Sur les rendements logarithmiques, et non arithmétiques : eux seuls
 * s'additionnent dans le temps, ce qui est la condition pour annualiser en
 * multipliant par la racine de 252.
 */
export function computeRollingVol(data: Point[], window = 30): { date: string; vol: number }[] {
  const result: { date: string; vol: number }[] = [];
  for (let i = window; i < data.length; i++) {
    const slice = data.slice(i - window, i + 1);
    const lr: number[] = [];
    for (let j = 1; j < slice.length; j++) {
      if (slice[j - 1].value > 0 && slice[j].value > 0) lr.push(Math.log(slice[j].value / slice[j - 1].value));
    }
    if (lr.length < 2) continue;
    const mean = lr.reduce((a, b) => a + b, 0) / lr.length;
    const vari = lr.reduce((a, b) => a + (b - mean) ** 2, 0) / (lr.length - 1);
    result.push({ date: data[i].date, vol: Math.sqrt(vari) * Math.sqrt(252) * 100 });
  }
  return result;
}

/**
 * RSI de Wilder, sur `period` séances.
 *
 * Les moyennes de gains et de pertes sont lissées, non recalculées à chaque
 * pas : c'est la définition d'origine, et elle donne des valeurs sensiblement
 * différentes d'une moyenne mobile simple.
 */
export function computeRSI(data: Point[], period = 14): { date: string; rsi: number }[] {
  if (data.length < period + 1) return [];
  const result: { date: string; rsi: number }[] = [];
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const delta = data[i].value - data[i - 1].value;
    if (delta > 0) avgGain += delta / period;
    else avgLoss += Math.abs(delta) / period;
  }
  for (let i = period; i < data.length; i++) {
    if (i > period) {
      const delta = data[i].value - data[i - 1].value;
      avgGain = (avgGain * (period - 1) + Math.max(0, delta)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.max(0, -delta)) / period;
    }
    // Sans aucune perte sur la fenêtre, le RSI vaut 100 par définition. Le
    // calcul bornait le rapport gains/pertes à 100 au lieu de borner le RSI :
    // une série strictement croissante sortait à 99,01 — proche, jamais juste,
    // et jamais signalé.
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    result.push({ date: data[i].date, rsi });
  }
  return result;
}

/**
 * Distribution des rendements quotidiens, en classes.
 *
 * Les centiles extrêmes sont écartés avant de construire les classes : un seul
 * jour de krach étirerait l'échelle au point de tasser tout le reste dans une
 * ou deux barres.
 */
export function computeDistribution(
  data: Point[], bins = 24,
): { label: string; count: number; ret: number }[] {
  if (data.length < 2) return [];
  const returns: number[] = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i - 1].value > 0 && data[i].value > 0) {
      returns.push(((data[i].value - data[i - 1].value) / data[i - 1].value) * 100);
    }
  }
  if (returns.length === 0) return [];
  const sorted = [...returns].sort((a, b) => a - b);
  const p1 = sorted[Math.floor(sorted.length * 0.01)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const clipped = returns.filter(r => r >= p1 && r <= p99);
  if (clipped.length === 0) return [];
  const min = Math.min(...clipped), max = Math.max(...clipped);
  const binSize = (max - min) / bins || 1;
  const histo = Array.from({ length: bins }, (_, i) => ({
    label: (min + (i + 0.5) * binSize).toFixed(2) + "%",
    ret: min + (i + 0.5) * binSize,
    count: 0,
  }));
  clipped.forEach(r => { histo[Math.min(Math.floor((r - min) / binSize), bins - 1)].count++; });
  return histo;
}

/**
 * Corrélation glissante entre deux séries.
 *
 * Les deux sont d'abord alignées sur les jours qu'elles ont en commun. Sans
 * cet appariement, deux places aux jours fériés différents produisent des
 * couples décalés, et la corrélation mesure alors le calendrier autant que les
 * cours.
 */
export function computeRollingCorrelation(
  portfolio: Point[], benchmark: Point[], window = 90,
): { date: string; corr: number }[] {
  const bmMap = new Map(benchmark.map(p => [p.date.slice(0, 10), p.value]));
  const aligned: { date: string; pRet: number; bRet: number }[] = [];
  for (let i = 1; i < portfolio.length; i++) {
    const bPrev = bmMap.get(portfolio[i - 1].date.slice(0, 10));
    const bCurr = bmMap.get(portfolio[i].date.slice(0, 10));
    if (bPrev && bCurr && portfolio[i - 1].value > 0 && portfolio[i].value > 0) {
      aligned.push({
        date: portfolio[i].date,
        pRet: (portfolio[i].value - portfolio[i - 1].value) / portfolio[i - 1].value,
        bRet: (bCurr - bPrev) / bPrev,
      });
    }
  }
  const result: { date: string; corr: number }[] = [];
  for (let i = window; i < aligned.length; i++) {
    const sl = aligned.slice(i - window, i + 1);
    const pm = sl.reduce((a, b) => a + b.pRet, 0) / sl.length;
    const bm = sl.reduce((a, b) => a + b.bRet, 0) / sl.length;
    let num = 0, pv = 0, bv = 0;
    sl.forEach(s => { num += (s.pRet - pm) * (s.bRet - bm); pv += (s.pRet - pm) ** 2; bv += (s.bRet - bm) ** 2; });
    const d = Math.sqrt(pv * bv);
    if (d > 0) result.push({ date: aligned[i].date, corr: Math.max(-1, Math.min(1, num / d)) });
  }
  return result;
}

/**
 * Ratio de Sharpe glissant, annualisé.
 *
 * Le taux sans risque est ramené au jour avant d'être retranché, puis le
 * résultat est annualisé. Retrancher le taux annuel à un rendement quotidien
 * donnerait un excédent négatif de plusieurs points chaque jour.
 */
export function computeRollingSharpe(
  data: Point[], window = 90, rf = 0.035,
): { date: string; sharpe: number }[] {
  const rets: { date: string; ret: number }[] = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i - 1].value > 0 && data[i].value > 0) {
      rets.push({ date: data[i].date, ret: (data[i].value - data[i - 1].value) / data[i - 1].value });
    }
  }
  const dailyRF = rf / 252;
  const result: { date: string; sharpe: number }[] = [];
  for (let i = window; i < rets.length; i++) {
    const sl = rets.slice(i - window, i + 1);
    const exc = sl.map(r => r.ret - dailyRF);
    const mean = exc.reduce((a, b) => a + b, 0) / exc.length;
    const vari = exc.reduce((a, b) => a + (b - mean) ** 2, 0) / (exc.length - 1);
    const vol = Math.sqrt(vari);
    if (vol > 0) result.push({ date: rets[i].date, sharpe: (mean / vol) * Math.sqrt(252) });
  }
  return result;
}
