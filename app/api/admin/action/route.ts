import { NextRequest, NextResponse } from "next/server";
import { randomBytes, randomUUID } from "crypto";
import { isAdmin } from "@/lib/auth";
import { readDb, writeDb, findById } from "@/lib/db";
import {
  sendMail,
  tplInvitation,
  tplRelance,
  tplTest,
  MAIL_FROM,
} from "@/lib/mailer";
import { DOC_KEYS, fastcheckGlobal, piecesCompletes, type Prestataire } from "@/lib/types";
import { fastcheckPdf, normalizeText } from "@/lib/fastcheck";
import { readLocalFile } from "@/lib/files";
import { readInvitationRows } from "@/lib/google";

export const runtime = "nodejs";
export const maxDuration = 300;

type Action =
  | "inviter"
  | "relancer"
  | "valider"
  | "supprimer"
  | "recontroler"
  | "inviter_tous"
  | "relancer_tous"
  | "importer_sheet"
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

  if (action === "importer_sheet") {
    // Lit l'onglet « À inviter » du Google Sheet, crée les prestataires
    // manquants et envoie l'invitation à chacun (premier envoi via le Sheet).
    let lignes: { societe: string; email: string }[];
    try {
      lignes = await readInvitationRows();
    } catch (e) {
      return NextResponse.json(
        { error: `Lecture du Sheet impossible : ${e instanceof Error ? e.message : e}` },
        { status: 400 }
      );
    }
    const existants = new Set(db.prestataires.map((p) => normalizeText(p.societe)));
    const erreurs: string[] = [];
    let invites = 0;
    for (const { societe, email } of lignes) {
      if (!societe || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        erreurs.push(`Ligne ignorée : "${societe};${email}"`);
        continue;
      }
      let p = db.prestataires.find((x) => normalizeText(x.societe) === normalizeText(societe));
      if (!p) {
        p = {
          id: randomUUID(),
          societe,
          email: email.toLowerCase(),
          token: randomBytes(16).toString("hex"),
          statut: "a_inviter",
          createdAt: now,
          updatedAt: now,
        } satisfies Prestataire;
        db.prestataires.push(p);
        existants.add(normalizeText(societe));
      }
      // On (ré)invite uniquement les dossiers pas encore passés en réception.
      if (p.statut === "a_inviter" || p.statut === "en_attente") {
        await sendMail({ to: p.email, ...tplInvitation(p) });
        p.statut = "en_attente";
        p.dateInvitation = now;
        p.updatedAt = now;
        invites++;
      }
    }
    await writeDb(db);
    return NextResponse.json({ ok: true, invites, lignes: lignes.length, erreurs });
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
