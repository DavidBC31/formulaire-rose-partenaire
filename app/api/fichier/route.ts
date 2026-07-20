import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { readDb, findById } from "@/lib/db";
import { readLocalFile } from "@/lib/files";
import { DOC_KEYS, type DocKey } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Consultation d'une pièce par l'admin : ?id=<prestataire>&doc=<kbis|urssaf|fiscale|rcpro>
 * En mode Blob on redirige vers l'URL du fichier, en local on sert le fichier.
 */
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id") || "";
  const doc = req.nextUrl.searchParams.get("doc") || "";
  const db = await readDb();
  const p = findById(db, id);
  if (!p) return NextResponse.json({ error: "Prestataire introuvable" }, { status: 404 });

  if (!DOC_KEYS.includes(doc as DocKey))
    return NextResponse.json({ error: "Document inconnu" }, { status: 400 });

  const piece = p.pieces?.[doc as DocKey];
  if (piece?.url) return NextResponse.redirect(piece.url);
  if (!piece?.path) return NextResponse.json({ error: "Fichier absent" }, { status: 404 });

  const buf = await readLocalFile(piece.path);
  if (!buf) return NextResponse.json({ error: "Fichier absent" }, { status: 404 });
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${p.societe}-${doc}"`,
    },
  });
}
