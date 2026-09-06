/**
 * Filme une visite du site sur le compte de démonstration, pour la porte de l'alpha.
 *
 * ⚠️ Un compte fictif, jamais celui de quelqu'un : la vidéo est publique.
 *
 * Lancement : node filmer-demo.mjs
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync, readdirSync, renameSync } from "node:fs";

const S = process.env.SCRATCH;
const SORTIE = process.env.SORTIE;
const demo = JSON.parse(readFileSync(`${S}/demo.json`, "utf8"));
mkdirSync(SORTIE, { recursive: true });

const navigateur = await chromium.launch();
const contexte = await navigateur.newContext({
  /* ⚠️ **1600 × 1000 et non 1280 × 800.** La vidéo finit dans une boîte d'environ 540 px de
     large sur un écran dense, soit 1080 px réels : filmée à 1280 puis recadrée, il ne restait
     plus assez de matière et le texte de l'interface partait en bouillie. On filme large et on
     réduit — l'inverse ne se rattrape pas. */
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
  colorScheme: "dark",
  recordVideo: { dir: SORTIE, size: { width: 1600, height: 1000 } },
});

// La porte de l'alpha, ouverte hors caméra.
const porte = await contexte.request.post("https://novac.fyi/api/acces", {
  data: { motDePasse: process.env.CODE },
});
console.log("  porte :", porte.status());

await contexte.addInitScript(([jeton, compte, portefeuille]) => {
  localStorage.setItem("novac_token", jeton);
  localStorage.setItem("novac_user", JSON.stringify(compte));
  localStorage.setItem("appMode", "portfolio");
  localStorage.setItem("activePortfolio", JSON.stringify(portefeuille));
  localStorage.setItem("novac-theme", "sombre");
}, [demo.token, { id: demo.uid, email: "demo@novac.fyi", username: demo.nom },
    { id: demo.pid, name: demo.pnom, assets: [], color: "#6366F1" }]);

const page = await contexte.newPage();

/* ⚠️ Le chargement se fait caméra tournante mais sera coupé au montage : une démonstration
   qui s'ouvre sur trois secondes d'écran vide donne l'impression d'un site lent. */
await page.goto(`https://novac.fyi/portfolio?id=${demo.pid}`, { waitUntil: "networkidle", timeout: 90000 }).catch(() => {});
await page.waitForTimeout(26000);   // les cours, les courbes et les dossiers arrivent

const clic = async (texte, pause = 2600) => {
  await page.getByText(texte, { exact: true }).first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(pause);
};

// La visite : la vue générale, puis ce qu'on peut en faire.
await page.waitForTimeout(3500);
await clic("Analyse", 3600);
await clic("Transactions", 3000);
await clic("Objectifs", 3000);
await clic("Vue générale", 2600);
await clic("Crypto", 3400);          // un dossier s'ouvre sur ses cartes d'actif

await page.close();                  // c'est la fermeture qui écrit la vidéo
await contexte.close();
await navigateur.close();

const film = readdirSync(SORTIE).find(f => f.endsWith(".webm"));
renameSync(`${SORTIE}/${film}`, `${SORTIE}/demonstration-brute.webm`);
console.log("  filmé :", film);
