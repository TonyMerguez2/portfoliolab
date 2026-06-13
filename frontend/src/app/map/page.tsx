"use client";
import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { feature } from "topojson-client";
import Header from "@/components/Header";

const COUNTRY_FLAGS: Record<string, string> = {
  "AFG":"🇦🇫","ALB":"🇦🇱","DZA":"🇩🇿","AGO":"🇦🇴","ARG":"🇦🇷","AUS":"🇦🇺","AUT":"🇦🇹","BHS":"🇧🇸","BGD":"🇧🇩","BEL":"🇧🇪","BTN":"🇧🇹","BOL":"🇧🇴","BIH":"🇧🇦","BWA":"🇧🇼","BRA":"🇧🇷","BLZ":"🇧🇿","SLB":"🇸🇧","BRN":"🇧🇳","BGR":"🇧🇬","MMR":"🇲🇲","BDI":"🇧🇮","BLR":"🇧🇾","KHM":"🇰🇭","CMR":"🇨🇲","CAN":"🇨🇦","CAF":"🇨🇫","LKA":"🇱🇰","TCD":"🇹🇩","CHL":"🇨🇱","CHN":"🇨🇳","TWN":"🇹🇼","COL":"🇨🇴","COM":"🇰🇲","COG":"🇨🇬","COD":"🇨🇩","CRI":"🇨🇷","HRV":"🇭🇷","CUB":"🇨🇺","CYP":"🇨🇾","CZE":"🇨🇿","BEN":"🇧🇯","DNK":"🇩🇰","DOM":"🇩🇴","ECU":"🇪🇨","SLV":"🇸🇻","GNQ":"🇬🇶","ETH":"🇪🇹","ERI":"🇪🇷","EST":"🇪🇪","FJI":"🇫🇯","FIN":"🇫🇮","FRA":"🇫🇷","DJI":"🇩🇯","GAB":"🇬🇦","GEO":"🇬🇪","GMB":"🇬🇲","PSE":"🇵🇸","DEU":"🇩🇪","GHA":"🇬🇭","GRC":"🇬🇷","GRL":"🇬🇱","GTM":"🇬🇹","GIN":"🇬🇳","GUY":"🇬🇾","HTI":"🇭🇹","HND":"🇭🇳","HUN":"🇭🇺","ISL":"🇮🇸","IND":"🇮🇳","IDN":"🇮🇩","IRN":"🇮🇷","IRQ":"🇮🇶","IRL":"🇮🇪","ISR":"🇮🇱","ITA":"🇮🇹","CIV":"🇨🇮","JAM":"🇯🇲","JPN":"🇯🇵","KAZ":"🇰🇿","JOR":"🇯🇴","KEN":"🇰🇪","PRK":"🇰🇵","KOR":"🇰🇷","KWT":"🇰🇼","KGZ":"🇰🇬","LAO":"🇱🇦","LBN":"🇱🇧","LSO":"🇱🇸","LVA":"🇱🇻","LBR":"🇱🇷","LBY":"🇱🇾","LTU":"🇱🇹","LUX":"🇱🇺","MDG":"🇲🇬","MWI":"🇲🇼","MYS":"🇲🇾","MDV":"🇲🇻","MLI":"🇲🇱","MRT":"🇲🇷","MUS":"🇲🇺","MEX":"🇲🇽","MNG":"🇲🇳","MDA":"🇲🇩","MNE":"🇲🇪","MAR":"🇲🇦","MOZ":"🇲🇿","OMN":"🇴🇲","NAM":"🇳🇦","NPL":"🇳🇵","NLD":"🇳🇱","NCL":"🇳🇨","VUT":"🇻🇺","NZL":"🇳🇿","NIC":"🇳🇮","NER":"🇳🇪","NGA":"🇳🇬","NOR":"🇳🇴","PAK":"🇵🇰","PAN":"🇵🇦","PNG":"🇵🇬","PRY":"🇵🇾","PER":"🇵🇪","PHL":"🇵🇭","POL":"🇵🇱","PRT":"🇵🇹","GNB":"🇬🇼","TLS":"🇹🇱","PRI":"🇵🇷","QAT":"🇶🇦","ROU":"🇷🇴","RUS":"🇷🇺","RWA":"🇷🇼","SAU":"🇸🇦","SEN":"🇸🇳","SRB":"🇷🇸","SLE":"🇸🇱","SGP":"🇸🇬","SVK":"🇸🇰","VNM":"🇻🇳","SVN":"🇸🇮","SOM":"🇸🇴","ZAF":"🇿🇦","ZWE":"🇿🇼","ESP":"🇪🇸","SDN":"🇸🇩","SSD":"🇸🇸","ESH":"🇪🇭","SUR":"🇸🇷","SWZ":"🇸🇿","SWE":"🇸🇪","CHE":"🇨🇭","SYR":"🇸🇾","TJK":"🇹🇯","THA":"🇹🇭","TGO":"🇹🇬","TTO":"🇹🇹","ARE":"🇦🇪","TUN":"🇹🇳","TUR":"🇹🇷","TKM":"🇹🇲","UGA":"🇺🇬","UKR":"🇺🇦","MKD":"🇲🇰","EGY":"🇪🇬","GBR":"🇬🇧","TZA":"🇹🇿","USA":"🇺🇸","BFA":"🇧🇫","URY":"🇺🇾","UZB":"🇺🇿","VEN":"🇻🇪","YEM":"🇾🇪","ZMB":"🇿🇲","AZE":"🇦🇿","ARM":"🇦🇲","FLK":"🇫🇰","CYP":"🇨🇾",
};

