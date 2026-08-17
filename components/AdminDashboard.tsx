"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DOC_KEYS,
  DOC_LABELS,
  STATUT_LABELS,
  formulaireCommence,
  fastcheckResume,
  type PlanDocument,
  type Prestataire,
  type Statut,
} from "@/lib/types";

const BADGE_STYLE: Record<Statut, string> = {
  a_inviter: "bg-white",
  en_attente: "bg-rose",
  recu_a_verifier: "bg-amber-300",
  recu_ok: "bg-rose-mid",
  valide: "bg-green-300",
};

export function AdminDashboard({
  prestataires,
  planDocument,
  mailConfigured,
  driveConfigured,
  sheetUrl,
}: {
  prestataires: Prestataire[];
  planDocument: PlanDocument | null;
  mailConfigured: boolean;
  driveConfigured: boolean;
  sheetUrl: string | null;
}) {
  const router = useRouter();
  const [filtre, setFiltre] = useState<"tous" | Statut>("tous");
  const [recherche, setRecherche] = useState("");
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [panneauAjout, setPanneauAjout] = useState(false);
  const [ajout, setAjout] = useState({ societe: "", email: "" });
  const [bulk, setBulk] = useState("");
  const [message, setMessage] = useState("");
  const [enCours, setEnCours] = useState<string | null>(null);

  const stats = useMemo(() => {
    const s = { total: prestataires.length, attente: 0, recus: 0, valides: 0, attestes: 0 };
    for (const p of prestataires) {
      if (["a_inviter", "en_attente"].includes(p.statut)) s.attente++;
      else if (["recu_ok", "recu_a_verifier"].includes(p.statut)) s.recus++;
      else if (p.statut === "valide") s.valides++;
      if (p.plan?.dateAttestation) s.attestes++;
    }
    return s;
  }, [prestataires]);

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return prestataires.filter(
      (p) =>
        (filtre === "tous" || p.statut === filtre) &&
        (!q || p.societe.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
    );
  }, [prestataires, filtre, recherche]);

  async function action(id: string | null, act: string, confirmation?: string) {
    if (confirmation && !window.confirm(confirmation)) return;
    setMessage("");
    setEnCours(`${id}:${act}`);
    try {
      const res = await fetch("/api/admin/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: act }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action impossible");
      if (act === "email_test")
        setMessage(
          data.dryRun
            ? `★ Email de test SIMULÉ vers ${data.to} — configurer l'envoi (GMAIL_DELEGATE ou SMTP) pour un envoi réel.`
            : `Email de test envoyé à ${data.to} ✓`
        );
      else if (act === "importer_sheet")
        setMessage(
          `${data.invites} invitation(s) envoyée(s) depuis le Sheet (sur ${data.lignes} ligne(s)).` +
            (data.erreurs?.length ? ` ${data.erreurs.length} ignorée(s) : ${data.erreurs.join(" · ")}` : "")
        );
      else if (act === "importer_liste")
        setMessage(
          `Liste de diffusion chargée : ${data.crees} nouveau(x) dossier(s) créé(s), ` +
            `${data.demarres} relance(s) démarrée(s), sur ${data.total} ligne(s). Aucun email envoyé.`
        );
      else if (typeof data.traites === "number")
        setMessage(`${data.traites} email(s) envoyé(s).`);
      router.refresh();
    } catch (e) {
      setMessage(`★ ${e instanceof Error ? e.message : "Erreur"}`);
    } finally {
      setEnCours(null);
    }
  }

  async function fusionner(sourceId: string, cibleId: string) {
    if (!cibleId) return;
    const cibleName = prestataires.find((p) => p.id === cibleId)?.societe;
    if (
      !window.confirm(
        `Fusionner ce dossier dans « ${cibleName} » ? Ce dossier-ci sera supprimé, l'autre conservé et complété avec les infos manquantes.`
      )
    )
      return;
    setMessage("");
    setEnCours(`${sourceId}:fusionner`);
    try {
      const res = await fetch("/api/admin/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sourceId, cibleId, action: "fusionner" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fusion impossible");
      setMessage(`Dossier fusionné dans « ${data.cible} ».`);
      router.refresh();
    } catch (e) {
      setMessage(`★ ${e instanceof Error ? e.message : "Erreur"}`);
    } finally {
      setEnCours(null);
    }
  }

  async function ajouter(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    const body = bulk.trim() ? { bulk } : ajout;
    const res = await fetch("/api/admin/prestataires", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return setMessage(`★ ${data.error || "Erreur"}`);
    setMessage(
      `${data.ajoutes} prestataire(s) ajouté(s).` +
        (data.erreurs?.length ? ` ${data.erreurs.length} ligne(s) ignorée(s) : ${data.erreurs.join(" · ")}` : "")
    );
    setAjout({ societe: "", email: "" });
    setBulk("");
    setPanneauAjout(false);
    router.refresh();
  }

  async function uploadPlan(file: File | undefined) {
    if (!file) return;
    setMessage("");
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch("/api/admin/plan-document", { method: "POST", body: fd });
    const data = await res.json();
    setMessage(res.ok ? "Plan de prévention mis à jour." : `★ ${data.error}`);
    router.refresh();
  }

  async function deconnexion() {
    await fetch("/api/admin/login", { method: "DELETE" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-3xl sm:text-4xl">
          Suivi <span className="text-rose-vif">prestataires</span>
        </h1>
        <button className="btn-outline btn-sm" onClick={deconnexion}>
          Déconnexion
        </button>
      </div>

      {(!mailConfigured || !driveConfigured) && (
        <div className="card mb-6 border-rose-vif p-4 text-sm font-semibold">
          {!mailConfigured && (
            <p>
              ★ SMTP non configuré : les emails sont <u>simulés</u>, personne ne
              reçoit rien. Renseigner SMTP_HOST/SMTP_USER/SMTP_PASS (boîte
              administration@rosefestival.fr) puis utiliser « Email de test ».
            </p>
          )}
          {!driveConfigured && (
            <p>
              ★ Google Drive/Sheet non connectés : les pièces restent stockées
              dans l&apos;app. Configurer GOOGLE_SERVICE_ACCOUNT_KEY +
              GOOGLE_DRIVE_FOLDER_ID + GOOGLE_SHEET_ID (voir README).
            </p>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["Prestataires", stats.total],
          ["En attente", stats.attente],
          ["Pièces reçues", stats.recus],
          ["Validés", stats.valides],
          ["Plans attestés", stats.attestes],
        ].map(([label, n]) => (
          <div key={label} className="card p-3 text-center">
            <div className="display text-3xl">{n}</div>
            <div className="text-xs font-bold uppercase tracking-wider">{label}</div>
          </div>
        ))}
      </div>

      {/* Barre d'outils */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button className="btn btn-sm" onClick={() => setPanneauAjout(!panneauAjout)}>
          + Prestataires
        </button>
        {sheetUrl && (
          <button
            className="btn btn-sm"
            disabled={enCours === "null:importer_liste"}
            onClick={() =>
              action(
                null,
                "importer_liste",
                "Charger la liste de diffusion (prestataires déjà invités par email) comme « en attente », sans renvoyer d'email ? Démarre les relances du lundi."
              )
            }
          >
            {enCours === "null:importer_liste" ? "Chargement…" : "⇪ Charger la liste (diffusion)"}
          </button>
        )}
        {sheetUrl && (
          <button
            className="btn-outline btn-sm"
            disabled={enCours === "null:importer_sheet"}
            onClick={() =>
              action(
                null,
                "importer_sheet",
                "Importer l'onglet « À inviter » du Google Sheet ET envoyer les invitations aux nouvelles lignes ?"
              )
            }
          >
            {enCours === "null:importer_sheet" ? "Import…" : "⇪ Importer + inviter (À inviter)"}
          </button>
        )}
        <button
          className="btn-outline btn-sm"
          disabled={enCours === "null:inviter_tous"}
          onClick={() =>
            action(null, "inviter_tous", "Envoyer l'invitation à tous les prestataires « À inviter » ?")
          }
        >
          ✉ Inviter tous
        </button>
        <button
          className="btn-outline btn-sm"
          disabled={enCours === "null:relancer_tous"}
          onClick={() =>
            action(null, "relancer_tous", "Relancer tous les prestataires « En attente » ?")
          }
        >
          ↻ Relancer tous
        </button>
        <a className="btn-outline btn-sm" href="/api/admin/export">
          ⬇ Export CSV
        </a>
        {sheetUrl && (
          <a className="btn-outline btn-sm" href={sheetUrl} target="_blank">
            ↗ Google Sheet
          </a>
        )}
        <button
          className="btn-outline btn-sm"
          disabled={enCours === "null:email_test"}
          onClick={() => action(null, "email_test")}
        >
          ✉ Email de test
        </button>
        <label className="btn-outline btn-sm cursor-pointer">
          {planDocument ? "Remplacer le plan de prévention" : "Déposer le plan de prévention"}
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => uploadPlan(e.target.files?.[0])}
          />
        </label>
        {planDocument && (
          <span className="text-xs font-semibold">
            Plan : {planDocument.originalName} ({fmt(planDocument.uploadedAt)})
          </span>
        )}
      </div>

      {/* Panneau ajout / import */}
      {panneauAjout && (
        <form className="card mb-6 p-5" onSubmit={ajouter}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="label">Ajout unitaire</div>
              <input
                className="input mb-2"
                placeholder="Société"
                value={ajout.societe}
                onChange={(e) => setAjout({ ...ajout, societe: e.target.value })}
              />
              <input
                className="input"
                type="email"
                placeholder="email@societe.fr"
                value={ajout.email}
                onChange={(e) => setAjout({ ...ajout, email: e.target.value })}
              />
            </div>
            <div>
              <div className="label">Import en masse (une ligne : Société;email)</div>
              <textarea
                className="input h-24"
                placeholder={"Citron Événements;contact@citron.fr\nSécurité Plus;admin@securiteplus.fr"}
                value={bulk}
                onChange={(e) => setBulk(e.target.value)}
              />
            </div>
          </div>
          <button className="btn btn-sm mt-4">Ajouter</button>
        </form>
      )}

      {message && (
        <div className="card mb-4 p-3 text-sm font-semibold">{message}</div>
      )}

      {/* Filtres */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          className="input max-w-xs"
          placeholder="Rechercher…"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
        <select
          className="input w-auto"
          value={filtre}
          onChange={(e) => setFiltre(e.target.value as typeof filtre)}
        >
          <option value="tous">Tous les statuts</option>
          {Object.entries(STATUT_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <span className="text-sm font-semibold">
          {visibles.length}/{prestataires.length}
        </span>
      </div>

      {/* Tableau de suivi */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="display border-b-2 border-black bg-black text-left text-rose">
              <th className="px-3 py-2 font-normal">Prestataire</th>
              <th className="px-3 py-2 font-normal">Envoi</th>
              <th className="px-3 py-2 font-normal">Statut</th>
              <th className="px-3 py-2 font-normal">Relance</th>
              <th className="px-3 py-2 font-normal">Pièces</th>
              <th className="px-3 py-2 font-normal">Plan</th>
              <th className="px-3 py-2 font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center font-semibold">
                  Aucun prestataire — commencez par « + Prestataires ».
                </td>
              </tr>
            )}
            {visibles.map((p) => (
              <Ligne
                key={p.id}
                p={p}
                autres={prestataires}
                ouvert={ouvert === p.id}
                basculer={() => setOuvert(ouvert === p.id ? null : p.id)}
                action={action}
                fusionner={fusionner}
                enCours={enCours}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Ligne({
  p,
  autres,
  ouvert,
  basculer,
  action,
  fusionner,
  enCours,
}: {
  p: Prestataire;
  autres: Prestataire[];
  ouvert: boolean;
  basculer: () => void;
  action: (id: string, act: string, confirmation?: string) => Promise<void>;
  fusionner: (sourceId: string, cibleId: string) => Promise<void>;
  enCours: string | null;
}) {
  const [cible, setCible] = useState("");
  const piecesRecues = DOC_KEYS.filter((k) => p.pieces?.[k]).length;
  const fastcheckOk = DOC_KEYS.every((k) => p.pieces?.[k]?.fastcheck.ok);
  const busy = (act: string) => enCours === `${p.id}:${act}`;

  return (
    <>
      <tr
        className="cursor-pointer border-b border-black/15 align-middle transition hover:bg-rose/30"
        onClick={basculer}
      >
        <td className="px-3 py-2">
          <div className="font-bold">{p.societe}</div>
          <div className="text-xs text-black/60">{p.email}</div>
        </td>
        <td className="px-3 py-2">{fmt(p.dateInvitation)}</td>
        <td className="px-3 py-2">
          <span className={`badge ${BADGE_STYLE[p.statut]}`}>{STATUT_LABELS[p.statut]}</span>
          {p.statut === "en_attente" && (
            <div className="mt-1 text-[11px] font-semibold leading-tight">
              {formulaireCommence(p) ? (
                <span className="text-amber-700">formulaire commencé · pièces manquantes</span>
              ) : (
                <span className="text-black/45">rien reçu</span>
              )}
            </div>
          )}
        </td>
        <td className="px-3 py-2">{fmt(p.dateDerniereRelance)}</td>
        <td className="px-3 py-2">
          {piecesRecues === 0 ? (
            "—"
          ) : (
            <span title={fastcheckOk ? "Fastcheck cohérent" : "Incohérences détectées"}>
              {piecesRecues}/4 {piecesRecues === 4 && (fastcheckOk ? "✓" : "⚠")}
            </span>
          )}
        </td>
        <td className="px-3 py-2">
          {p.plan?.dateAttestation ? `Attesté ${fmt(p.plan.dateAttestation)}` : "—"}
        </td>
        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-wrap gap-1">
            {["a_inviter"].includes(p.statut) && (
              <button className="btn btn-sm" disabled={busy("inviter")} onClick={() => action(p.id, "inviter")}>
                ✉ Inviter
              </button>
            )}
            {p.statut === "en_attente" && (
              <button className="btn-outline btn-sm" disabled={busy("relancer")} onClick={() => action(p.id, "relancer")}>
                ↻ Relancer
              </button>
            )}
            {["recu_ok", "recu_a_verifier"].includes(p.statut) && (
              <button
                className="btn btn-sm"
                disabled={busy("valider")}
                onClick={() =>
                  action(
                    p.id,
                    "valider",
                    p.statut === "recu_a_verifier"
                      ? `Le fastcheck a détecté des incohérences pour ${p.societe}. Valider quand même ?`
                      : undefined
                  )
                }
              >
                ✓ Valider
              </button>
            )}
          </div>
        </td>
      </tr>
      {ouvert && (
        <tr className="border-b border-black/15 bg-creme">
          <td colSpan={7} className="px-4 py-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <div className="label">Pièces</div>
                <ul className="space-y-1 text-sm">
                  {DOC_KEYS.map((k) => {
                    const piece = p.pieces?.[k];
                    return (
                      <li key={k}>
                        <div className="flex items-center justify-between gap-2">
                          <span>{DOC_LABELS[k]}</span>
                          {piece ? (
                            <span className="flex items-center gap-2">
                              <span>{piece.fastcheck.ok ? "✓" : "⚠"}</span>
                              <a
                                className="font-bold underline"
                                href={`/api/fichier?id=${p.id}&doc=${k}`}
                                target="_blank"
                              >
                                voir
                              </a>
                            </span>
                          ) : (
                            <span className="text-black/50">manquante</span>
                          )}
                        </div>
                        {piece && !piece.fastcheck.ok && (
                          <div className="text-[11px] font-semibold leading-tight text-amber-700">
                            {fastcheckResume(piece.fastcheck)}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {p.dateSoumission && (
                  <p className="mt-2 text-xs">Déposées le {fmt(p.dateSoumission)}</p>
                )}
                {p.driveFolderUrl && (
                  <p className="mt-1 text-xs">
                    <a className="font-bold underline" href={p.driveFolderUrl} target="_blank">
                      Ouvrir le dossier Drive ↗
                    </a>
                  </p>
                )}
              </div>
              <div>
                <div className="label">
                  Équipe sur site
                  {p.effectifApprox ? ` (~${p.effectifApprox} pers.)` : ""}
                </div>
                {p.responsableSite?.nom && (
                  <p className="text-sm">
                    <strong>Responsable :</strong>{" "}
                    {[p.responsableSite.prenom, p.responsableSite.nom].filter(Boolean).join(" ")}
                    {p.responsableSite.societe && p.responsableSite.societe !== p.societe
                      ? ` (${p.responsableSite.societe})`
                      : ""}
                    {p.responsableSite.email && (
                      <>
                        <br />
                        {p.responsableSite.email}
                      </>
                    )}
                    {p.responsableSite.telephone && ` · ${p.responsableSite.telephone}`}
                  </p>
                )}
                {(p.equipe?.length ?? 0) === 0 && (
                  <p className="text-xs text-black/60">
                    Liste nominative non fournie (attendue à J-7).
                  </p>
                )}
                <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-sm">
                  {p.equipe?.map((m, i) => (
                    <li key={i}>
                      {m.prenom} {m.nom}
                      {m.societe && m.societe !== p.societe && (
                        <span className="text-black/50"> ({m.societe})</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="label">Dossier</div>
                <p className="text-sm">
                  Contact : {p.contact?.prenom} {p.contact?.nom}
                  {p.contact?.telephone && ` — ${p.contact.telephone}`}
                </p>
                {p.plan?.dateAttestation && (
                  <p className="mt-1 text-sm">
                    Plan de prévention attesté le{" "}
                    <strong>{fmt(p.plan.dateAttestation)}</strong>.
                    {p.plan.signePath && (
                      <>
                        {" "}
                        <a
                          className="font-bold underline"
                          href={`/api/fichier?id=${p.id}&doc=plan_signe`}
                          target="_blank"
                        >
                          voir le plan signé
                        </a>
                      </>
                    )}
                  </p>
                )}
                <p className="mt-2 flex flex-wrap gap-2">
                  <button
                    className="btn-outline btn-sm"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/?t=${p.token}`);
                    }}
                  >
                    Copier le lien du formulaire
                  </button>
                  {Object.keys(p.pieces || {}).length > 0 && (
                    <button
                      className="btn-outline btn-sm"
                      disabled={enCours === `${p.id}:recontroler`}
                      onClick={() => action(p.id, "recontroler")}
                    >
                      ↻ Recontrôler les pièces
                    </button>
                  )}
                  <button
                    className="btn-outline btn-sm"
                    onClick={() =>
                      action(p.id, "supprimer", `Supprimer définitivement ${p.societe} du suivi ?`)
                    }
                  >
                    Supprimer
                  </button>
                </p>
                <div className="mt-3 border-t border-black/10 pt-3">
                  <div className="label">Fusionner (doublon)</div>
                  <p className="mb-2 text-xs text-black/60">
                    Rattache CE dossier à un autre (ce dossier-ci sera supprimé,
                    l&apos;autre conservé et complété).
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="input w-auto max-w-[16rem] text-sm"
                      value={cible}
                      onChange={(e) => setCible(e.target.value)}
                    >
                      <option value="">— choisir le dossier à conserver —</option>
                      {autres
                        .filter((x) => x.id !== p.id)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.societe} ({STATUT_LABELS[x.statut]})
                          </option>
                        ))}
                    </select>
                    <button
                      className="btn-outline btn-sm"
                      disabled={!cible || enCours === `${p.id}:fusionner`}
                      onClick={() => fusionner(p.id, cible)}
                    >
                      Fusionner
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

const fmtLong = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" });
function fmt(iso?: string): string {
  return iso ? fmtLong.format(new Date(iso)) : "—";
}
