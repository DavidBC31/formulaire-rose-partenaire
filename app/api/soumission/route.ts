import { NextRequest, NextResponse } from "next/server";
import { randomBytes, randomUUID } from "crypto";
import { readDb, writeDb } from "@/lib/db";
import { applyInfo, matchPrestataire } from "@/lib/soumission";
import type { Prestataire } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Étape 1 : crée (ou retrouve) le prestataire et retourne son token pour la
 * suite. Les infos sont appliquées ici puis RÉAPPLIQUÉES à la finalisation
 * (source autoritaire), ce qui protège des lectures périmées du db.json.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });

  const societe = String(body.societe || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  if (!societe) return NextResponse.json({ error: "Le nom de la société est requis" }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return NextResponse.json({ error: "Email de contact invalide" }, { status: 400 });

  const db = await readDb();
  const now = new Date().toISOString();

  // Rattachement robuste : token > email > nom (avec/sans forme juridique).
  let p: Prestataire | undefined = matchPrestataire(db.prestataires, {
    token: String(body.token || ""),
    societe,
    email,
  });
  if (!p) {
    p = {
      id: randomUUID(),
      societe,
      email,
      token: randomBytes(16).toString("hex"),
      statut: "en_attente",
      createdAt: now,
      updatedAt: now,
    };
    db.prestataires.push(p);
  }

  applyInfo(p, body);
  p.updatedAt = now;

  await writeDb(db);
  return NextResponse.json({ ok: true, token: p.token, societe: p.societe });
}
