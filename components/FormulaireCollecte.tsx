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

/** Astérisque rouge indiquant un champ obligatoire. */
const Req = () => (
  <span className="text-red-600" aria-hidden="true">
    {" "}
    *
  </span>
);

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
  const [responsable, setResponsable] = useState({
    prenom: "",
    nom: "",
    email: "",
    telephone: "",
    societe: "",
  });
  const [effectif, setEffectif] = useState("");
  const [equipe, setEquipe] = useState<Membre[]>([{ prenom: "", nom: "", societe: "" }]);
  const [attestePlan, setAttestePlan] = useState(false);
  const planSigne = useRef<File | null>(null);
  const [nomPlanSigne, setNomPlanSigne] = useState("");
  const fichiers = useRef<Partial<Record<DocKey, File>>>({});
  const [nomsFichiers, setNomsFichiers] = useState<Partial<Record<DocKey, string>>>({});
  const [progression, setProgression] = useState<Partial<Record<DocKey, EtapeUpload>>>({});
  const [fastchecks, setFastchecks] = useState<Partial<Record<DocKey, FastcheckResult>>>({});
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  const [termine, setTermine] = useState<null | {
    fastcheckOk: boolean;
    emailsSimules: boolean;
    planAtteste: boolean;
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
    setFastchecks((s) => ({ ...s, [doc]: undefined }));
  }

  const emailValide = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

  async function envoyer() {
    setErreur("");
    // Bloc 1 — société : tous les champs obligatoires.
    if (!societe.trim()) return setErreur("Le nom de votre société est requis.");
    if (!contact.prenom.trim()) return setErreur("Le prénom du contact est requis.");
    if (!contact.nom.trim()) return setErreur("Le nom du contact est requis.");
    if (!emailValide(contact.email))
      return setErreur("Merci d'indiquer un email de contact valide.");
    if (!contact.telephone.trim()) return setErreur("Le téléphone du contact est requis.");
    // Bloc 2 — les 4 pièces obligatoires.
    const manquants = DOC_KEYS.filter((k) => !fichiers.current[k]);
    if (manquants.length)
      return setErreur(
        `Pièce(s) manquante(s) : ${manquants.map((k) => DOC_LABELS[k]).join(", ")}.`
      );
    // Bloc 3 — informations du responsable obligatoires (équipe facultative).
    if (!responsable.prenom.trim()) return setErreur("Le prénom du responsable est requis.");
    if (!responsable.nom.trim()) return setErreur("Le nom du responsable est requis.");
    if (!emailValide(responsable.email))
      return setErreur("Merci d'indiquer un email valide pour le responsable.");
    if (!responsable.telephone.trim())
      return setErreur("Le téléphone du responsable est requis.");
    if (!(Number(effectif) > 0))
      return setErreur("Merci d'indiquer le nombre approximatif de personnes sur site.");
    // Bloc 4 — plan de prévention : attestation cochée + plan signé déposé.
    if (planDisponible && !attestePlan)
      return setErreur("Merci d'attester avoir pris connaissance du plan de prévention.");
    if (planDisponible && !planSigne.current)
      return setErreur("Merci de déposer le plan de prévention signé (PDF).");

    const membresValides = equipe.filter((m) => m.nom.trim() || m.prenom.trim());

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
          responsablePrenom: responsable.prenom,
          responsableNom: responsable.nom,
          responsableEmail: responsable.email,
          responsableTelephone: responsable.telephone,
          responsableSociete: responsable.societe || societe,
          effectifApprox: effectif,
          equipe: membresValides.map((m) => ({ ...m, societe: m.societe || societe })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de l'envoi");
      const tok: string = data.token;

      // 2. Pièces une par une (stockées + fastcheck), métadonnées collectées
      // pour la finalisation (aucune écriture db.json à cette étape).
      const piecesMeta: Record<string, unknown> = {};
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
        piecesMeta[doc] = upData.piece;
        setFastchecks((s) => ({ ...s, [doc]: upData.fastcheck }));
        setProgression((s) => ({ ...s, [doc]: upData.fastcheck.ok ? "ok" : "a_verifier" }));
      }

      // 2 bis. Plan de prévention signé
      let planSigneMeta: unknown = null;
      if (planDisponible && planSigne.current) {
        const fd = new FormData();
        fd.set("token", tok);
        fd.set("file", planSigne.current);
        const up = await fetch("/api/soumission/plan-signe", { method: "POST", body: fd });
        const d = await up.json().catch(() => ({}));
        if (!up.ok) throw new Error(`Plan signé : ${d.error || "échec de l'envoi"}`);
        planSigneMeta = d.plan;
      }

      // 3. Finalisation (seule écriture db.json)
      const fin = await fetch("/api/soumission/finaliser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: tok,
          attestePlan,
          pieces: piecesMeta,
          planSigne: planSigneMeta,
        }),
      });
      const finData = await fin.json();
      if (!fin.ok) throw new Error(finData.error || "Erreur lors de la finalisation");
      setTermine({
        fastcheckOk: finData.fastcheckOk,
        emailsSimules: !!finData.emailsSimules,
        planAtteste: !!planDisponible && attestePlan,
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
        {termine.planAtteste && (
          <p className="mt-4 text-sm">
            Vous avez attesté avoir pris connaissance du plan de prévention et
            déposé sa version signée.
          </p>
        )}
        {!termine.fastcheckOk && (
          <p className="mt-4 text-sm">
            Certaines pièces n&apos;ont pas pu être vérifiées automatiquement
            (document scanné ou nom différent) : notre équipe les contrôlera
            manuellement, vous n&apos;avez rien de plus à faire de ce côté.
          </p>
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
      <p className="text-sm">
        Les champs marqués d&apos;un <span className="text-red-600">*</span> sont
        obligatoires.
      </p>
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
            <label className="label" htmlFor="societe">Raison sociale<Req /></label>
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
            <label className="label" htmlFor="prenom">Prénom du contact<Req /></label>
            <input id="prenom" className="input" value={contact.prenom}
              onChange={(e) => setContact({ ...contact, prenom: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="nom">Nom du contact<Req /></label>
            <input id="nom" className="input" value={contact.nom}
              onChange={(e) => setContact({ ...contact, nom: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="email">Email<Req /></label>
            <input id="email" type="email" className="input" value={contact.email}
              onChange={(e) => setContact({ ...contact, email: e.target.value })}
              placeholder="contact@societe.fr" />
          </div>
          <div>
            <label className="label" htmlFor="tel">Téléphone<Req /></label>
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
          {DOC_KEYS.map((doc) => {
            const fc = fastchecks[doc];
            const nonConforme = fc && fc.textFound && !fc.ok;
            const nonLisible = fc && !fc.textFound;
            return (
              <div key={doc}>
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border-2 border-black bg-white p-3 transition hover:bg-rose/40">
                  <div className="min-w-0">
                    <div className="text-sm font-bold">{DOC_LABELS[doc]}<Req /></div>
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
                {nonConforme && (
                  <p className="mt-1 px-1 text-xs font-semibold text-rose-vif">
                    ★ Pièce non conforme : le nom figurant sur le document ne
                    correspond pas aux données de la structure. Vérifiez que le
                    bon document est déposé, sinon notre équipe le contrôlera
                    manuellement.
                  </p>
                )}
                {nonLisible && (
                  <p className="mt-1 px-1 text-xs">
                    Document non lisible automatiquement (PDF scanné) : il sera
                    vérifié manuellement par notre équipe.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 3 — Équipe sur site */}
      <section className="card p-6">
        <h2 className="display mb-5 text-2xl">
          <span className="text-rose-vif">3.</span> Votre équipe sur site
        </h2>

        {/* 3a — Responsable de l'équipe */}
        <h3 className="display mb-4 text-lg">Responsable de l&apos;équipe</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="resp-prenom">Prénom<Req /></label>
            <input id="resp-prenom" className="input" value={responsable.prenom}
              onChange={(e) => setResponsable({ ...responsable, prenom: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="resp-nom">Nom<Req /></label>
            <input id="resp-nom" className="input" value={responsable.nom}
              onChange={(e) => setResponsable({ ...responsable, nom: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="resp-email">Email<Req /></label>
            <input id="resp-email" type="email" className="input" value={responsable.email}
              onChange={(e) => setResponsable({ ...responsable, email: e.target.value })}
              placeholder="responsable@societe.fr" />
          </div>
          <div>
            <label className="label" htmlFor="resptel">Téléphone<Req /></label>
            <input id="resptel" type="tel" className="input" value={responsable.telephone}
              onChange={(e) => setResponsable({ ...responsable, telephone: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="resp-soc">Société<Req /></label>
            <input id="resp-soc" className="input" value={responsable.societe}
              onChange={(e) => setResponsable({ ...responsable, societe: e.target.value })}
              placeholder={`Défaut : ${societe || "la vôtre"}`} />
          </div>
          <div>
            <label className="label" htmlFor="effectif">Nombre approximatif de personnes sur site<Req /></label>
            <input id="effectif" type="number" min="1" className="input" value={effectif}
              onChange={(e) => setEffectif(e.target.value)} placeholder="Ex. 8" />
          </div>
        </div>

        {/* 3b — L'équipe (liste nominative, facultative) */}
        <div className="mt-6 border-t-2 border-black/10 pt-6">
          <h3 className="display mb-1 text-lg">L&apos;équipe</h3>
          <p className="mb-3 text-xs text-black/70">
            Nom, prénom et société des personnes qui composent votre équipe.
            Facultatif : si vous ne disposez pas encore de la liste nominative
            des personnes présentes, celle-ci devra être envoyée au plus tard à
            J-7 à{" "}
            <a className="font-bold underline" href="mailto:administration@rosefestival.fr">
              administration@rosefestival.fr
            </a>
            .
          </p>
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

      {/* 4 — Plan de prévention */}
      {planDisponible && (
        <section className="card p-6">
          <h2 className="display mb-1 text-2xl">
            <span className="text-rose-vif">4.</span> Plan de prévention
          </h2>
          <p className="mb-4 text-sm">
            Merci de <strong>télécharger</strong> le plan de prévention du Rose
            Festival, de le <strong>signer</strong>, puis de le
            <strong> recharger</strong> ci-dessous — et de cocher l&apos;attestation.
          </p>

          <div className="mb-2 text-sm font-bold">
            <span className="text-rose-vif">1.</span> Télécharger le document
          </div>
          <a className="btn-outline btn-sm" href="/api/plan-document" target="_blank" rel="noopener">
            ⬇ Télécharger le plan de prévention
          </a>

          <div className="mt-5 mb-2 text-sm font-bold">
            <span className="text-rose-vif">2.</span> Déposer le plan signé (PDF)<Req />
          </div>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border-2 border-black bg-white p-3 transition hover:bg-rose/40">
            <div className="min-w-0">
              <div className="text-sm font-bold">Plan de prévention signé</div>
              <div className="truncate text-xs text-black/60">
                {nomPlanSigne || "Aucun fichier choisi — cliquer pour parcourir"}
              </div>
            </div>
            <span className="shrink-0">
              {nomPlanSigne ? (
                <span className="badge bg-rose">prêt</span>
              ) : (
                <span className="btn btn-sm pointer-events-none">Choisir</span>
              )}
            </span>
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > MAX_MO * 1024 * 1024) {
                  setErreur(`"${f.name}" dépasse ${MAX_MO} Mo.`);
                  return;
                }
                setErreur("");
                planSigne.current = f;
                setNomPlanSigne(f.name);
              }}
            />
          </label>

          <div className="mt-5 mb-2 text-sm font-bold">
            <span className="text-rose-vif">3.</span> Attester
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-black bg-white p-4">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 accent-rose-vif"
              checked={attestePlan}
              onChange={(e) => setAttestePlan(e.target.checked)}
            />
            <span className="text-sm font-semibold">
              J&apos;atteste avoir pris connaissance du plan de prévention du
              Rose Festival et m&apos;engage à le faire respecter par mon équipe
              présente sur site.<Req />
            </span>
          </label>
        </section>
      )}

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
