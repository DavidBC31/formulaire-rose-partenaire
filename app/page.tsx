import { readDb, findByToken } from "@/lib/db";
import { FormulaireCollecte } from "@/components/FormulaireCollecte";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  const db = await readDb();
  const prestataire = t ? findByToken(db, t) : undefined;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-8 text-center">
        <div className="display text-4xl leading-none sm:text-6xl">
          Pièces
          <br />
          <span className="text-rose-vif drop-shadow-[3px_3px_0_#000]">
            prestataires et exposants
          </span>
        </div>
        <p className="mx-auto mt-4 max-w-xl font-medium">
          Avant toute intervention sur le Rose Festival, merci de déposer vos
          pièces administratives obligatoires et la liste de votre équipe
          présente sur site. L&apos;ensemble est transmis à{" "}
          <strong>administration@rosefestival.fr</strong>.
        </p>
      </div>
      <FormulaireCollecte
        token={prestataire?.token}
        societeInvitee={prestataire?.societe}
        dejaSoumis={!!prestataire?.dateSoumission}
      />
    </div>
  );
}
