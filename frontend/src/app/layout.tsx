import type { Metadata } from "next";
import { AppProvider } from "@/lib/AppContext";
import { AvatarProvider } from "@/lib/AvatarContext";
import { Geist } from "next/font/google";
import "./globals.css";
import GlobalHeader from "@/components/GlobalHeader";
import SideNav from "@/components/SideNav";
import PointsFond from "@/components/PointsFond";
import CadreSite from "@/components/CadreSite";

/**
 * Police de l'application.
 *
 * ⚠️ **Le nom déclaré ici doit rester celui de la pile `FONT`.** `next/font` enregistre la
 * famille sous son vrai nom — « Geist », et non un nom haché — donc le `fontFamily` en ligne
 * que porte presque tout composant la retrouve. Renommer d'un côté seulement ferait
 * silencieusement retomber la page sur la police système, sans rien casser de visible : on
 * s'en apercevrait des semaines plus tard, sur une capture.
 */
const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "NOVAC — Analyse de Portefeuille",
  description: "Construisez, analysez et comprenez votre portefeuille d'investissement.",
};

/**
 * Pose le thème avant la première peinture.
 *
 * Le serveur ne sait pas quel thème l'utilisateur a choisi : le rendu part donc
 * du sombre par défaut. Si le choix retenu est le clair, l'appliquer depuis un
 * effet React arriverait après la première peinture, et l'on verrait la page
 * noircir puis blanchir — le scintillement classique.
 *
 * D'où ce script exécuté avant le corps du document. Il est bloquant, mais il
 * ne fait que lire une clé et écrire un attribut.
 */
/**
 * ⚠️ **Deux marques pour un seul thème, et les deux sont posées avant l'hydratation.**
 * `data-theme` est celle du site ; `dark` est celle qu'attendent les composants d'Appica, dont
 * la variante sombre s'écrit `&:is(.dark *)`. La poser plus tard ferait paraître leurs
 * composants en clair le temps d'un rendu.
 */
const SCRIPT_THEME = `(function(){try{
  var m = localStorage.getItem('novac-theme');
  if (m !== 'clair' && m !== 'sombre') {
    m = matchMedia('(prefers-color-scheme: light)').matches ? 'clair' : 'sombre';
  }
  document.documentElement.setAttribute('data-theme', m);
  document.documentElement.classList.toggle('dark', m === 'sombre');
}catch(e){
  document.documentElement.setAttribute('data-theme','sombre');
  document.documentElement.classList.add('dark');
}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Le script écrit data-theme avant l'hydratation : React constaterait
    // sinon un écart entre son rendu serveur et le DOM reçu.
    <html lang="fr" data-theme="sombre" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_THEME }} />
      </head>
      <body className={geist.className}>
        <PointsFond />
        <AppProvider>
          {/* L'avatar vit dans le bandeau, mais ce qu'il exprime vient des pages :
              le fournisseur doit donc envelopper les deux. */}
          <AvatarProvider>
            {/* ⚠️ Le cadre s'efface devant la porte de l'alpha fermée — voir `CadreSite`. */}
            <CadreSite rail={<SideNav/>} bandeau={<GlobalHeader/>}>
              {children}
            </CadreSite>
          </AvatarProvider>
        </AppProvider>
      </body>
    </html>
  );
}
