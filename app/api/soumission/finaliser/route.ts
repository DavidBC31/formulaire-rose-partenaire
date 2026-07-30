import { NextRequest, NextResponse } from "next/server";
import { writeDb, readDbForToken } from "@/lib/db";
import { saveFile, slugify } from "@/lib/files";
import { applyInfo } from "@/lib/soumission";
import { mirrorToDrive, driveFolderFor } from "@/lib/google";
import {
  sendMail,
  tplConfirmationDepot,
  tplNotifDepot,
  MAIL_FROM,
} from "@/lib/mailer";
import {
  DOC_KEYS,
  fastcheckGlobal,
  piecesCompletes,
  type DocKey,
  type PieceInfo,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Finalisation : SEULE écriture du db.json pour une soumission. Applique en
 * une fois les pièces et le plan signé (déposés au préalable, métadonnées
 * transmises par le client), fixe le statut, archive l'équipe et notifie.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = String(body?.token || "");

  const { db, p } = await readDbForToken(token);
  if (!p) return NextResponse.json({ error: "Soumission introuvable" }, { status: 404 });

  // Réapplication autoritaire des infos (protège d'une lecture périmée).
  applyInfo(p, body);

  // Application des pièces transmises par le client (validées minimalement).
  const pieces: Partial<Record<DocKey, PieceInfo>> = {};
  for (const k of DOC_KEYS) {
    const piece = body?.pieces?.[k];
    if (piece && typeof piece.path === "string" && piece.fastcheck) {
      pieces[k] = {
        originalName: String(piece.originalName || `${k}.pdf`),
        path: String(piece.path),
        url: piece.url ? String(piece.url) : undefined,
        size: Number(piece.size) || 0,
        uploadedAt: String(piece.uploadedAt || new Date().toISOString()),
        fastcheck: piece.fastcheck,
      };
    }
  }
  p.pieces = { ...p.pieces, ...pieces };

  if (!piecesCompletes(p)) {
    const manquantes = DOC_KEYS.filter((k) => !p.pieces?.[k]);
    return NextResponse.json({ error: "Pièces manquantes", manquantes }, { status: 400 });
  }

  // Plan de prévention (si un document est en ligne) : attestation + plan signé.
  const planDisponible = !!db.planDocument;
  const planSigne = body?.planSigne;
  if (planSigne?.signePath) {
    p.plan = {
      ...p.plan,
      signePath: String(planSigne.signePath),
      signeUrl: planSigne.signeUrl ? String(planSigne.signeUrl) : undefined,
      signeNom: String(planSigne.signeNom || "plan-signe.pdf"),
    };
  }
  if (planDisponible && body?.attestePlan !== true)
    return NextResponse.json(
      { error: "Merci d'attester avoir pris connaissance du plan de prévention." },
      { status: 400 }
    );
  if (planDisponible && !p.plan?.signePath)
    return NextResponse.json(
      { error: "Merci de déposer le plan de prévention signé." },
      { status: 400 }
    );

  const now = new Date().toISOString();
  const ok = fastcheckGlobal(p);
  if (["a_inviter", "en_attente", "recu_a_verifier", "recu_ok"].includes(p.statut)) {
    p.statut = ok ? "recu_ok" : "recu_a_verifier";
  }
  p.dateSoumission = now;
  if (planDisponible) {
    p.plan = {
      ...p.plan,
      dateAttestation: now,
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnue",
    };
  }

  // Archive de la liste nominative + lien du dossier Drive.
  if (p.equipe?.length) {
    const csv = ["Prénom;Nom;Société"]
      .concat(p.equipe.map((m) => `${m.prenom};${m.nom};${m.societe}`))
      .join("\n");
    const buf = Buffer.from(csv, "utf-8");
    await saveFile(`${slugify(p.societe)}/equipe.csv`, buf, "text/csv");
    await mirrorToDrive({ societe: p.societe }, "equipe.csv", buf, "text/csv");
  }
  const folder = await driveFolderFor(p.societe);
  if (folder) {
    p.driveFolderId = folder.id;
    p.driveFolderUrl = folder.url;
  }

  p.updatedAt = now;
  await writeDb(db);

  const conf = tplConfirmationDepot(p);
  const envoi = await sendMail({ to: p.email, ...conf });
  await sendMail({ to: MAIL_FROM, ...tplNotifDepot(p, ok) });

  return NextResponse.json({
    ok: true,
    statut: p.statut,
    fastcheckOk: ok,
    emailsSimules: envoi.dryRun,
  });
}