const COUNTRY_NAMES: Record<string, string> = {
  "AFG":"Afghanistan","ALB":"Albanie","DZA":"Algérie","AGO":"Angola","ARG":"Argentine","AUS":"Australie","AUT":"Autriche","BHS":"Bahamas","BGD":"Bangladesh","BEL":"Belgique","BTN":"Bhoutan","BOL":"Bolivie","BIH":"Bosnie","BWA":"Botswana","BRA":"Brésil","BLZ":"Belize","SLB":"Îles Salomon","BRN":"Brunei","BGR":"Bulgarie","MMR":"Myanmar","BDI":"Burundi","BLR":"Biélorussie","KHM":"Cambodge","CMR":"Cameroun","CAN":"Canada","CAF":"Rép. Centrafricaine","LKA":"Sri Lanka","TCD":"Tchad","CHL":"Chili","CHN":"Chine","TWN":"Taïwan","COL":"Colombie","COM":"Comores","COG":"Congo","COD":"R.D. Congo","CRI":"Costa Rica","HRV":"Croatie","CUB":"Cuba","CYP":"Chypre","CZE":"Tchéquie","BEN":"Bénin","DNK":"Danemark","DOM":"Rép. Dominicaine","ECU":"Équateur","SLV":"El Salvador","GNQ":"Guinée équatoriale","ETH":"Éthiopie","ERI":"Érythrée","EST":"Estonie","FJI":"Fidji","FIN":"Finlande","FRA":"France","DJI":"Djibouti","GAB":"Gabon","GEO":"Géorgie","GMB":"Gambie","PSE":"Palestine","DEU":"Allemagne","GHA":"Ghana","GRC":"Grèce","GRL":"Groenland","GTM":"Guatemala","GIN":"Guinée","GUY":"Guyana","HTI":"Haïti","HND":"Honduras","HUN":"Hongrie","ISL":"Islande","IND":"Inde","IDN":"Indonésie","IRN":"Iran","IRQ":"Irak","IRL":"Irlande","ISR":"Israël","ITA":"Italie","CIV":"Côte d'Ivoire","JAM":"Jamaïque","JPN":"Japon","KAZ":"Kazakhstan","JOR":"Jordanie","KEN":"Kenya","PRK":"Corée du Nord","KOR":"Corée du Sud","KWT":"Koweït","KGZ":"Kirghizstan","LAO":"Laos","LBN":"Liban","LSO":"Lesotho","LVA":"Lettonie","LBR":"Liberia","LBY":"Libye","LTU":"Lituanie","LUX":"Luxembourg","MDG":"Madagascar","MWI":"Malawi","MYS":"Malaisie","MDV":"Maldives","MLI":"Mali","MRT":"Mauritanie","MUS":"Maurice","MEX":"Mexique","MNG":"Mongolie","MDA":"Moldova","MNE":"Monténégro","MAR":"Maroc","MOZ":"Mozambique","OMN":"Oman","NAM":"Namibie","NPL":"Népal","NLD":"Pays-Bas","NCL":"Nouvelle-Calédonie","VUT":"Vanuatu","NZL":"Nouvelle-Zélande","NIC":"Nicaragua","NER":"Niger","NGA":"Nigeria","NOR":"Norvège","PAK":"Pakistan","PAN":"Panama","PNG":"Papouasie","PRY":"Paraguay","PER":"Pérou","PHL":"Philippines","POL":"Pologne","PRT":"Portugal","GNB":"Guinée-Bissau","TLS":"Timor oriental","PRI":"Porto Rico","QAT":"Qatar","ROU":"Roumanie","RUS":"Russie","RWA":"Rwanda","SAU":"Arabie Saoudite","SEN":"Sénégal","SRB":"Serbie","SLE":"Sierra Leone","SGP":"Singapour","SVK":"Slovaquie","VNM":"Vietnam","SVN":"Slovénie","SOM":"Somalie","ZAF":"Afrique du Sud","ZWE":"Zimbabwe","ESP":"Espagne","SDN":"Soudan","SSD":"Soudan du Sud","ESH":"Sahara occidental","SUR":"Suriname","SWZ":"Eswatini","SWE":"Suède","CHE":"Suisse","SYR":"Syrie","TJK":"Tadjikistan","THA":"Thaïlande","TGO":"Togo","TTO":"Trinité-et-Tobago","ARE":"Émirats Arabes","TUN":"Tunisie","TUR":"Turquie","TKM":"Turkménistan","UGA":"Ouganda","UKR":"Ukraine","MKD":"Macédoine du Nord","EGY":"Égypte","GBR":"Royaume-Uni","TZA":"Tanzanie","USA":"États-Unis","BFA":"Burkina Faso","URY":"Uruguay","UZB":"Ouzbékistan","VEN":"Venezuela","YEM":"Yémen","ZMB":"Zambie","AZE":"Azerbaïdjan","ARM":"Arménie","FLK":"Îles Falkland",
};

