import { NextRequest, NextResponse } from "next/server";
import { sendMail, tplAlerteEchec, MAIL_FROM } from "@/lib/mailer";

export const runtime = "nodejs";

/**
 * Alerte l'équipe (administration@) quand une soumission échoue en cours
 * (upload d'une pièce ou finalisation) — pour ne plus avoir d'échec silencieux.
 * Appelé en « fire and forget » par le formulaire depuis son bloc catch.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const info = {
    societe: String(body?.societe || "").trim().slice(0, 120),
    email: String(body?.email || "").trim().slice(0, 120),
    erreur: String(body?.erreur || "").trim().slice(0, 300),
  };
  try {
    await sendMail({ to: MAIL_FROM, ...tplAlerteEchec(info) });
  } catch (e) {
    console.error("[ECHEC] alerte non envoyée :", e);
  }
  return NextResponse.json({ ok: true });
}
