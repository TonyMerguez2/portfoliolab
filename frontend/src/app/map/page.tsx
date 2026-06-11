"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { feature } from "topojson-client";
import Header from "@/components/Header";

const COUNTRY_FLAGS: Record<string, string> = {
  "004":"🇦🇫","008":"🇦🇱","012":"🇩🇿","024":"🇦🇴","032":"🇦🇷","036":"🇦🇺","040":"🇦🇹","050":"🇧🇩","056":"🇧🇪","068":"🇧🇴","076":"🇧🇷","100":"🇧🇬","104":"🇲🇲","116":"🇰🇭","120":"🇨🇲","124":"🇨🇦","144":"🇱🇰","152":"🇨🇱","156":"🇨🇳","170":"🇨🇴","180":"🇨🇩","188":"🇨🇷","191":"🇭🇷","192":"🇨🇺","203":"🇨🇿","208":"🇩🇰","218":"🇪🇨","818":"🇪🇬","231":"🇪🇹","246":"🇫🇮","250":"🇫🇷","276":"🇩🇪","288":"🇬🇭","300":"🇬🇷","320":"🇬🇹","324":"🇬🇳","340":"🇭🇳","348":"🇭🇺","356":"🇮🇳","360":"🇮🇩","364":"🇮🇷","368":"🇮🇶","372":"🇮🇪","376":"🇮🇱","380":"🇮🇹","388":"🇯🇲","392":"🇯🇵","400":"🇯🇴","398":"🇰🇿","404":"🇰🇪","408":"🇰🇵","410":"🇰🇷","414":"🇰🇼","418":"🇱🇦","422":"🇱🇧","434":"🇱🇾","484":"🇲🇽","504":"🇲🇦","508":"🇲🇿","516":"🇳🇦","524":"🇳🇵","528":"🇳🇱","554":"🇳🇿","558":"🇳🇮","566":"🇳🇬","578":"🇳🇴","586":"🇵🇰","591":"🇵🇦","598":"🇵🇬","600":"🇵🇾","604":"🇵🇪","608":"🇵🇭","616":"🇵🇱","620":"🇵🇹","634":"🇶🇦","642":"🇷🇴","643":"🇷🇺","682":"🇸🇦","686":"🇸🇳","710":"🇿🇦","724":"🇪🇸","752":"🇸🇪","756":"🇨🇭","760":"🇸🇾","158":"🇹🇼","764":"🇹🇭","788":"🇹🇳","792":"🇹🇷","800":"🇺🇬","804":"🇺🇦","784":"🇦🇪","826":"🇬🇧","840":"🇺🇸","858":"🇺🇾","862":"🇻🇪","704":"🇻🇳","702":"🇸🇬","304":"🇬🇱","090":"🇸🇧","598":"🇵🇬","626":"🇹🇱","540":"🇳🇨","242":"🇫🇯","148":"🇹🇩","140":"🇨🇫","238":"🇫🇰","630":"🇵🇷","728":"🇸🇸","729":"🇸🇩","887":"🇾🇪","108":"🇧🇮","450":"🇲🇬","454":"🇲🇼","466":"🇲🇱","478":"🇲🇷","748":"🇸🇿","426":"🇱🇸","072":"🇧🇼","716":"🇿🇼","894":"🇿🇲","646":"🇷🇼","706":"🇸🇴","262":"🇩🇯","232":"🇪🇷","270":"🇬🇲","430":"🇱🇷","562":"🇳🇪","768":"🇹🇬","204":"🇧🇯","854":"🇧🇫","178":"🇨🇬","266":"🇬🇦","226":"🇬🇶","624":"🇬🇼","694":"🇸🇱","496":"🇲🇳","051":"🇦🇲","031":"🇦🇿","268":"🇬🇪","112":"🇧🇾","498":"🇲🇩","807":"🇲🇰","688":"🇷🇸","070":"🇧🇦","499":"🇲🇪","705":"🇸🇮","703":"🇸🇰","440":"🇱🇹","428":"🇱🇻","233":"🇪🇪","442":"🇱🇺","352":"🇮🇸","780":"🇹🇹","044":"🇧🇸","332":"🇭🇹","328":"🇬🇾","740":"🇸🇷","084":"🇧🇿","222":"🇸🇻","548":"🇻🇺","096":"🇧🇳","462":"🇲🇻","417":"🇰🇬","762":"🇹🇯","795":"🇹🇲","860":"🇺🇿","512":"🇴🇲","275":"🇵🇸","834":"🇹🇿","800":"🇺🇬","404":"🇰🇪","231":"🇪🇹","238":"🇫🇰","630":"🇵🇷","728":"🇸🇸","729":"🇸🇩","887":"🇾🇪","706":"🇸🇴","508":"🇲🇿","716":"🇿🇼","894":"🇿🇲","454":"🇲🇼","426":"🇱🇸","072":"🇧🇼","516":"🇳🇦","710":"🇿🇦","748":"🇸🇿","174":"🇰🇲","450":"🇲🇬","480":"🇲🇺","332":"🇭🇹","214":"🇩🇴","196":"🇨🇾","458":"🇲🇾",
};

