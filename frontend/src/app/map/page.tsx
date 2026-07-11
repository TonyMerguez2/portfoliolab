"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { feature } from "topojson-client";
import Header from "@/components/Header";
import { useApp } from "@/lib/AppContext";



const ETF_COUNTRY_WEIGHTS: Record<string, Record<string, number>> = {
  "SPY":  {"USA":100},
  "QQQ":  {"USA":100},
  "IWM":  {"USA":100},
  "VTI":  {"USA":100},
  "ARKK": {"USA":100},
  "GLD":  {},
  "SLV":  {},
  "IBIT": {},
  "FBTC": {},
  "TLT":  {"USA":100},
  "AGG":  {"USA":100},
  "HYG":  {"USA":100},
  "VNQ":  {"USA":100},
  "XLF":  {"USA":100},
  "XLK":  {"USA":100},
  "XLE":  {"USA":100},
  "XLV":  {"USA":100},
  "XLI":  {"USA":100},
  "EWJ":  {"JPN":100},
  "FXI":  {"CHN":100},
  "EWG":  {"DEU":100},
  "EWU":  {"GBR":100},
  "VEA":  {"JPN":22,"GBR":14,"FRA":10,"CAN":9,"CHE":8,"DEU":8,"AUS":7,"NLD":4,"SWE":3,"DNK":2,"ESP":2,"ITA":2,"FIN":1,"BEL":1,"NOR":1,"HKG":1,"SGP":1},
  "EEM":  {"CHN":32,"TWN":16,"IND":15,"KOR":12,"BRA":6,"ZAF":4,"MEX":3,"IDN":2,"THA":2,"MYS":2,"PHL":1,"POL":1},
  "ACWI": {"USA":62,"JPN":6,"GBR":4,"FRA":3,"CHE":3,"DEU":3,"CAN":3,"AUS":2,"TWN":2,"IND":2,"KOR":1,"NLD":1,"SWE":1,"HKG":1},
  "CW8.PA":{"USA":70,"JPN":6,"GBR":4,"FRA":3,"CHE":3,"DEU":3,"CAN":3,"AUS":2,"NLD":1,"SWE":1,"DNK":1,"HKG":1,"SGP":1,"ITA":1},
  "EWLD.PA":{"USA":70,"JPN":6,"GBR":4,"FRA":3,"CHE":3,"DEU":3,"CAN":3,"AUS":2,"NLD":1,"SWE":1,"DNK":1,"HKG":1,"SGP":1,"ITA":1},
  "ESE.PA":{"USA":100},
  "PANX.PA":{"USA":100},
  "^STOXX50E":{"FRA":35,"DEU":28,"NLD":12,"ESP":8,"ITA":7,"BEL":4,"FIN":3,"IRL":2,"LUX":1},
};

