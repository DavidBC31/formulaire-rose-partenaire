import { NextRequest, NextResponse } from "next/server";
import { readDb, writeDb, findByToken } from "@/lib/db";
import { saveFile, slugify, isPdf, MAX_FILE_SIZE } from "@/lib/files";
import { fastcheckPdf } from "@/lib/fastcheck";
import { mirrorToDrive } from "@/lib/google";
import { DOC_KEYS, type DocKey } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Étape 2 : dépôt d'une pièce (une requête par fichier pour rester sous
 * les limites de taille de requête en production). Fastcheck immédiat :
 * le nom du prestataire doit figurer dans le texte du PDF.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });

  const token = String(form.get("token") || "");
  const doc = String(form.get("doc") || "") as DocKey;
  const file = form.get("file");

  if (!DOC_KEYS.includes(doc))
    return NextResponse.json({ error: "Type de pièce inconnu" }, { status: 400 });
  if (!(file instanceof File))
    return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
  if (file.size > MAX_FILE_SIZE)
    return NextResponse.json({ error: "Fichier trop lourd (8 Mo maximum)" }, { status: 400 });

  const db = await readDb();
  const p = findByToken(db, token);
  if (!p) return NextResponse.json({ error: "Soumission introuvable" }, { status: 404 });

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!isPdf(buffer))
    return NextResponse.json({ error: "Le fichier doit être un PDF" }, { status: 400 });

  const fastcheck = await fastcheckPdf(buffer, p.societe);
  const saved = await saveFile(`${slugify(p.societe)}/${doc}.pdf`, buffer, "application/pdf");
  // Classement dans le Drive dédié (sous-dossier du prestataire, CDC Brique 1).
  await mirrorToDrive(p, `${doc}.pdf`, buffer, "application/pdf");

  p.pieces = p.pieces || {};
  p.pieces[doc] = {
    originalName: file.name,
    path: saved.path,
    url: saved.url,
    size: file.size,
    uploadedAt: new Date().toISOString(),
    fastcheck,
  };
  p.updatedAt = new Date().toISOString();
  await writeDb(db);

  return NextResponse.json({ ok: true, doc, fastcheck });
}
