import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { appUrl } from "@/lib/mailer";
import { STATUT_LABELS } from "@/lib/types";

export const runtime = "nodejs";

const fmt = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR") : "";

/**
 * Export CSV du tableau de suivi (colonnes du CDC : Prestataire, Date
 * d'envoi, Statut de réponse, Date de dernière relance, Lien pièces
 * + statut plan de prévention). Importable dans le Google Sheet de suivi.
 */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const db = await readDb();
  const lignes = [
    "Prestataire;Email;Date d'envoi;Statut de réponse;Date de dernière relance;Lien pièces;Plan de prévention",
  ];
  for (const p of db.prestataires) {
    const plan = p.plan?.dateAttestation
      ? `Attesté${p.plan.signePath ? " + signé" : ""} le ${fmt(p.plan.dateAttestation)}`
      : "";
    lignes.push(
      [
        p.societe,
        p.email,
        fmt(p.dateInvitation),
        STATUT_LABELS[p.statut],
        fmt(p.dateDerniereRelance),
        p.driveFolderUrl || (p.dateSoumission ? `${appUrl()}/admin?dossier=${p.id}` : ""),
        plan,
      ].join(";")
    );
  }

  return new NextResponse("﻿" + lignes.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="suivi-prestataires-rose-festival.csv"`,
    },
  });
}