const TICKER_TO_COUNTRIES: Record<string, string[]> = {
  // US
  "AAPL":["USA"],"MSFT":["USA"],"NVDA":["USA"],"TSLA":["USA"],"AMZN":["USA"],
  "META":["USA"],"GOOGL":["USA"],"GOOG":["USA"],"JPM":["USA"],"V":["USA"],
  "MA":["USA"],"JNJ":["USA"],"WMT":["USA"],"BAC":["USA"],"XOM":["USA"],
  "UNH":["USA"],"PG":["USA"],"HD":["USA"],"ABBV":["USA"],"MRK":["USA"],
  "AVGO":["USA"],"COST":["USA"],"KO":["USA"],"LLY":["USA"],"MCD":["USA"],
  "INTC":["USA"],"AMD":["USA"],"CRM":["USA"],"ADBE":["USA"],"NFLX":["USA"],
  "PYPL":["USA"],"QCOM":["USA"],"TXN":["USA"],"HON":["USA"],"GS":["USA"],
  "MS":["USA"],"BLK":["USA"],"BA":["USA"],"CAT":["USA"],"DIS":["USA"],
  "COIN":["USA"],"PLTR":["USA"],"UBER":["USA"],"ABNB":["USA"],"SNOW":["USA"],
  "NOW":["USA"],"ARM":["USA"],"SMCI":["USA"],"F":["USA"],"GM":["USA"],
  // France
  "MC.PA":["FRA"],"TTE.PA":["FRA"],"OR.PA":["FRA"],"SAN.PA":["FRA"],
  "AIR.PA":["FRA"],"BNP.PA":["FRA"],"SU.PA":["FRA"],"AI.PA":["FRA"],
  "RI.PA":["FRA"],"KER.PA":["FRA"],"HO.PA":["FRA"],"DG.PA":["FRA"],
  "CS.PA":["FRA"],"ACA.PA":["FRA"],"GLE.PA":["FRA"],
  // Germany
  "SAP":["DEU"],"SIE.DE":["DEU"],"ALV.DE":["DEU"],"BMW.DE":["DEU"],
  "VOW3.DE":["DEU"],"BAYN.DE":["DEU"],"BAS.DE":["DEU"],"DTE.DE":["DEU"],"ADS.DE":["DEU"],
  // Netherlands
  "ASML":["NLD"],
  // UK
  "HSBA.L":["GBR"],"BP.L":["GBR"],"GSK.L":["GBR"],"ULVR.L":["GBR"],
  "SHEL.L":["GBR"],"RIO.L":["GBR"],
  // Switzerland
  "NOVN.SW":["CHE"],"NESN.SW":["CHE"],"RO.SW":["CHE"],
  // Stellantis — multinationale
  "STLA":["FRA","ITA","USA"],
  // Asia
  "TSM":["TWN"],"BABA":["CHN"],"BIDU":["CHN"],"JD":["CHN"],"PDD":["CHN"],"TCEHY":["CHN"],
  "7203.T":["JPN"],"6758.T":["JPN"],"9984.T":["JPN"],"005930.KS":["KOR"],
  // ETF monde
  "SPY":["USA"],"QQQ":["USA"],"IWM":["USA"],"ARKK":["USA"],
  "VTI":["USA"],"XLF":["USA"],"XLK":["USA"],"XLE":["USA"],
  // ETF monde entier
  "VEA":["USA","JPN","GBR","FRA","DEU","CHE","AUS","CAN","NLD","SWE","DNK","NOR","FIN","BEL","ESP","ITA","HKG","SGP","KOR","TWN"],
  "EEM":["CHN","KOR","TWN","IND","BRA","ZAF","MEX","IDN","THA","MYS","PHL","POL","HUN","CZE","TUR"],
  "ACWI":["USA","JPN","GBR","FRA","DEU","CHE","AUS","CAN","NLD","SWE","DNK","NOR","FIN","BEL","ESP","ITA","HKG","SGP","KOR","TWN"],
  "CW8.PA":["USA","JPN","GBR","FRA","DEU","CHE","AUS","CAN","NLD","SWE","DNK","NOR","FIN","BEL","ESP","ITA","HKG","SGP","KOR","TWN"],
  "EWLD.PA":["USA","JPN","GBR","FRA","DEU","CHE","AUS","CAN","NLD","SWE","DNK","NOR","FIN","BEL","ESP","ITA","HKG","SGP","KOR","TWN"],
  "EWJ":["JPN"],"FXI":["CHN"],"EWG":["DEU"],"EWU":["GBR"],
  // Crypto — mondial
  "BTC-USD":[],"ETH-USD":[],"SOL-USD":[],"BNB-USD":[],"XRP-USD":[],
  "DOGE-USD":[],"ADA-USD":[],"AVAX-USD":[],
  // Indices
  "^GSPC":["USA"],"^NDX":["USA"],"^DJI":["USA"],"^RUT":["USA"],
  "^FCHI":["FRA"],"^GDAXI":["DEU"],"^FTSE":["GBR"],"^N225":["JPN"],
  "^HSI":["HKG"],"^STOXX50E":["FRA","DEU","NLD","ESP","ITA","BEL","FIN"],
  "^IBEX":["ESP"],"^AEX":["NLD"],"^SSMI":["CHE"],
};

const ISO_ALPHA2_TO_ISO3: Record<string,string> = {
  "USA":"USA","FRA":"FRA","DEU":"DEU","GBR":"GBR","CHN":"CHN","JPN":"JPN",
  "KOR":"KOR","TWN":"TWN","NLD":"NLD","CHE":"CHE","AUS":"AUS","CAN":"CAN",
  "IND":"IND","BRA":"BRA","ZAF":"ZAF","HKG":"HKG","ITA":"ITA","ESP":"ESP",
  "BEL":"BEL","FIN":"FIN","SWE":"SWE","NOR":"NOR","DNK":"DNK",
};

