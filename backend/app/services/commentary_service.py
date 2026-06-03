"""
Intelligent commentary generator — multilingual (en, fr, es, zh, de).
"""
from __future__ import annotations
from app.models.schemas import PerformanceMetrics, BenchmarkComparison

TRANSLATIONS = {
    "en": {
        "quality": {"exceptional":"exceptional","strong":"strong","solid":"solid","modest":"modest","negative":"negative"},
        "overall": "The portfolio delivered a {quality} annualized return of {cagr:.1f}% (total: {total:+.1f}%) over the selected period. Positive trading days accounted for {pos:.0f}% of sessions.",
        "risk_level": {"low":"low","moderate":"moderate","elevated":"elevated","high":"high"},
        "risk_context": {"low":"comparable to a conservative bond portfolio","moderate":"typical of a diversified equity portfolio","elevated":"higher than a broad equity index","high":"characteristic of concentrated or speculative positions"},
        "risk": "Annualized volatility is {vol:.1f}% — {level} risk, {context}. On a bad day (95% VaR), the portfolio could lose up to {var:.2f}% of its value.",
        "div_level": {"very_low":"very low","low":"low","moderate":"moderate","good":"good"},
        "div_advice": {
            "very_low": "Assets move almost in lockstep — consider adding uncorrelated asset classes (bonds, commodities, alternatives).",
            "low": "Correlation is high; diversification benefits are limited. Introducing less-correlated assets could reduce portfolio risk.",
            "moderate": "Diversification is reasonable, though there is room to improve by adding assets from different sectors or geographies.",
            "good": "Low average correlation suggests meaningful diversification across asset classes."
        },
        "diversification": "With {n} asset{s} and an average pairwise correlation of {corr:.2f}, diversification is {level}. {advice}",
        "outperformed": "outperformed", "underperformed": "underperformed",
        "more_volatile": "more", "less_volatile": "less",
        "vol_adj": " while being {more_less} volatile ({diff:.1f}pp difference)",
        "alpha": {"high":"adding alpha","neutral":"neutral to marginal alpha","low":"below benchmark risk-adjusted"},
        "vs_benchmark": "The portfolio {direction} the {name} by {sign}{excess:.2f}% annualized{vol_adj}. Information ratio: {ir:.2f} ({alpha}).",
        "sharpe_quality": {"excellent":"excellent","good":"good","acceptable":"acceptable","suboptimal":"suboptimal","negative":"negative"},
        "sharpe_note": {
            "excellent": "Risk-adjusted returns are outstanding — return far exceeds the risk taken.",
            "good": "The portfolio rewards risk-taking effectively.",
            "acceptable": "Returns modestly compensate for the volatility incurred.",
            "suboptimal": "Returns barely cover the risk premium; consider rebalancing toward higher-Sharpe assets.",
            "negative": "The portfolio generated less than the risk-free rate — risk was not rewarded."
        },
        "sharpe": "Sharpe ratio of {s:.2f} is {quality}. {note}",
        "dd_severity": {"mild":"mild","moderate":"moderate","severe":"severe","extreme":"extreme"},
        "dd_context": {
            "mild": "Capital preservation was strong throughout the period.",
            "moderate": "A significant but not uncommon drawdown for an equity portfolio.",
            "severe": "Investors would have faced substantial unrealized losses at the trough — emotional discipline is critical at these levels.",
            "extreme": "This level of drawdown is associated with speculative or highly concentrated positions."
        },
        "drawdown": "Maximum drawdown was {mdd:.1f}% ({severity}). {context}",
        "assets_plural": "s",
    },
    "fr": {
        "quality": {"exceptional":"exceptionnel","strong":"solide","solid":"correct","modest":"modeste","negative":"négatif"},
        "overall": "Le portefeuille a délivré un rendement annualisé {quality} de {cagr:.1f}% (total : {total:+.1f}%) sur la période sélectionnée. Les jours de hausse représentent {pos:.0f}% des séances.",
        "risk_level": {"low":"faible","moderate":"modéré","elevated":"élevé","high":"très élevé"},
        "risk_context": {"low":"comparable à un portefeuille obligataire conservateur","moderate":"typique d'un portefeuille actions diversifié","elevated":"supérieur à un indice actions large","high":"caractéristique de positions concentrées ou spéculatives"},
        "risk": "La volatilité annualisée est de {vol:.1f}% — risque {level}, {context}. Un mauvais jour (VaR 95%), le portefeuille pourrait perdre jusqu'à {var:.2f}% de sa valeur.",
        "div_level": {"very_low":"très faible","low":"faible","moderate":"modérée","good":"bonne"},
        "div_advice": {
            "very_low": "Les actifs évoluent presque en tandem — envisagez d'ajouter des classes d'actifs décorrélées (obligations, matières premières, alternatifs).",
            "low": "La corrélation est élevée ; les bénéfices de diversification sont limités. Introduire des actifs moins corrélés pourrait réduire le risque.",
            "moderate": "La diversification est raisonnable, mais peut être améliorée en ajoutant des actifs de secteurs ou géographies différents.",
            "good": "La faible corrélation moyenne suggère une diversification significative entre les classes d'actifs."
        },
        "diversification": "Avec {n} actif{s} et une corrélation moyenne de {corr:.2f}, la diversification est {level}. {advice}",
        "outperformed": "surperformé", "underperformed": "sous-performé",
        "more_volatile": "plus", "less_volatile": "moins",
        "vol_adj": " tout en étant {more_less} volatile ({diff:.1f}pp d'écart)",
        "alpha": {"high":"génère de l'alpha","neutral":"alpha neutre à marginal","low":"en dessous du benchmark ajusté au risque"},
        "vs_benchmark": "Le portefeuille a {direction} le {name} de {sign}{excess:.2f}% annualisé{vol_adj}. Ratio d'information : {ir:.2f} ({alpha}).",
        "sharpe_quality": {"excellent":"excellent","good":"bon","acceptable":"acceptable","suboptimal":"sous-optimal","negative":"négatif"},
        "sharpe_note": {
            "excellent": "Les rendements ajustés au risque sont remarquables — le rendement dépasse largement le risque pris.",
            "good": "Le portefeuille rémunère efficacement la prise de risque.",
            "acceptable": "Les rendements compensent modestement la volatilité supportée.",
            "suboptimal": "Les rendements couvrent à peine la prime de risque ; envisagez un rééquilibrage vers des actifs à Sharpe plus élevé.",
            "negative": "Le portefeuille a généré moins que le taux sans risque — le risque n'a pas été récompensé."
        },
        "sharpe": "Le ratio de Sharpe de {s:.2f} est {quality}. {note}",
        "dd_severity": {"mild":"faible","moderate":"modéré","severe":"sévère","extreme":"extrême"},
        "dd_context": {
            "mild": "La préservation du capital a été solide sur toute la période.",
            "moderate": "Un drawdown significatif mais courant pour un portefeuille actions.",
            "severe": "Les investisseurs auraient fait face à des pertes latentes substantielles — la discipline émotionnelle est cruciale à ces niveaux.",
            "extreme": "Ce niveau de drawdown est associé à des positions spéculatives ou très concentrées."
        },
        "drawdown": "Le drawdown maximum était de {mdd:.1f}% ({severity}). {context}",
        "assets_plural": "s",
    },
    "es": {
        "quality": {"exceptional":"excepcional","strong":"sólido","solid":"correcto","modest":"modesto","negative":"negativo"},
        "overall": "La cartera ofreció una rentabilidad anualizada {quality} del {cagr:.1f}% (total: {total:+.1f}%) durante el período seleccionado. Los días positivos representaron el {pos:.0f}% de las sesiones.",
        "risk_level": {"low":"bajo","moderate":"moderado","elevated":"elevado","high":"alto"},
        "risk_context": {"low":"comparable a una cartera de bonos conservadora","moderate":"típico de una cartera de renta variable diversificada","elevated":"superior a un índice bursátil amplio","high":"característico de posiciones concentradas o especulativas"},
        "risk": "La volatilidad anualizada es del {vol:.1f}% — riesgo {level}, {context}. En un mal día (VaR 95%), la cartera podría perder hasta un {var:.2f}% de su valor.",
        "div_level": {"very_low":"muy baja","low":"baja","moderate":"moderada","good":"buena"},
        "div_advice": {
            "very_low": "Los activos se mueven casi al unísono — considere añadir clases de activos no correlacionadas.",
            "low": "La correlación es alta; los beneficios de diversificación son limitados.",
            "moderate": "La diversificación es razonable, aunque se puede mejorar añadiendo activos de distintos sectores.",
            "good": "La baja correlación media sugiere una diversificación significativa entre clases de activos."
        },
        "diversification": "Con {n} activo{s} y una correlación media de {corr:.2f}, la diversificación es {level}. {advice}",
        "outperformed": "superado", "underperformed": "quedado por debajo de",
        "more_volatile": "más", "less_volatile": "menos",
        "vol_adj": " siendo {more_less} volátil ({diff:.1f}pp de diferencia)",
        "alpha": {"high":"generando alfa","neutral":"alfa neutro a marginal","low":"por debajo del benchmark ajustado al riesgo"},
        "vs_benchmark": "La cartera ha {direction} al {name} en {sign}{excess:.2f}% anualizado{vol_adj}. Ratio de información: {ir:.2f} ({alpha}).",
        "sharpe_quality": {"excellent":"excelente","good":"bueno","acceptable":"aceptable","suboptimal":"subóptimo","negative":"negativo"},
        "sharpe_note": {
            "excellent": "Los rendimientos ajustados al riesgo son sobresalientes.",
            "good": "La cartera recompensa eficazmente la toma de riesgos.",
            "acceptable": "Los rendimientos compensan modestamente la volatilidad.",
            "suboptimal": "Los rendimientos apenas cubren la prima de riesgo.",
            "negative": "La cartera generó menos que la tasa libre de riesgo."
        },
        "sharpe": "El ratio de Sharpe de {s:.2f} es {quality}. {note}",
        "dd_severity": {"mild":"leve","moderate":"moderado","severe":"severo","extreme":"extremo"},
        "dd_context": {
            "mild": "La preservación del capital fue sólida durante todo el período.",
            "moderate": "Una caída significativa pero no infrecuente para una cartera de renta variable.",
            "severe": "Los inversores habrían enfrentado pérdidas latentes sustanciales.",
            "extreme": "Este nivel de caída está asociado a posiciones especulativas o muy concentradas."
        },
        "drawdown": "La caída máxima fue del {mdd:.1f}% ({severity}). {context}",
        "assets_plural": "s",
    },
    "zh": {
        "quality": {"exceptional":"卓越","strong":"强劲","solid":"稳健","modest":"温和","negative":"负收益"},
        "overall": "投资组合在所选期间实现了{quality}的年化收益率{cagr:.1f}%（总计：{total:+.1f}%）。正收益交易日占总交易日的{pos:.0f}%。",
        "risk_level": {"low":"低","moderate":"中等","elevated":"偏高","high":"高"},
        "risk_context": {"low":"与保守型债券组合相当","moderate":"典型的多元化股票组合","elevated":"高于宽基股票指数","high":"集中型或投机性仓位的特征"},
        "risk": "年化波动率为{vol:.1f}% — {level}风险，{context}。在糟糕的一天（95% VaR），组合最多可能损失{var:.2f}%的价值。",
        "div_level": {"very_low":"极低","low":"较低","moderate":"适中","good":"良好"},
        "div_advice": {
            "very_low": "资产几乎同步波动——建议增加不相关资产类别（债券、大宗商品、另类资产）。",
            "low": "相关性较高，分散化效果有限。引入低相关性资产可降低组合风险。",
            "moderate": "分散化程度合理，但可通过增加不同行业或地区的资产进一步改善。",
            "good": "平均相关性较低，说明各资产类别之间具有显著的分散化效果。"
        },
        "diversification": "包含{n}只资产，平均相关系数为{corr:.2f}，分散化程度{level}。{advice}",
        "outperformed": "跑赢", "underperformed": "跑输",
        "more_volatile": "更高", "less_volatile": "更低",
        "vol_adj": "，波动率{more_less}（差异{diff:.1f}个百分点）",
        "alpha": {"high":"创造超额收益","neutral":"超额收益中性至边际","low":"风险调整后低于基准"},
        "vs_benchmark": "组合{direction}{name} {sign}{excess:.2f}%（年化）{vol_adj}。信息比率：{ir:.2f}（{alpha}）。",
        "sharpe_quality": {"excellent":"卓越","good":"良好","acceptable":"可接受","suboptimal":"欠佳","negative":"为负"},
        "sharpe_note": {
            "excellent": "风险调整后收益表现突出，回报远超所承担的风险。",
            "good": "组合对风险承担的回报有效。",
            "acceptable": "收益对波动率的补偿适中。",
            "suboptimal": "收益勉强覆盖风险溢价，建议向高夏普资产再平衡。",
            "negative": "组合收益低于无风险利率——风险未获回报。"
        },
        "sharpe": "夏普比率为{s:.2f}，表现{quality}。{note}",
        "dd_severity": {"mild":"轻微","moderate":"中等","severe":"严重","extreme":"极端"},
        "dd_context": {
            "mild": "整个期间资本保全良好。",
            "moderate": "对股票组合而言，这是显著但并不罕见的回撤。",
            "severe": "投资者将面临大幅浮亏——此水平需要极强的情绪纪律。",
            "extreme": "此回撤水平与投机性或高度集中的仓位相关。"
        },
        "drawdown": "最大回撤为{mdd:.1f}%（{severity}）。{context}",
        "assets_plural": "",
    },
    "de": {
        "quality": {"exceptional":"außergewöhnlich","strong":"stark","solid":"solide","modest":"bescheiden","negative":"negativ"},
        "overall": "Das Portfolio erzielte eine {quality} annualisierte Rendite von {cagr:.1f}% (gesamt: {total:+.1f}%) über den gewählten Zeitraum. Positive Handelstage machten {pos:.0f}% der Sitzungen aus.",
        "risk_level": {"low":"niedrig","moderate":"moderat","elevated":"erhöht","high":"hoch"},
        "risk_context": {"low":"vergleichbar mit einem konservativen Anleiheportfolio","moderate":"typisch für ein diversifiziertes Aktienportfolio","elevated":"höher als ein breiter Aktienindex","high":"charakteristisch für konzentrierte oder spekulative Positionen"},
        "risk": "Die annualisierte Volatilität beträgt {vol:.1f}% — {level}es Risiko, {context}. An einem schlechten Tag (95% VaR) könnte das Portfolio bis zu {var:.2f}% seines Wertes verlieren.",
        "div_level": {"very_low":"sehr gering","low":"gering","moderate":"moderat","good":"gut"},
        "div_advice": {
            "very_low": "Die Vermögenswerte bewegen sich fast im Gleichschritt — erwägen Sie das Hinzufügen unkorrellierter Anlageklassen.",
            "low": "Die Korrelation ist hoch; der Diversifikationsnutzen ist begrenzt.",
            "moderate": "Die Diversifikation ist angemessen, kann aber durch Hinzufügen von Vermögenswerten aus verschiedenen Sektoren verbessert werden.",
            "good": "Die niedrige Durchschnittskorrelation deutet auf eine bedeutende Diversifikation hin."
        },
        "diversification": "Mit {n} Vermögenswert{s} und einer durchschnittlichen Korrelation von {corr:.2f} ist die Diversifikation {level}. {advice}",
        "outperformed": "übertroffen", "underperformed": "unterschritten",
        "more_volatile": "volatiler", "less_volatile": "weniger volatil",
        "vol_adj": " bei {more_less}er Volatilität ({diff:.1f}pp Unterschied)",
        "alpha": {"high":"Alpha generierend","neutral":"neutrales bis marginales Alpha","low":"unter risikobereinigtem Benchmark"},
        "vs_benchmark": "Das Portfolio hat den {name} um {sign}{excess:.2f}% annualisiert {direction}{vol_adj}. Informationsquotient: {ir:.2f} ({alpha}).",
        "sharpe_quality": {"excellent":"ausgezeichnet","good":"gut","acceptable":"akzeptabel","suboptimal":"suboptimal","negative":"negativ"},
        "sharpe_note": {
            "excellent": "Die risikobereinigten Renditen sind hervorragend.",
            "good": "Das Portfolio belohnt die Risikobereitschaft effektiv.",
            "acceptable": "Die Renditen kompensieren die entstandene Volatilität moderat.",
            "suboptimal": "Die Renditen decken kaum die Risikoprämie; erwägen Sie eine Umschichtung.",
            "negative": "Das Portfolio erzielte weniger als den risikofreien Zinssatz."
        },
        "sharpe": "Das Sharpe-Ratio von {s:.2f} ist {quality}. {note}",
        "dd_severity": {"mild":"mild","moderate":"moderat","severe":"schwerwiegend","extreme":"extrem"},
        "dd_context": {
            "mild": "Die Kapitalerhaltung war während des gesamten Zeitraums stark.",
            "moderate": "Ein erheblicher, aber nicht ungewöhnlicher Rückgang für ein Aktienportfolio.",
            "severe": "Anleger hätten erhebliche unrealisierte Verluste gehabt.",
            "extreme": "Dieses Drawdown-Niveau ist mit spekulativen oder hochkonzentrierten Positionen verbunden."
        },
        "drawdown": "Der maximale Drawdown betrug {mdd:.1f}% ({severity}). {context}",
        "assets_plural": "en",
    },
}


