import type { Prestataire } from "./types";

/**
 * Tous les emails partent de administration@rosefestival.fr (décision actée CDC).
 * Sans configuration SMTP, le mailer fonctionne en mode "dry-run" :
 * l'email est loggé mais pas envoyé (utile en dev / recette).
 */

export const MAIL_FROM =
  process.env.MAIL_FROM || "administration@rosefestival.fr";

export function appUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

export function isMailConfigured(): boolean {
  return !!process.env.SMTP_HOST;
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ sent: boolean; dryRun: boolean }> {
  if (!isMailConfigured()) {
    console.log(
      `[MAIL DRY-RUN] de:${MAIL_FROM} à:${opts.to} sujet:"${opts.subject}"`
    );
    return { sent: true, dryRun: true };
  }
  const nodemailer = (await import("nodemailer")).default;
  const port = Number(process.env.SMTP_PORT || 587);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  await transporter.sendMail({
    from: `"Rose Festival" <${MAIL_FROM}>`,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
  return { sent: true, dryRun: false };
}

/* ------------------------------ Templates ------------------------------ */

function layout(titre: string, corps: string): string {
  return `
  <div style="font-family:Helvetica,Arial,sans-serif;background:#FFB0D8;padding:24px">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:2px solid #000;border-radius:12px;overflow:hidden">
      <div style="background:#000;color:#FFB0D8;padding:16px 24px;font-size:18px;font-weight:800;letter-spacing:1px;text-transform:uppercase">
        ★ Rose Festival — ${titre}
      </div>
      <div style="padding:24px;color:#111;font-size:15px;line-height:1.6">${corps}</div>
      <div style="background:#FFB0D8;border-top:2px solid #000;padding:12px 24px;font-size:12px;color:#000">
        Rose Festival · Toulouse MEETT · administration@rosefestival.fr
      </div>
    </div>
  </div>`;
}

function bouton(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${href}" style="background:#000;color:#FFB0D8;text-decoration:none;padding:12px 28px;border-radius:999px;font-weight:800;text-transform:uppercase;letter-spacing:1px">${label}</a></p>`;
}

export function tplInvitation(p: Prestataire): { subject: string; html: string } {
  const lien = `${appUrl()}/?t=${p.token}`;
  return {
    subject: "Rose Festival — Dépôt de vos pièces administratives",
    html: layout(
      "Pièces prestataires",
      `<p>Bonjour,</p>
       <p>Dans le cadre de votre intervention sur le <strong>Rose Festival</strong> (27, 28, 29 août — Toulouse MEETT),
       merci de nous transmettre les pièces administratives obligatoires pour <strong>${p.societe}</strong> :</p>
       <ul>
         <li>Extrait KBIS</li>
         <li>Attestation de vigilance URSSAF</li>
         <li>Attestation fiscale de moins de 6 mois</li>
         <li>Attestation de responsabilité civile professionnelle</li>
         <li>Liste nominative de votre équipe présente sur site</li>
       </ul>
       ${bouton(lien, "Déposer mes pièces")}
       <p style="font-size:13px;color:#555">Ce lien est personnel à votre société. En cas de question :
       <a href="mailto:administration@rosefestival.fr">administration@rosefestival.fr</a></p>`
    ),
  };
}

export function tplRelance(p: Prestataire): { subject: string; html: string } {
  const lien = `${appUrl()}/?t=${p.token}`;
  return {
    subject: "Rappel — Rose Festival : vos pièces administratives sont attendues",
    html: layout(
      "Relance",
      `<p>Bonjour,</p>
       <p>Sauf erreur de notre part, nous n'avons pas encore reçu les pièces administratives de
       <strong>${p.societe}</strong> pour le Rose Festival. Elles sont <strong>obligatoires avant toute
       intervention sur site</strong>.</p>
       ${bouton(lien, "Déposer mes pièces")}
       <p style="font-size:13px;color:#555">Vous recevrez une relance chaque semaine jusqu'à réception des pièces.</p>`
    ),
  };
}

export function tplConfirmationDepot(p: Prestataire): { subject: string; html: string } {
  return {
    subject: "Rose Festival — Vos pièces ont bien été reçues",
    html: layout(
      "Confirmation",
      `<p>Bonjour,</p>
       <p>Nous confirmons la bonne réception des pièces administratives de <strong>${p.societe}</strong>.
       Elles vont être contrôlées par notre équipe ; nous reviendrons vers vous si un document doit être complété.</p>
       <p>Merci, et à très vite au Rose Festival !</p>`
    ),
  };
}

export function tplNotifDepot(p: Prestataire, fastcheckOk: boolean): { subject: string; html: string } {
  return {
    subject: `[Formulaire] Pièces reçues — ${p.societe} ${fastcheckOk ? "(fastcheck OK)" : "(à vérifier)"}`,
    html: layout(
      "Nouvelle soumission",
      `<p><strong>${p.societe}</strong> a déposé ses pièces.</p>
       <p>Fastcheck : ${fastcheckOk ? "✅ cohérent" : "⚠️ incohérences détectées — vérification manuelle requise"}.</p>
       ${bouton(`${appUrl()}/admin`, "Ouvrir le suivi")}`
    ),
  };
}

export function tplPlanPrevention(p: Prestataire): { subject: string; html: string } {
  const lien = `${appUrl()}/plan/${p.token}`;
  return {
    subject: "Rose Festival — Plan de prévention à signer",
    html: layout(
      "Plan de prévention",
      `<p>Bonjour,</p>
       <p>Les pièces administratives de <strong>${p.societe}</strong> ont été validées ✅.</p>
       <p>Dernière étape avant votre intervention : consulter le <strong>plan de prévention</strong> du
       Rose Festival et le signer électroniquement.</p>
       ${bouton(lien, "Consulter et signer")}`
    ),
  };
}

export function tplNotifSignature(p: Prestataire): { subject: string; html: string } {
  return {
    subject: `[Formulaire] Plan de prévention signé — ${p.societe}`,
    html: layout(
      "Plan signé",
      `<p><strong>${p.societe}</strong> a accepté les modalités et signé le plan de prévention
       (signataire : ${p.plan?.signataire || "?"}).</p>
       ${bouton(`${appUrl()}/admin`, "Ouvrir le suivi")}`
    ),
  };
}
