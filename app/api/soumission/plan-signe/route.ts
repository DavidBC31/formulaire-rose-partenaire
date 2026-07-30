import { NextRequest, NextResponse } from "next/server";
import { readDbForToken } from "@/lib/db";
import { saveFile, slugify, isPdf, MAX_FILE_SIZE } from "@/lib/files";
import { mirrorToDrive } from "@/lib/google";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Dépôt du plan de prévention signé (PDF) : stockage + miroir Drive.
 * N'écrit pas le db.json ; les métadonnées sont renvoyées au client puis
 * transmises à la finalisation (seule écriture de la soumission).
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

  const { p } = await readDbForToken(token);
  if (!p) return NextResponse.json({ error: "Soumission introuvable" }, { status: 404 });

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!isPdf(buffer))
    return NextResponse.json({ error: "Le plan signé doit être un PDF" }, { status: 400 });

  const saved = await saveFile(
    `${slugify(p.societe)}/plan-prevention-signe.pdf`,
    buffer,
    "application/pdf"
  );
  await mirrorToDrive(
    { societe: p.societe },
    "plan-prevention-signe.pdf",
    buffer,
    "application/pdf"
  );

  return NextResponse.json({
    ok: true,
    plan: { signePath: saved.path, signeUrl: saved.url, signeNom: file.name },
  });
}