const COUNTRY_NAMES: Record<string, string> = {
  "004":"Afghanistan","008":"Albanie","012":"Algérie","024":"Angola","032":"Argentine","036":"Australie","040":"Autriche","050":"Bangladesh","056":"Belgique","068":"Bolivie","076":"Brésil","100":"Bulgarie","104":"Myanmar","116":"Cambodge","120":"Cameroun","124":"Canada","144":"Sri Lanka","152":"Chili","156":"Chine","170":"Colombie","180":"R.D. Congo","188":"Costa Rica","191":"Croatie","192":"Cuba","203":"Tchéquie","208":"Danemark","218":"Équateur","818":"Égypte","231":"Éthiopie","246":"Finlande","250":"France","276":"Allemagne","288":"Ghana","300":"Grèce","320":"Guatemala","324":"Guinée","340":"Honduras","348":"Hongrie","356":"Inde","360":"Indonésie","364":"Iran","368":"Irak","372":"Irlande","376":"Israël","380":"Italie","388":"Jamaïque","392":"Japon","400":"Jordanie","398":"Kazakhstan","404":"Kenya","408":"Corée du Nord","410":"Corée du Sud","414":"Koweït","418":"Laos","422":"Liban","434":"Libye","484":"Mexique","504":"Maroc","508":"Mozambique","516":"Namibie","524":"Népal","528":"Pays-Bas","554":"Nouvelle-Zélande","558":"Nicaragua","566":"Nigeria","578":"Norvège","586":"Pakistan","591":"Panama","598":"Papouasie","600":"Paraguay","604":"Pérou","608":"Philippines","616":"Pologne","620":"Portugal","634":"Qatar","642":"Roumanie","643":"Russie","682":"Arabie Saoudite","686":"Sénégal","710":"Afrique du Sud","724":"Espagne","752":"Suède","756":"Suisse","760":"Syrie","158":"Taïwan","764":"Thaïlande","788":"Tunisie","792":"Turquie","800":"Ouganda","804":"Ukraine","784":"Émirats Arabes","826":"Royaume-Uni","840":"États-Unis","858":"Uruguay","862":"Venezuela","704":"Vietnam","702":"Singapour","304":"Groenland","090":"Îles Salomon","598":"Papouasie-Nvl-Guinée","626":"Timor oriental","540":"Nouvelle-Calédonie","242":"Fidji","148":"Tchad","140":"Rép. Centrafricaine","238":"Îles Falkland","630":"Porto Rico","728":"Soudan du Sud","729":"Soudan","887":"Yémen","108":"Burundi","450":"Madagascar","454":"Malawi","466":"Mali","478":"Mauritanie","748":"Eswatini","426":"Lesotho","072":"Botswana","716":"Zimbabwe","894":"Zambie","646":"Rwanda","174":"Comores","706":"Somalie","262":"Djibouti","232":"Érythrée","270":"Gambie","430":"Liberia","478":"Mauritanie","562":"Niger","768":"Togo","204":"Bénin","854":"Burkina Faso","566":"Nigeria","178":"Congo","266":"Gabon","226":"Guinée équat.","120":"Cameroun","288":"Ghana","384":"Côte d'Ivoire","324":"Guinée","624":"Guinée-Bissau","686":"Sénégal","694":"Sierra Leone","496":"Mongolie","051":"Arménie","031":"Azerbaïdjan","268":"Géorgie","112":"Biélorussie","498":"Moldova","807":"Macédoine du Nord","688":"Serbie","070":"Bosnie-Herzégovine","499":"Monténégro","008":"Albanie","191":"Croatie","705":"Slovénie","703":"Slovaquie","440":"Lituanie","428":"Lettonie","233":"Estonie","442":"Luxembourg","352":"Islande","780":"Trinité-et-Tobago","044":"Bahamas","388":"Jamaïque","192":"Cuba","214":"Haïti","332":"Haïti","328":"Guyana","740":"Suriname","084":"Belize","222":"El Salvador","320":"Guatemala","340":"Honduras","558":"Nicaragua","591":"Panama","188":"Costa Rica","548":"Vanuatu","090":"Îles Salomon","598":"Papouasie","096":"Brunei","418":"Laos","116":"Cambodge","764":"Thaïlande","512":"Oman","275":"Palestine","400":"Jordanie","422":"Liban","760":"Syrie","050":"Bangladesh","144":"Sri Lanka","524":"Népal","064":"Bhoutan","462":"Maldives","417":"Kirghizstan","762":"Tadjikistan","795":"Turkménistan","860":"Ouzbékistan","834":"Tanzanie","214":"République dominicaine","332":"Haïti","174":"Comores","480":"Maurice","196":"Chypre","458":"Malaisie",
};

