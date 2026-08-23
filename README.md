# Suivi Travaux Patrimoine — Mini serveur avec comptes utilisateurs

Cette version connecte l'application **Suivi Travaux Patrimoine** à un
mini serveur Node.js qui :
- conserve tous les dossiers (ajouts, modifications, suppressions) de
  façon permanente dans `data/dossiers.json`
- gère des **comptes utilisateurs** avec connexion par identifiant et
  mot de passe
- propose une **zone d'administration** (réservée aux comptes admin)
  pour créer et supprimer les comptes des personnes autorisées à
  utiliser l'application

Aucune dépendance à installer (`npm install` non nécessaire) : tout
repose sur les briques natives de Node.js, y compris le hachage des
mots de passe (scrypt) et la gestion des sessions.

## 🚀 Installation en un clic

- **Windows** : double-cliquez sur `setup_windows.bat`
- **macOS / Linux** : lancez `./setup_mac_linux.sh`

Le script installe l'application dans un dossier permanent, crée un
raccourci sur le Bureau, démarre le serveur et ouvre le navigateur.

## Premier lancement — créer le compte administrateur

À la toute première ouverture, **aucun compte n'existe encore**.
L'écran de connexion vous propose alors de **créer le premier
compte** — il devient automatiquement administrateur.

C'est avec ce compte que vous pourrez ensuite créer un compte pour
chaque personne qui doit utiliser l'application : cliquez sur le
bouton **« Administration »** en haut de l'application (visible
uniquement pour les comptes administrateur).

## Gestion des comptes (zone Administration)

Dans la fenêtre d'administration :
- **« Nouveau compte »** : créez un identifiant, un mot de passe (4
  caractères minimum), et choisissez le rôle :
  - **Utilisateur** : peut consulter et modifier les dossiers
  - **Administrateur** : peut en plus créer/supprimer des comptes
- Chaque compte peut être **supprimé** individuellement (sauf le
  vôtre, et sauf le dernier compte administrateur restant — pour
  éviter de vous retrouver bloqué sans accès à l'administration)

## Sécurité — ce qu'il faut savoir

- Les mots de passe sont **hachés** (jamais stockés en clair), avec
  l'algorithme scrypt intégré à Node.js
- Chaque connexion génère un **jeton de session** valable 12 heures,
  gardé en mémoire côté serveur — si le serveur redémarre, tout le
  monde doit se reconnecter (comportement volontairement simple)
- ⚠️ Ce système est adapté à un **usage interne, sur un réseau de
  confiance** (bureau, intranet). Il ne remplace pas une
  authentification d'entreprise complète (pas de HTTPS forcé, pas de
  limitation de tentatives de connexion, pas de récupération de mot
  de passe oublié). Pour un déploiement plus large ou plus exposé,
  ces points mériteraient d'être renforcés — dites-le-moi si c'est
  votre cas.

## 🌐 Lien permanent, accessible depuis n'importe quel réseau

Le lien ngrok fonctionne bien pour un test rapide, mais il a deux limites :
il **change à chaque redémarrage**, et **votre ordinateur doit rester
allumé** avec le serveur qui tourne en permanence.

Pour un **lien fixe, permanent**, accessible depuis n'importe quel
réseau, même ordinateur éteint, déployez ce projet sur **Render.com**
(offre gratuite, sans carte bancaire) :

1. Créez un compte sur [render.com](https://render.com)
2. Mettez ce dossier dans un dépôt Git (GitHub) :
   - Créez un compte gratuit sur [github.com](https://github.com) si
     besoin
   - Créez un nouveau dépôt (bouton **New repository**), laissez-le
     public
   - Sur la page du dépôt vide, cliquez sur **« uploading an existing
     file »** et glissez-y tout le contenu de ce dossier (server.js,
     package.json, render.yaml, Procfile, dossiers `public/` et
     `data/`)
3. Sur Render : **New +** → **Web Service**, choisissez ce dépôt
4. Render détecte automatiquement `render.yaml` — vérifiez juste que
   le plan **Free** est sélectionné, puis **Create Web Service**
5. En 1-2 minutes, vous obtenez un lien fixe du type :
   `https://comilog-suivi-travaux.onrender.com`

**C'est ce lien-là** que vous partagez définitivement à tous vos
utilisateurs — plus besoin de relancer quoi que ce soit sur votre
ordinateur.

⚠️ **Point important** : sur l'offre gratuite de Render, le disque de
stockage est *temporaire* — les comptes et dossiers ajoutés peuvent
être réinitialisés lors d'un redéploiement ou après une longue
période d'inactivité. Pour une conservation garantie des données en
usage professionnel continu, il faut soit :
- ajouter un disque persistant chez Render (quelques dollars/mois),
- soit héberger sur l'infrastructure interne de Comilog (serveur
  intranet), à voir avec votre service informatique — c'est la
  solution la plus sûre pour des données d'entreprise sensibles.

Dites-moi si vous voulez de l'aide pour l'une de ces deux options.

## Démarrage manuel (alternative au script d'installation)

```
node server.js
```
Puis ouvrez : http://localhost:3001

Pour changer le port :
```
PORT=8080 node server.js
```

## API

| Méthode | URL                          | Accès          | Effet                                |
|---------|------------------------------|----------------|----------------------------------------|
| GET     | `/api/auth/status`           | public         | Indique si des comptes existent déjà   |
| POST    | `/api/auth/register-first`   | public (1x)    | Crée le tout premier compte (admin)    |
| POST    | `/api/auth/login`             | public         | Connexion, renvoie un jeton            |
| GET     | `/api/auth/me`                | connecté       | Infos du compte connecté               |
| POST    | `/api/auth/logout`            | connecté       | Invalide le jeton                      |
| GET     | `/api/users`                  | admin          | Liste des comptes                      |
| POST    | `/api/users`                  | admin          | Crée un compte                         |
| DELETE  | `/api/users/:id`               | admin          | Supprime un compte                     |
| GET     | `/api/dossiers`               | connecté       | Liste des dossiers                     |
| POST    | `/api/dossiers`               | connecté       | Ajoute un dossier                      |
| PUT     | `/api/dossiers/:id`            | connecté       | Modifie un dossier                     |
| DELETE  | `/api/dossiers/:id`            | connecté       | Supprime un dossier                    |
| POST    | `/api/dossiers/import`         | connecté       | Remplace tous les dossiers (import)    |
| GET     | `/api/health`                 | public         | Vérifie que le serveur répond          |

Vos données sont dans `data/dossiers.json` et `data/users.json` — de
simples fichiers texte que vous pouvez sauvegarder.
