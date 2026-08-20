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
import { DOC_KEYS, fastcheckGlobal, piecesCompletes, type DocKey, type Prestataire } from "@/lib/types";
import {
  fastcheckPdf,
  pdfText,
  evaluer,
  classifyDocType,
  significantTokens,
  normalizeText,
} from "@/lib/fastcheck";
import { matchPrestataire } from "@/lib/soumission";
import { readLocalFile, saveFile, slugify, isPdf } from "@/lib/files";
import {
  readInvitationRows,
  readDiffusionRows,
  ocrPdf,
  isDriveConfigured,
  driveFolderFor,
  listDriveFolders,
  listDriveFiles,
  downloadDriveFile,
} from "@/lib/google";

export const runtime = "nodejs";
export const maxDuration = 300;

type Action =
  | "inviter"
  | "relancer"
  | "valider"
  | "supprimer"
  | "recontroler"
  | "recontroler_tous"
  | "inviter_tous"
  | "relancer_tous"
  | "importer_sheet"
  | "importer_liste"
  | "fusionner"
  | "renommer"
  | "sync_drive"
  | "check_drive"
  | "email_test";

const ORDRE_STATUT = ["a_inviter", "en_attente", "recu_a_verifier", "recu_ok", "valide"];

/** Jour calendaire (Europe/Paris) d'une date ISO, pour comparer « même jour ». */
const jourParis = (d: Date) =>
  new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(d);

/** Rejoue le fastcheck sur les pièces déjà stockées d'un dossier (récupère le
 * fichier depuis le Blob/local). Retourne le nombre de pièces recontrôlées. */
