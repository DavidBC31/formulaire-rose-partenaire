import type { FastcheckResult } from "./types";

/**
 * Fastcheck : vérifie que le nom du prestataire figure bien dans le texte
 * de chaque pièce déposée (contrôle de cohérence documentaire du CDC).
 */

const FORMES_JURIDIQUES = new Set([
  "sarl", "sas", "sasu", "eurl", "sa", "sci", "snc", "scop", "scic",
  "ei", "eirl", "sel", "selarl", "gie", "asso", "association",
  "societe", "ste", "ets", "etablissements", "cie", "compagnie",
  "groupe", "group", "france", "les", "des", "the", "and",
]);

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tokens significatifs du nom de société (hors formes juridiques et mots vides). */
export function significantTokens(societe: string): string[] {
  const tokens = normalizeText(societe)
    .split(" ")
    .filter((t) => t.length >= 2 && !FORMES_JURIDIQUES.has(t));
  // Si tout a été filtré (ex. société nommée "SAS"), on garde les tokens bruts.
  return tokens.length > 0 ? tokens : normalizeText(societe).split(" ").filter(Boolean);
}

// Validité des documents : le doc doit être « récent ou valable pour le
// festival » = porter au moins une date ≥ 6 mois avant le festival
// (27/02/2026). Borne haute = fin 2027 : accepte les dates de validité qui
// courent au-delà du festival (RC pro/assurances annuelles) tout en excluant
// les dates aberrantes mal lues (ex. 2086, 2124).
export const DOC_DATE_MIN = Date.UTC(2026, 1, 27); // 27/02/2026 (6 mois avant)
export const DOC_DATE_MAX = Date.UTC(2027, 11, 31); // borne haute plausible
export const DOC_PERIODE_LABEL = "à partir du 27/02/2026";

const MOIS = "janvier fevrier mars avril mai juin juillet aout septembre octobre novembre decembre".split(" ");

/** Extrait les dates plausibles d'un texte (formats JJ/MM/AAAA et « 1er juin 2025 »). */
export function extraireDates(raw: string): number[] {
  const t = raw.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const out: number[] = [];
  const push = (y: number, m: number, d: number) => {
    if (m < 0 || m > 11 || d < 1 || d > 31 || y < 2000 || y > 2100) return;
    const ts = Date.UTC(y, m, d);
    const dt = new Date(ts);
    if (dt.getUTCFullYear() === y && dt.getUTCMonth() === m && dt.getUTCDate() === d) out.push(ts);
  };
  for (const m of t.matchAll(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b/g))
    push(+m[3], +m[2] - 1, +m[1]);
  for (const m of t.matchAll(/\b(\d{1,2})(?:er)?\s+([a-zûùé]+)\s+(\d{4})\b/g)) {
    const mo = MOIS.indexOf(m[2]);
    if (mo >= 0) push(+m[3], mo, +m[1]);
  }
  return out;
}

export async function fastcheckPdf(
  buffer: Buffer,
  societe: string
): Promise<FastcheckResult> {
  const tokens = significantTokens(societe);
  let text = "";
  let raw = "";
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      raw = result.text || "";
      text = normalizeText(raw);
    } finally {
      await parser.destroy();
    }
  } catch (e) {
    // Ne jamais avaler l'erreur : c'est la seule trace en prod (logs Vercel).
    console.error("[FASTCHECK] extraction du texte PDF impossible :", e);
  }

  // PDF scanné / illisible : pas de texte exploitable → vérification humaine.
  if (text.length < 20) {
    return {
      ok: false,
      textFound: false,
      score: 0,
      tokensFound: [],
      tokensMissing: tokens,
      nameOk: false,
      dateOk: false,
      dateStatus: "aucune",
      datesTrouvees: [],
    };
  }

  // Tolérances : texte sans espaces (mots coupés par l'extraction) et
  // singulier/pluriel (dernier caractère facultatif pour les tokens longs).
  const compact = text.replace(/ /g, "");
  const matche = (t: string): boolean => {
    if (text.includes(t) || compact.includes(t)) return true;
    if (t.length > 4) {
      const sing = t.slice(0, -1);
      return text.includes(sing) || compact.includes(sing);
    }
    return false;
  };

  const tokensFound = tokens.filter(matche);
  const tokensMissing = tokens.filter((t) => !tokensFound.includes(t));
  const score = tokens.length ? tokensFound.length / tokens.length : 0;
  // Cohérent si au moins la moitié des mots significatifs du nom figurent
  // dans le document (et au moins un).
  const nameOk = tokensFound.length > 0 && score >= 0.5;

  // Contrôle de la date : au moins une date du document doit tomber dans la
  // période acceptée (les dates aberrantes tombent d'elles-mêmes hors fenêtre).
  const dates = extraireDates(raw);
  const dateStatus: FastcheckResult["dateStatus"] =
    dates.length === 0
      ? "aucune"
      : dates.some((d) => d >= DOC_DATE_MIN && d <= DOC_DATE_MAX)
        ? "ok"
        : "hors_periode";
  const dateOk = dateStatus === "ok";

  return {
    ok: nameOk && dateOk,
    textFound: true,
    score,
    tokensFound,
    tokensMissing,
    nameOk,
    dateOk,
    dateStatus,
    datesTrouvees: [...new Set(dates)]
      .sort((a, b) => b - a)
      .slice(0, 6)
      .map((ts) => new Date(ts).toISOString().slice(0, 10)),
  };
}
