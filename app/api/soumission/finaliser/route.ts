import { NextRequest, NextResponse } from "next/server";
import { readDb, writeDb, findByToken } from "@/lib/db";
import { saveFile, slugify } from "@/lib/files";
import { mirrorToDrive } from "@/lib/google";
import {
  sendMail,
  tplConfirmationDepot,
  tplNotifDepot,
  MAIL_FROM,
} from "@/lib/mailer";
import { DOC_KEYS, fastcheckGlobal, piecesCompletes } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Étape 3 : clôture de la soumission une fois les 4 pièces déposées.
 * Statut selon fastcheck, liste d'équipe archivée en CSV, emails de
 * confirmation (prestataire) et de notification (administration@).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = String(body?.token || "");

  const db = await readDb();
  const p = findByToken(db, token);
  if (!p) return NextResponse.json({ error: "Soumission introuvable" }, { status: 404 });

  if (!piecesCompletes(p)) {
    const manquantes = DOC_KEYS.filter((k) => !p.pieces?.[k]);
    return NextResponse.json(
      { error: "Pièces manquantes", manquantes },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const ok = fastcheckGlobal(p);
  // On ne rétrograde jamais un dossier déjà validé / plan signé.
  if (["a_inviter", "en_attente", "recu_a_verifier", "recu_ok"].includes(p.statut)) {
    p.statut = ok ? "recu_ok" : "recu_a_verifier";
  }
  p.dateSoumission = now;
  p.updatedAt = now;

  // Archive de la liste nominative dans le dossier du prestataire.
  if (p.equipe?.length) {
    const csv = ["Prénom;Nom;Société"]
      .concat(p.equipe.map((m) => `${m.prenom};${m.nom};${m.societe}`))
      .join("\n");
    const buf = Buffer.from(csv, "utf-8");
    await saveFile(`${slugify(p.societe)}/equipe.csv`, buf, "text/csv");
    await mirrorToDrive(p, "equipe.csv", buf, "text/csv");
  }

  await writeDb(db);

  // Le plan de prévention est proposé dans la foulée si le document est prêt.
  const planDisponible = !!db.planDocument;
  const conf = tplConfirmationDepot(p, planDisponible);
  const envoi = await sendMail({ to: p.email, ...conf });
  const notif = tplNotifDepot(p, ok);
  await sendMail({ to: MAIL_FROM, ...notif });

  return NextResponse.json({
    ok: true,
    statut: p.statut,
    fastcheckOk: ok,
    planDisponible,
    emailsSimules: envoi.dryRun,
  });
}
