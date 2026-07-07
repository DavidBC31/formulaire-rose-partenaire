import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { readDb, writeDb, findById } from "@/lib/db";
import {
  sendMail,
  tplInvitation,
  tplRelance,
  tplPlanPrevention,
} from "@/lib/mailer";
import { piecesCompletes } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

type Action =
  | "inviter"
  | "relancer"
  | "valider"
  | "envoyer_plan"
  | "supprimer"
  | "inviter_tous"
  | "relancer_tous";

/** Actions admin sur un dossier (ou en masse pour *_tous). */
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const action = body?.action as Action;
  const db = await readDb();
  const now = new Date().toISOString();

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
      // Décision actée CDC : envoi conditionné à la validation des pièces.
      if (p.statut !== "valide" && p.statut !== "plan_envoye")
        return NextResponse.json(
          { error: "Le plan ne peut être envoyé qu'après validation des pièces" },
          { status: 400 }
        );
      if (!db.planDocument)
        return NextResponse.json(
          { error: "Aucun plan de prévention n'a été déposé (voir Réglages)" },
          { status: 400 }
        );
      await sendMail({ to: p.email, ...tplPlanPrevention(p) });
      p.statut = "plan_envoye";
      p.plan = { ...p.plan, dateEnvoi: now };
      break;
    }
    case "supprimer": {
      db.prestataires = db.prestataires.filter((x) => x.id !== p.id);
      await writeDb(db);
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  }

  p.updatedAt = now;
  await writeDb(db);
  return NextResponse.json({ ok: true, statut: p.statut });
}
