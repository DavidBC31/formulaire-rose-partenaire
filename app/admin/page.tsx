import { redirect } from "next/navigation";
import { isAdmin, usesDefaultPassword } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { isMailConfigured } from "@/lib/mailer";
import { AdminDashboard } from "@/components/AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isAdmin())) redirect("/admin/login");

  const db = await readDb();
  db.prestataires.sort((a, b) => a.societe.localeCompare(b.societe, "fr"));

  return (
    <AdminDashboard
      prestataires={db.prestataires}
      planDocument={db.planDocument || null}
      mailConfigured={isMailConfigured()}
      defaultPassword={usesDefaultPassword()}
    />
  );
}