def generate_commentary(
    portfolio: PerformanceMetrics,
    benchmark: BenchmarkComparison,
    n_assets: int,
    avg_correlation: float,
    lang: str = "en",
) -> dict[str, str]:
    t = TRANSLATIONS.get(lang, TRANSLATIONS["en"])
    return {
        "overall": _overall(portfolio, t),
        "risk": _risk(portfolio, t),
        "diversification": _diversification(n_assets, avg_correlation, t),
        "vs_benchmark": _vs_benchmark(portfolio, benchmark, t) if benchmark else "",
        "sharpe_interpretation": _sharpe(portfolio.sharpe_ratio, t),
        "drawdown_note": _drawdown(portfolio.max_drawdown, t),
    }


def _overall(p: PerformanceMetrics, t: dict) -> str:
    cagr_pct = p.cagr * 100
    total_pct = p.total_return * 100
    if cagr_pct > 15: q = "exceptional"
    elif cagr_pct > 10: q = "strong"
    elif cagr_pct > 5: q = "solid"
    elif cagr_pct > 0: q = "modest"
    else: q = "negative"
    return t["overall"].format(quality=t["quality"][q], cagr=cagr_pct, total=total_pct, pos=p.positive_days_pct*100)


def _risk(p: PerformanceMetrics, t: dict) -> str:
    vol_pct = p.annualized_volatility * 100
    if vol_pct < 8: level = "low"
    elif vol_pct < 15: level = "moderate"
    elif vol_pct < 25: level = "elevated"
    else: level = "high"
    var_pct = abs(p.var_95_historical) * 100
    return t["risk"].format(vol=vol_pct, level=t["risk_level"][level], context=t["risk_context"][level], var=var_pct)