// ISO alpha-3 → numeric mapping pour World Bank
const ISO3_TO_NUMERIC: Record<string, string> = {
  "USA":"840","FRA":"250","DEU":"276","GBR":"826","JPN":"392","CHN":"156","IND":"356","BRA":"076","AUS":"036","CAN":"124",
  "KOR":"410","MEX":"484","SAU":"682","SGP":"702","CHE":"756","NLD":"528","ITA":"380","ESP":"724","SWE":"752","NOR":"578",
  "RUS":"643","TUR":"792","ZAF":"710","ARG":"032","IDN":"360","NGA":"566","EGY":"818","PAK":"586","BGD":"050","VNM":"704",
  "POL":"616","UKR":"804","IRN":"364","THA":"764","MYS":"458","PHL":"608","COL":"170","CHL":"152","PER":"604","CZE":"203",
  "HUN":"348","GRC":"300","PRT":"620","ROU":"642","FIN":"246","DNK":"208","BEL":"056","AUT":"040","ISR":"376","ARE":"784",
  "IRQ":"368","DZA":"012","MAR":"504","KAZ":"398","AGO":"024","GHA":"288","ETH":"231","TZA":"834","KEN":"404","CIV":"384",
};

const MACRO_INDICATORS = [
  { id: "FP.CPI.TOTL.ZG", label: "Inflation", unit: "%", colorHigh: "#ef4444", colorLow: "#22c55e", desc: "Variation des prix à la consommation" },
  { id: "SL.UEM.TOTL.ZS", label: "Chômage", unit: "%", colorHigh: "#ef4444", colorLow: "#22c55e", desc: "Taux de chômage" },
  { id: "NY.GDP.MKTP.KD.ZG", label: "Croissance PIB", unit: "%", colorHigh: "#22c55e", colorLow: "#ef4444", desc: "Croissance du PIB réel" },
  { id: "GC.DOD.TOTL.GD.ZS", label: "Dette publique", unit: "% PIB", colorHigh: "#ef4444", colorLow: "#22c55e", desc: "Dette publique en % du PIB" },
  { id: "NY.GDP.PCAP.CD", label: "PIB/habitant", unit: "$", colorHigh: "#22c55e", colorLow: "#ef4444", desc: "PIB par habitant en USD" },
];

const ETF_LIST = [
  { id: "SPY", desc: "Actions US large cap", countries: { "840": 100 } },
  { id: "QQQ", desc: "Tech US Nasdaq-100", countries: { "840": 100 } },
  { id: "VEA", desc: "Marchés développés hors US", countries: { "392":22,"826":14,"276":9,"250":8,"124":7,"036":7,"756":6,"528":4,"724":3,"380":3 } },
  { id: "EEM", desc: "Marchés émergents", countries: { "156":30,"356":18,"158":14,"410":12,"076":6,"484":3,"682":3,"702":3 } },
  { id: "VWO", desc: "Marchés émergents Vanguard", countries: { "156":35,"356":20,"076":8,"410":8,"484":4,"682":3 } },
  { id: "EWJ", desc: "Actions japonaises", countries: { "392":100 } },
  { id: "FXI", desc: "Actions chinoises", countries: { "156":100 } },
  { id: "EWG", desc: "Actions allemandes", countries: { "276":100 } },
  { id: "EWU", desc: "Actions britanniques", countries: { "826":100 } },
  { id: "ACWI", desc: "Monde entier", countries: { "840":62,"392":6,"826":4,"276":3,"250":3,"124":3,"036":2,"156":3,"356":2,"756":2 } },
];

