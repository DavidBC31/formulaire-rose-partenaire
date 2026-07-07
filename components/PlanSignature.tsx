"use client";

import { useState } from "react";
import { SignaturePad } from "./SignaturePad";

export function PlanSignature({
  token,
  dejaSigne,
  dateSignature,
  signataire: signataireInitial,
  documentDisponible,
}: {
  token: string;
  dejaSigne: boolean;
  dateSignature?: string;
  signataire?: string;
  documentDisponible: boolean;
}) {
  const [accepte, setAccepte] = useState(false);
  const [signataire, setSignataire] = useState("");
  const [fonction, setFonction] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const [signe, setSigne] = useState<null | string>(
    dejaSigne ? dateSignature || "" : null
  );

  async function signer() {
    setErreur("");
    if (!accepte) return setErreur("Merci de cocher la case d'acceptation des modalités.");
    if (!signataire.trim()) return setErreur("Merci d'indiquer le nom du signataire.");
    if (!signature) return setErreur("La signature manuscrite est requise.");
    setEnvoi(true);
    try {
      const res = await fetch(`/api/plan/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepte, signataire, fonction, signature }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de la signature");
      setSigne(data.dateSignature);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Une erreur est survenue.");
    } finally {
      setEnvoi(false);
    }
  }

  if (signe !== null) {
    return (
      <div className="card p-8 text-center">
        <div className="display text-3xl">Plan signé ✓</div>
        <p className="mt-4">
          Le plan de prévention du Rose Festival a été accepté et signé
          {(signataireInitial || signataire) && (
            <>
              {" "}par <strong>{signataireInitial || signataire}</strong>
            </>
          )}
          {signe && (
            <>
              {" "}le{" "}
              <strong>
                {new Date(signe).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </strong>
            </>
          )}
          .
        </p>
        <p className="mt-2 text-sm">
          L&apos;équipe du festival en a été notifiée. Merci, et à très vite !
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="card overflow-hidden">
        <h2 className="display border-b-2 border-black bg-black px-6 py-3 text-xl text-rose">
          ★ Le document
        </h2>
        {documentDisponible ? (
          <>
            <object
              data={`/api/plan-document?t=${token}`}
              type="application/pdf"
              className="h-[70vh] w-full"
            >
              <p className="p-6 text-sm">
                Votre navigateur ne peut pas afficher le PDF ici.{" "}
                <a className="font-bold underline" href={`/api/plan-document?t=${token}`} target="_blank">
                  Ouvrir le plan de prévention
                </a>
              </p>
            </object>
            <div className="border-t-2 border-black p-3 text-center text-sm">
              <a className="font-bold underline" href={`/api/plan-document?t=${token}`} target="_blank">
                Ouvrir le document dans un nouvel onglet ↗
              </a>
            </div>
          </>
        ) : (
          <p className="p-6 text-sm font-semibold">
            Le document n&apos;est pas encore disponible — contactez
            administration@rosefestival.fr.
          </p>
        )}
      </section>

      <section className="card p-6">
        <h2 className="display mb-4 text-2xl">Acceptation &amp; signature</h2>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-black bg-white p-4">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 accent-rose-vif"
            checked={accepte}
            onChange={(e) => setAccepte(e.target.checked)}
          />
          <span className="text-sm font-semibold">
            J&apos;accepte les modalités du plan de prévention du Rose Festival
            et m&apos;engage à les faire respecter par l&apos;ensemble de mon
            équipe présente sur site. *
          </span>
        </label>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="signataire">Nom et prénom du signataire *</label>
            <input id="signataire" className="input" value={signataire}
              onChange={(e) => setSignataire(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="fonction">Fonction</label>
            <input id="fonction" className="input" value={fonction}
              onChange={(e) => setFonction(e.target.value)} placeholder="Ex. Gérant·e" />
          </div>
        </div>

        <div className="mt-4">
          <span className="label">Signature manuscrite *</span>
          <SignaturePad onChange={setSignature} />
        </div>

        {erreur && (
          <div className="mt-4 rounded-xl border-2 border-rose-vif bg-white p-3 text-sm font-bold text-rose-vif">
            ★ {erreur}
          </div>
        )}

        <div className="mt-6 text-center">
          <button className="btn text-lg" onClick={signer} disabled={envoi || !documentDisponible}>
            {envoi ? "Signature en cours…" : "Signer le plan de prévention ★"}
          </button>
          <p className="mt-3 text-xs">
            La signature est horodatée et conservée avec votre dossier
            prestataire.
          </p>
        </div>
      </section>
    </div>
  );
}