def _diversification(n_assets: int, avg_corr: float, t: dict) -> str:
    if avg_corr > 0.80: level = "very_low"
    elif avg_corr > 0.60: level = "low"
    elif avg_corr > 0.40: level = "moderate"
    else: level = "good"
    s = t["assets_plural"] if n_assets > 1 else ""
    return t["diversification"].format(n=n_assets, s=s, corr=avg_corr, level=t["div_level"][level], advice=t["div_advice"][level])


def _vs_benchmark(p: PerformanceMetrics, b: BenchmarkComparison, t: dict) -> str:
    if b is None: return t("commentary.noBenchmark", default="Aucun benchmark sélectionné.")
    excess = b.excess_return * 100
    sign = "+" if excess >= 0 else ""
    direction = t["outperformed"] if excess >= 0 else t["underperformed"]
    vol_compare = p.annualized_volatility - b.performance.annualized_volatility
    vol_adj = ""
    if abs(vol_compare) > 0.03:
        more_less = t["more_volatile"] if vol_compare > 0 else t["less_volatile"]
        vol_adj = t["vol_adj"].format(more_less=more_less, diff=abs(vol_compare)*100)
    ir = b.information_ratio
    alpha = t["alpha"]["high"] if ir > 0.5 else t["alpha"]["neutral"] if ir > 0 else t["alpha"]["low"]
    return t["vs_benchmark"].format(direction=direction, name=b.name, sign=sign, excess=abs(excess), vol_adj=vol_adj, ir=ir, alpha=alpha)


