import { createSign } from "crypto";
import type { Db } from "./types";
import { STATUT_LABELS } from "./types";

/**
 * Intégration Google Workspace via compte de service (sans dépendance) :
 * - miroir des pièces dans le Drive dédié, un sous-dossier par prestataire ;
 * - synchronisation du Google Sheet de suivi à chaque écriture.
 * Le compte de service doit avoir accès au dossier Drive et au Sheet
 * (partage avec son adresse client_email, rôle Éditeur / Gestionnaire de contenu).
 */

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

function serviceAccount(): ServiceAccountKey | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  try {
    const json = raw.trim().startsWith("{")
      ? raw
      : Buffer.from(raw, "base64").toString("utf-8");
    const parsed = JSON.parse(json);
    if (!parsed.client_email || !parsed.private_key) return null;
    // Clé collée avec des \n littéraux (variable d'env single-line).
    parsed.private_key = String(parsed.private_key).replace(/\\n/g, "\n");
    return parsed;
  } catch {
    return null;
  }
}

export function isDriveConfigured(): boolean {
  return !!serviceAccount() && !!process.env.GOOGLE_DRIVE_FOLDER_ID;
}

export function isSheetConfigured(): boolean {
  return !!serviceAccount() && !!process.env.GOOGLE_SHEET_ID;
}

export function sheetUrl(): string | null {
  return process.env.GOOGLE_SHEET_ID
    ? `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}`
    : null;
}

const b64url = (b: Buffer | string) =>
  (typeof b === "string" ? Buffer.from(b) : b)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const tokenCache = new Map<string, { token: string; expires: number }>();

/**
 * Jeton d'accès du compte de service. `subject` = adresse à impersonner via
 * la délégation au niveau du domaine (envoi Gmail en tant qu'administration@,
 * sans mot de passe ni MFA — la délégation s'accorde dans la console admin).
 */
async function accessTokenFor(scope: string, subject?: string): Promise<string> {
  const sa = serviceAccount();
  if (!sa) throw new Error("Compte de service Google non configuré");
  const key = `${scope}|${subject || ""}`;
  const cached = tokenCache.get(key);
  if (cached && Date.now() < cached.expires - 60_000) return cached.token;

  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
      ...(subject ? { sub: subject } : {}),
    })
  )}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${b64url(signature)}`,
    }),
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(`Auth Google : ${data.error_description || data.error}`);
  tokenCache.set(key, {
    token: data.access_token,
    expires: Date.now() + data.expires_in * 1000,
  });
  return data.access_token;
}

const accessToken = () =>
  accessTokenFor(
    "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets"
  );

/** Envoi Gmail configuré = compte de service + adresse déléguée (GMAIL_DELEGATE). */
export function isGmailConfigured(): boolean {
  return !!serviceAccount() && !!process.env.GMAIL_DELEGATE;
}

/** Envoie un email via l'API Gmail en tant que l'adresse déléguée. */
export async function sendViaGmail(opts: {
  to: string;
  subject: string;
  html: string;
  fromName?: string;
}): Promise<void> {
  const delegate = process.env.GMAIL_DELEGATE!;
  const token = await accessTokenFor(
    "https://www.googleapis.com/auth/gmail.send",
    delegate
  );
  const message = [
    `From: "${opts.fromName || "Rose Festival"}" <${delegate}>`,
    `To: ${opts.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(opts.subject).toString("base64")}?=`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(opts.html).toString("base64"),
  ].join("\r\n");
  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: b64url(Buffer.from(message)) }),
    }
  );
  if (!res.ok)
    throw new Error(`Gmail API ${res.status} : ${(await res.text()).slice(0, 300)}`);
}

async function gfetch(url: string, init?: RequestInit): Promise<Response> {
  const token = await accessToken();
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
  });
  if (!res.ok)
    throw new Error(`Google API ${res.status} : ${(await res.text()).slice(0, 300)}`);
  return res;
}

/** Dossier Drive du prestataire sous le dossier racine dédié (créé si absent). */
async function ensureDriveFolder(nom: string): Promise<{ id: string; url: string }> {
  const root = process.env.GOOGLE_DRIVE_FOLDER_ID!;
  const q = encodeURIComponent(
    `name = '${nom.replace(/'/g, "\\'")}' and '${root}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  const found = await (
    await gfetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`
    )
  ).json();
  let id: string | undefined = found.files?.[0]?.id;
  if (!id) {
    const created = await (
      await gfetch(
        "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: nom,
            mimeType: "application/vnd.google-apps.folder",
            parents: [root],
          }),
        }
      )
    ).json();
    id = created.id as string;
  }
  return { id, url: `https://drive.google.com/drive/folders/${id}` };
}

/** Dépose (ou remplace) un fichier dans un dossier Drive. */
export async function uploadToDrive(
  folderId: string,
  fileName: string,
  data: Buffer,
  contentType: string
): Promise<void> {
  const q = encodeURIComponent(
    `name = '${fileName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed = false`
  );
  const found = await (
    await gfetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`
    )
  ).json();
  const existing: string | undefined = found.files?.[0]?.id;

  if (existing) {
    await gfetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existing}?uploadType=media&supportsAllDrives=true`,
      { method: "PATCH", headers: { "Content-Type": contentType }, body: new Uint8Array(data) }
    );
    return;
  }

  const boundary = `rose${Date.now()}`;
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify({ name: fileName, parents: [folderId] }) +
        `\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`
    ),
    data,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  await gfetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true",
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body: new Uint8Array(body),
    }
  );
}

