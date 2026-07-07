import { NextRequest, NextResponse } from "next/server";
import { randomBytes, randomUUID } from "crypto";
import { isAdmin } from "@/lib/auth";
import { readDb, writeDb } from "@/lib/db";
import { normalizeText } from "@/lib/fastcheck";
import type { Prestataire } from "@/lib/types";

export const runtime = "nodejs";

function nouveau(societe: string, email: string): Prestataire {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    societe,
    email,
    token: randomBytes(16).toString("hex"),
    statut: "a_inviter",
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Ajout d'un prestataire ({ societe, email }) ou import en masse
 * ({ bulk }) au format une ligne par prestataire : "Société;email".
 */
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });

  const db = await readDb();
  const existants = new Set(db.prestataires.map((p) => normalizeText(p.societe)));
  let ajoutes = 0;
  const erreurs: string[] = [];

  const lignes: Array<{ societe: string; email: string }> = [];
  if (body.bulk) {
    for (const ligne of String(body.bulk).split("\n")) {
      const clean = ligne.trim();
      if (!clean) continue;
      const [societe, email] = clean.split(/[;,\t]/).map((s) => s?.trim() || "");
      lignes.push({ societe, email });
    }
  } else {
    lignes.push({ societe: String(body.societe || "").trim(), email: String(body.email || "").trim() });
  }

  for (const { societe, email } of lignes) {
    if (!societe || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      erreurs.push(`Ligne invalide : "${societe};${email}" (attendu : Société;email)`);
      continue;
    }
    if (existants.has(normalizeText(societe))) {
      erreurs.push(`Doublon ignoré : ${societe}`);
      continue;
    }
    db.prestataires.push(nouveau(societe, email.toLowerCase()));
    existants.add(normalizeText(societe));
    ajoutes++;
  }

  await writeDb(db);
  return NextResponse.json({ ok: true, ajoutes, erreurs });
}
