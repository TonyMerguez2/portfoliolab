"use client";

/**
 * Le pictogramme d'un mode d'affichage.
 *
 * Trois glyphes pleins, sur une boîte de 24 unités, rendus à 14 px comme les
 * autres icônes du bandeau. Ils sont en `fill` et non en trait : c'est le jeu
 * dont ils viennent, et le mélanger avec des tracés au trait de 1,5 aurait donné
 * trois poids différents sur trois boutons voisins.
 *
 * Chaque glyphe désigne l'état qu'il représente, et non celui qui suivrait un
 * clic. Le bouton unique qui faisait tourner les trois modes montrait le mode
 * suivant, parce qu'il n'avait aucun autre moyen d'annoncer où il menait ; une
 * piste à deux pastilles montre l'état retenu, donc chaque pastille porte le
 * sien.
 */
export default function MarqueMode({ cible }: { cible: "ligne" | "bougie" }) {
  const commun = {
    width: 14, height: 14, viewBox: "0 0 24 24", fill: "currentColor",
    "aria-hidden": true as const, style: { display: "block" },
  };
  if (cible === "bougie") {
    return (
      <svg {...commun}>
        <path d="M6.167 3.25a.97.97 0 0 1 .965.859l.007.113v.973a1.944 1.944 0 0 1 1.94 1.798l.004.146v2.917a1.944 1.944 0 0 1-1.798 1.94L7.139 12v7.778a.972.972 0 0 1-1.938.114l-.007-.114V12a1.944 1.944 0 0 1-1.94-1.8l-.004-.145V7.139A1.945 1.945 0 0 1 5.049 5.2l.145-.004v-.973a.97.97 0 0 1 .973-.972M12 3.25a.97.97 0 0 1 .965.859l.007.113v8.75a1.945 1.945 0 0 1 1.94 1.8l.005.145v2.917a1.945 1.945 0 0 1-1.799 1.94l-.146.005a.973.973 0 0 1-1.937.114l-.007-.114-.146-.005a1.945 1.945 0 0 1-1.793-1.787l-.006-.153v-2.917a1.945 1.945 0 0 1 1.799-1.94l.146-.004v-8.75A.97.97 0 0 1 12 3.25M17.833 3.25a.97.97 0 0 1 .966.859l.007.113a1.944 1.944 0 0 1 1.94 1.799l.004.146v3.889a1.944 1.944 0 0 1-1.799 1.94l-.145.005v7.778a.973.973 0 0 1-1.938.114l-.007-.114V12a1.944 1.944 0 0 1-1.94-1.8l-.004-.145v-3.89a1.945 1.945 0 0 1 1.798-1.939l.146-.005a.97.97 0 0 1 .972-.972" />
      </svg>
    );
  }
  return (
    <svg {...commun}>
      <path d="M15.13 9.438a.97.97 0 0 1 1.355-.16l.091.08 3.89 3.882a.97.97 0 0 1 .275.56l.009.127v4.852a.97.97 0 0 1-.858.964l-.114.007H4.2l-.107-.009-.107-.02-.104-.032-.102-.045-.097-.057-.092-.068-.058-.053-.07-.08-.062-.086-.053-.094-.015-.034-.04-.1-.025-.102-.015-.105-.004-.107.009-.107.018-.102q.015-.057.034-.108l.045-.102.057-.097 3.89-5.824a.97.97 0 0 1 1.132-.378l.11.048 3.187 1.59z" />
      <path d="M15.142 3.6a.973.973 0 0 1 1.344-.146l.09.08 3.89 3.883a.97.97 0 0 1-1.284 1.453l-.092-.08-3.136-3.13-4.18 5.005a.97.97 0 0 1-1.069.295l-.112-.048L7.43 9.334 5 12.568a.973.973 0 0 1-1.259.26l-.102-.066a.97.97 0 0 1-.262-1.257l.068-.102L6.36 7.521a.97.97 0 0 1 1.106-.331l.107.045 3.2 1.597z" />
    </svg>
  );
}
