import type { Prestataire, TeamMember } from "./types";

/**
 * Applique les informations du formulaire à un prestataire (contact,
 * responsable, effectif, équipe). Appelée à la fois par /api/soumission et par
 * /api/soumission/finaliser : la finalisation la rejoue de façon autoritaire,
 * si bien qu'une lecture légèrement périmée du db.json ne peut pas faire perdre
 * ces champs (cohérence lecture-après-écriture du Blob).
 */
export function applyInfo(p: Prestataire, body: Record<string, unknown>): void {
  const societe = String(body.societe || p.societe || "").trim();
  if (!p.societe && societe) p.societe = societe;

  const email = String(body.email || "").trim().toLowerCase();
  if (email) p.email = email;

  p.contact = {
    prenom: String(body.contactPrenom || "").trim(),
    nom: String(body.contactNom || "").trim(),
    telephone: String(body.contactTelephone || "").trim(),
    email: email || p.contact?.email,
  };
  p.responsableSite = {
    prenom: String(body.responsablePrenom || "").trim(),
    nom: String(body.responsableNom || "").trim(),
    email: String(body.responsableEmail || "").trim(),
    telephone: String(body.responsableTelephone || "").trim(),
    societe: String(body.responsableSociete || societe).trim(),
  };

  const eff = Number.parseInt(String(body.effectifApprox ?? ""), 10);
  if (Number.isFinite(eff) && eff > 0) p.effectifApprox = eff;

  if (Array.isArray(body.equipe)) {
    p.equipe = (body.equipe as Record<string, unknown>[])
      .map((m) => ({
        prenom: String(m.prenom || "").trim(),
        nom: String(m.nom || "").trim(),
        societe: String(m.societe || societe).trim(),
      }))
      .filter((m: TeamMember) => m.nom || m.prenom);
  }
}
