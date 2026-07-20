# Formulaire Partenaire Rose — Rose Festival

Collecte des pièces prestataires et attestation du plan de prévention pour le
Rose Festival (~100 prestataires). Réalisé d'après le cahier des charges
SI-PRO20, avec la direction artistique du site [rosefestival.fr](https://rosefestival.fr).

## Les deux briques

**Brique 1 — Collecte, classement et suivi des pièces**

- Formulaire public (`/`) : KBIS, attestation de vigilance URSSAF, attestation
  fiscale de moins de 6 mois, attestation RC professionnelle + responsable et
  effectif approximatif de l'équipe sur site. La liste nominative est
  facultative dans le formulaire : à défaut, elle est attendue au plus tard à
  J-7 à administration@rosefestival.fr.
- **Premier envoi via le Google Sheet** : l'équipe liste les prestataires
  (Société | Email) dans l'onglet **« À inviter »** du Sheet, puis clique
  « ⇪ Importer + inviter (Sheet) » dans l'admin — les nouveaux prestataires
  sont créés et invités en un clic.
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

**Brique 2 — Plan de prévention (attestation intégrée au formulaire)**

- Le plan de prévention est une **section du formulaire** (dès qu'un PDF est
  déposé côté admin) : le prestataire le télécharge et coche
  « J'atteste avoir pris connaissance du plan de prévention » — case
  **obligatoire** pour valider l'envoi.
- L'attestation (date + IP) est conservée dans le dossier et remonte dans le
  tableau de suivi, le Google Sheet et l'export CSV (colonne « Plan de
  prévention : Attesté le … »).

## Démarrage (dev / recette)

```bash
npm install
npm run dev        # http://localhost:3000
```

- Admin : `http://localhost:3000/admin` — protégé par `ADMIN_PASSWORD`
  (**obligatoire** : sans lui l'admin est verrouillé). Le formulaire
  prestataire reste public.
- Sans SMTP configuré, les emails sont **simulés** (loggés dans la console
  serveur, personne ne reçoit rien) : un bandeau le rappelle dans l'admin et
  le bouton « Email de test » permet de vérifier la configuration réelle.
- Sans compte de service Google, les pièces restent dans `.data/` (gitignoré) ;
  avec, elles sont **aussi classées dans le Drive** et le Sheet est synchronisé.

### Parcours de recette conseillé

1. `/admin` → déposer le PDF du plan de prévention (bouton dans la barre
   d'outils) pour activer la section 4 du formulaire.
2. `/admin` → « + Prestataires » (ou onglet « À inviter » du Sheet +
   « ⇪ Importer + inviter ») → « ✉ Inviter » → copier le lien du formulaire.
3. Ouvrir le lien, remplir le formulaire, déposer 4 PDF (dont un au nom de la
   société pour voir le fastcheck ✓ et un autre pour voir le message « pièce
   non conforme »), renseigner responsable + effectif, cocher l'attestation.
4. `/admin` → vérifier le dossier (pièces, effectif, « Plan attesté le … »),
   « ✓ Valider ».
5. Vérifier l'export CSV et la synchro du Google Sheet.

## Configuration (production)

Variables d'environnement — voir [.env.example](.env.example) :

| Variable | Rôle |
| --- | --- |
| `ADMIN_PASSWORD` | **Obligatoire** : protège le tableau de suivi (absent = admin verrouillé) |
| `APP_URL` | URL publique (liens des emails), ex. https://prestataires.rosefestival.fr |
| `GMAIL_DELEGATE` | Envoi réel via API Gmail : adresse impersonnée par le compte de service (délégation domaine, **sans mot de passe ni MFA**) |
| `MAIL_FROM` | Adresse d'expédition (défaut : administration@rosefestival.fr) |
| `SMTP_HOST/PORT/USER/PASS` | Alternative SMTP classique (inutile si `GMAIL_DELEGATE` actif) |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Clé JSON (base64) du compte de service Drive+Sheets+Gmail |
| `GOOGLE_DRIVE_FOLDER_ID` | Dossier Drive racine du classement par prestataire |
| `GOOGLE_SHEET_ID` | Google Sheet de suivi synchronisé |
| `BLOB_READ_WRITE_TOKEN` | Stockage persistant Vercel Blob (lier un store au projet) |
| `CRON_SECRET` | Protège `/api/cron/relances` (Vercel l'envoie automatiquement) |

### Connecter le Drive, le Sheet et l'envoi d'emails (un seul compte de service)

1. [console.cloud.google.com](https://console.cloud.google.com) → créer (ou
   réutiliser) un projet → activer les API **Google Drive**, **Google Sheets**
   et **Gmail**.
2. IAM → Comptes de service → créer → onglet Clés → **nouvelle clé JSON**.
3. Encoder la clé : `base64 -i cle.json | pbcopy` → coller dans
   `GOOGLE_SERVICE_ACCOUNT_KEY`.
4. **Partager** le dossier Drive dédié et le Sheet de suivi avec l'adresse
   `client_email` du compte de service (rôle Éditeur / Gestionnaire de contenu —
   fonctionne aussi dans un Drive partagé).
5. Renseigner `GOOGLE_DRIVE_FOLDER_ID` et `GOOGLE_SHEET_ID` (ids visibles dans
   les URLs) — le Sheet est réécrit à chaque changement, ne pas y saisir de
   données à la main (utiliser un 2ᵉ onglet si besoin).
6. **Envoi d'emails sans mot de passe ni MFA** (la validation en 2 étapes est
   désactivée sur le domaine, les mots de passe d'application sont donc
   impossibles) : [admin.google.com](https://admin.google.com) → Sécurité →
   Contrôle des accès et des données → Commandes API → **Délégation au niveau
   du domaine** → Ajouter : l'**ID client** numérique du compte de service +
   le champ d'application `https://www.googleapis.com/auth/gmail.send`.
   Renseigner ensuite `GMAIL_DELEGATE=administration@rosefestival.fr` :
   l'app envoie via l'API Gmail en tant que cette adresse. La délégation est
   limitée au seul scope « envoyer un mail » — le compte de service ne peut
   ni lire ni administrer quoi que ce soit d'autre.

### Hébergement (domaine rosefestival.fr chez OVH)

L'app est un serveur Next.js : l'hébergement mutualisé OVH ne peut pas
l'exécuter. Le schéma prévu : déployer sur **Vercel** (crons + Blob inclus)
et créer dans la zone DNS OVH un enregistrement `CNAME`
`prestataires.rosefestival.fr → cname.vercel-dns.com` (le sous-domaine reste
sous rosefestival.fr). Attention : seul le domaine est chez OVH — la
messagerie, elle, est chez **Google Workspace** (MX `smtp.google.com`), d'où
le SMTP `smtp.gmail.com` avec mot de passe d'application. Vérifier que le
cron de `vercel.json` (`0 7 * * 1` UTC = lundi 9h Paris) est actif après
déploiement.

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
