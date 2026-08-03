/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // La pastille de développement de Next, en bas à gauche. Next 15 l'affiche
  // bien plus visiblement qu'avant : un rond sombre marqué d'un N, posé
  // par-dessus la barre latérale, où il se confond avec un élément de Novac.
  // Elle n'existe qu'en développement et ne part jamais en production ; on la
  // masque pour ne pas la relire à chaque capture d'écran.
  devIndicators: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "t3.gstatic.com" },
      { protocol: "https", hostname: "ui-avatars.com" },
      { protocol: "https", hostname: "storage.googleapis.com" },
    ],
  },
};

module.exports = nextConfig;