const COUNTRY_FLAGS: Record<string, string> = {
  "AFG":"🇦🇫","ALB":"🇦🇱","DZA":"🇩🇿","AGO":"🇦🇴","ARG":"🇦🇷","AUS":"🇦🇺","AUT":"🇦🇹","BHS":"🇧🇸","BGD":"🇧🇩","BEL":"🇧🇪","BTN":"🇧🇹","BOL":"🇧🇴","BIH":"🇧🇦","BWA":"🇧🇼","BRA":"🇧🇷","BLZ":"🇧🇿","SLB":"🇸🇧","BRN":"🇧🇳","BGR":"🇧🇬","MMR":"🇲🇲","BDI":"🇧🇮","BLR":"🇧🇾","KHM":"🇰🇭","CMR":"🇨🇲","CAN":"🇨🇦","CAF":"🇨🇫","LKA":"🇱🇰","TCD":"🇹🇩","CHL":"🇨🇱","CHN":"🇨🇳","TWN":"🇹🇼","COL":"🇨🇴","COM":"🇰🇲","COG":"🇨🇬","COD":"🇨🇩","CRI":"🇨🇷","HRV":"🇭🇷","CUB":"🇨🇺","CYP":"🇨🇾","CZE":"🇨🇿","BEN":"🇧🇯","DNK":"🇩🇰","DOM":"🇩🇴","ECU":"🇪🇨","SLV":"🇸🇻","GNQ":"🇬🇶","ETH":"🇪🇹","ERI":"🇪🇷","EST":"🇪🇪","FJI":"🇫🇯","FIN":"🇫🇮","FRA":"🇫🇷","DJI":"🇩🇯","GAB":"🇬🇦","GEO":"🇬🇪","GMB":"🇬🇲","PSE":"🇵🇸","DEU":"🇩🇪","GHA":"🇬🇭","GRC":"🇬🇷","GRL":"🇬🇱","GTM":"🇬🇹","GIN":"🇬🇳","GUY":"🇬🇾","HTI":"🇭🇹","HND":"🇭🇳","HUN":"🇭🇺","ISL":"🇮🇸","IND":"🇮🇳","IDN":"🇮🇩","IRN":"🇮🇷","IRQ":"🇮🇶","IRL":"🇮🇪","ISR":"🇮🇱","ITA":"🇮🇹","CIV":"🇨🇮","JAM":"🇯🇲","JPN":"🇯🇵","KAZ":"🇰🇿","JOR":"🇯🇴","KEN":"🇰🇪","PRK":"🇰🇵","KOR":"🇰🇷","KWT":"🇰🇼","KGZ":"🇰🇬","LAO":"🇱🇦","LBN":"🇱🇧","LSO":"🇱🇸","LVA":"🇱🇻","LBR":"🇱🇷","LBY":"🇱🇾","LTU":"🇱🇹","LUX":"🇱🇺","MDG":"🇲🇬","MWI":"🇲🇼","MYS":"🇲🇾","MDV":"🇲🇻","MLI":"🇲🇱","MRT":"🇲🇷","MUS":"🇲🇺","MEX":"🇲🇽","MNG":"🇲🇳","MDA":"🇲🇩","MNE":"🇲🇪","MAR":"🇲🇦","MOZ":"🇲🇿","OMN":"🇴🇲","NAM":"🇳🇦","NPL":"🇳🇵","NLD":"🇳🇱","NCL":"🇳🇨","VUT":"🇻🇺","NZL":"🇳🇿","NIC":"🇳🇮","NER":"🇳🇪","NGA":"🇳🇬","NOR":"🇳🇴","PAK":"🇵🇰","PAN":"🇵🇦","PNG":"🇵🇬","PRY":"🇵🇾","PER":"🇵🇪","PHL":"🇵🇭","POL":"🇵🇱","PRT":"🇵🇹","GNB":"🇬🇼","TLS":"🇹🇱","PRI":"🇵🇷","QAT":"🇶🇦","ROU":"🇷🇴","RUS":"🇷🇺","RWA":"🇷🇼","SAU":"🇸🇦","SEN":"🇸🇳","SRB":"🇷🇸","SLE":"🇸🇱","SGP":"🇸🇬","SVK":"🇸🇰","VNM":"🇻🇳","SVN":"🇸🇮","SOM":"🇸🇴","ZAF":"🇿🇦","ZWE":"🇿🇼","ESP":"🇪🇸","SDN":"🇸🇩","SSD":"🇸🇸","ESH":"🇪🇭","SUR":"🇸🇷","SWZ":"🇸🇿","SWE":"🇸🇪","CHE":"🇨🇭","SYR":"🇸🇾","TJK":"🇹🇯","THA":"🇹🇭","TGO":"🇹🇬","TTO":"🇹🇹","ARE":"🇦🇪","TUN":"🇹🇳","TUR":"🇹🇷","TKM":"🇹🇲","UGA":"🇺🇬","UKR":"🇺🇦","MKD":"🇲🇰","EGY":"🇪🇬","GBR":"🇬🇧","TZA":"🇹🇿","USA":"🇺🇸","BFA":"🇧🇫","URY":"🇺🇾","UZB":"🇺🇿","VEN":"🇻🇪","YEM":"🇾🇪","ZMB":"🇿🇲","AZE":"🇦🇿","ARM":"🇦🇲","FLK":"🇫🇰",
};

