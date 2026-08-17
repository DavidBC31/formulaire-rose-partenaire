import type { Prestataire, TeamMember } from "./types";
import { normalizeText, significantTokens } from "./fastcheck";

/** Clé « nom sans forme juridique » (SAS/SARL…) pour rattacher malgré les
 * variantes d'écriture : « SAS KSP Events » ≈ « KSP Events ». */
function sigKey(societe: string): string {
  return significantTokens(societe || "").slice().sort().join(" ");
}

/**
 * Retrouve le prestataire correspondant à une soumission, du signal le plus
 * fiable au plus souple : token du lien > email exact > nom exact > nom sans
 * forme juridique. Évite les doublons quand le prestataire tape son nom ou son
 * email différemment de la liste (lien générique, sans token personnel).
 */
export function matchPrestataire(
  prestataires: Prestataire[],
  q: { token?: string; societe?: string; email?: string }
): Prestataire | undefined {
  const token = String(q.token || "");
  if (token) {
    const byToken = prestataires.find((p) => p.token === token);
    if (byToken) return byToken;
  }
  const email = String(q.email || "").trim().toLowerCase();
  if (email) {
    const byEmail = prestataires.find((p) => (p.email || "").toLowerCase() === email);
    if (byEmail) return byEmail;
  }
  const norm = normalizeText(q.societe || "");
  if (norm) {
    const byName = prestataires.find((p) => normalizeText(p.societe) === norm);
    if (byName) return byName;
    const key = sigKey(q.societe || "");
    if (key) {
      const bySig = prestataires.find((p) => sigKey(p.societe) === key);
      if (bySig) return bySig;
    }
  }
  return undefined;
}

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
