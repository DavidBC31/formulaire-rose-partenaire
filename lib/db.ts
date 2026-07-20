import { promises as fs } from "fs";
import path from "path";
import type { Db, Prestataire } from "./types";
import { syncSheet } from "./google";

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const BLOB_DB_PATH = "formulaire-rose/db.json";

const useBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;

const EMPTY_DB: Db = { prestataires: [] };

export async function readDb(): Promise<Db> {
  if (useBlob()) {
    const { head } = await import("@vercel/blob");
    try {
      const meta = await head(BLOB_DB_PATH);
      // Cache-buster : évite qu'un nœud CDN serve une version périmée du
      // db.json juste après une écriture (cohérence lecture-après-écriture).
      const bust = meta.uploadedAt ? new Date(meta.uploadedAt).getTime() : "";
      const url = `${meta.url}${meta.url.includes("?") ? "&" : "?"}v=${bust}`;
      const res = await fetch(url, { cache: "no-store" });
      return (await res.json()) as Db;
    } catch {
      return structuredClone(EMPTY_DB);
    }
  }
  try {
    const raw = await fs.readFile(DB_FILE, "utf-8");
    return JSON.parse(raw) as Db;
  } catch {
    return structuredClone(EMPTY_DB);
  }
}

export async function writeDb(db: Db): Promise<void> {
  if (useBlob()) {
    const { put } = await import("@vercel/blob");
    await put(BLOB_DB_PATH, JSON.stringify(db, null, 2), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      cacheControlMaxAge: 0, // db.json change souvent : pas de cache CDN
    });
  } else {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  }
  // Le Google Sheet de suivi reflète chaque écriture (no-op si non configuré).
  await syncSheet(db);
}

export function findByToken(db: Db, token: string): Prestataire | undefined {
  if (!token) return undefined;
  return db.prestataires.find((p) => p.token === token);
}

export function findById(db: Db, id: string): Prestataire | undefined {
  return db.prestataires.find((p) => p.id === id);
}

export function touch(p: Prestataire): void {
  p.updatedAt = new Date().toISOString();
}
