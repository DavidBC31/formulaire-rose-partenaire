import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse"],
  // pdf-parse charge ./pdf.worker.mjs dynamiquement : le traçage Vercel le
  // rate, il faut embarquer tout son dist dans la lambda du fastcheck.
  outputFileTracingIncludes: {
    "/api/soumission/piece": ["./node_modules/pdf-parse/dist/**"],
  },
  // Plusieurs lockfiles présents sur la machine : fixer la racine du projet.
  turbopack: { root: __dirname },
};

export default nextConfig;
