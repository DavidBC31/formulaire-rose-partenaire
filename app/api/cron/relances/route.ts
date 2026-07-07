import { NextRequest, NextResponse } from "next/server";
import { readDb, writeDb } from "@/lib/db";
import { sendMail, tplRelance } from "@/lib/mailer";

export const runtime = "nodejs";
export const maxDuration = 300;

const SEPT_JOURS_MOINS_MARGE = 6 * 24 * 60 * 60 * 1000; // ≥ 6 jours : évite les doubles relances du lundi

/**
 * Relance automatique (décision actée CDC : tous les 7 jours, chaque lundi,
 * jusqu'à réception des pièces). Déclenché par le cron Vercel — voir vercel.json.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const db = await readDb();
  const now = Date.now();
  const relances: string[] = [];

  for (const p of db.prestataires) {
    if (p.statut !== "en_attente") continue; // pièces reçues = plus de relance
    const dernierContact = p.dateDerniereRelance || p.dateInvitation;
    if (!dernierContact) continue; // jamais invité : pas de relance automatique
    if (now - new Date(dernierContact).getTime() < SEPT_JOURS_MOINS_MARGE) continue;

    await sendMail({ to: p.email, ...tplRelance(p) });
    p.dateDerniereRelance = new Date(now).toISOString();
    p.updatedAt = p.dateDerniereRelance;
    relances.push(p.societe);
  }

  if (relances.length) await writeDb(db);
  return NextResponse.json({ ok: true, relances: relances.length, societes: relances });
}
