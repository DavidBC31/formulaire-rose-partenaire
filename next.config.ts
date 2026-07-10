import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
  // pdf-parse charge son worker et le binaire natif @napi-rs/canvas (DOMMatrix)
  // via des chemins dynamiques que le traçage Vercel rate : il faut embarquer
  // ces fichiers explicitement dans la lambda du fastcheck, sinon l'extraction
  // échoue en prod avec « DOMMatrix is not defined ».
  outputFileTracingIncludes: {
    "/api/soumission/piece": [
      "./node_modules/pdf-parse/dist/**",
      "./node_modules/pdfjs-dist/**",
      "./node_modules/@napi-rs/**",
    ],
    "/api/admin/action": [
      "./node_modules/pdf-parse/dist/**",
      "./node_modules/pdfjs-dist/**",
      "./node_modules/@napi-rs/**",
    ],
  },
  // Plusieurs lockfiles présents sur la machine : fixer la racine du projet.
  turbopack: { root: __dirname },
};

export default nextConfig;