const COUNTRY_NAMES: Record<string, string> = {
  "AFG":"Afghanistan","ALB":"Albanie","DZA":"Algérie","AGO":"Angola","ARG":"Argentine","AUS":"Australie","AUT":"Autriche","BHS":"Bahamas","BGD":"Bangladesh","BEL":"Belgique","BTN":"Bhoutan","BOL":"Bolivie","BIH":"Bosnie","BWA":"Botswana","BRA":"Brésil","BLZ":"Belize","SLB":"Îles Salomon","BRN":"Brunei","BGR":"Bulgarie","MMR":"Myanmar","BDI":"Burundi","BLR":"Biélorussie","KHM":"Cambodge","CMR":"Cameroun","CAN":"Canada","CAF":"Rép. Centrafricaine","LKA":"Sri Lanka","TCD":"Tchad","CHL":"Chili","CHN":"Chine","TWN":"Taïwan","COL":"Colombie","COM":"Comores","COG":"Congo","COD":"R.D. Congo","CRI":"Costa Rica","HRV":"Croatie","CUB":"Cuba","CYP":"Chypre","CZE":"Tchéquie","BEN":"Bénin","DNK":"Danemark","DOM":"Rép. Dominicaine","ECU":"Équateur","SLV":"El Salvador","GNQ":"Guinée équatoriale","ETH":"Éthiopie","ERI":"Érythrée","EST":"Estonie","FJI":"Fidji","FIN":"Finlande","FRA":"France","DJI":"Djibouti","GAB":"Gabon","GEO":"Géorgie","GMB":"Gambie","PSE":"Palestine","DEU":"Allemagne","GHA":"Ghana","GRC":"Grèce","GRL":"Groenland","GTM":"Guatemala","GIN":"Guinée","GUY":"Guyana","HTI":"Haïti","HND":"Honduras","HUN":"Hongrie","ISL":"Islande","IND":"Inde","IDN":"Indonésie","IRN":"Iran","IRQ":"Irak","IRL":"Irlande","ISR":"Israël","ITA":"Italie","CIV":"Côte d'Ivoire","JAM":"Jamaïque","JPN":"Japon","KAZ":"Kazakhstan","JOR":"Jordanie","KEN":"Kenya","PRK":"Corée du Nord","KOR":"Corée du Sud","KWT":"Koweït","KGZ":"Kirghizstan","LAO":"Laos","LBN":"Liban","LSO":"Lesotho","LVA":"Lettonie","LBR":"Liberia","LBY":"Libye","LTU":"Lituanie","LUX":"Luxembourg","MDG":"Madagascar","MWI":"Malawi","MYS":"Malaisie","MDV":"Maldives","MLI":"Mali","MRT":"Mauritanie","MUS":"Maurice","MEX":"Mexique","MNG":"Mongolie","MDA":"Moldova","MNE":"Monténégro","MAR":"Maroc","MOZ":"Mozambique","OMN":"Oman","NAM":"Namibie","NPL":"Népal","NLD":"Pays-Bas","NCL":"Nouvelle-Calédonie","VUT":"Vanuatu","NZL":"Nouvelle-Zélande","NIC":"Nicaragua","NER":"Niger","NGA":"Nigeria","NOR":"Norvège","PAK":"Pakistan","PAN":"Panama","PNG":"Papouasie","PRY":"Paraguay","PER":"Pérou","PHL":"Philippines","POL":"Pologne","PRT":"Portugal","GNB":"Guinée-Bissau","TLS":"Timor oriental","PRI":"Porto Rico","QAT":"Qatar","ROU":"Roumanie","RUS":"Russie","RWA":"Rwanda","SAU":"Arabie Saoudite","SEN":"Sénégal","SRB":"Serbie","SLE":"Sierra Leone","SGP":"Singapour","SVK":"Slovaquie","VNM":"Vietnam","SVN":"Slovénie","SOM":"Somalie","ZAF":"Afrique du Sud","ZWE":"Zimbabwe","ESP":"Espagne","SDN":"Soudan","SSD":"Soudan du Sud","ESH":"Sahara occidental","SUR":"Suriname","SWZ":"Eswatini","SWE":"Suède","CHE":"Suisse","SYR":"Syrie","TJK":"Tadjikistan","THA":"Thaïlande","TGO":"Togo","TTO":"Trinité-et-Tobago","ARE":"Émirats Arabes","TUN":"Tunisie","TUR":"Turquie","TKM":"Turkménistan","UGA":"Ouganda","UKR":"Ukraine","MKD":"Macédoine du Nord","EGY":"Égypte","GBR":"Royaume-Uni","TZA":"Tanzanie","USA":"États-Unis","BFA":"Burkina Faso","URY":"Uruguay","UZB":"Ouzbékistan","VEN":"Venezuela","YEM":"Yémen","ZMB":"Zambie","AZE":"Azerbaïdjan","ARM":"Arménie","FLK":"Îles Falkland",
};

const NUM_TO_ISO3: Record<string, string> = {
  "004":"AFG","008":"ALB","012":"DZA","024":"AGO","032":"ARG","036":"AUS","040":"AUT","044":"BHS","050":"BGD","056":"BEL","064":"BTN","068":"BOL","070":"BIH","072":"BWA","076":"BRA","084":"BLZ","090":"SLB","096":"BRN","100":"BGR","104":"MMR","108":"BDI","112":"BLR","116":"KHM","120":"CMR","124":"CAN","140":"CAF","144":"LKA","148":"TCD","152":"CHL","156":"CHN","158":"TWN","170":"COL","174":"COM","178":"COG","180":"COD","188":"CRI","191":"HRV","192":"CUB","196":"CYP","203":"CZE","204":"BEN","208":"DNK","214":"DOM","218":"ECU","222":"SLV","226":"GNQ","231":"ETH","232":"ERI","233":"EST","242":"FJI","246":"FIN","250":"FRA","262":"DJI","266":"GAB","268":"GEO","270":"GMB","275":"PSE","276":"DEU","288":"GHA","300":"GRC","304":"GRL","320":"GTM","324":"GIN","328":"GUY","332":"HTI","340":"HND","348":"HUN","352":"ISL","356":"IND","360":"IDN","364":"IRN","368":"IRQ","372":"IRL","376":"ISR","380":"ITA","384":"CIV","388":"JAM","392":"JPN","398":"KAZ","400":"JOR","404":"KEN","408":"PRK","410":"KOR","414":"KWT","417":"KGZ","418":"LAO","422":"LBN","426":"LSO","428":"LVA","430":"LBR","434":"LBY","440":"LTU","442":"LUX","450":"MDG","454":"MWI","458":"MYS","462":"MDV","466":"MLI","478":"MRT","480":"MUS","484":"MEX","496":"MNG","498":"MDA","499":"MNE","504":"MAR","508":"MOZ","512":"OMN","516":"NAM","524":"NPL","528":"NLD","540":"NCL","548":"VUT","554":"NZL","558":"NIC","562":"NER","566":"NGA","578":"NOR","586":"PAK","591":"PAN","598":"PNG","600":"PRY","604":"PER","608":"PHL","616":"POL","620":"PRT","624":"GNB","626":"TLS","630":"PRI","634":"QAT","642":"ROU","643":"RUS","646":"RWA","682":"SAU","686":"SEN","688":"SRB","694":"SLE","702":"SGP","703":"SVK","704":"VNM","705":"SVN","706":"SOM","710":"ZAF","716":"ZWE","724":"ESP","728":"SSD","729":"SDN","732":"ESH","740":"SUR","748":"SWZ","752":"SWE","756":"CHE","760":"SYR","762":"TJK","764":"THA","768":"TGO","780":"TTO","784":"ARE","788":"TUN","792":"TUR","795":"TKM","800":"UGA","804":"UKR","807":"MKD","818":"EGY","826":"GBR","834":"TZA","840":"USA","854":"BFA","858":"URY","860":"UZB","862":"VEN","887":"YEM","894":"ZMB","031":"AZE","051":"ARM","238":"FLK",
};

