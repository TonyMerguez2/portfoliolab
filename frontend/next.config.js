/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // La pastille de développement de Next, en bas à gauche. Next 15 l'affiche
  // bien plus visiblement qu'avant : un rond sombre marqué d'un N, posé
  // par-dessus la barre latérale, où il se confond avec un élément de Novac.
  // Elle n'existe qu'en développement et ne part jamais en production ; on la
  // masque pour ne pas la relire à chaque capture d'écran.
  devIndicators: false,

  /**
   * Le frontal relaie l'API, au lieu que le navigateur l'appelle directement.
   *
   * ⚠️ C'est ce qui rend le site consultable depuis un autre appareil sans
   * qu'aucune adresse IP ne soit écrite nulle part. Le navigateur n'appelle que
   * l'origine qu'il a chargée — `localhost:3000` depuis cette machine,
   * `172.20.10.2:3000` depuis un téléphone — et Next transmet à `localhost:8000`,
   * qu'il atteint toujours puisqu'il tourne sur la même machine que le serveur.
   *
   * Le défaut qu'il remplace : `NEXT_PUBLIC_API_URL` figeait l'adresse au
   * démarrage. Passée en partage de connexion, la machine ne portait plus
   * `192.168.1.142` et chaque appel de données allait vers une adresse morte —
   * page vivante, aucune courbe, aucune transaction. Le CORS aurait refusé de
   * toute façon : l'adresse du partage par USB, `192.0.0.2`, n'appartient à
   * aucune des trois plages privées que le serveur autorise. En même origine, la
   * question ne se pose plus.
   *
   * `/uploads` est relayé aussi : les images de portefeuille sont servies par le
   * serveur, et les laisser dehors aurait rendu la vignette borgne là où le reste
   * fonctionne.
   *
   * ⚠️ Ne concerne pas les flux Binance de la page graphique : ce sont des
   * WebSockets vers un hôte public, hors de ce relais.
   */
  async rewrites() {
    const serveur = process.env.API_INTERNE || "http://localhost:8000";
    return [
      { source: "/api/v1/:chemin*", destination: `${serveur}/api/v1/:chemin*` },
      { source: "/uploads/:chemin*", destination: `${serveur}/uploads/:chemin*` },
    ];
  },

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "t3.gstatic.com" },
      { protocol: "https", hostname: "ui-avatars.com" },
      { protocol: "https", hostname: "storage.googleapis.com" },
    ],
  },
};

module.exports = nextConfig;