export default function MapPage() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number, y: number, countryId: string } | null>(null);
  const [tab, setTab] = useState<"etf"|"macro">("etf");
  const [search, setSearch] = useState("");
  const [selectedEtf, setSelectedEtf] = useState<string | null>(null);
  const [selectedMacro, setSelectedMacro] = useState<string | null>(null);
  const [macroData, setMacroData] = useState<Record<string, number>>({});
  const [macroLoading, setMacroLoading] = useState(false);
  const [dark, setDark] = useState(true);
  const [searchResults, setSearchResults] = useState<{ticker:string,name:string,type:string}[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!search || tab !== "etf") { setSearchResults([]); setShowSearchResults(false); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`http://localhost:8000/api/v1/search?q=${encodeURIComponent(search)}`);
        const data = await res.json();
        const items = data?.quotes || data?.results || [];
        setSearchResults(items.slice(0, 8).map((r: any) => ({
          ticker: r.symbol || r.ticker,
          name: r.shortname || r.longname || r.name || r.symbol,
          type: r.quoteType || r.type || "EQUITY",
        })));
        setShowSearchResults(true);
      } catch {}
    }, 300);
  }, [search, tab]);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    setDark(saved !== "light");
  }, []);

  const text = dark ? "#F8F9FC" : "#0B1A33";
  const etf = ETF_LIST.find(e => e.id === selectedEtf);
  const macro = MACRO_INDICATORS.find(m => m.id === selectedMacro);

  // Fetch macro data from World Bank
  useEffect(() => {
    if (!selectedMacro) return;
    setMacroLoading(true);
    setMacroData({});
    fetch(`https://api.worldbank.org/v2/country/all/indicator/${selectedMacro}?format=json&mrv=1&per_page=300`)
      .then(r => r.json())
      .then((data: any) => {
        const result: Record<string, number> = {};
        if (data[1]) {
          data[1].forEach((entry: any) => {
            if (entry.value !== null && entry.countryiso3code) {
              const numeric = ISO3_TO_NUMERIC[entry.countryiso3code];
              if (numeric) result[numeric] = entry.value;
            }
          });
        }
        setMacroData(result);
        setMacroLoading(false);
      })
      .catch(() => setMacroLoading(false));
  }, [selectedMacro]);

  const getMacroColor = (id: string) => {
    if (!macro || !macroData[id]) return dark ? "rgba(255,255,255,0.03)" : "rgba(11,26,51,0.05)";
    const values = Object.values(macroData).filter(v => v !== null);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const val = macroData[id];
    const t = (val - min) / (max - min);
    // Interpoler entre colorLow et colorHigh
    const isHighBad = macro.colorHigh === "#ef4444";
    const intensity = isHighBad ? t : 1 - t;
    if (intensity < 0.33) return dark ? `rgba(34,197,94,${0.2 + intensity * 0.8})` : `rgba(34,197,94,${0.15 + intensity * 0.7})`;
    if (intensity < 0.66) return dark ? `rgba(234,179,8,${0.3 + intensity * 0.5})` : `rgba(234,179,8,${0.25 + intensity * 0.5})`;
    return dark ? `rgba(239,68,68,${0.3 + intensity * 0.5})` : `rgba(239,68,68,${0.25 + intensity * 0.5})`;
  };

  const getCountryColor = (id: string) => {
    if (tab === "macro" && selectedMacro) return getMacroColor(id);
    if (!etf) return COUNTRY_NAMES[id] ? (dark ? "rgba(91,141,239,0.28)" : "rgba(91,141,239,0.2)") : (dark ? "rgba(255,255,255,0.03)" : "rgba(11,26,51,0.05)");
    const pct = etf.countries[id];
    if (!pct) return dark ? "rgba(255,255,255,0.03)" : "rgba(11,26,51,0.05)";
    const intensity = Math.min(pct / 40, 1);
    return dark ? `rgba(91,141,239,${0.15 + intensity * 0.7})` : `rgba(91,141,239,${0.1 + intensity * 0.6})`;
  };

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    const w = svgRef.current?.parentElement?.clientWidth || 1200;
    const h = window.innerHeight - 36;
    svg.attr("width", w).attr("height", h);
    svg.selectAll("*").remove();

    const defs = svg.append("defs");
    const grad = defs.append("radialGradient").attr("id","ocean-grad").attr("cx","50%").attr("cy","50%").attr("r","70%");
    if (dark) {
      grad.append("stop").attr("offset","0%").attr("stop-color","#071830");
      grad.append("stop").attr("offset","100%").attr("stop-color","#020d1c");
    } else {
      grad.append("stop").attr("offset","0%").attr("stop-color","#C8D9F0");
      grad.append("stop").attr("offset","100%").attr("stop-color","#A8C0E0");
    }
    svg.append("rect").attr("width",w).attr("height",h).attr("fill","url(#ocean-grad)");

    const projection = d3.geoNaturalEarth1().scale(w/6.2).translate([w/2, h/2+10]);
    const path = d3.geoPath().projection(projection);

    fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
      .then(r => r.json())
      .then((world: any) => {
        const countries = feature(world, world.objects.countries) as any;
        const filtered = countries.features.filter((d: any) => { const id = Number(d.id); return d.id !== undefined && d.id !== null && id !== 10 && id !== 260; });

        svg.append("g").selectAll("path").data(filtered).join("path")
          .attr("d", path as any)
          .attr("fill", (d: any) => getCountryColor(String(d.id).padStart(3,"0")))
          .attr("stroke", dark ? "rgba(255,255,255,0.06)" : "rgba(11,26,51,0.09)")
          .attr("stroke-width", 0.4)
          .style("cursor", (d: any) => COUNTRY_NAMES[String(d.id).padStart(3,"0")] ? "pointer" : "default")
          .on("mouseenter", function(event: any, d: any) {
            const id = String(d.id).padStart(3,"0");
            d3.select(this).attr("fill", dark ? "rgba(155,185,255,0.6)" : "rgba(91,141,239,0.5)");
            setTooltip({ x: event.clientX, y: event.clientY, countryId: id });
          })
          .on("mousemove", function(event: any, d: any) {
            const id = String(d.id).padStart(3,"0");
            setTooltip(t => t ? { ...t, x: event.clientX, y: event.clientY } : null);
          })
          .on("mouseleave", function(event: any, d: any) {
            const id = String(d.id).padStart(3,"0");
            d3.select(this).attr("fill", getCountryColor(id));
            setTooltip(null);
          });
      });
  }, [dark, selectedEtf, selectedMacro, macroData, tab]);

  const filteredEtfs = ETF_LIST.filter(e => e.id.toLowerCase().includes(search.toLowerCase()) || e.desc.toLowerCase().includes(search.toLowerCase()));
  const filteredMacro = MACRO_INDICATORS.filter(m => m.label.toLowerCase().includes(search.toLowerCase()));

  // Légende macro
  const macroValues = Object.values(macroData);
  const macroMin = macroValues.length ? Math.min(...macroValues) : 0;
  const macroMax = macroValues.length ? Math.max(...macroValues) : 100;

  return (
    <div style={{ display: "flex", height: "100vh", backgroundColor: dark ? "#020d1c" : "#D8E8F4", overflow: "hidden" }}>
      <Header dark={dark} setDark={setDark}/>

      {/* Sidebar */}
      <div style={{
        width: "220px", flexShrink: 0, height: "100vh", overflowY: "auto",
        borderRight: dark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(11,26,51,0.08)",
        background: "rgba(2,10,24,0.99)",
        display: "flex", flexDirection: "column",
      }}>

        {/* Header sidebar */}
        <div style={{ padding: "16px 16px 12px", borderBottom: dark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(11,26,51,0.07)" }}>
          <a href="/" style={{ color: text, opacity: 0.35, fontSize: "10px", textDecoration: "none", display: "block", marginBottom: "10px" }}>← Accueil</a>
          <h1 style={{ color: text, fontSize: "11px", fontWeight: 700, letterSpacing: "0.2em", margin: "0 0 12px" }}>WORLD MAP</h1>

          {/* Barre de recherche */}
          <div style={{ position: "relative" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: "8px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "8px", padding: "0 10px", height: "32px",
            }}>
              <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="#F8F9FC" strokeWidth={2} style={{ opacity: 0.35, flexShrink: 0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
              </svg>
              <input value={search} onChange={e => { setSearch(e.target.value); setShowSearchResults(false); }}
                onFocus={() => searchResults.length > 0 && setShowSearchResults(true)}
                placeholder={tab === "etf" ? "Rechercher AAPL, SPY, BTC..." : "Rechercher un indicateur..."}
                style={{
                  background: "transparent", border: "none", outline: "none",
                  color: "#F8F9FC", fontSize: "11px", width: "100%",
                  opacity: search ? 1 : 0.4,
                }}
              />
              {search && <button onClick={() => { setSearch(""); setSearchResults([]); setShowSearchResults(false); }}
                style={{ background: "transparent", border: "none", cursor: "pointer", opacity: 0.4, padding: 0 }}>
                <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="#F8F9FC" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>}
            </div>
            {showSearchResults && searchResults.length > 0 && (
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50,
                background: "rgba(4,17,36,0.98)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px", overflow: "hidden",
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              }}>
                {searchResults.map(r => (
                  <button key={r.ticker} onClick={() => { setSearch(r.ticker); setShowSearchResults(false); }}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      width: "100%", padding: "8px 10px", background: "transparent", border: "none",
                      cursor: "pointer", textAlign: "left",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <div>
                      <span style={{ color: "#F8F9FC", fontSize: "11px", fontWeight: 600 }}>{r.ticker}</span>
                      <span style={{ color: "#F8F9FC", fontSize: "10px", opacity: 0.4, marginLeft: "6px" }}>{r.name}</span>
                    </div>
                    <span style={{
                      fontSize: "9px", padding: "2px 6px", borderRadius: "4px", fontWeight: 600,
                      background: r.type === "ETF" ? "rgba(59,130,246,0.2)" : r.type === "CRYPTOCURRENCY" ? "rgba(245,158,11,0.2)" : "rgba(99,102,241,0.2)",
                      color: r.type === "ETF" ? "#93c5fd" : r.type === "CRYPTOCURRENCY" ? "#fcd34d" : "#a5b4fc",
                    }}>{r.type === "CRYPTOCURRENCY" ? "Crypto" : r.type === "ETF" ? "ETF" : "Action"}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Onglets */}
          <div style={{ display: "flex", gap: "4px", marginTop: "10px" }}>
            {(["etf", "macro"] as const).map(t => (
              <button key={t} onClick={() => { setTab(t); setSearch(""); setSelectedEtf(null); setSelectedMacro(null); }} style={{
                flex: 1, padding: "6px 0", borderRadius: "7px", border: "none",
                background: tab === t ? (dark ? "rgba(91,141,239,0.18)" : "rgba(91,141,239,0.14)") : "transparent",
                color: text, fontSize: "11px", fontWeight: tab === t ? 600 : 400,
                opacity: tab === t ? 1 : 0.45, cursor: "pointer", letterSpacing: "0.06em",
              }}>
                {t === "etf" ? "ETF" : "Macro"}
              </button>
            ))}
          </div>
        </div>

        {/* Liste */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
          {tab === "etf" ? (
            <>
              <button onClick={() => setSelectedEtf(null)} style={{
                padding: "8px 12px", borderRadius: "7px", border: "none", textAlign: "left",
                background: !selectedEtf ? (dark ? "rgba(91,141,239,0.15)" : "rgba(91,141,239,0.12)") : "transparent",
                borderLeft: !selectedEtf ? "2px solid rgba(91,141,239,0.6)" : "2px solid transparent",
                cursor: "pointer", width: "100%", marginBottom: "2px",
              }}>
                <span style={{ color: text, fontSize: "11px", opacity: !selectedEtf ? 1 : 0.5, fontWeight: !selectedEtf ? 600 : 400 }}>🌍 Vue globale</span>
              </button>
              {filteredEtfs.map(e => (
                <button key={e.id} onClick={() => setSelectedEtf(e.id)} style={{
                  padding: "8px 12px", borderRadius: "7px", border: "none", textAlign: "left",
                  background: selectedEtf === e.id ? (dark ? "rgba(91,141,239,0.15)" : "rgba(91,141,239,0.12)") : "transparent",
                  borderLeft: selectedEtf === e.id ? "2px solid rgba(91,141,239,0.6)" : "2px solid transparent",
                  cursor: "pointer", width: "100%", marginBottom: "2px",
                }}>
                  <div style={{ color: text, fontSize: "12px", fontWeight: 600, opacity: selectedEtf === e.id ? 1 : 0.65 }}>{e.id}</div>
                  <div style={{ color: text, fontSize: "10px", opacity: 0.35, marginTop: "1px" }}>{e.desc}</div>
                </button>
              ))}
            </>
          ) : (
            filteredMacro.map(m => (
              <button key={m.id} onClick={() => setSelectedMacro(m.id)} style={{
                padding: "8px 12px", borderRadius: "7px", border: "none", textAlign: "left",
                background: selectedMacro === m.id ? (dark ? "rgba(91,141,239,0.15)" : "rgba(91,141,239,0.12)") : "transparent",
                borderLeft: selectedMacro === m.id ? "2px solid rgba(91,141,239,0.6)" : "2px solid transparent",
                cursor: "pointer", width: "100%", marginBottom: "2px",
              }}>
                <div style={{ color: text, fontSize: "12px", fontWeight: 600, opacity: selectedMacro === m.id ? 1 : 0.65 }}>{m.label}</div>
                <div style={{ color: text, fontSize: "10px", opacity: 0.35, marginTop: "1px" }}>{m.desc}</div>
              </button>
            ))
          )}
        </div>

        {/* Légende */}
        <div style={{ padding: "12px 16px", borderTop: dark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(11,26,51,0.07)" }}>
          {tab === "etf" && etf && (
            <>
              <p style={{ color: text, fontSize: "10px", opacity: 0.35, letterSpacing: "0.08em", margin: "0 0 8px" }}>PONDÉRATION</p>
              {Object.entries(etf.countries).sort((a,b) => b[1]-a[1]).slice(0,6).map(([id, pct]) => (
                <div key={id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "5px" }}>
                  <span style={{ color: text, fontSize: "11px", opacity: 0.6 }}>{COUNTRY_FLAGS[id] || "🌐"} {COUNTRY_NAMES[id] || id}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <div style={{ width: `${Math.max(pct * 0.8, 4)}px`, height: "3px", borderRadius: "2px", background: "rgba(91,141,239,0.7)" }}/>
                    <span style={{ color: "#9BB9FF", fontSize: "11px", fontWeight: 600 }}>{pct}%</span>
                  </div>
                </div>
              ))}
            </>
          )}
          {tab === "macro" && selectedMacro && !macroLoading && macroValues.length > 0 && (
            <>
              <p style={{ color: text, fontSize: "10px", opacity: 0.35, letterSpacing: "0.08em", margin: "0 0 8px" }}>
                {macro?.label} · {macro?.unit}
              </p>
              {/* Barre de gradient */}
              <div style={{ height: "6px", borderRadius: "3px", background: "linear-gradient(to right, #22c55e, #eab308, #ef4444)", marginBottom: "4px" }}/>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: text, fontSize: "10px", opacity: 0.4 }}>{macroMin.toFixed(1)}{macro?.unit}</span>
                <span style={{ color: text, fontSize: "10px", opacity: 0.4 }}>{macroMax.toFixed(1)}{macro?.unit}</span>
              </div>
            </>
          )}
          {tab === "macro" && macroLoading && (
            <p style={{ color: text, fontSize: "10px", opacity: 0.35, textAlign: "center" }}>Chargement...</p>
          )}
        </div>
      </div>

      {/* Map */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <svg ref={svgRef} style={{ display: "block", width: "100%", height: "100%" }}/>

        {tooltip && (
          <div style={{
            position: "fixed", left: tooltip.x+14, top: tooltip.y-14,
            background: dark ? "rgba(4,17,36,0.95)" : "rgba(225,236,250,0.97)",
            border: dark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(11,26,51,0.12)",
            borderRadius: "10px", padding: "10px 14px",
            backdropFilter: "blur(16px)", pointerEvents: "none", zIndex: 100,
            boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <span style={{ fontSize: "20px" }}>{COUNTRY_FLAGS[tooltip.countryId] || "🌐"}</span>
              <span style={{ color: text, fontSize: "12px", fontWeight: 600 }}>{COUNTRY_NAMES[tooltip.countryId] || `Pays ${tooltip.countryId}`}</span>
            </div>
            {tab === "etf" && etf?.countries[tooltip.countryId] && (
              <div style={{ color: "#9BB9FF", fontSize: "11px", fontWeight: 600 }}>
                {etf.countries[tooltip.countryId]}% dans {etf.id}
              </div>
            )}
            {tab === "macro" && macroData[tooltip.countryId] !== undefined && (
              <div style={{ color: "#9BB9FF", fontSize: "11px", fontWeight: 600 }}>
                {macro?.label} : {macroData[tooltip.countryId].toFixed(1)} {macro?.unit}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
