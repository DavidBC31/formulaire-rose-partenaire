import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse"],
  // Plusieurs lockfiles présents sur la machine : fixer la racine du projet.
  turbopack: { root: __dirname },
};

export default nextConfig;