def _sharpe(s: float, t: dict) -> str:
    if s > 2.0: q = "excellent"
    elif s > 1.0: q = "good"
    elif s > 0.5: q = "acceptable"
    elif s > 0: q = "suboptimal"
    else: q = "negative"
    return t["sharpe"].format(s=s, quality=t["sharpe_quality"][q], note=t["sharpe_note"][q])


def _drawdown(mdd: float, t: dict) -> str:
    mdd_pct = abs(mdd) * 100
    if mdd_pct < 10: severity = "mild"
    elif mdd_pct < 25: severity = "moderate"
    elif mdd_pct < 50: severity = "severe"
    else: severity = "extreme"
    return t["drawdown"].format(mdd=mdd_pct, severity=t["dd_severity"][severity], context=t["dd_context"][severity])


def compute_portfolio_score(
    portfolio,
    benchmark,
    avg_correlation: float,
    n_assets: int,
) -> dict:
    scores = {}
    cagr_pct = portfolio.cagr * 100
    if cagr_pct > 20: scores["performance"] = 25
    elif cagr_pct > 15: scores["performance"] = 22
    elif cagr_pct > 10: scores["performance"] = 18
    elif cagr_pct > 5: scores["performance"] = 13
    elif cagr_pct > 0: scores["performance"] = 8
    else: scores["performance"] = 2
    if benchmark and benchmark and benchmark.excess_return > 0.02: scores["performance"] = min(25, scores["performance"] + 3)
    vol = portfolio.annualized_volatility * 100
    mdd = abs(portfolio.max_drawdown) * 100
    risk_score = 25
    if vol > 30: risk_score -= 12
    elif vol > 20: risk_score -= 7
    elif vol > 15: risk_score -= 3
    if mdd > 50: risk_score -= 10
    elif mdd > 30: risk_score -= 6
    elif mdd > 20: risk_score -= 3
    scores["risk"] = max(0, risk_score)
    s = portfolio.sharpe_ratio
    if s > 2: scores["risk_adjusted"] = 25
    elif s > 1.5: scores["risk_adjusted"] = 22
    elif s > 1: scores["risk_adjusted"] = 18
    elif s > 0.5: scores["risk_adjusted"] = 13
    elif s > 0: scores["risk_adjusted"] = 7
    else: scores["risk_adjusted"] = 2
    div_score = 25
    if avg_correlation > 0.80: div_score -= 15
    elif avg_correlation > 0.60: div_score -= 10
    elif avg_correlation > 0.40: div_score -= 5
    if n_assets == 1: div_score -= 10
    elif n_assets == 2: div_score -= 5
    elif n_assets >= 5: div_score = min(25, div_score + 3)
    scores["diversification"] = max(0, div_score)
    global_score = sum(scores.values())
    vol_pct = portfolio.annualized_volatility * 100
    mdd_pct = abs(portfolio.max_drawdown) * 100
    if vol_pct < 8 and mdd_pct < 10:
        profile = "Défensif"; profile_en = "Defensive"; profile_emoji = "🛡️"
        profile_desc = "Portefeuille très peu risqué, priorité à la préservation du capital."
        profile_desc_en = "Very low-risk portfolio, capital preservation priority."
    elif vol_pct < 12 and mdd_pct < 20:
        profile = "Modéré"; profile_en = "Moderate"; profile_emoji = "⚖️"
        profile_desc = "Équilibre rendement/risque raisonnable. Convient à la majorité des investisseurs."
        profile_desc_en = "Reasonable risk/return balance. Suitable for most investors."
    elif vol_pct < 18 and mdd_pct < 35:
        profile = "Équilibré"; profile_en = "Balanced"; profile_emoji = "📊"
        profile_desc = "Portefeuille dynamique avec exposition actions significative. Horizon 5 ans minimum."
        profile_desc_en = "Dynamic portfolio with significant equity exposure. Minimum 5-year horizon."
    elif vol_pct < 25 and mdd_pct < 50:
        profile = "Dynamique"; profile_en = "Dynamic"; profile_emoji = "🚀"
        profile_desc = "Forte exposition aux actifs risqués. Potentiel élevé mais drawdowns importants."
        profile_desc_en = "High exposure to risky assets. High potential but significant drawdowns."
    else:
        profile = "Agressif"; profile_en = "Aggressive"; profile_emoji = "⚡"
        profile_desc = "Portefeuille spéculatif. Réservé aux investisseurs expérimentés."
        profile_desc_en = "Speculative portfolio. For experienced investors only."
    if global_score >= 80:
        synthesis = f"Excellent portefeuille {profile.lower()} — performance solide, risque maîtrisé et bonne diversification."
        synthesis_en = f"Excellent {profile_en.lower()} portfolio — solid performance, controlled risk and good diversification."
    elif global_score >= 65:
        synthesis = f"Bon portefeuille {profile.lower()} avec des points d'amélioration identifiables."
        synthesis_en = f"Good {profile_en.lower()} portfolio with identifiable improvement areas."
    elif global_score >= 50:
        synthesis = f"Portefeuille {profile.lower()} correct mais des ajustements amélioreraient le profil risque/rendement."
        synthesis_en = f"{profile_en} portfolio acceptable but adjustments could improve the risk/return profile."
    else:
        synthesis = f"Portefeuille {profile.lower()} présentant des faiblesses — revoir l'allocation."
        synthesis_en = f"{profile_en} portfolio with significant weaknesses — review allocation."
    return {
        "global_score": global_score,
        "scores": scores,
        "profile": profile,
        "profile_en": profile_en,
        "profile_emoji": profile_emoji,
        "profile_desc": profile_desc,
        "profile_desc_en": profile_desc_en,
        "synthesis": synthesis,
        "synthesis_en": synthesis_en,
    }
