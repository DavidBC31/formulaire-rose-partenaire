import { readDb, findByToken } from "@/lib/db";
import { PlanSignature } from "@/components/PlanSignature";

export const dynamic = "force-dynamic";

export default async function PlanPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const db = await readDb();
  const p = findByToken(db, token);
  const accessible =
    p &&
    (["recu_ok", "recu_a_verifier", "valide", "plan_envoye", "plan_signe"].includes(p.statut) ||
      !!p.plan?.dateSignature);

  if (!p || !accessible) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="card p-8">
          <div className="display text-3xl">Lien invalide</div>
          <p className="mt-4">
            Ce lien de signature n&apos;est pas (ou plus) actif. Contactez{" "}
            <a className="font-bold underline" href="mailto:administration@rosefestival.fr">
              administration@rosefestival.fr
            </a>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-8 text-center">
        <div className="display text-4xl leading-none sm:text-5xl">
          Plan de
          <br />
          <span className="text-rose-vif drop-shadow-[3px_3px_0_#000]">prévention</span>
        </div>
        <p className="mt-3 font-medium">
          Dossier : <strong>{p.societe}</strong>
        </p>
      </div>
      <PlanSignature
        token={token}
        dejaSigne={!!p.plan?.dateSignature}
        dateSignature={p.plan?.dateSignature}
        signataire={p.plan?.signataire}
        documentDisponible={!!db.planDocument}
      />
    </div>
  );
}
