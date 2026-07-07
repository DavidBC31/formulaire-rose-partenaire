import { NextRequest, NextResponse } from "next/server";
import { readDb, findByToken } from "@/lib/db";
import { readLocalFile } from "@/lib/files";

export const runtime = "nodejs";

/**
 * Sert le PDF du plan de prévention au prestataire, uniquement avec un
 * token valide dont le plan a été envoyé (?t=<token>).
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t") || "";
  const db = await readDb();
  const p = findByToken(db, token);
  const autorise =
    p &&
    ["recu_ok", "recu_a_verifier", "valide", "plan_envoye", "plan_signe"].includes(p.statut);
  if (!autorise || !db.planDocument)
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