// ISO numeric → alpha3
const NUM_TO_ISO3: Record<string, string> = {
  "004":"AFG","008":"ALB","012":"DZA","024":"AGO","032":"ARG","036":"AUS","040":"AUT","044":"BHS","050":"BGD","056":"BEL","064":"BTN","068":"BOL","070":"BIH","072":"BWA","076":"BRA","084":"BLZ","090":"SLB","096":"BRN","100":"BGR","104":"MMR","108":"BDI","112":"BLR","116":"KHM","120":"CMR","124":"CAN","140":"CAF","144":"LKA","148":"TCD","152":"CHL","156":"CHN","158":"TWN","170":"COL","174":"COM","178":"COG","180":"COD","188":"CRI","191":"HRV","192":"CUB","196":"CYP","203":"CZE","204":"BEN","208":"DNK","214":"DOM","218":"ECU","222":"SLV","226":"GNQ","231":"ETH","232":"ERI","233":"EST","242":"FJI","246":"FIN","250":"FRA","262":"DJI","266":"GAB","268":"GEO","270":"GMB","275":"PSE","276":"DEU","288":"GHA","300":"GRC","304":"GRL","320":"GTM","324":"GIN","328":"GUY","332":"HTI","340":"HND","348":"HUN","352":"ISL","356":"IND","360":"IDN","364":"IRN","368":"IRQ","372":"IRL","376":"ISR","380":"ITA","384":"CIV","388":"JAM","392":"JPN","398":"KAZ","400":"JOR","404":"KEN","408":"PRK","410":"KOR","414":"KWT","417":"KGZ","418":"LAO","422":"LBN","426":"LSO","428":"LVA","430":"LBR","434":"LBY","440":"LTU","442":"LUX","450":"MDG","454":"MWI","458":"MYS","462":"MDV","466":"MLI","478":"MRT","480":"MUS","484":"MEX","496":"MNG","498":"MDA","499":"MNE","504":"MAR","508":"MOZ","512":"OMN","516":"NAM","524":"NPL","528":"NLD","540":"NCL","548":"VUT","554":"NZL","558":"NIC","562":"NER","566":"NGA","578":"NOR","586":"PAK","591":"PAN","598":"PNG","600":"PRY","604":"PER","608":"PHL","616":"POL","620":"PRT","624":"GNB","626":"TLS","630":"PRI","634":"QAT","642":"ROU","643":"RUS","646":"RWA","682":"SAU","686":"SEN","688":"SRB","694":"SLE","702":"SGP","703":"SVK","704":"VNM","705":"SVN","706":"SOM","710":"ZAF","716":"ZWE","724":"ESP","728":"SSD","729":"SDN","732":"ESH","740":"SUR","748":"SWZ","752":"SWE","756":"CHE","760":"SYR","762":"TJK","764":"THA","768":"TGO","780":"TTO","784":"ARE","788":"TUN","792":"TUR","795":"TKM","800":"UGA","804":"UKR","807":"MKD","818":"EGY","826":"GBR","834":"TZA","840":"USA","854":"BFA","858":"URY","860":"UZB","862":"VEN","887":"YEM","894":"ZMB","031":"AZE","051":"ARM","238":"FLK",
};

const ISO3_TO_NUMERIC: Record<string, string> = Object.fromEntries(Object.entries(NUM_TO_ISO3).map(([k,v]) => [v,k]));

const MACRO_INDICATORS = [
  { id: "FP.CPI.TOTL.ZG", label: "Inflation", unit: "%", desc: "Variation des prix à la consommation" },
  { id: "SL.UEM.TOTL.ZS", label: "Chômage", unit: "%", desc: "Taux de chômage" },
  { id: "NY.GDP.MKTP.KD.ZG", label: "Croissance PIB", unit: "%", desc: "Croissance du PIB réel" },
  { id: "GC.DOD.TOTL.GD.ZS", label: "Dette publique", unit: "% PIB", desc: "Dette publique en % du PIB" },
  { id: "NY.GDP.PCAP.CD", label: "PIB/habitant", unit: "$", desc: "PIB par habitant en USD" },
];

