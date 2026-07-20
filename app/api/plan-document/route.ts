import { NextResponse } from "next/server";
import { readDb } from "@/lib/db";
import { readLocalFile } from "@/lib/files";

export const runtime = "nodejs";

/**
 * Sert le PDF du plan de prévention pour consultation dans le formulaire.
 * Document général (mêmes consignes pour tous), servi dès qu'il est en ligne —
 * un prestataire arrivant sur le formulaire public n'a pas encore de token.
 */
export async function GET() {
  const db = await readDb();
  if (!db.planDocument)
    return NextResponse.json({ error: "Document indisponible" }, { status: 404 });

  if (db.planDocument.url) return NextResponse.redirect(db.planDocument.url);

  const buf = await readLocalFile(db.planDocument.path);
  if (!buf) return NextResponse.json({ error: "Document indisponible" }, { status: 404 });
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="plan-de-prevention-rose-festival.pdf"`,
    },
  });
}
