"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const router = useRouter();

  async function connecter(e: React.FormEvent) {
    e.preventDefault();
    setErreur("");
    setEnvoi(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Connexion impossible");
      }
      router.push("/admin");
      router.refresh();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Erreur");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <form className="card p-8" onSubmit={connecter}>
        <div className="display text-center text-3xl">Suivi ★ Admin</div>
        <p className="mt-2 text-center text-sm">
          Accès réservé à l&apos;équipe du Rose Festival.
        </p>
        <div className="mt-6">
          <label className="label" htmlFor="pw">Mot de passe</label>
          <input
            id="pw"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </div>
        {erreur && (
          <p className="mt-3 text-sm font-bold text-rose-vif">★ {erreur}</p>
        )}
        <button className="btn mt-6 w-full justify-center" disabled={envoi}>
          {envoi ? "Connexion…" : "Entrer"}
        </button>
      </form>
    </div>
  );
}
