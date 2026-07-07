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

export async function fastcheckPdf(
  buffer: Buffer,
  societe: string
): Promise<FastcheckResult> {
  const tokens = significantTokens(societe);
  let text = "";
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      text = normalizeText(result.text || "");
    } finally {
      await parser.destroy();
    }
  } catch {
    text = "";
  }

  // PDF scanné / illisible : pas de texte exploitable → vérification humaine.
  if (text.length < 20) {
    return { ok: false, textFound: false, score: 0, tokensFound: [], tokensMissing: tokens };
  }

  const tokensFound = tokens.filter((t) => text.includes(t));
  const tokensMissing = tokens.filter((t) => !text.includes(t));
  const score = tokens.length ? tokensFound.length / tokens.length : 0;

  return {
    ok: tokensMissing.length === 0,
    textFound: true,
    score,
    tokensFound,
    tokensMissing,
  };
}
