import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const S = process.env.S, base = process.env.BASE, ou = process.env.OU;
const demo = JSON.parse(readFileSync(S + "/demo.json", "utf8"));
const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: "dark" });
if (base.includes("novac.fyi")) await ctx.request.post("https://novac.fyi/api/acces", { data: { motDePasse: "tonymerguez" } });
await ctx.addInitScript(([j, u]) => {
  localStorage.setItem("novac_token", j); localStorage.setItem("novac_user", JSON.stringify(u));
}, [demo.token, { id: demo.uid, email: "demo@novac.fyi", username: demo.nom }]);
for (const [nom, url] of [["accueil", "/"], ["portefeuille", "/portfolio"]]) {
  const p = await ctx.newPage();
  await p.goto(base + url, { waitUntil: "networkidle", timeout: 120000 }).catch(() => {});
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(nom === "portefeuille" ? 9000 : 4000);
  await p.screenshot({ path: `${S}/appica-${ou}-${nom}.png` });
  if (nom === "accueil") console.log(`  ${ou} · fond du body :`, await p.evaluate(() => getComputedStyle(document.body).backgroundImage.slice(0, 60)));
  await p.close();
}
await nav.close();
