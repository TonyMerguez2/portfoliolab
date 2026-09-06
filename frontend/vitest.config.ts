import { defineConfig } from "vitest/config";

/**
 * ⚠️ **Jusqu'ici aucun test ne touchait un composant, et c'est pour ça que ce fichier
 * n'existait pas.** `tsconfig.json` laisse le JSX en `preserve` — c'est Next qui le compile.
 * Vitest, lui, lit ce réglage et refuse d'importer un `.tsx` : « make sure to not set jsx
 * to preserve ». On ne touche pas au `tsconfig` de Next.
 *
 * ⚠️ **Ce n'est plus `esbuild` qui transforme, c'est `oxc`** — Vite 8. Réglé d'abord sous
 * `esbuild`, l'option était annoncée ignorée et l'erreur restait identique. Le réglage vit
 * donc sous `oxc`, et seulement pour les tests.
 */
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
});