async function recontrolerDossier(p: Prestataire, now: string): Promise<number> {
  let n = 0;
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
    // Recontrôle : repli OCR (Google Drive) si le PDF est scanné/illisible.
    piece.fastcheck = await fastcheckPdf(buf, p.societe, ocrPdf);
    n++;
  }
  if (piecesCompletes(p) && ["recu_ok", "recu_a_verifier"].includes(p.statut)) {
    p.statut = fastcheckGlobal(p) ? "recu_ok" : "recu_a_verifier";
  }
  p.updatedAt = now;
  return n;
}

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

  if (action === "sync_drive") {
    // Crée (ou relie) le dossier Drive de chaque prestataire qui n'en a pas.
    // Relie d'abord les dossiers déjà présents (par nom), crée les manquants.
    if (!isDriveConfigured())
      return NextResponse.json({ error: "Google Drive non configuré." }, { status: 400 });
    const existants = await listDriveFolders();
    const parNom = new Map(existants.map((f) => [normalizeText(f.name), f]));
    let crees = 0;
    let lies = 0;
    for (const p of db.prestataires) {
      if (p.driveFolderId) continue;
      const found = parNom.get(normalizeText(p.societe));
      if (found) {
        p.driveFolderId = found.id;
        p.driveFolderUrl = `https://drive.google.com/drive/folders/${found.id}`;
        lies++;
      } else {
        const folder = await driveFolderFor(p.societe);
        if (!folder) continue;
        p.driveFolderId = folder.id;
        p.driveFolderUrl = folder.url;
        parNom.set(normalizeText(p.societe), { id: folder.id, name: p.societe });
        crees++;
      }
      p.updatedAt = now;
    }
    if (crees || lies) await writeDb(db);
    return NextResponse.json({ ok: true, total: db.prestataires.length, crees, lies });
  }

  if (action === "importer_liste") {
    // Charge la liste de diffusion (prestataires déjà invités par email de
    // l'équipe) comme « en attente », SANS renvoyer d'email et sans doublon.
    // Démarre le compteur de relances automatiques du lundi.
    let lignes: { societe: string; email: string }[];
    try {
      lignes = await readDiffusionRows();
    } catch (e) {
      return NextResponse.json(
        { error: `Lecture de la liste impossible : ${e instanceof Error ? e.message : e}` },
        { status: 400 }
      );
    }
    let crees = 0;
    let demarres = 0;
    for (const { societe, email } of lignes) {
      const p = matchPrestataire(db.prestataires, { societe, email });
      if (!p) {
        db.prestataires.push({
          id: randomUUID(),
          societe,
          email: email.toLowerCase(),
          token: randomBytes(16).toString("hex"),
          statut: "en_attente",
          dateInvitation: now,
          createdAt: now,
          updatedAt: now,
        } satisfies Prestataire);
        crees++;
      } else if (p.statut === "a_inviter" || (p.statut === "en_attente" && !p.dateInvitation)) {
        // Dossier déjà là mais pas encore « invité » : on démarre les relances.
        p.statut = "en_attente";
        if (!p.dateInvitation) p.dateInvitation = now;
        p.updatedAt = now;
        demarres++;
      }
    }
    await writeDb(db);
    return NextResponse.json({ ok: true, total: lignes.length, crees, demarres });
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

  if (action === "recontroler_tous") {
    const cibles = db.prestataires.filter((x) => x.pieces && Object.keys(x.pieces).length > 0);
    let pieces = 0;
    for (const x of cibles) pieces += await recontrolerDossier(x, now);
    await writeDb(db);
    return NextResponse.json({ ok: true, dossiers: cibles.length, pieces });
  }

  if (action === "inviter_tous" || action === "relancer_tous") {
    const cibles = db.prestataires.filter((p) => {
      if (action === "inviter_tous") return p.statut === "a_inviter";
      if (p.statut !== "en_attente") return false;
      // relancer_tous : saute ceux déjà relancés aujourd'hui (évite les doublons).
      return !(
        p.dateDerniereRelance &&
        jourParis(new Date(p.dateDerniereRelance)) === jourParis(new Date(now))
      );
    });
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
      if (
        p.dateDerniereRelance &&
        jourParis(new Date(p.dateDerniereRelance)) === jourParis(new Date(now))
      )
        return NextResponse.json(
          { error: "Ce prestataire a déjà été relancé aujourd'hui." },
          { status: 409 }
        );
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
    case "fusionner": {
      // Fusionne CE dossier (p, source) dans le dossier cible (conservé) :
      // la cible garde ses valeurs et se complète avec celles de la source ;
      // union des pièces ; statut le plus avancé. La source est supprimée.
      const cible = findById(db, String(body?.cibleId || ""));
      if (!cible || cible.id === p.id)
        return NextResponse.json({ error: "Dossier cible invalide" }, { status: 400 });

      cible.pieces = cible.pieces || {};
      for (const k of DOC_KEYS) {
        if (!cible.pieces[k] && p.pieces?.[k]) cible.pieces[k] = p.pieces[k];
      }
      if (!(cible.contact?.nom || cible.contact?.prenom) && p.contact) cible.contact = p.contact;
      if (!cible.responsableSite?.nom && p.responsableSite) cible.responsableSite = p.responsableSite;
      if (!cible.effectifApprox && p.effectifApprox) cible.effectifApprox = p.effectifApprox;
      if (!cible.equipe?.length && p.equipe?.length) cible.equipe = p.equipe;
      if (!cible.dateSoumission && p.dateSoumission) cible.dateSoumission = p.dateSoumission;
      if (!cible.plan?.signePath && !cible.plan?.dateAttestation && p.plan)
        cible.plan = { ...cible.plan, ...p.plan };
      if (!cible.dateInvitation && p.dateInvitation) cible.dateInvitation = p.dateInvitation;
      if (!cible.driveFolderId && p.driveFolderId) {
        cible.driveFolderId = p.driveFolderId;
        cible.driveFolderUrl = p.driveFolderUrl;
      }
      if (ORDRE_STATUT.indexOf(p.statut) > ORDRE_STATUT.indexOf(cible.statut))
        cible.statut = p.statut;
      cible.updatedAt = now;

      db.prestataires = db.prestataires.filter((x) => x.id !== p.id);
      await writeDb(db);
      return NextResponse.json({ ok: true, cible: cible.societe });
    }
    case "recontroler": {
      const recontroles = await recontrolerDossier(p, now);
      await writeDb(db);
      return NextResponse.json({ ok: true, recontroles, statut: p.statut });
    }
    case "check_drive": {
      // Lit les PDF déposés dans le dossier Drive du prestataire (pièces reçues
      // par email et classées à la main), les classe par type, fait le
      // fastcheck (avec OCR), et valide le dossier si les 4 pièces sont là et
      // cohérentes. Cœur du flux « traitement des PJ hors formulaire ».
      if (!isDriveConfigured())
        return NextResponse.json({ error: "Google Drive non configuré." }, { status: 400 });
      if (!p.driveFolderId) {
        const folder = await driveFolderFor(p.societe);
        if (!folder)
          return NextResponse.json({ error: "Dossier Drive introuvable." }, { status: 400 });
        p.driveFolderId = folder.id;
        p.driveFolderUrl = folder.url;
      }
      const fichiers = await listDriveFiles(p.driveFolderId);
      const pdfs = fichiers.filter(
        (f) => f.mimeType === "application/pdf" || /\.pdf$/i.test(f.name)
      );
      p.pieces = p.pieces || {};
      const tokens = significantTokens(p.societe);
      const classes: string[] = [];
      const nonClasses: string[] = [];
      const prises = new Set<DocKey>();
      for (const f of pdfs) {
        const buf = await downloadDriveFile(f.id);
        if (!isPdf(buf)) {
          nonClasses.push(`${f.name} (pas un PDF)`);
          continue;
        }
        const { text, viaOcr } = await pdfText(buf, ocrPdf);
        const key = classifyDocType(f.name, text);
        if (!key) {
          nonClasses.push(`${f.name} (type indéterminé)`);
          continue;
        }
        if (prises.has(key)) {
          nonClasses.push(`${f.name} (déjà un ${key})`);
          continue;
        }
        const fastcheck = evaluer(text, tokens);
        if (viaOcr) fastcheck.viaOcr = true;
        const saved = await saveFile(`${slugify(p.societe)}/${key}.pdf`, buf, "application/pdf");
        p.pieces[key] = {
          originalName: f.name,
          path: saved.path,
          url: saved.url,
          size: buf.length,
          uploadedAt: now,
          fastcheck,
        };
        prises.add(key);
        classes.push(`${key} ${fastcheck.ok ? "✓" : "⚠"}`);
      }
      if (piecesCompletes(p)) {
        p.statut = fastcheckGlobal(p) ? "valide" : "recu_a_verifier";
      } else if (prises.size > 0 && p.statut === "en_attente") {
        p.statut = "recu_a_verifier";
      }
      if (prises.size > 0 && !p.dateSoumission) p.dateSoumission = now;
      p.updatedAt = now;
      await writeDb(db);
      return NextResponse.json({
        ok: true,
        total: pdfs.length,
        classes,
        nonClasses,
        complete: piecesCompletes(p),
        statut: p.statut,
      });
    }
    case "renommer": {
      const nouveauNom = String(body?.societe || "").trim();
      if (!nouveauNom)
        return NextResponse.json({ error: "Le nouveau nom est vide." }, { status: 400 });
      p.societe = nouveauNom;
      // Le nom sert de référence au fastcheck : on rejoue le contrôle sur les
      // pièces déjà déposées pour rafraîchir le ⚠ immédiatement.
      let recontroles = 0;
      if (p.pieces && Object.keys(p.pieces).length > 0)
        recontroles = await recontrolerDossier(p, now);
      p.updatedAt = now;
      await writeDb(db);
      return NextResponse.json({ ok: true, societe: p.societe, recontroles, statut: p.statut });
    }
    default:
      return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  }

  p.updatedAt = now;
  await writeDb(db);
  return NextResponse.json({ ok: true, statut: p.statut });
}