/**
 * Miroir d'un fichier dans le dossier Drive du prestataire (créé au besoin,
 * id mémorisé sur le dossier prestataire). Ne bloque jamais le parcours :
 * un échec Drive est loggé, la pièce reste stockée côté app.
 */
export async function mirrorToDrive(
  p: { societe: string; driveFolderId?: string; driveFolderUrl?: string },
  fileName: string,
  data: Buffer,
  contentType: string
): Promise<void> {
  if (!isDriveConfigured()) return;
  try {
    if (!p.driveFolderId) {
      const folder = await ensureDriveFolder(p.societe);
      p.driveFolderId = folder.id;
      p.driveFolderUrl = folder.url;
    }
    await uploadToDrive(p.driveFolderId, fileName, data, contentType);
  } catch (e) {
    console.error(`[DRIVE] Échec du dépôt de ${fileName} pour ${p.societe} :`, e);
  }
}

/** Dépose un document global (ex. plan de prévention) à la racine du Drive dédié. */
export async function uploadToDriveRoot(
  fileName: string,
  data: Buffer,
  contentType: string
): Promise<void> {
  if (!isDriveConfigured()) return;
  try {
    await uploadToDrive(process.env.GOOGLE_DRIVE_FOLDER_ID!, fileName, data, contentType);
  } catch (e) {
    console.error(`[DRIVE] Échec du dépôt de ${fileName} :`, e);
  }
}

/** Nom de l'onglet où l'équipe liste les prestataires à inviter. */
const INVITE_TAB = "À inviter";

interface SheetTab {
  sheetId: number;
  title: string;
  index: number;
}

async function sheetsMeta(id: string): Promise<SheetTab[]> {
  const res = await gfetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties(sheetId,title,index)`
  );
  const data = await res.json();
  return ((data.sheets || []) as { properties: SheetTab }[]).map((s) => s.properties);
}

/** Crée l'onglet « À inviter » (avec en-têtes) s'il n'existe pas encore. */
async function ensureInviteTab(id: string, titles: SheetTab[]): Promise<void> {
  if (titles.some((t) => t.title === INVITE_TAB)) return;
  await gfetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title: INVITE_TAB } } }],
    }),
  });
  await gfetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(
      `'${INVITE_TAB}'!A1`
    )}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ majorDimension: "ROWS", values: [["Société", "Email"]] }),
    }
  );
}

/** Lit les lignes (Société | Email) saisies dans l'onglet « À inviter ». */
export async function readInvitationRows(): Promise<{ societe: string; email: string }[]> {
  if (!isSheetConfigured()) return [];
  const id = process.env.GOOGLE_SHEET_ID!;
  const titles = await sheetsMeta(id);
  await ensureInviteTab(id, titles);
  const res = await gfetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(
      `'${INVITE_TAB}'!A2:B2000`
    )}`
  );
  const data = await res.json();
  const rows = (data.values || []) as string[][];
  return rows
    .map((r) => ({ societe: String(r[0] || "").trim(), email: String(r[1] || "").trim() }))
    .filter((r) => r.societe || r.email);
}

/** Réécrit le tableau de suivi dans le Google Sheet (colonnes du CDC). */
export async function syncSheet(db: Db): Promise<void> {
  if (!isSheetConfigured()) return;
  try {
    const id = process.env.GOOGLE_SHEET_ID!;
    const titles = await sheetsMeta(id);
    await ensureInviteTab(id, titles);
    // Suivi = premier onglet hors « À inviter » (pour ne pas écraser l'entrée).
    const suivi = titles
      .filter((t) => t.title !== INVITE_TAB)
      .sort((a, b) => a.index - b.index)[0];
    const suiviTitle = suivi ? suivi.title : "Feuille 1";

    const fmtD = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("fr-FR") : "");
    const values: string[][] = [
      [
        "Prestataire",
        "Email",
        "Date d'envoi",
        "Statut de réponse",
        "Date de dernière relance",
        "Lien Drive",
        "Plan de prévention",
      ],
    ];
    for (const p of db.prestataires) {
      values.push([
        p.societe,
        p.email,
        fmtD(p.dateInvitation),
        STATUT_LABELS[p.statut],
        fmtD(p.dateDerniereRelance),
        p.driveFolderUrl || "",
        p.plan?.dateAttestation ? `Attesté le ${fmtD(p.plan.dateAttestation)}` : "",
      ]);
    }
    const range = (r: string) => encodeURIComponent(`'${suiviTitle}'!${r}`);
    await gfetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range("A1:G10000")}:clear`,
      { method: "POST" }
    );
    await gfetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range(
        "A1"
      )}?valueInputOption=USER_ENTERED`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ majorDimension: "ROWS", values }),
      }
    );
  } catch (e) {
    console.error("[SHEET] Échec de synchronisation :", e);
  }
}
