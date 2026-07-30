import { NextRequest, NextResponse } from "next/server";
import { randomBytes, randomUUID } from "crypto";
import { readDb, writeDb, findByToken } from "@/lib/db";
import { normalizeText } from "@/lib/fastcheck";
import { applyInfo } from "@/lib/soumission";
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

  // Rattachement : token d'invitation > correspondance nom société > création.
  let p: Prestataire | undefined = findByToken(db, String(body.token || ""));
  if (!p) {
    const norm = normalizeText(societe);
    p = db.prestataires.find((x) => normalizeText(x.societe) === norm);
  }
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
