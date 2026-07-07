import { NextRequest, NextResponse } from "next/server";
import { readDb, writeDb, findByToken } from "@/lib/db";
import { saveFile, slugify } from "@/lib/files";
import { mirrorToDrive } from "@/lib/google";
import { sendMail, tplNotifSignature, MAIL_FROM } from "@/lib/mailer";

export const runtime = "nodejs";

// Signature possible dès le dépôt des pièces (même « à vérifier ») :
// elle n'attend pas le contrôle humain, qui reste tracé dans le suivi.
const STATUTS_PLAN = ["recu_ok", "recu_a_verifier", "valide", "plan_envoye"];

/**
 * Signature numérique du plan de prévention (Brique 2) :
 * case "J'accepte les modalités" + signature manuscrite (PNG),
 * horodatage et IP conservés comme éléments de preuve.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });

  const db = await readDb();
  const p = findByToken(db, token);
  if (!p) return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  if (p.plan?.dateSignature)
    return NextResponse.json({ error: "Plan déjà signé" }, { status: 400 });
  if (!STATUTS_PLAN.includes(p.statut))
    return NextResponse.json(
      { error: "Le plan sera disponible une fois vos pièces déposées" },
      { status: 400 }
    );
  if (!db.planDocument)
    return NextResponse.json({ error: "Document indisponible" }, { status: 400 });

  const signataire = String(body.signataire || "").trim();
  const fonction = String(body.fonction || "").trim();
  const accepte = body.accepte === true;
  const signature = String(body.signature || "");

  if (!accepte)
    return NextResponse.json({ error: "Vous devez accepter les modalités" }, { status: 400 });
  if (!signataire)
    return NextResponse.json({ error: "Le nom du signataire est requis" }, { status: 400 });
  const match = signature.match(/^data:image\/png;base64,(.+)$/);
  if (!match)
    return NextResponse.json({ error: "La signature manuscrite est requise" }, { status: 400 });

  const png = Buffer.from(match[1], "base64");
  if (png.length > 2 * 1024 * 1024)
    return NextResponse.json({ error: "Signature trop lourde" }, { status: 400 });

  const saved = await saveFile(`${slugify(p.societe)}/signature-plan-prevention.png`, png, "image/png");
  await mirrorToDrive(p, "signature-plan-prevention.png", png, "image/png");

  const now = new Date().toISOString();
  // Le statut « pièces » n'est pas écrasé tant que le contrôle humain n'a pas eu lieu.
  if (p.statut === "valide" || p.statut === "plan_envoye") p.statut = "plan_signe";
  p.plan = {
    ...p.plan,
    dateSignature: now,
    signataire,
    fonction,
    signaturePath: saved.path,
    signatureUrl: saved.url,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnue",
  };
  p.updatedAt = now;
  await writeDb(db);

  await sendMail({ to: MAIL_FROM, ...tplNotifSignature(p) });

  return NextResponse.json({ ok: true, dateSignature: now });
}