const MACRO_INDICATORS = [
  { id: "FP.CPI.TOTL.ZG", label: "Inflation", unit: "%", desc: "Variation des prix à la consommation" },
  { id: "SL.UEM.TOTL.ZS", label: "Chômage", unit: "%", desc: "Taux de chômage" },
  { id: "NY.GDP.MKTP.KD.ZG", label: "Croissance PIB", unit: "%", desc: "Croissance du PIB réel" },
  { id: "GC.DOD.TOTL.GD.ZS", label: "Dette publique", unit: "% PIB", desc: "Dette publique en % du PIB" },
  { id: "NY.GDP.PCAP.CD", label: "PIB/habitant", unit: "$", desc: "PIB par habitant en USD" },
];

function computePortfolioGeo(portfolio: { assets: { ticker: string; weight: number }[] }): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of portfolio.assets) {
    const w = a.weight / 100;
    const etfW = ETF_COUNTRY_WEIGHTS[a.ticker];
    if (etfW && Object.keys(etfW).length > 0) {
      for (const [c, pct] of Object.entries(etfW)) out[c] = (out[c] || 0) + w * pct / 100;
    } else {
      const cs = TICKER_TO_COUNTRIES[a.ticker] || [];
      if (cs.length > 0) cs.forEach(c => { out[c] = (out[c] || 0) + w / cs.length; });
    }
  }
  return out;
}

