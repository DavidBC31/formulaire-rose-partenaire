import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { readDb, writeDb } from "@/lib/db";
import { saveFile, isPdf, MAX_FILE_SIZE } from "@/lib/files";
import { uploadToDriveRoot } from "@/lib/google";

export const runtime = "nodejs";

/** Dépôt (admin) du PDF du plan de prévention envoyé aux prestataires. */
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File))
    return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
  if (file.size > MAX_FILE_SIZE)
    return NextResponse.json({ error: "Fichier trop lourd (8 Mo maximum)" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!isPdf(buffer))
    return NextResponse.json({ error: "Le fichier doit être un PDF" }, { status: 400 });

  const saved = await saveFile("plan-prevention.pdf", buffer, "application/pdf");
  await uploadToDriveRoot("plan-de-prevention.pdf", buffer, "application/pdf");
  const db = await readDb();
  db.planDocument = {
    path: saved.path,
    url: saved.url,
    originalName: file.name,
    uploadedAt: new Date().toISOString(),
  };
  await writeDb(db);
  return NextResponse.json({ ok: true });
}
