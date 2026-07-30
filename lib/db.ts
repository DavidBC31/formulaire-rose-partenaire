import { promises as fs } from "fs";
import path from "path";
import { randomBytes } from "crypto";
import type { Db, Prestataire } from "./types";
import { syncSheet } from "./google";

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const BLOB_DB_PATH = "formulaire-rose/db.json";

const blobEnabled = () => !!process.env.BLOB_READ_WRITE_TOKEN;
const randomBust = () => randomBytes(6).toString("hex");

const EMPTY_DB: Db = { prestataires: [] };

export async function readDb(): Promise<Db> {
  if (blobEnabled()) {
    const { head } = await import("@vercel/blob");
    try {
      const meta = await head(BLOB_DB_PATH);
      // Cache-buster UNIQUE par lecture : force un contournement du cache CDN
      // (dont la clé sinon collée sur uploadedAt à la seconde peut servir une
      // version périmée qui ne se corrige pas). On lit ainsi toujours l'origine.
      const bust = `${meta.uploadedAt ? new Date(meta.uploadedAt).getTime() : ""}-${randomBust()}`;
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
  if (blobEnabled()) {
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

/**
 * Lit la base et attend que le prestataire du token soit visible (tolère la
 * latence de propagation du Blob juste après une écriture d'une autre requête).
 */
export async function readDbForToken(
  token: string,
  tries = 4
): Promise<{ db: Db; p?: Prestataire }> {
  let db = await readDb();
  let p = findByToken(db, token);
  for (let i = 0; !p && i < tries - 1; i++) {
    await new Promise((r) => setTimeout(r, 400));
    db = await readDb();
    p = findByToken(db, token);
  }
  return { db, p };
}

export function findById(db: Db, id: string): Prestataire | undefined {
  return db.prestataires.find((p) => p.id === id);
}

export function touch(p: Prestataire): void {
  p.updatedAt = new Date().toISOString();
}
