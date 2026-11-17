# DIGITAL-PRIME

**DIGITAL-PRIME** est une application web de travail collaboratif (PHP + PostgreSQL) :
- comptes utilisateurs avec **couleur personnalisée** (thème) ;
- **gestion du profil** : modifier nom affiché, couleur, mot de passe ;
- **espaces de projet** : création, invitation par nom d'utilisateur, membres ;
- **partage de fichiers** (textes, images, PDF, etc.) : envoi, téléchargement, suppression ;
- **édition de textes en ligne** : modifier et enregistrer, ou **renvoyer comme nouvelle version** ;
- **commentaires** sur chaque élément ;
- **appels** par projet : **visio (caméra + micro)** ou **appel simple (audio)** via WebRTC (signalisation intégrée).

Logo : H stylisé (`images/logo-h.svg`).

## Prérequis
- **XAMPP** (Apache + PHP 8+) avec extensions : `pdo_pgsql`, `pgsql`, `fileinfo`, `mbstring`, `session` (activées dans `php.ini`).
- **PostgreSQL** installé et en cours d'exécution.
- Droits d’écriture serveur web sur `data/` et `uploads/`.

## Installation dans XAMPP avec PostgreSQL
1. **Copier l’application** dans `C:\xampp\htdocs\digital-prime` (déjà fait si vous utilisez ce dossier).
2. **Créer la base PostgreSQL** (adapter l’utilisateur si besoin) :
   ```bash
   createdb -U postgres digital_prime
   psql -U postgres -d digital_prime -f database/schema.sql
   ```
   > Sans `psql`, créez une base vide nommée `digital_prime` puis ouvrez `http://localhost/digital-prime/api/install_db.php` après l’étape 3 (et supprimez ce fichier ensuite).
3. **Configurer la connexion** : copier `api/config.local.example.php` en `api/config.local.php` et renseigner hôte/port/base/utilisateur/mot de passe PostgreSQL.
4. **Démarrer Apache** dans XAMPP, puis ouvrir : `http://localhost/digital-prime/`
5. Créer un compte, créer un projet, inviter des amis (comptes sur la même instance).

## Structure
```
digital-prime/
├── index.html, app.html
├── css/style.css
├── js/api.js, js/app.js
├── images/logo-h.svg
├── api/ (config.php, auth.php, projects.php, items.php, comments.php, video.php, install_db.php)
├── database/schema.sql
├── data/ (protégé)
└── uploads/ (protégé, non exécutable)
```

## Appels visio / audio
- Bouton **« 📹 Appel vidéo »** dans un projet → choix **visio** ou **appel simple (audio)**.
- WebRTC pair-à-pair avec signalisation PHP (`api/video.php`).
- Les navigateurs exigent **HTTPS** pour caméra/micro hors `localhost`. Sur réseaux restrictifs (NAT symétrique), un serveur **TURN** peut être requis pour relayer le média.

## Déploiement sur Alwaysdata (nom : digital-prime)
1. Créer un site PHP nommé `digital-prime` (ex. `digital-prime.alwaysdata.net`) et activer HTTPS.
2. Créer une base PostgreSQL sur Alwaysdata et importer `database/schema.sql`.
3. Déposer les fichiers, créer `api/config.local.php` avec les identifiants Alwaysdata, donner les droits d’écriture à `data/` et `uploads/`.
4. Supprimer `api/install_db.php` après installation.

## Publication GitHub
Git/GitHub CLI non disponibles ici : initialisez et poussez depuis une machine avec git (`git init`, commit, remote vers `https://github.com/<utilisateur>/DIGITAL-PRIME.git`).

## Sécurité (rappel)
Base saine pour usage privé (hashage mots de passe, requêtes préparées, contrôle d’accès API, uploads isolés). Pour un usage public : HTTPS obligatoire, cookies sécurisés, protection CSRF, rate limiting, durcissement des uploads et sauvegardes. Supprimez `api/install_db.php` après mise en place.
