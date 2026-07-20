import { NextRequest, NextResponse } from "next/server";
import { randomBytes, randomUUID } from "crypto";
import { readDb, writeDb, findByToken } from "@/lib/db";
import { normalizeText } from "@/lib/fastcheck";
import type { Prestataire, TeamMember } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Étape 1 de la soumission : enregistre les infos prestataire + équipe,
 * retourne le token à utiliser pour déposer les pièces une par une.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });

  const societe = String(body.societe || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  if (!societe) return NextResponse.json({ error: "Le nom de la société est requis" }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return NextResponse.json({ error: "Email de contact invalide" }, { status: 400 });

  const equipe: TeamMember[] = Array.isArray(body.equipe)
    ? body.equipe
        .map((m: Record<string, unknown>) => ({
          prenom: String(m.prenom || "").trim(),
          nom: String(m.nom || "").trim(),
          societe: String(m.societe || societe).trim(),
        }))
        .filter((m: TeamMember) => m.nom || m.prenom)
    : [];

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

  p.societe = p.societe || societe;
  p.email = email || p.email;
  p.contact = {
    prenom: String(body.contactPrenom || "").trim(),
    nom: String(body.contactNom || "").trim(),
    telephone: String(body.contactTelephone || "").trim(),
    email,
  };
  p.responsableSite = {
    nom: String(body.responsableNom || "").trim(),
    telephone: String(body.responsableTelephone || "").trim(),
  };
  const effectif = Number.parseInt(String(body.effectifApprox ?? ""), 10);
  p.effectifApprox = Number.isFinite(effectif) && effectif > 0 ? effectif : undefined;
  p.equipe = equipe;
  p.updatedAt = now;

  await writeDb(db);
  return NextResponse.json({ ok: true, token: p.token, societe: p.societe });
}
