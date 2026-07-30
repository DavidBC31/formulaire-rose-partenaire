import { NextRequest, NextResponse } from "next/server";
import { readDb, writeDb, findByToken } from "@/lib/db";
import { saveFile, slugify, isPdf, MAX_FILE_SIZE } from "@/lib/files";
import { mirrorToDrive } from "@/lib/google";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Dépôt par le prestataire du plan de prévention signé (PDF), en plus de la
 * case d'attestation. Stocké dans son dossier + miroir Drive.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });

  const token = String(form.get("token") || "");
  const file = form.get("file");

  if (!(file instanceof File))
    return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
  if (file.size > MAX_FILE_SIZE)
    return NextResponse.json({ error: "Fichier trop lourd (8 Mo maximum)" }, { status: 400 });

  const db = await readDb();
  const p = findByToken(db, token);
  if (!p) return NextResponse.json({ error: "Soumission introuvable" }, { status: 404 });

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!isPdf(buffer))
    return NextResponse.json({ error: "Le plan signé doit être un PDF" }, { status: 400 });

  const saved = await saveFile(
    `${slugify(p.societe)}/plan-prevention-signe.pdf`,
    buffer,
    "application/pdf"
  );
  await mirrorToDrive(p, "plan-prevention-signe.pdf", buffer, "application/pdf");

  p.plan = {
    ...p.plan,
    signePath: saved.path,
    signeUrl: saved.url,
    signeNom: file.name,
  };
  p.updatedAt = new Date().toISOString();
  await writeDb(db);

  return NextResponse.json({ ok: true });
}
