# Formulaire Partenaire Rose — Rose Festival

Collecte des pièces prestataires et signature du plan de prévention pour le
Rose Festival (~100 prestataires). Réalisé d'après le cahier des charges
SI-PRO20, avec la direction artistique du site [rosefestival.fr](https://rosefestival.fr).

## Les deux briques

**Brique 1 — Collecte, classement et suivi des pièces**

- Formulaire public (`/`) : KBIS, attestation de vigilance URSSAF, attestation
  fiscale de moins de 6 mois, attestation RC professionnelle + liste nominative
  de l'équipe présente sur site (avec responsable).
- **Fastcheck** automatique : le texte de chaque PDF est analysé pour vérifier
  que le nom du prestataire y figure. PDF scanné ou nom absent → dossier marqué
  « à vérifier » (contrôle humain), jamais validé silencieusement.
- Classement des pièces **par prestataire** (un sous-dossier par société).
- Tableau de suivi (`/admin`) : prestataire, date d'envoi, statut de réponse,
  date de dernière relance, accès aux pièces, statut du plan de prévention.
  Export CSV compatible Google Sheet.
- **Relances automatiques** : cron Vercel chaque lundi 9h (Paris), relance des
  prestataires sans réponse depuis ≥ 6 jours, depuis
  `administration@rosefestival.fr`, jusqu'à réception des pièces.

**Brique 2 — Plan de prévention et signature numérique**

- Envoi **conditionné à la validation humaine** des pièces (décision actée CDC).
- Le prestataire consulte le PDF, coche « J'accepte les modalités », signe au
  doigt/à la souris. Signature PNG + horodatage + IP conservés dans le dossier.
- Statut (envoyé / signé) visible dans le tableau de suivi et l'export.

## Démarrage (dev / recette)

```bash
npm install
npm run dev        # http://localhost:3000
```

- Admin : `http://localhost:3000/admin` — mot de passe par défaut `rose2026`
  (⚠ définir `ADMIN_PASSWORD` avant la production).
- Sans SMTP configuré, les emails sont **simulés** (loggés dans la console
  serveur) : idéal pour recetter le parcours complet sans envoyer de vrais mails.
- Les données et fichiers vivent dans `.data/` (gitignoré).

### Parcours de recette conseillé

1. `/admin` → « + Prestataires » → ajouter une société de test avec votre email.
2. « ✉ Inviter » → copier le lien du formulaire (ou lire le log serveur).
3. Ouvrir le lien, remplir le formulaire, déposer 4 PDF (dont un au nom de la
   société pour voir le fastcheck ✓ et un autre pour voir le ⚠).
4. `/admin` → vérifier le dossier, « ✓ Valider ».
5. Déposer le PDF du plan de prévention (bouton dans la barre d'outils) →
   « → Envoyer plan » → ouvrir `/plan/<token>` → accepter + signer.
6. Vérifier le statut « Plan signé » et l'export CSV.

## Configuration (production)

Variables d'environnement — voir [.env.example](.env.example) :

| Variable | Rôle |
| --- | --- |
| `ADMIN_PASSWORD` | Accès au tableau de suivi |
| `APP_URL` | URL publique (liens des emails) |
| `SMTP_HOST/PORT/USER/PASS` | Envoi réel depuis administration@rosefestival.fr |
| `MAIL_FROM` | Adresse d'expédition (défaut : administration@rosefestival.fr) |
| `BLOB_READ_WRITE_TOKEN` | Stockage persistant Vercel Blob (lier un store au projet) |
| `CRON_SECRET` | Protège `/api/cron/relances` (Vercel l'envoie automatiquement) |

Sur Vercel : lier un store **Blob** (les fichiers locaux ne persistent pas
entre les invocations) et vérifier que le cron de `vercel.json`
(`0 7 * * 1` UTC = lundi 9h Paris) est bien actif après déploiement.

## Architecture

- **Next.js 16 (App Router) + Tailwind v4**, TypeScript.
- `lib/db.ts` — suivi JSON (local `.data/db.json`, ou Vercel Blob en prod).
- `lib/files.ts` — pièces classées par prestataire (local ou Blob).
- `lib/fastcheck.ts` — extraction texte PDF (`pdf-parse`) + contrôle de
  cohérence nom prestataire / document.
- `lib/mailer.ts` — nodemailer + templates FR, dry-run sans SMTP.
- `app/api/cron/relances` — relances hebdomadaires (cron Vercel).

## Reste à faire (hors périmètre de cette version)

- Classement miroir dans le **Google Drive** dédié + **Google Sheet** de suivi
  (nécessite un compte de service Workspace) — l'export CSV assure la
  transition. Structure prête dans `lib/files.ts` / `lib/db.ts`.
- Contenu final du plan de prévention à fournir par Alice Castelle / Axel
  Dupont (TODO CDC), à déposer via l'admin.
- Donner l'accès `administration@rosefestival.fr` à Alice (TODO CDC).
