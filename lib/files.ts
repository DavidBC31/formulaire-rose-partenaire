import { promises as fs } from "fs";
import path from "path";

const FILES_DIR = path.join(process.cwd(), ".data", "files");
const BLOB_PREFIX = "formulaire-rose/files";

const useBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "prestataire";
}

/** Enregistre un fichier ; retourne le chemin logique + URL publique si Blob. */
export async function saveFile(
  subpath: string,
  data: Buffer,
  contentType: string
): Promise<{ path: string; url?: string }> {
  const clean = subpath.replace(/\.\./g, "").replace(/^\/+/, "");
  if (useBlob()) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`${BLOB_PREFIX}/${clean}`, data, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType,
    });
    return { path: clean, url: blob.url };
  }
  const abs = path.join(FILES_DIR, clean);
  if (!abs.startsWith(FILES_DIR)) throw new Error("Chemin invalide");
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, data);
  return { path: clean };
}

/** Lit un fichier stocké localement (mode local uniquement). */
export async function readLocalFile(subpath: string): Promise<Buffer | null> {
  const clean = subpath.replace(/\.\./g, "").replace(/^\/+/, "");
  const abs = path.join(FILES_DIR, clean);
  if (!abs.startsWith(FILES_DIR)) return null;
  try {
    return await fs.readFile(abs);
  } catch {
    return null;
  }
}

export function isPdf(buf: Buffer): boolean {
  return buf.subarray(0, 5).toString("latin1").startsWith("%PDF-");
}

export const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8 Mo par pièce
