import { NextRequest, NextResponse } from "next/server";
import { readDbForToken } from "@/lib/db";
import { saveFile, slugify, isPdf, MAX_FILE_SIZE } from "@/lib/files";
import { fastcheckPdf } from "@/lib/fastcheck";
import { mirrorToDrive } from "@/lib/google";
import { DOC_KEYS, type DocKey, type PieceInfo } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Dépôt d'une pièce : stockage du fichier + fastcheck immédiat + miroir Drive.
 * N'ÉCRIT PAS le db.json (pour éviter les pertes d'écritures concurrentes) :
 * les métadonnées de la pièce sont renvoyées au client, qui les transmet à
 * l'étape de finalisation — seule écriture de la soumission.
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

  const { p } = await readDbForToken(token);
  if (!p) return NextResponse.json({ error: "Soumission introuvable" }, { status: 404 });

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!isPdf(buffer))
    return NextResponse.json({ error: "Le fichier doit être un PDF" }, { status: 400 });

  const fastcheck = await fastcheckPdf(buffer, p.societe);
  const saved = await saveFile(`${slugify(p.societe)}/${doc}.pdf`, buffer, "application/pdf");
  // Classement Drive (idempotent, sans persistance en base ici).
  await mirrorToDrive({ societe: p.societe }, `${doc}.pdf`, buffer, "application/pdf");

  const piece: PieceInfo = {
    originalName: file.name,
    path: saved.path,
    url: saved.url,
    size: file.size,
    uploadedAt: new Date().toISOString(),
    fastcheck,
  };
  return NextResponse.json({ ok: true, doc, fastcheck, piece });
}