export default function MapPage() {
  const svgRef = useRef<SVGSVGElement>(null);
  const oceanRef = useRef<HTMLCanvasElement>(null);
  const [countriesData, setCountriesData] = useState<any[]>([]);
  const [hovTooltip, setHovTooltip] = useState<{x:number,y:number,iso3:string}|null>(null);
  const [selectedMacro, setSelectedMacro] = useState<string | null>(null);
  const [macroData, setMacroData] = useState<Record<string, number>>({});
  const [macroLoading, setMacroLoading] = useState(false);
  const [showMacroPanel, setShowMacroPanel] = useState(false);
  const [showGeoPanel, setShowGeoPanel] = useState(false);
  const dark = true;

  useEffect(() => {
    const canvas = oceanRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    let t = 0;
    let raf: number;
    const draw = () => {
      t += 0.003;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Fond de base
      const bg = ctx.createRadialGradient(canvas.width*0.4, canvas.height*0.45, 0, canvas.width*0.5, canvas.height*0.5, canvas.width*0.8);
      bg.addColorStop(0, "#0D2147");
      bg.addColorStop(0.5, "#071530");
      bg.addColorStop(1, "#020A18");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Ondulations lumineuses
      for (let i = 0; i < 5; i++) {
        const x = canvas.width * (0.2 + i * 0.15 + Math.sin(t + i) * 0.05);
        const y = canvas.height * (0.3 + Math.cos(t * 0.7 + i * 1.2) * 0.15);
        const r = canvas.width * (0.15 + Math.sin(t * 0.5 + i) * 0.03);
        const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
        glow.addColorStop(0, `rgba(30,80,180,${0.06 + Math.sin(t + i) * 0.02})`);
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  const { mode, activePortfolio, activeAsset, setActiveAsset } = useApp();
  const portfolioGeo = useMemo(() => activePortfolio ? computePortfolioGeo(activePortfolio) : {}, [activePortfolio]);
  const macro = MACRO_INDICATORS.find(m => m.id === selectedMacro);

  // Fetch countries
  useEffect(() => {
    fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
      .then(r => r.json())
      .then((world: any) => {
        const countries = feature(world, world.objects.countries) as any;
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
        if (data[1]) data[1].forEach((e: any) => { if (e.value !== null && e.countryiso3code) result[e.countryiso3code] = e.value; });
        setMacroData(result);
        setMacroLoading(false);
      }).catch(() => setMacroLoading(false));
  }, [selectedMacro]);

  const getCountryColor = (iso3: string) => {
    // Mode actif sélectionné
    if (mode === "asset" && activeAsset) {
      const weights = ETF_COUNTRY_WEIGHTS[activeAsset.ticker];
      if (weights) {
        const pct = weights[iso3] || 0;
        if (pct > 0) {
          const maxPct = Math.max(...Object.values(weights));
          const ratio = pct / maxPct;
          // Échelle : bleu sombre → bleu vif → cyan/blanc
          if (ratio > 0.7) return `rgba(147,197,253,${0.5 + ratio * 0.5})`;
          if (ratio > 0.3) return `rgba(91,141,239,${0.3 + ratio * 0.6})`;
          return `rgba(59,90,180,${0.15 + ratio * 0.4})`;
        }
        return "rgba(255,255,255,0.02)";
      }
      const countries = TICKER_TO_COUNTRIES[activeAsset.ticker] || [];
      if (countries.length === 0) return "rgba(255,255,255,0.06)";
      if (countries.includes(iso3)) return "rgba(91,141,239,0.7)";
    }
    // Mode macro
    if (selectedMacro && macroData[iso3] !== undefined) {
      const values = Object.values(macroData);
      const min = Math.min(...values), max = Math.max(...values);
      const t = (macroData[iso3] - min) / (max - min);
      const isHighGood = macro?.id === "NY.GDP.MKTP.KD.ZG" || macro?.id === "NY.GDP.PCAP.CD";
      const intensity = isHighGood ? t : 1 - t;
      if (intensity < 0.33) return `rgba(34,197,94,${0.5 + intensity * 0.5})`;
      if (intensity < 0.66) return `rgba(234,179,8,${0.5 + intensity * 0.4})`;
      return `rgba(239,68,68,${0.5 + intensity * 0.4})`;
    }
    if (selectedMacro) return "rgba(255,255,255,0.04)";

    // Mode portefeuille
    if (mode === "portfolio" && activePortfolio) {
      const pct = portfolioGeo[iso3] || 0;
      if (pct > 0) {
        const maxPct = Math.max(...Object.values(portfolioGeo));
        const ratio = pct / maxPct;
        if (ratio > 0.65) return `rgba(147,197,253,${0.5 + ratio * 0.45})`;
        if (ratio > 0.25) return `rgba(91,141,239,${0.3 + ratio * 0.55})`;
        return `rgba(59,90,180,${0.12 + ratio * 0.5})`;
      }
      return "rgba(255,255,255,0.02)";
    }

    // Mode actif individuel
    if (mode === "asset" && activeAsset) {
      return COUNTRY_NAMES[iso3] ? "rgba(91,141,239,0.28)" : "rgba(255,255,255,0.04)";
    }

    return COUNTRY_NAMES[iso3] ? "rgba(91,141,239,0.28)" : "rgba(255,255,255,0.04)";
  };

  // Rendu D3
  useEffect(() => {
    if (!svgRef.current || countriesData.length === 0) return;
    const svg = d3.select(svgRef.current);
    const w = svgRef.current.parentElement?.clientWidth || 1200;
    const h = svgRef.current.parentElement?.clientHeight || 700;
    svg.attr("width", w).attr("height", h);
    svg.selectAll("*").remove();

    const defs = svg.append("defs");

    // Gradient océan multicouche
    const grad = defs.append("radialGradient").attr("id","ocean-flat").attr("cx","40%").attr("cy","45%").attr("r","75%");
    grad.append("stop").attr("offset","0%").attr("stop-color","#0D2147");
    grad.append("stop").attr("offset","40%").attr("stop-color","#071530");
    grad.append("stop").attr("offset","100%").attr("stop-color","#020A18");

    // Gradient secondaire pour profondeur
    const grad2 = defs.append("linearGradient").attr("id","ocean-depth").attr("x1","0%").attr("y1","0%").attr("x2","100%").attr("y2","100%");
    grad2.append("stop").attr("offset","0%").attr("stop-color","rgba(14,42,100,0.4)");
    grad2.append("stop").attr("offset","50%").attr("stop-color","rgba(4,17,36,0)");
    grad2.append("stop").attr("offset","100%").attr("stop-color","rgba(0,30,80,0.3)");

    // fond géré par canvas

    const projection = d3.geoNaturalEarth1().scale(w/5.2).translate([w/2, h/2]);
    const path = d3.geoPath().projection(projection);



    const g = svg.append("g");

    // Zoom + Pan
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 8])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });
    svg.call(zoom);
    svg.on("dblclick.zoom", null);

    g.selectAll("path").data(countriesData).join("path")
      .attr("d", path as any)
      .attr("fill", (d: any) => { const iso3 = NUM_TO_ISO3[String(d.id).padStart(3,"0")] || ""; return getCountryColor(iso3); })
      .attr("stroke","rgba(255,255,255,0.07)").attr("stroke-width",0.4).style("cursor","pointer")
      .on("mouseenter", function(event: any, d: any) {
        const iso3 = NUM_TO_ISO3[String(d.id).padStart(3,"0")] || "";
        d3.select(this).attr("fill","rgba(200,220,255,0.85)");
        setHovTooltip({ x: event.clientX, y: event.clientY, iso3 });
      })
      .on("mousemove", (event: any) => { setHovTooltip(t => t ? {...t, x: event.clientX, y: event.clientY} : null); })
      .on("mouseleave", function(event: any, d: any) {
        const iso3 = NUM_TO_ISO3[String(d.id).padStart(3,"0")] || "";
        d3.select(this).attr("fill", getCountryColor(iso3));
        setHovTooltip(null);
      });
  }, [countriesData, selectedMacro, macroData, mode, activePortfolio, activeAsset, portfolioGeo]);

  const macroValues = Object.values(macroData);
  const macroMin = macroValues.length ? Math.min(...macroValues) : 0;
  const macroMax = macroValues.length ? Math.max(...macroValues) : 100;

  return (
    <div style={{ position: "relative", height: "100vh", backgroundColor: "var(--novac-bg, #041124)", overflow: "hidden" }}>
      {/* Ocean canvas */}
      <canvas ref={oceanRef} style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none", width: "100%", height: "100%" }}/>

      {/* Carte plein écran */}
      <svg ref={svgRef} style={{ display: "block", width: "100%", height: "100%", background: "transparent", position: "relative", zIndex: 1 }}/>

      {/* Panel macro flottant en bas à gauche */}
      <div style={{ position: "fixed", bottom: "48px", left: "20px", zIndex: 30, display: "flex", gap: "8px" }}>
        {/* Bouton Indicateurs macro */}
        <div style={{ position: "relative" }}>
          <button onClick={() => { setShowMacroPanel(p => !p); setShowGeoPanel(false); }} style={{
            display: "flex", alignItems: "center", gap: "6px",
            background: showMacroPanel ? "rgba(91,141,239,0.2)" : "rgba(4,17,36,0.85)",
            border: showMacroPanel ? "1px solid rgba(91,141,239,0.4)" : "1px solid rgba(255,255,255,0.1)",
            borderRadius: "8px", padding: "7px 12px",
            backdropFilter: "blur(12px)", color: "var(--novac-text-primary, #F8F9FC)", fontSize: "11px", cursor: "pointer",
          }}>
            📊 Indicateurs macro {showMacroPanel ? "▲" : "▼"}
          </button>
          {showMacroPanel && (
            <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, background: "rgba(4,17,36,0.97)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px", padding: "6px", minWidth: "200px", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
              {[
                {id:"FP.CPI.TOTL.ZG",label:"Inflation",unit:"%"},
                {id:"SL.UEM.TOTL.ZS",label:"Chômage",unit:"%"},
                {id:"NY.GDP.MKTP.KD.ZG",label:"Croissance PIB",unit:"%"},
                {id:"GC.DOD.TOTL.GD.ZS",label:"Dette publique",unit:"% PIB"},
                {id:"NY.GDP.PCAP.CD",label:"PIB/habitant",unit:"USD"},
              ].map(m => (
                <button key={m.id} onClick={() => setSelectedMacro(selectedMacro === m.id ? null : m.id)}
                  style={{ display: "block", width: "100%", padding: "7px 10px", borderRadius: "6px", background: selectedMacro === m.id ? "rgba(91,141,239,0.2)" : "transparent", border: "none", color: "var(--novac-text-primary, #F8F9FC)", fontSize: "11px", textAlign: "left", cursor: "pointer", opacity: selectedMacro === m.id ? 1 : 0.6 }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
                  onMouseLeave={e => (e.currentTarget.style.background = selectedMacro === m.id ? "rgba(91,141,239,0.2)" : "transparent")}>
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bouton Exposition géographique — visible si ETF sélectionné */}
        {mode === "asset" && activeAsset && ETF_COUNTRY_WEIGHTS[activeAsset.ticker] && (
          <button onClick={() => { setShowGeoPanel(p => !p); setShowMacroPanel(false); }} style={{
            display: "flex", alignItems: "center", gap: "6px",
            background: showGeoPanel ? "rgba(91,141,239,0.25)" : "rgba(91,141,239,0.15)",
            border: showGeoPanel ? "1px solid rgba(91,141,239,0.5)" : "1px solid rgba(91,141,239,0.3)",
            borderRadius: "8px", padding: "7px 12px",
            backdropFilter: "blur(12px)", color: "#9BB9FF", fontSize: "11px", cursor: "pointer",
          }}>
            🌍 Exposition géo. {showGeoPanel ? "▲" : "▼"}
          </button>
        )}

        {/* Bouton Exposition géo portefeuille */}
        {mode === "portfolio" && activePortfolio && Object.keys(portfolioGeo).length > 0 && (
          <button onClick={() => { setShowGeoPanel(p => !p); setShowMacroPanel(false); }} style={{
            display: "flex", alignItems: "center", gap: "6px",
            background: showGeoPanel ? "rgba(91,141,239,0.25)" : "rgba(91,141,239,0.15)",
            border: showGeoPanel ? "1px solid rgba(91,141,239,0.5)" : "1px solid rgba(91,141,239,0.3)",
            borderRadius: "8px", padding: "7px 12px",
            backdropFilter: "blur(12px)", color: "#9BB9FF", fontSize: "11px", cursor: "pointer",
          }}>
            🌍 Exposition géo. {showGeoPanel ? "▲" : "▼"}
          </button>
        )}
      </div>

      {/* Panel exposition géo */}
      {showGeoPanel && mode === "asset" && activeAsset && ETF_COUNTRY_WEIGHTS[activeAsset.ticker] && (
        <div style={{ position: "fixed", left: "20px", top: "80px", zIndex: 30, width: "240px", background: "rgba(4,17,36,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", padding: "16px", backdropFilter: "blur(20px)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)", maxHeight: "calc(100vh - 160px)", overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
            <div>
              <div style={{ color: "var(--novac-text-primary, #F8F9FC)", fontSize: "12px", fontWeight: 600 }}>{activeAsset.name}</div>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px", marginTop: "2px" }}>Exposition géographique</div>
            </div>
            <button onClick={() => setShowGeoPanel(false)} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: "14px" }}>✕</button>
          </div>
          {Object.entries(ETF_COUNTRY_WEIGHTS[activeAsset.ticker])
            .sort((a: any, b: any) => b[1] - a[1])
            .map(([iso3, pct]: any) => (
            <div key={iso3} style={{ marginBottom: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span style={{ color: "var(--novac-text-primary, #F8F9FC)", fontSize: "11px", opacity: 0.8 }}>{COUNTRY_FLAGS[iso3] || "🌐"} {COUNTRY_NAMES[iso3] || iso3}</span>
                <span style={{ color: "#9BB9FF", fontSize: "11px", fontWeight: 700 }}>{pct}%</span>
              </div>
              <div style={{ height: "4px", background: "rgba(255,255,255,0.07)", borderRadius: "2px" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(to right, #3B82F6, #93C5FD)", borderRadius: "2px" }}/>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Panel exposition géo portefeuille */}
      {showGeoPanel && mode === "portfolio" && activePortfolio && Object.keys(portfolioGeo).length > 0 && (
        <div style={{ position: "fixed", left: "20px", top: "80px", zIndex: 30, width: "240px", background: "rgba(4,17,36,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", padding: "16px", backdropFilter: "blur(20px)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)", maxHeight: "calc(100vh - 160px)", overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
            <div>
              <div style={{ color: "var(--novac-text-primary, #F8F9FC)", fontSize: "12px", fontWeight: 600 }}>{activePortfolio.name}</div>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px", marginTop: "2px" }}>Exposition géographique</div>
            </div>
            <button onClick={() => setShowGeoPanel(false)} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: "14px" }}>✕</button>
          </div>
          {Object.entries(portfolioGeo)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 15)
            .map(([iso3, pct]) => (
            <div key={iso3} style={{ marginBottom: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span style={{ color: "var(--novac-text-primary, #F8F9FC)", fontSize: "11px", opacity: 0.8 }}>{COUNTRY_FLAGS[iso3] || "🌐"} {COUNTRY_NAMES[iso3] || iso3}</span>
                <span style={{ color: "#9BB9FF", fontSize: "11px", fontWeight: 700 }}>{(pct * 100).toFixed(1)}%</span>
              </div>
              <div style={{ height: "4px", background: "rgba(255,255,255,0.07)", borderRadius: "2px" }}>
                <div style={{ width: `${Math.min(pct * 100, 100)}%`, height: "100%", background: "linear-gradient(to right, #3B82F6, #93C5FD)", borderRadius: "2px" }}/>
              </div>
            </div>
          ))}
        </div>
      )}

      {hovTooltip && COUNTRY_NAMES[hovTooltip.iso3] && (
        <div style={{ position: "fixed", left: hovTooltip.x+14, top: hovTooltip.y-14, background: "rgba(2,10,24,0.97)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "12px", padding: "10px 14px", pointerEvents: "none", zIndex: 100, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px" }}>
            <span style={{ fontSize: "20px" }}>{COUNTRY_FLAGS[hovTooltip.iso3] || "🌐"}</span>
            <span style={{ color: "var(--novac-text-primary, #F8F9FC)", fontSize: "13px", fontWeight: 600 }}>{COUNTRY_NAMES[hovTooltip.iso3]}</span>
          </div>
          {selectedMacro && macroData[hovTooltip.iso3] !== undefined && (
            <div style={{ color: "#9BB9FF", fontSize: "11px", fontWeight: 600, marginTop: "4px" }}>
              {macro?.label}: {macroData[hovTooltip.iso3].toFixed(1)} {macro?.unit}
            </div>
          )}
          {mode === "asset" && activeAsset && ETF_COUNTRY_WEIGHTS[activeAsset.ticker] && ETF_COUNTRY_WEIGHTS[activeAsset.ticker][hovTooltip.iso3] && (
            <div style={{ marginTop: "6px" }}>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "10px", marginBottom: "4px" }}>{activeAsset.ticker}</div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ flex: 1, height: "4px", background: "rgba(255,255,255,0.1)", borderRadius: "2px" }}>
                  <div style={{ width: `${ETF_COUNTRY_WEIGHTS[activeAsset.ticker][hovTooltip.iso3]}%`, height: "100%", background: "#5B8DEF", borderRadius: "2px" }}/>
                </div>
                <span style={{ color: "#9BB9FF", fontSize: "12px", fontWeight: 700, minWidth: "36px", textAlign: "right" }}>
                  {ETF_COUNTRY_WEIGHTS[activeAsset.ticker][hovTooltip.iso3]}%
                </span>
              </div>
            </div>
          )}
          {mode === "portfolio" && activePortfolio && portfolioGeo[hovTooltip.iso3] && (
            <div style={{ marginTop: "6px" }}>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "10px", marginBottom: "4px" }}>{activePortfolio.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ flex: 1, height: "4px", background: "rgba(255,255,255,0.1)", borderRadius: "2px" }}>
                  <div style={{ width: `${Math.min(portfolioGeo[hovTooltip.iso3] * 100, 100)}%`, height: "100%", background: "#5B8DEF", borderRadius: "2px" }}/>
                </div>
                <span style={{ color: "#9BB9FF", fontSize: "12px", fontWeight: 700, minWidth: "36px", textAlign: "right" }}>
                  {(portfolioGeo[hovTooltip.iso3] * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
