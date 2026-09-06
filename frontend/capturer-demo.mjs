/**
 * Capture les écrans du compte de démonstration, pour illustrer la porte.
 *
 * ⚠️ Un compte fictif, jamais celui de quelqu'un : les images sont publiques.
 *
 * Lancement : node capturer.mjs
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { mkdirSync } from "node:fs";

const S = process.env.SCRATCH;
const demo = JSON.parse(readFileSync(`${S}/demo.json`, "utf8"));
const SORTIE = process.env.SORTIE;
mkdirSync(SORTIE, { recursive: true });

const navigateur = await chromium.launch();
const contexte = await navigateur.newContext({
  viewport: { width: 1500, height: 940 },
  deviceScaleFactor: 2,            // écran dense : les captures restent nettes une fois réduites
  colorScheme: "dark",
});

// La porte de l'alpha : on l'ouvre une fois pour toutes les pages.
const page = await contexte.newPage();
await page.goto("https://novac.fyi/acces", { waitUntil: "domcontentloaded" });
const ouverture = await page.request.post("https://novac.fyi/api/acces", {
  data: { motDePasse: process.env.CODE },
});
console.log("  porte :", ouverture.status());

// La session du compte de démonstration, posée avant tout chargement d'application.
await contexte.addInitScript(([jeton, compte, portefeuille]) => {
  localStorage.setItem("novac_token", jeton);
  localStorage.setItem("novac_user", JSON.stringify(compte));
  localStorage.setItem("appMode", "portfolio");
  localStorage.setItem("activePortfolio", JSON.stringify(portefeuille));
  localStorage.setItem("novac-theme", "sombre");
}, [demo.token, { id: demo.uid, email: "demo@novac.fyi", username: demo.nom },
    { id: demo.pid, name: demo.pnom, assets: [], color: "#6366F1" }]);

/**
 * ⚠️ Le rail de navigation est découpé hors de chaque capture : c'est du mobilier de site,
 * pas du contenu, et il ferait doublon avec celui de la page qui affiche l'image.
 */
const CADRAGE = { x: 100, y: 40, width: 1380, height: 860 };

async function ouvrir(url, attente = 22000) {
  const p = await contexte.newPage();
  await p.goto(url, { waitUntil: "networkidle", timeout: 90000 }).catch(() => {});
  await p.waitForTimeout(attente);
  return p;
}

async function capturer(url, fichier, attente = 22000) {
  const p = await ouvrir(url, attente);
  await p.screenshot({ path: `${SORTIE}/${fichier}`, type: "png", clip: CADRAGE });
  console.log("  capturé :", fichier);
  await p.close();
}

/** Capture un élément précis, désigné par un texte qu'il contient. */
async function capturerElement(url, texte, fichier, remonte = 0, attente = 22000, avant) {
  const p = await ouvrir(url, attente);
  if (avant) { await avant(p); await p.waitForTimeout(6000); }
  let cible = p.getByText(texte, { exact: false }).first();
  for (let i = 0; i < remonte; i++) cible = cible.locator("xpath=..");
  try {
    await cible.screenshot({ path: `${SORTIE}/${fichier}`, type: "png", timeout: 15000 });
    console.log("  capturé :", fichier);
  } catch (e) {
    console.log("  ÉCHEC   :", fichier, String(e).slice(0, 90));
  }
  await p.close();
}

await capturer(`https://novac.fyi/portfolio?id=${demo.pid}`, "tableau-de-bord.png");
await capturer("https://novac.fyi/chart?ticker=NVDA", "graphique.png", 26000);

// La carte d'objectif, sur l'onglet Objectifs.
await capturerElement(`https://novac.fyi/portfolio?id=${demo.pid}`, "Retraite à 62 ans",
  "objectif.png", 3, 20000,
  async p => { await p.getByText("Objectifs", { exact: true }).first().click().catch(() => {}); });

// Une carte d'actif, en ouvrant un dossier du tableau de bord.
// On ouvre le dossier CTO, puis on capture la carte d'Apple qu'il contient.
await capturerElement(`https://novac.fyi/portfolio?id=${demo.pid}`, "Apple Inc.",
  "carte-actif.png", 3, 20000,
  async p => { await p.getByText("CTO", { exact: true }).first().click().catch(() => {}); });

// La carte de Solana, dans le même dossier.
await capturerElement(`https://novac.fyi/portfolio?id=${demo.pid}`, "Solana",
  "solana.png", 3, 20000,
  async p => { await p.getByText("Crypto", { exact: true }).first().click().catch(() => {}); });

await navigateur.close();
