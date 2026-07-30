export type DocKey = "kbis" | "urssaf" | "fiscale" | "rcpro";

export const DOC_KEYS: DocKey[] = ["kbis", "urssaf", "fiscale", "rcpro"];

export const DOC_LABELS: Record<DocKey, string> = {
  kbis: "Extrait KBIS (moins de 6 mois)",
  urssaf: "Attestation de vigilance URSSAF (moins de 6 mois)",
  fiscale: "Attestation fiscale (moins de 6 mois)",
  rcpro: "Attestation de responsabilité civile professionnelle (moins de 6 mois)",
};

export interface FastcheckResult {
  ok: boolean;
  textFound: boolean;
  score: number;
  tokensFound: string[];
  tokensMissing: string[];
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