const ETF_LIST = [
  { id: "SPY", desc: "Actions US large cap", countries: { "USA": 100 } },
  { id: "QQQ", desc: "Tech US Nasdaq-100", countries: { "USA": 100 } },
  { id: "VEA", desc: "Marchés développés hors US", countries: { "JPN":22,"GBR":14,"DEU":9,"FRA":8,"CAN":7,"AUS":7,"CHE":6,"NLD":4,"ESP":3,"ITA":3 } },
  { id: "EEM", desc: "Marchés émergents", countries: { "CHN":30,"IND":18,"TWN":14,"KOR":12,"BRA":6,"MEX":3,"SAU":3,"SGP":3 } },
  { id: "VWO", desc: "Marchés émergents Vanguard", countries: { "CHN":35,"IND":20,"BRA":8,"KOR":8,"MEX":4,"SAU":3 } },
  { id: "EWJ", desc: "Actions japonaises", countries: { "JPN":100 } },
  { id: "FXI", desc: "Actions chinoises", countries: { "CHN":100 } },
  { id: "EWG", desc: "Actions allemandes", countries: { "DEU":100 } },
  { id: "EWU", desc: "Actions britanniques", countries: { "GBR":100 } },
  { id: "ACWI", desc: "Monde entier", countries: { "USA":62,"JPN":6,"GBR":4,"DEU":3,"FRA":3,"CAN":3,"AUS":2,"CHN":3,"IND":2,"CHE":2 } },
];

