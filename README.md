# DIGITAL-PRIME

**DIGITAL-PRIME** est une application web de travail collaboratif (PHP natif + PostgreSQL + JavaScript vanilla), responsive et installable comme application (PWA).

## Fonctionnalités
- Comptes utilisateurs avec **couleur personnalisée** (thème de l'interface).
- **Gestion du profil** : nom affiché, couleur, mot de passe.
- **Espaces de projet** : création, invitation d'amis par nom d'utilisateur, membres.
- **Partage de fichiers** : envoi, téléchargement, suppression (images, PDF, etc.).
- **Édition de textes en ligne** : modification en place ou enregistrement comme nouvelle version.
- **Commentaires** sur chaque élément.
- **Appels ciblés** depuis la liste des membres : **📹 visio** (caméra + micro) ou **🎙️ appel audio**, avec bandeau « Appel entrant », sonnerie, Répondre / Refuser / Annuler / Occupé / Pas de réponse.
- **Notifications d'appel même page fermée** : Web Push natif (VAPID + chiffrement RFC 8291), service worker, clic = ouverture de l'application. Bouton **🔔 Alertes** pour activer.
- **Innovation — Équipe en direct & mode concentration** : statuts visibles en temps réel (Disponible 🟢, Concentration 🧠, En réunion 📅, Absent 🌙), compte à rebours de concentration, et appel direct depuis la carte d'équipe.
- **Interface responsive et stable** : CSS avec fallbacks multi-navigateurs (`color-mix`, `aspect-ratio`, `100dvh`, safe-area iOS), mise en page adaptée mobile/tablette/PC.
- **Menu mobile** : sur téléphone, un bouton déroulant (☰) regroupe les actions de la barre supérieure ; sur PC, l'interface reste inchangée.
- **Installation PWA** : bouton « Installer l'application » sur l'accueil (et dans le menu). Android/Chrome via `beforeinstallprompt`, iPhone/iPad via « Partager > Sur l’écran d’accueil », autres navigateurs via redirection/instructions. Icônes PNG 192/512 et Apple touch icon incluses.

Logo : H stylisé (`images/logo-h.svg`, icônes PNG pour l'installation).

## Adresse en ligne
`https://digitalelect.alwaysdata.net/digital-prime/`

Le site principal Digital-Elect (`https://digitalelect.alwaysdata.net/`) n'est pas modifié.

## Prérequis
- PHP 8+ avec extensions `pdo_pgsql`, `pgsql`, `fileinfo`, `mbstring`, `session`.
- PostgreSQL.
- Droits d'écriture serveur sur `data/` et `uploads/`.
- **HTTPS** obligatoire pour la caméra, le micro et les notifications push (sauf `localhost`).
- **Installation sur iPhone** : iOS 16.4+ et ajout via « Partager > Sur l’écran d’accueil » (PWA) pour bénéficier des notifications.

## Installation locale (XAMPP)
1. Copier l'application dans `C:\xampp\htdocs\digital-prime`.
2. Créer la base PostgreSQL et importer `database/schema.sql` :
   ```bash
   createdb -U postgres digital_prime
   psql -U postgres -d digital_prime -f database/schema.sql
   ```
3. Copier `api/config.local.example.php` en `api/config.local.php` et renseigner les identifiants PostgreSQL.
4. Démarrer Apache puis ouvrir `http://localhost/digital-prime/`.
5. Créer un compte, un projet, inviter des amis (comptes sur la même instance).

> Les scripts d'installation DB non authentifiés ont été **supprimés** : l'import du schéma se fait uniquement via `psql` ou phpPgAdmin.

## Structure
```
digital-prime/
├── index.html, app.html
├── css/style.css
├── js/api.js, js/app.js, js/install.js
├── images/ (logo-h.svg, icon-192.png, icon-512.png, apple-touch-icon.png)
├── api/ (config.php, auth.php, projects.php, items.php,
│         comments.php, video.php, push.php, webpush.php, presence.php)
├── sw.js, manifest.webmanifest
├── database/schema.sql
├── data/ (protégé)
└── uploads/ (protégé, non exécutable)
```

## Confidentialité / sécurité
- Mot de passe hashé (`password_hash`), requêtes SQL préparées, contrôle d'accès sur chaque projet.
- Cookies de session `Secure` + `HttpOnly` + `SameSite=Lax`.
- Fichiers sensibles exclus du dépôt via `.gitignore` : `api/config.local.php`, `api/vapid.local.php`, `b64.txt`, `data/`, `uploads/`.
- Les clés VAPID sont générées localement et restent sur le serveur : **ne jamais publier `api/vapid.local.php`**.

## Déploiement
Le déploiement sur l'hébergement se fait par archive tar extraite dans `/home/digitalelect/www/digital-prime/`, via une tâche planifiée Alwaysdata temporaire supprimée juste après exécution. La base dédiée est `digitalelect_digitalprime` (utilisateur `digitalelect_dpprime`) ; la base `digitalelect_vote` du site principal n'est pas touchée.

## Publication GitHub
Dépôt : `https://github.com/maellmoise45-coder/DIGITAL-PRIME`. Les fichiers sensibles ci-dessus ne doivent pas être versionnés.