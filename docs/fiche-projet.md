---
etape: 2-dev
reste_a_faire:
  - renseigner le SMTP (mot de passe administration@rosefestival.fr)
  - configurer le compte de service Google (Drive/Sheets/Gmail + délégation domaine)
  - importer la liste des ~100 prestataires
  - récupérer le PDF final du plan de prévention (Alice/Axel)
  - donner l'accès admin à Alice
  - brancher le domaine prestataires.rosefestival.fr (CNAME OVH vers Vercel)
prochaine_echeance: recette 15/07/2026, prod 20/07/2026
---
# Fiche projet — Formulaire Rose Partenaire

**Quoi** : collecte et suivi des pièces des ~100 prestataires du Rose Festival : formulaire public, contrôle automatique des PDF (fastcheck), rangement Drive + Sheet de suivi, relances automatiques, puis signature numérique du plan de prévention.
**Stack** : Next.js 16 / React 19 / Tailwind v4, Vercel Blob, Gmail API (délégation domaine), Google Drive + Sheets, pdf-parse.
**Hébergement** : Vercel (crons de relance lundi 11h Paris) — domaine cible `prestataires.rosefestival.fr` (pas encore branché au 10/07).
**État au 10/07/2026** : briques 1 et 2 implémentées et testées ; il reste la configuration de production (SMTP, compte de service, données réelles) avant la recette.

## Décisions & notes

- ⚠️ Projet le plus contraint du portefeuille : **recette le 15/07, prod le 20/07**.
- Admin protégé par mot de passe obligatoire ; relances en brouillons/validation humaine côté envoi.

## Historique des jalons

- 07/07/2026 : envoi d'emails via API Gmail (délégation domaine, sans MFA).
- 10/07/2026 : rétro-cadrage (fiche créée par DevMaster).