export default function MapPage() {
  const globeRef = useRef<HTMLDivElement>(null);
  const globeInstanceRef = useRef<any>(null);
  const [tooltip, setTooltip] = useState<{ x: number, y: number, iso3: string } | null>(null);
  const [tab, setTab] = useState<"etf"|"macro">("etf");
  const [search, setSearch] = useState("");
  const [selectedEtf, setSelectedEtf] = useState<string | null>(null);
  const [selectedMacro, setSelectedMacro] = useState<string | null>(null);
  const [macroData, setMacroData] = useState<Record<string, number>>({});
  const [macroLoading, setMacroLoading] = useState(false);
  const dark = true;
  const setDark = (_: any) => {};
  const [countriesData, setCountriesData] = useState<any[]>([]);
  const debounceRef = useRef<NodeJS.Timeout>();
  const hoveredRef = useRef<string>("");
  const getCountryColorRef = useRef<(iso3: string) => string>(() => "rgba(91,141,239,0.28)");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [hovTooltip, setHovTooltip] = useState<{x:number,y:number,iso3:string}|null>(null);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [viewMode, setViewMode] = useState<"globe"|"flat">("globe");
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    setDark(saved !== "light");
  }, []);

  const etf = ETF_LIST.find(e => e.id === selectedEtf);
  const macro = MACRO_INDICATORS.find(m => m.id === selectedMacro);

  // Fetch countries geojson
  useEffect(() => {
    fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
      .then(r => r.json())
      .then((world: any) => {
        const { feature } = require("topojson-client");
        const countries = feature(world, world.objects.countries);
        const filtered = countries.features.filter((d: any) => {
          const id = Number(d.id);
          return d.id !== undefined && d.id !== null && id !== 10 && id !== 260;
        });
        setCountriesData(filtered);
      });
  }, []);

  // Fetch macro
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
              result[entry.countryiso3code] = entry.value;
            }
          });
        }
        setMacroData(result);
        setMacroLoading(false);
      })
      .catch(() => setMacroLoading(false));
  }, [selectedMacro]);

  // Search
  useEffect(() => {
    if (!search || tab !== "etf") { setSearchResults([]); setShowSearchResults(false); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`http://localhost:8000/api/v1/search?q=${encodeURIComponent(search)}`);
        const data = await res.json();
        const items = data?.quotes || data?.results || [];
        setSearchResults(items.slice(0,8).map((r: any) => ({
          ticker: r.symbol || r.ticker,
          name: r.shortname || r.longname || r.name || r.symbol,
          type: r.quoteType || r.type || "EQUITY",
        })));
        setShowSearchResults(true);
      } catch {}
    }, 300);
  }, [search, tab]);

  const getCountryColor = (iso3: string) => {
    if (tab === "macro" && selectedMacro) {
      if (!macroData[iso3]) return dark ? "rgba(255,255,255,0.04)" : "rgba(11,26,51,0.06)";
      const values = Object.values(macroData).filter(v => v !== null);
      const min = Math.min(...values), max = Math.max(...values);
      const t = (macroData[iso3] - min) / (max - min);
      const isHighBad = macro?.id !== "NY.GDP.MKTP.KD.ZG" && macro?.id !== "NY.GDP.PCAP.CD";
      const intensity = isHighBad ? t : 1 - t;
      if (intensity < 0.33) return `rgba(34,197,94,${0.5 + intensity * 0.5})`;
      if (intensity < 0.66) return `rgba(234,179,8,${0.5 + intensity * 0.4})`;
      return `rgba(239,68,68,${0.5 + intensity * 0.4})`;
    }
    if (!etf) return COUNTRY_NAMES[iso3] ? (dark ? "rgba(91,141,239,0.35)" : "rgba(91,141,239,0.25)") : (dark ? "rgba(255,255,255,0.04)" : "rgba(11,26,51,0.05)");
    const pct = etf.countries[iso3];
    if (!pct) return dark ? "rgba(255,255,255,0.04)" : "rgba(11,26,51,0.05)";
    const intensity = Math.min(pct / 40, 1);
    return `rgba(91,141,239,${0.2 + intensity * 0.7})`;
  };

  // Update couleurs
  useEffect(() => {
    getCountryColorRef.current = getCountryColor;
    if (!globeInstanceRef.current) return;
    globeInstanceRef.current
      .polygonCapColor((d: any) => {
        const numId = String(d.id).padStart(3,"0");
        const iso3 = NUM_TO_ISO3[numId] || "";
        if (hoveredRef.current === iso3) return "rgba(200,220,255,0.9)";
        return getCountryColorRef.current(iso3);
      });
  }, [selectedEtf, selectedMacro, macroData, tab]);

  // Vue planisphère D3
  useEffect(() => {
    if (viewMode !== "flat" || !svgRef.current || countriesData.length === 0) return;
    const svg = d3.select(svgRef.current);
    const w = svgRef.current.parentElement?.clientWidth || 1200;
    const h = svgRef.current.parentElement?.clientHeight || 700;
    svg.attr("width", w).attr("height", h);
    svg.selectAll("*").remove();

    // Fond océan
    const defs = svg.append("defs");
    const grad = defs.append("radialGradient").attr("id","ocean-flat").attr("cx","50%").attr("cy","50%").attr("r","70%");
    grad.append("stop").attr("offset","0%").attr("stop-color","#0B1C3F");
    grad.append("stop").attr("offset","100%").attr("stop-color","#041124");
    svg.append("rect").attr("width",w).attr("height",h).attr("fill","url(#ocean-flat)");



    const projection = d3.geoNaturalEarth1().scale(w/5.2).translate([w/2, h/2]);
    const path = d3.geoPath().projection(projection);

    // Vagues océan (sous les pays)
    for (let i = 0; i < 5; i++) {
      const waveOpacity = 0.025 + i * 0.01;
      const waveY = h * (0.15 + i * 0.18);
      const waveAmp = 5 + i * 3;
      const wavePeriod = w / (1.5 + i * 0.3);
      const waveSpeed = 10 + i * 4;
      const wavePath = svg.append("path")
        .attr("fill", "none")
        .attr("stroke", `rgba(120,160,255,${waveOpacity})`)
        .attr("stroke-width", 1)
        .attr("opacity", 0);
      let frame = i * 30;
      const animate = () => {
        frame++;
        const pts = [];
        for (let x = -10; x <= w + 10; x += 6) {
          const y = waveY
            + Math.sin((x / wavePeriod + frame / waveSpeed) * Math.PI * 2) * waveAmp
            + Math.sin((x / (wavePeriod * 1.4) - frame / (waveSpeed * 1.5)) * Math.PI * 2) * (waveAmp * 0.3);
          pts.push([x, y]);
        }
        wavePath.attr("d", "M " + pts.map(p => p.join(",")).join(" L "));
        requestAnimationFrame(animate);
      };
      setTimeout(() => { wavePath.attr("opacity", 1); animate(); }, i * 150);
    }

    svg.append("g").selectAll("path").data(countriesData).join("path")
      .attr("d", path as any)
      .attr("fill", (d: any) => {
        const numId = String(d.id).padStart(3,"0");
        const iso3 = NUM_TO_ISO3[numId] || "";
        return getCountryColorRef.current(iso3);
      })
      .attr("stroke", "rgba(255,255,255,0.07)")
      .attr("stroke-width", 0.4)
      .style("cursor", "pointer")
      .on("mouseenter", function(event: any, d: any) {
        const numId = String(d.id).padStart(3,"0");
        const iso3 = NUM_TO_ISO3[numId] || "";
        d3.select(this).attr("fill", "rgba(200,220,255,0.85)");
        setHovTooltip({ x: event.clientX, y: event.clientY, iso3 });
      })
      .on("mousemove", (event: any, d: any) => {
        const numId = String(d.id).padStart(3,"0");
        const iso3 = NUM_TO_ISO3[numId] || "";
        setHovTooltip(t => t ? { ...t, x: event.clientX, y: event.clientY } : null);
      })
      .on("mouseleave", function(event: any, d: any) {
        const numId = String(d.id).padStart(3,"0");
        const iso3 = NUM_TO_ISO3[numId] || "";
        d3.select(this).attr("fill", getCountryColorRef.current(iso3));
        setHovTooltip(null);
      });
  }, [viewMode, countriesData, selectedEtf, selectedMacro, macroData, tab]);

  // Init Globe.gl — une seule fois
  useEffect(() => {
    if (!globeRef.current || countriesData.length === 0 || globeInstanceRef.current) return;

    import("globe.gl").then(({ default: Globe }) => {

      const w = globeRef.current!.clientWidth;
      const h = globeRef.current!.clientHeight;

      const globe = Globe()(globeRef.current!)
        .width(w)
        .height(h)
        .backgroundColor(dark ? "#041124" : "#F3F6FC")
        .globeImageUrl("")
        .polygonsData(countriesData)
        .polygonAltitude((d: any) => {
          const numId = String(d.id).padStart(3,"0");
          const iso3 = NUM_TO_ISO3[numId] || "";
          return hoveredRef.current === iso3 ? 0.02 : 0.005;
        })
        .polygonCapColor((d: any) => {
          const numId = String(d.id).padStart(3,"0");
          const iso3 = NUM_TO_ISO3[numId] || "";
          if (hoveredRef.current === iso3) return "rgba(200,220,255,0.9)";
          return getCountryColor(iso3);
        })
        .polygonSideColor((d: any) => {
          const numId = String(d.id).padStart(3,"0");
          const iso3 = NUM_TO_ISO3[numId] || "";
          if (hoveredRef.current === iso3) return "rgba(200,220,255,0.4)";
          return dark ? "rgba(255,255,255,0.02)" : "rgba(11,26,51,0.03)";
        })
        .polygonStrokeColor((d: any) => {
          const numId = String(d.id).padStart(3,"0");
          const iso3 = NUM_TO_ISO3[numId] || "";
          if (hoveredRef.current === iso3) return "rgba(255,255,255,0.9)";
          return dark ? "rgba(255,255,255,0.08)" : "rgba(11,26,51,0.1)";
        })
        .polygonLabel(() => "")
        .onPolygonHover((d: any, prevD: any, event: any) => {
          const numId = d ? String((d as any).id).padStart(3,"0") : "";
          const iso3 = numId ? (NUM_TO_ISO3[numId] || "") : "";
          hoveredRef.current = iso3;
          globeRef.current!.style.cursor = d ? "pointer" : "default";
          if (!d) { setHovTooltip(null); }
          globe.polygonAltitude((f: any) => {
            const fId = String(f.id).padStart(3,"0");
            const fIso3 = NUM_TO_ISO3[fId] || "";
            return fIso3 === iso3 ? 0.02 : 0.005;
          });
          globe.polygonCapColor((f: any) => {
            const fId = String(f.id).padStart(3,"0");
            const fIso3 = NUM_TO_ISO3[fId] || "";
            if (fIso3 === iso3 && iso3) return "rgba(200,220,255,0.9)";
            return getCountryColorRef.current(fIso3);
          });
          globe.polygonStrokeColor((f: any) => {
            const fId = String(f.id).padStart(3,"0");
            const fIso3 = NUM_TO_ISO3[fId] || "";
            if (fIso3 === iso3 && iso3) return "rgba(255,255,255,0.95)";
            return dark ? "rgba(255,255,255,0.08)" : "rgba(11,26,51,0.1)";
          });
        })
        .atmosphereColor(dark ? "#4a7fd4" : "#6b9fd4")
        .atmosphereAltitude(0.25);

      // Globe surface color
      globe.globeMaterial().color.set(dark ? "#0B1C3F" : "#C8D9F0");
      globe.globeMaterial().shininess = 8;
      // Texture étoiles en fond
      globe.backgroundImageUrl("");

      globe.pointOfView({ lat: 20, lng: 10, altitude: 1.8 });
      // Logger les classes du tooltip après hover
      setTimeout(() => {
        const tooltips = document.querySelectorAll('[style*="position: absolute"]');
        tooltips.forEach(t => console.log(t.className, t.getAttribute('style')?.slice(0,100)));
      }, 3000);
      // Track mouse position pour tooltip custom
      const handleMouseMove = (e: MouseEvent) => {
        if (hoveredRef.current) {
          setHovTooltip({ x: e.clientX, y: e.clientY, iso3: hoveredRef.current });
        }
      };
      globeRef.current!.addEventListener("mousemove", handleMouseMove);
      globeInstanceRef.current = globe;

      // Supprimer le style du container tooltip Globe.gl
      const styleEl = document.createElement("style");
      styleEl.textContent = "canvas + div > div, canvas ~ div > div { background: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; }";
      document.head.appendChild(styleEl);

      // Resize observer avec debounce
      let resizeTimeout: NodeJS.Timeout;
      const resizeObserver = new ResizeObserver(() => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          if (globeRef.current && globeInstanceRef.current) {
            globeInstanceRef.current
              .width(globeRef.current.clientWidth)
              .height(globeRef.current.clientHeight);
          }
        }, 50);
      });
      resizeObserver.observe(globeRef.current!);
      return () => resizeObserver.disconnect();
    });
  }, [countriesData, dark]);

  const macroValues = Object.values(macroData);
  const macroMin = macroValues.length ? Math.min(...macroValues) : 0;
  const macroMax = macroValues.length ? Math.max(...macroValues) : 100;
  const filteredEtfs = ETF_LIST.filter(e => e.id.toLowerCase().includes(search.toLowerCase()) || e.desc.toLowerCase().includes(search.toLowerCase()));
  const filteredMacro = MACRO_INDICATORS.filter(m => m.label.toLowerCase().includes(search.toLowerCase()));
  const text = dark ? "#F8F9FC" : "#0B1A33";

  return (
    <div style={{ display: "flex", height: "100vh", backgroundColor: dark ? "#041124" : "#F3F6FC", overflow: "hidden" }}>
      <Header dark={true} setDark={() => {}} hideToggle/>

      {/* Sidebar */}
      <div style={{
        width: "220px", flexShrink: 0, height: "100vh", overflowY: "auto",
        borderRight: dark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(11,26,51,0.08)",
        background: "rgba(2,10,24,0.99)",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <a href="/" style={{ color: "#F8F9FC", opacity: 0.35, fontSize: "10px", textDecoration: "none", display: "block", marginBottom: "10px" }}>← Accueil</a>
          <h1 style={{ color: "#F8F9FC", fontSize: "11px", fontWeight: 700, letterSpacing: "0.2em", margin: "0 0 12px" }}>WORLD MAP</h1>

          <div style={{ position: "relative" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: "8px",
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "8px", padding: "0 10px", height: "32px",
            }}>
              <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="#F8F9FC" strokeWidth={2} style={{ opacity: 0.35, flexShrink: 0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
              </svg>
              <input value={search} onChange={e => { setSearch(e.target.value); setShowSearchResults(false); }}
                placeholder={tab === "etf" ? "ETF, action, crypto..." : "Indicateur..."}
                style={{ background: "transparent", border: "none", outline: "none", color: "#F8F9FC", fontSize: "11px", width: "100%", opacity: search ? 1 : 0.4 }}
              />
            </div>
            {showSearchResults && searchResults.length > 0 && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50, background: "rgba(4,17,36,0.98)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
                {searchResults.map(r => (
                  <button key={r.ticker} onClick={() => { setSearch(r.ticker); setShowSearchResults(false); }}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "8px 10px", background: "transparent", border: "none", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <div>
                      <span style={{ color: "#F8F9FC", fontSize: "11px", fontWeight: 600 }}>{r.ticker}</span>
                      <span style={{ color: "#F8F9FC", fontSize: "10px", opacity: 0.4, marginLeft: "6px" }}>{r.name}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: "4px", marginTop: "10px" }}>
            {(["etf", "macro"] as const).map(t => (
              <button key={t} onClick={() => { setTab(t); setSearch(""); setSelectedEtf(null); setSelectedMacro(null); }} style={{
                flex: 1, padding: "6px 0", borderRadius: "7px", border: "none",
                background: tab === t ? "rgba(91,141,239,0.18)" : "transparent",
                color: "#F8F9FC", fontSize: "11px", fontWeight: tab === t ? 600 : 400,
                opacity: tab === t ? 1 : 0.45, cursor: "pointer",
              }}>
                {t === "etf" ? "ETF" : "Macro"}
              </button>
            ))}
          </div>

          {/* Toggle vue */}
          <div style={{ display: "flex", gap: "4px", marginTop: "8px" }}>
            {(["globe", "flat"] as const).map(v => (
              <button key={v} onClick={() => setViewMode(v)} style={{
                flex: 1, padding: "5px 0", borderRadius: "6px", border: "none",
                background: viewMode === v ? "rgba(255,255,255,0.1)" : "transparent",
                color: "#F8F9FC", fontSize: "10px", opacity: viewMode === v ? 1 : 0.4,
                cursor: "pointer",
              }}>
                {v === "globe" ? "🌐 Globe" : "🗺 Carte"}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
          {tab === "etf" ? (
            <>
              <button onClick={() => setSelectedEtf(null)} style={{ padding: "8px 12px", borderRadius: "7px", border: "none", textAlign: "left", background: !selectedEtf ? "rgba(91,141,239,0.15)" : "transparent", borderLeft: !selectedEtf ? "2px solid rgba(91,141,239,0.6)" : "2px solid transparent", cursor: "pointer", width: "100%", marginBottom: "2px" }}>
                <span style={{ color: "#F8F9FC", fontSize: "11px", opacity: !selectedEtf ? 1 : 0.5, fontWeight: !selectedEtf ? 600 : 400 }}>🌍 Vue globale</span>
              </button>
              {filteredEtfs.map(e => (
                <button key={e.id} onClick={() => setSelectedEtf(e.id)} style={{ padding: "8px 12px", borderRadius: "7px", border: "none", textAlign: "left", background: selectedEtf === e.id ? "rgba(91,141,239,0.15)" : "transparent", borderLeft: selectedEtf === e.id ? "2px solid rgba(91,141,239,0.6)" : "2px solid transparent", cursor: "pointer", width: "100%", marginBottom: "2px" }}>
                  <div style={{ color: "#F8F9FC", fontSize: "12px", fontWeight: 600, opacity: selectedEtf === e.id ? 1 : 0.65 }}>{e.id}</div>
                  <div style={{ color: "#F8F9FC", fontSize: "10px", opacity: 0.35, marginTop: "1px" }}>{e.desc}</div>
                </button>
              ))}
            </>
          ) : (
            filteredMacro.map(m => (
              <button key={m.id} onClick={() => setSelectedMacro(m.id)} style={{ padding: "8px 12px", borderRadius: "7px", border: "none", textAlign: "left", background: selectedMacro === m.id ? "rgba(91,141,239,0.15)" : "transparent", borderLeft: selectedMacro === m.id ? "2px solid rgba(91,141,239,0.6)" : "2px solid transparent", cursor: "pointer", width: "100%", marginBottom: "2px" }}>
                <div style={{ color: "#F8F9FC", fontSize: "12px", fontWeight: 600, opacity: selectedMacro === m.id ? 1 : 0.65 }}>{m.label}</div>
                <div style={{ color: "#F8F9FC", fontSize: "10px", opacity: 0.35, marginTop: "1px" }}>{m.desc}</div>
              </button>
            ))
          )}
        </div>

        <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {tab === "etf" && etf && (
            <>
              <p style={{ color: "#F8F9FC", fontSize: "10px", opacity: 0.35, letterSpacing: "0.08em", margin: "0 0 8px" }}>PONDÉRATION</p>
              {Object.entries(etf.countries).sort((a,b) => b[1]-a[1]).slice(0,6).map(([iso3, pct]) => (
                <div key={iso3} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "5px" }}>
                  <span style={{ color: "#F8F9FC", fontSize: "11px", opacity: 0.6 }}>{COUNTRY_FLAGS[iso3] || "🌐"} {COUNTRY_NAMES[iso3] || iso3}</span>
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
              <p style={{ color: "#F8F9FC", fontSize: "10px", opacity: 0.35, letterSpacing: "0.08em", margin: "0 0 8px" }}>{macro?.label} · {macro?.unit}</p>
              <div style={{ height: "6px", borderRadius: "3px", background: "linear-gradient(to right, #22c55e, #eab308, #ef4444)", marginBottom: "4px" }}/>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#F8F9FC", fontSize: "10px", opacity: 0.4 }}>{macroMin.toFixed(1)}</span>
                <span style={{ color: "#F8F9FC", fontSize: "10px", opacity: 0.4 }}>{macroMax.toFixed(1)}</span>
              </div>
            </>
          )}
          {tab === "macro" && macroLoading && <p style={{ color: "#F8F9FC", fontSize: "10px", opacity: 0.35, textAlign: "center" }}>Chargement...</p>}
        </div>
      </div>

      {/* Vue */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <div ref={globeRef} style={{ width: "100%", height: "100%", display: viewMode === "globe" ? "block" : "none" }}/>
        {viewMode === "flat" && <svg ref={svgRef} style={{ display: "block", width: "100%", height: "100%" }}/>}
        {hovTooltip && COUNTRY_NAMES[hovTooltip.iso3] && (
          <div style={{
            position: "fixed", left: hovTooltip.x + 14, top: hovTooltip.y - 14,
            background: "rgba(2,10,24,0.97)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "12px", padding: "12px 16px",
            pointerEvents: "none", zIndex: 100,
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            fontFamily: "-apple-system, sans-serif",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "2px" }}>
              <span style={{ fontSize: "22px", lineHeight: 1 }}>{COUNTRY_FLAGS[hovTooltip.iso3] || "🌐"}</span>
              <span style={{ color: "#F8F9FC", fontSize: "13px", fontWeight: 600 }}>{COUNTRY_NAMES[hovTooltip.iso3]}</span>
            </div>
            {tab === "etf" && etf?.countries[hovTooltip.iso3] && (
              <div style={{ color: "#9BB9FF", fontSize: "12px", fontWeight: 600, marginTop: "6px" }}>
                {etf.countries[hovTooltip.iso3]}% dans {etf.id}
              </div>
            )}
            {tab === "macro" && macroData[hovTooltip.iso3] !== undefined && (
              <div style={{ color: "#9BB9FF", fontSize: "12px", fontWeight: 600, marginTop: "6px" }}>
                {macro?.label}: {macroData[hovTooltip.iso3].toFixed(1)} {macro?.unit}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
