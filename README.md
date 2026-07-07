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
- Classement des pièces **par prestataire** : un sous-dossier par société dans
  le **Google Drive dédié** (miroir automatique dès que le compte de service
  est configuré) + stockage app pour la consultation en ligne.
- Tableau de suivi (`/admin`, sans connexion par défaut) : prestataire, date
  d'envoi, statut de réponse, date de dernière relance, accès aux pièces,
  statut du plan de prévention. **Google Sheet synchronisé à chaque
  changement** + export CSV.
- **Relances automatiques** : cron Vercel chaque lundi 9h (Paris), relance des
  prestataires sans réponse depuis ≥ 6 jours, depuis
  `administration@rosefestival.fr`, jusqu'à réception des pièces.

**Brique 2 — Plan de prévention et signature numérique**

- Lecture et signature **dans la foulée du dépôt des pièces** : l'écran de fin
  du formulaire et l'email de confirmation mènent directement au plan, même si
  le fastcheck a marqué le dossier « à vérifier » (le contrôle humain reste
  tracé dans le suivi et ne bloque pas le prestataire).
- Le prestataire consulte le PDF, coche « J'accepte les modalités », signe au
  doigt/à la souris. Signature PNG + horodatage + IP conservés dans le dossier
  (et le Drive).
- Statut (envoyé / signé) visible dans le tableau de suivi, le Sheet et l'export.

## Démarrage (dev / recette)

```bash
npm install
npm run dev        # http://localhost:3000
```

- Admin : `http://localhost:3000/admin` — **accès libre** tant que
  `ADMIN_PASSWORD` n'est pas défini.
- Sans SMTP configuré, les emails sont **simulés** (loggés dans la console
  serveur, personne ne reçoit rien) : un bandeau le rappelle dans l'admin et
  le bouton « Email de test » permet de vérifier la configuration réelle.
- Sans compte de service Google, les pièces restent dans `.data/` (gitignoré) ;
  avec, elles sont **aussi classées dans le Drive** et le Sheet est synchronisé.

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
| `ADMIN_PASSWORD` | Optionnel : protège le tableau de suivi (vide = accès libre) |
| `APP_URL` | URL publique (liens des emails), ex. https://prestataires.rosefestival.fr |
| `SMTP_HOST/PORT/USER/PASS` | Envoi réel — boîte OVH : `ssl0.ovh.net:465` |
| `MAIL_FROM` | Adresse d'expédition (défaut : administration@rosefestival.fr) |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Clé JSON (base64) du compte de service Drive+Sheets |
| `GOOGLE_DRIVE_FOLDER_ID` | Dossier Drive racine du classement par prestataire |
| `GOOGLE_SHEET_ID` | Google Sheet de suivi synchronisé |
| `BLOB_READ_WRITE_TOKEN` | Stockage persistant Vercel Blob (lier un store au projet) |
| `CRON_SECRET` | Protège `/api/cron/relances` (Vercel l'envoie automatiquement) |

### Connecter le Drive et le Sheet

1. [console.cloud.google.com](https://console.cloud.google.com) → créer (ou
   réutiliser) un projet → activer les API **Google Drive** et **Google Sheets**.
2. IAM → Comptes de service → créer → onglet Clés → **nouvelle clé JSON**.
3. Encoder la clé : `base64 -i cle.json | pbcopy` → coller dans
   `GOOGLE_SERVICE_ACCOUNT_KEY`.
4. **Partager** le dossier Drive dédié et le Sheet de suivi avec l'adresse
   `client_email` du compte de service (rôle Éditeur / Gestionnaire de contenu —
   fonctionne aussi dans un Drive partagé).
5. Renseigner `GOOGLE_DRIVE_FOLDER_ID` et `GOOGLE_SHEET_ID` (ids visibles dans
   les URLs) — le Sheet est réécrit à chaque changement, ne pas y saisir de
   données à la main (utiliser un 2ᵉ onglet si besoin).

### Hébergement (domaine rosefestival.fr chez OVH)

L'app est un serveur Next.js : l'hébergement mutualisé OVH ne peut pas
l'exécuter. Le schéma prévu : déployer sur **Vercel** (crons + Blob inclus)
et créer dans la zone DNS OVH un enregistrement `CNAME`
`prestataires.rosefestival.fr → cname.vercel-dns.com` (le sous-domaine reste
sous rosefestival.fr). Les emails partent de la boîte OVH
`administration@rosefestival.fr` via SMTP (`ssl0.ovh.net:465`), indépendamment
de l'hébergement web. Vérifier que le cron de `vercel.json` (`0 7 * * 1` UTC =
lundi 9h Paris) est actif après déploiement.

## Architecture

- **Next.js 16 (App Router) + Tailwind v4**, TypeScript.
- `lib/db.ts` — suivi JSON (local `.data/db.json`, ou Vercel Blob en prod).
- `lib/files.ts` — pièces classées par prestataire (local ou Blob).
- `lib/fastcheck.ts` — extraction texte PDF (`pdf-parse`) + contrôle de
  cohérence nom prestataire / document.
- `lib/mailer.ts` — nodemailer + templates FR, dry-run sans SMTP.
- `app/api/cron/relances` — relances hebdomadaires (cron Vercel).

## Reste à faire (côté métier)

- Renseigner les identifiants SMTP (mot de passe de la boîte
  administration@rosefestival.fr) et le compte de service Google (ci-dessus).
- Contenu final du plan de prévention à fournir par Alice Castelle / Axel
  Dupont (TODO CDC), à déposer via l'admin.
- Liste définitive des ~100 prestataires (import en masse `Société;email`).
- Donner l'accès `administration@rosefestival.fr` à Alice (TODO CDC).
