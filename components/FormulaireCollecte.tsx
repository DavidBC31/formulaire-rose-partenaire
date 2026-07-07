"use client";

import { useRef, useState } from "react";
import { DOC_KEYS, DOC_LABELS, type DocKey, type FastcheckResult } from "@/lib/types";

interface Membre {
  prenom: string;
  nom: string;
  societe: string;
}

type EtapeUpload = "attente" | "envoi" | "ok" | "a_verifier" | "erreur";

const MAX_MO = 8;

export function FormulaireCollecte({
  token,
  societeInvitee,
  dejaSoumis,
  planDisponible,
}: {
  token?: string;
  societeInvitee?: string;
  dejaSoumis?: boolean;
  planDisponible?: boolean;
}) {
  const [societe, setSociete] = useState(societeInvitee || "");
  const [contact, setContact] = useState({ prenom: "", nom: "", email: "", telephone: "" });
  const [responsable, setResponsable] = useState({ nom: "", telephone: "" });
  const [equipe, setEquipe] = useState<Membre[]>([{ prenom: "", nom: "", societe: "" }]);
  const fichiers = useRef<Partial<Record<DocKey, File>>>({});
  const [nomsFichiers, setNomsFichiers] = useState<Partial<Record<DocKey, string>>>({});
  const [progression, setProgression] = useState<Partial<Record<DocKey, EtapeUpload>>>({});
  const [fastchecks, setFastchecks] = useState<Partial<Record<DocKey, FastcheckResult>>>({});
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  const [termine, setTermine] = useState<null | {
    fastcheckOk: boolean;
    token: string;
    emailsSimules: boolean;
  }>(null);

  function choisirFichier(doc: DocKey, file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_MO * 1024 * 1024) {
      setErreur(`"${file.name}" dépasse ${MAX_MO} Mo.`);
      return;
    }
    setErreur("");
    fichiers.current[doc] = file;
    setNomsFichiers((s) => ({ ...s, [doc]: file.name }));
    setProgression((s) => ({ ...s, [doc]: "attente" }));
  }

  async function envoyer() {
    setErreur("");
    if (!societe.trim()) return setErreur("Le nom de votre société est requis.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.email))
      return setErreur("Merci d'indiquer un email de contact valide.");
    const manquants = DOC_KEYS.filter((k) => !fichiers.current[k]);
    if (manquants.length)
      return setErreur(
        `Pièce(s) manquante(s) : ${manquants.map((k) => DOC_LABELS[k]).join(", ")}.`
      );
    const membresValides = equipe.filter((m) => m.nom.trim() || m.prenom.trim());
    if (membresValides.length === 0)
      return setErreur("Merci d'indiquer au moins une personne présente sur site.");
    if (!responsable.nom.trim())
      return setErreur("Merci d'indiquer le responsable présent sur site.");

    setEnvoiEnCours(true);
    try {
      // 1. Infos prestataire + équipe
      const res = await fetch("/api/soumission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          societe,
          email: contact.email,
          contactPrenom: contact.prenom,
          contactNom: contact.nom,
          contactTelephone: contact.telephone,
          responsableNom: responsable.nom,
          responsableTelephone: responsable.telephone,
          equipe: membresValides.map((m) => ({ ...m, societe: m.societe || societe })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de l'envoi");
      const tok: string = data.token;

      // 2. Pièces une par une, avec fastcheck immédiat
      for (const doc of DOC_KEYS) {
        setProgression((s) => ({ ...s, [doc]: "envoi" }));
        const fd = new FormData();
        fd.set("token", tok);
        fd.set("doc", doc);
        fd.set("file", fichiers.current[doc]!);
        const up = await fetch("/api/soumission/piece", { method: "POST", body: fd });
        const upData = await up.json();
        if (!up.ok) {
          setProgression((s) => ({ ...s, [doc]: "erreur" }));
          throw new Error(`${DOC_LABELS[doc]} : ${upData.error || "échec de l'envoi"}`);
        }
        setFastchecks((s) => ({ ...s, [doc]: upData.fastcheck }));
        setProgression((s) => ({ ...s, [doc]: upData.fastcheck.ok ? "ok" : "a_verifier" }));
      }

      // 3. Finalisation
      const fin = await fetch("/api/soumission/finaliser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tok }),
      });
      const finData = await fin.json();
      if (!fin.ok) throw new Error(finData.error || "Erreur lors de la finalisation");
      setTermine({
        fastcheckOk: finData.fastcheckOk,
        token: tok,
        emailsSimules: !!finData.emailsSimules,
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Une erreur est survenue.");
    } finally {
      setEnvoiEnCours(false);
    }
  }

  if (termine) {
    return (
      <div className="card p-8 text-center">
        <div className="display text-3xl">Merci !</div>
        <p className="mt-4">
          Les pièces de <strong>{societe}</strong> ont bien été transmises à
          l&apos;équipe du Rose Festival. Un email de confirmation vous a été
          envoyé.
        </p>
        <ul className="mx-auto mt-6 max-w-md space-y-2 text-left">
          {DOC_KEYS.map((doc) => (
            <li key={doc} className="flex items-center justify-between gap-2 border-b border-black/20 pb-1 text-sm">
              <span>{DOC_LABELS[doc]}</span>
              {fastchecks[doc]?.ok ? (
                <span className="badge bg-rose">✓ vérifiée</span>
              ) : (
                <span className="badge bg-white">contrôle manuel</span>
              )}
            </li>
          ))}
        </ul>
        {!termine.fastcheckOk && (
          <p className="mt-4 text-sm">
            Certaines pièces n&apos;ont pas pu être vérifiées automatiquement
            (document scanné ou nom différent) : notre équipe les contrôlera
            manuellement, vous n&apos;avez rien de plus à faire de ce côté.
          </p>
        )}
        {planDisponible && (
          <div className="mt-8 border-t-2 border-black pt-6">
            <p className="font-semibold">
              Dernière étape : lire et signer le plan de prévention du festival.
            </p>
            <a className="btn mt-4" href={`/plan/${termine.token}`}>
              Signer le plan de prévention →
            </a>
          </div>
        )}
        {termine.emailsSimules && (
          <p className="mt-6 text-xs text-black/50">
            Mode recette : les emails de confirmation sont simulés (SMTP non
            configuré).
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {dejaSoumis && (
        <div className="card bg-rose-vif/20 p-4 text-sm font-semibold">
          ★ Des pièces ont déjà été reçues pour {societeInvitee}. Un nouvel
          envoi remplacera les documents précédents.
        </div>
      )}

      {/* 1 — Société & contact */}
      <section className="card p-6">
        <h2 className="display mb-4 text-2xl">
          <span className="text-rose-vif">1.</span> Votre société
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="societe">Raison sociale *</label>
            <input
              id="societe"
              className="input"
              value={societe}
              onChange={(e) => setSociete(e.target.value)}
              disabled={!!societeInvitee}
              placeholder="Ex. Citron Événements SARL"
            />
            {societeInvitee && (
              <p className="mt-1 text-xs">Renseignée via votre lien d&apos;invitation.</p>
            )}
          </div>
          <div>
            <label className="label" htmlFor="prenom">Prénom du contact</label>
            <input id="prenom" className="input" value={contact.prenom}
              onChange={(e) => setContact({ ...contact, prenom: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="nom">Nom du contact</label>
            <input id="nom" className="input" value={contact.nom}
              onChange={(e) => setContact({ ...contact, nom: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="email">Email *</label>
            <input id="email" type="email" className="input" value={contact.email}
              onChange={(e) => setContact({ ...contact, email: e.target.value })}
              placeholder="contact@societe.fr" />
          </div>
          <div>
            <label className="label" htmlFor="tel">Téléphone</label>
            <input id="tel" type="tel" className="input" value={contact.telephone}
              onChange={(e) => setContact({ ...contact, telephone: e.target.value })} />
          </div>
        </div>
      </section>

      {/* 2 — Pièces */}
      <section className="card p-6">
        <h2 className="display mb-1 text-2xl">
          <span className="text-rose-vif">2.</span> Vos pièces administratives
        </h2>
        <p className="mb-4 text-sm">
          Format PDF, {MAX_MO} Mo maximum par pièce. Le nom de votre société
          doit figurer sur chaque document.
        </p>
        <div className="space-y-3">
          {DOC_KEYS.map((doc) => (
            <label
              key={doc}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border-2 border-black bg-white p-3 transition hover:bg-rose/40"
            >
              <div className="min-w-0">
                <div className="text-sm font-bold">{DOC_LABELS[doc]} *</div>
                <div className="truncate text-xs text-black/60">
                  {nomsFichiers[doc] || "Aucun fichier choisi — cliquer pour parcourir"}
                </div>
              </div>
              <span className="shrink-0">
                {progression[doc] === "envoi" ? (
                  <span className="badge animate-pulse bg-rose">envoi…</span>
                ) : progression[doc] === "ok" ? (
                  <span className="badge bg-rose">✓</span>
                ) : progression[doc] === "a_verifier" ? (
                  <span className="badge bg-white">⚠</span>
                ) : nomsFichiers[doc] ? (
                  <span className="badge bg-rose">prêt</span>
                ) : (
                  <span className="btn btn-sm pointer-events-none">Choisir</span>
                )}
              </span>
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => choisirFichier(doc, e.target.files?.[0])}
              />
            </label>
          ))}
        </div>
      </section>

      {/* 3 — Équipe sur site */}
      <section className="card p-6">
        <h2 className="display mb-1 text-2xl">
          <span className="text-rose-vif">3.</span> Votre équipe sur site
        </h2>
        <p className="mb-4 text-sm">
          Liste nominative des personnes présentes sur le festival.
        </p>
        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="resp">Responsable présent sur site *</label>
            <input id="resp" className="input" value={responsable.nom}
              onChange={(e) => setResponsable({ ...responsable, nom: e.target.value })}
              placeholder="Nom et prénom" />
          </div>
          <div>
            <label className="label" htmlFor="resptel">Téléphone du responsable</label>
            <input id="resptel" type="tel" className="input" value={responsable.telephone}
              onChange={(e) => setResponsable({ ...responsable, telephone: e.target.value })} />
          </div>
        </div>
        <div className="space-y-2">
          {equipe.map((m, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                className="input flex-1"
                style={{ minWidth: "8rem" }}
                placeholder="Prénom"
                value={m.prenom}
                onChange={(e) =>
                  setEquipe(equipe.map((x, j) => (j === i ? { ...x, prenom: e.target.value } : x)))
                }
              />
              <input
                className="input flex-1"
                style={{ minWidth: "8rem" }}
                placeholder="Nom"
                value={m.nom}
                onChange={(e) =>
                  setEquipe(equipe.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)))
                }
              />
              <input
                className="input flex-1"
                style={{ minWidth: "8rem" }}
                placeholder={`Société (défaut : ${societe || "la vôtre"})`}
                value={m.societe}
                onChange={(e) =>
                  setEquipe(equipe.map((x, j) => (j === i ? { ...x, societe: e.target.value } : x)))
                }
              />
              <button
                type="button"
                aria-label="Retirer cette personne"
                className="btn-outline btn-sm"
                onClick={() => setEquipe(equipe.filter((_, j) => j !== i))}
                disabled={equipe.length === 1}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn-outline btn-sm mt-3"
          onClick={() => setEquipe([...equipe, { prenom: "", nom: "", societe: "" }])}
        >
          + Ajouter une personne
        </button>
      </section>

      {erreur && (
        <div className="card border-rose-vif bg-white p-4 text-sm font-bold text-rose-vif">
          ★ {erreur}
        </div>
      )}

      <div className="text-center">
        <button className="btn text-lg" onClick={envoyer} disabled={envoiEnCours}>
          {envoiEnCours ? "Envoi en cours…" : "Envoyer mes pièces ★"}
        </button>
        <p className="mt-3 text-xs">
          Vos documents sont transmis exclusivement à l&apos;équipe
          administrative du Rose Festival.
        </p>
      </div>
    </div>
  );
}
