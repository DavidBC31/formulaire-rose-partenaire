import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { readDb, writeDb, findById } from "@/lib/db";
import {
  sendMail,
  tplInvitation,
  tplRelance,
  tplPlanPrevention,
  tplTest,
  MAIL_FROM,
} from "@/lib/mailer";
import { DOC_KEYS, fastcheckGlobal, piecesCompletes } from "@/lib/types";
import { fastcheckPdf } from "@/lib/fastcheck";
import { readLocalFile } from "@/lib/files";

export const runtime = "nodejs";
export const maxDuration = 120;

type Action =
  | "inviter"
  | "relancer"
  | "valider"
  | "envoyer_plan"
  | "supprimer"
  | "recontroler"
  | "inviter_tous"
  | "relancer_tous"
  | "email_test";

/** Actions admin sur un dossier (ou en masse pour *_tous). */
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const action = body?.action as Action;
  const db = await readDb();
  const now = new Date().toISOString();

  if (action === "email_test") {
    const to = String(body?.email || "").trim() || MAIL_FROM;
    const res = await sendMail({ to, ...tplTest() });
    return NextResponse.json({ ok: true, dryRun: res.dryRun, to });
  }

  if (action === "inviter_tous" || action === "relancer_tous") {
    const cibles = db.prestataires.filter((p) =>
      action === "inviter_tous" ? p.statut === "a_inviter" : p.statut === "en_attente"
    );
    for (const p of cibles) {
      const tpl = action === "inviter_tous" ? tplInvitation(p) : tplRelance(p);
      await sendMail({ to: p.email, ...tpl });
      if (action === "inviter_tous") {
        p.statut = "en_attente";
        p.dateInvitation = now;
      } else {
        p.dateDerniereRelance = now;
      }
      p.updatedAt = now;
    }
    await writeDb(db);
    return NextResponse.json({ ok: true, traites: cibles.length });
  }

  const p = findById(db, String(body?.id || ""));
  if (!p) return NextResponse.json({ error: "Prestataire introuvable" }, { status: 404 });

  switch (action) {
    case "inviter": {
      await sendMail({ to: p.email, ...tplInvitation(p) });
      if (p.statut === "a_inviter") p.statut = "en_attente";
      p.dateInvitation = now;
      break;
    }
    case "relancer": {
      await sendMail({ to: p.email, ...tplRelance(p) });
      p.dateDerniereRelance = now;
      break;
    }
    case "valider": {
      if (!piecesCompletes(p))
        return NextResponse.json(
          { error: "Impossible de valider : pièces incomplètes" },
          { status: 400 }
        );
      p.statut = "valide";
      break;
    }
    case "envoyer_plan": {
      // Envoi possible dès le dépôt des pièces (lecture + signature dans la
      // foulée) ; le contrôle humain reste tracé via le statut « à vérifier ».
      if (!["recu_ok", "recu_a_verifier", "valide", "plan_envoye"].includes(p.statut))
        return NextResponse.json(
          { error: "Le plan ne peut être envoyé qu'une fois les pièces déposées" },
          { status: 400 }
        );
      if (!db.planDocument)
        return NextResponse.json(
          { error: "Aucun plan de prévention n'a été déposé (voir la barre d'outils)" },
          { status: 400 }
        );
      await sendMail({ to: p.email, ...tplPlanPrevention(p) });
      if (p.statut === "valide") p.statut = "plan_envoye";
      p.plan = { ...p.plan, dateEnvoi: now };
      break;
    }
    case "supprimer": {
      db.prestataires = db.prestataires.filter((x) => x.id !== p.id);
      await writeDb(db);
      return NextResponse.json({ ok: true });
    }
    case "recontroler": {
      // Rejoue le fastcheck sur les pièces déjà stockées (utile après une
      // évolution du contrôle : pas besoin de redemander les fichiers).
      let recontroles = 0;
      for (const key of DOC_KEYS) {
        const piece = p.pieces?.[key];
        if (!piece) continue;
        let buf: Buffer | null = null;
        if (piece.url) {
          const res = await fetch(piece.url, { cache: "no-store" });
          if (res.ok) buf = Buffer.from(await res.arrayBuffer());
        } else {
          buf = await readLocalFile(piece.path);
        }
        if (!buf) continue;
        piece.fastcheck = await fastcheckPdf(buf, p.societe);
        recontroles++;
      }
      if (piecesCompletes(p) && ["recu_ok", "recu_a_verifier"].includes(p.statut)) {
        p.statut = fastcheckGlobal(p) ? "recu_ok" : "recu_a_verifier";
      }
      p.updatedAt = now;
      await writeDb(db);
      return NextResponse.json({ ok: true, recontroles, statut: p.statut });
    }
    default:
      return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  }

  p.updatedAt = now;
  await writeDb(db);
  return NextResponse.json({ ok: true, statut: p.statut });
}
