export type DocKey = "kbis" | "urssaf" | "fiscale" | "rcpro";

export const DOC_KEYS: DocKey[] = ["kbis", "urssaf", "fiscale", "rcpro"];

export const DOC_LABELS: Record<DocKey, string> = {
  kbis: "Extrait KBIS (moins de 6 mois)",
  urssaf: "Attestation de vigilance URSSAF (moins de 6 mois)",
  fiscale: "Attestation fiscale (moins de 6 mois)",
  rcpro: "Attestation de responsabilité civile professionnelle (moins de 6 mois)",
};

export interface FastcheckResult {
  ok: boolean; // global : nom cohérent ET date dans la période
  textFound: boolean;
  score: number;
  tokensFound: string[];
  tokensMissing: string[];
  // Contrôle du nom (champs optionnels : absents des anciens contrôles).
  nameOk?: boolean;
  // Contrôle de la date du document (doit tomber dans la fenêtre acceptée).
  dateOk?: boolean;
  dateStatus?: "ok" | "hors_periode" | "aucune";
  datesTrouvees?: string[]; // ISO (aaaa-mm-jj), pour information
}

export interface PieceInfo {
  originalName: string;
  path: string;
  url?: string;
  size: number;
  uploadedAt: string;
  fastcheck: FastcheckResult;
}

export interface TeamMember {
  prenom: string;
  nom: string;
  societe: string;
}

export type Statut =
  | "a_inviter"
  | "en_attente"
  | "recu_a_verifier"
  | "recu_ok"
  | "valide";

export const STATUT_LABELS: Record<Statut, string> = {
  a_inviter: "À inviter",
  en_attente: "En attente",
  recu_a_verifier: "Reçu — à vérifier",
  recu_ok: "Reçu — fastcheck OK",
  valide: "Pièces validées",
};

export interface Prestataire {
  id: string;
  societe: string;
  email: string;
  token: string;
  statut: Statut;
  contact?: {
    prenom?: string;
    nom?: string;
    telephone?: string;
    email?: string;
  };
  responsableSite?: {
    prenom?: string;
    nom?: string;
    email?: string;
    telephone?: string;
    societe?: string;
  };
  effectifApprox?: number;
  equipe?: TeamMember[];
  pieces?: Partial<Record<DocKey, PieceInfo>>;
  dateInvitation?: string;
  dateSoumission?: string;
  dateDerniereRelance?: string;
  driveFolderId?: string;
  driveFolderUrl?: string;
  // Plan de prévention : case « pris connaissance » (dateAttestation) + dépôt
  // du plan signé par le prestataire (signePath/signeUrl).
  plan?: {
    dateAttestation?: string;
    ip?: string;
    signePath?: string;
    signeUrl?: string;
    signeNom?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface PlanDocument {
  path: string;
  url?: string;
  originalName: string;
  uploadedAt: string;
}

export interface Db {
  prestataires: Prestataire[];
  planDocument?: PlanDocument;
}

export function piecesCompletes(p: Prestataire): boolean {
  return DOC_KEYS.every((k) => p.pieces?.[k]);
}

export function fastcheckGlobal(p: Prestataire): boolean {
  return DOC_KEYS.every((k) => p.pieces?.[k]?.fastcheck.ok);
}

export const DOC_PERIODE = "27/02/2026";

/** Résumé lisible d'un contrôle (nom + date), tolérant aux anciens contrôles. */
export function fastcheckResume(fc: FastcheckResult): string {
  if (!fc.textFound) return "PDF scanné / illisible — contrôle manuel";
  const pbs: string[] = [];
  const nameOk = fc.nameOk ?? fc.ok;
  if (!nameOk)
    pbs.push(
      `nom absent du document${fc.tokensMissing?.length ? ` (manque : ${fc.tokensMissing.join(", ")})` : ""}`
    );
  if (fc.dateStatus === "hors_periode")
    pbs.push(
      `document trop ancien (aucune date ≥ ${DOC_PERIODE})${fc.datesTrouvees?.length ? ` — vue(s) : ${fc.datesTrouvees.join(", ")}` : ""}`
    );
  else if (fc.dateStatus === "aucune") pbs.push("aucune date lisible");
  return pbs.length ? pbs.join(" · ") : "nom présent et date valide";
}

/**
 * Dossier « en attente » dont le prestataire a commencé le formulaire (infos
 * saisies ou pièces partielles) mais sans finaliser — à distinguer d'un simple
 * invité qui n'a encore rien touché.
 */
export function formulaireCommence(p: Prestataire): boolean {
  if (p.statut !== "en_attente") return false;
  return !!(
    p.contact?.nom ||
    p.contact?.prenom ||
    p.responsableSite?.nom ||
    p.effectifApprox ||
    (p.pieces && Object.keys(p.pieces).length > 0)
  );
}
