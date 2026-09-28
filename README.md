# SpeedPost — Web

Serveur, **site vitrine** et **application web** de SpeedPost. Applications de bureau : [SpeedPost-Windows](https://github.com/Heiphaistos/SpeedPost-Windows) · [SpeedPost-Linux](https://github.com/Heiphaistos/SpeedPost-Linux).

Transfert de fichiers **chiffré et auto-hébergé**, façon WeTransfer / SwissTransfer : on dépose des fichiers, on obtient **un simple lien** à partager. Pas de compte, e-mail facultatif.

- 🌐 **Site vitrine** (accueil, fonctionnalités, sécurité, applications, FAQ, confidentialité) et **application web** sur `/app`, hébergés sur votre VPS (ex. `https://speedpost.mondomaine.fr`)
- 🪟🐧 **Applications Windows et Linux** (dépôts séparés) : glisser-déposer, clic droit sur un fichier, lien copié automatiquement, notification, historique
- ⬇️ Page **Applications** : déposez les `.exe`, `.AppImage` et `.deb` dans `DATA_DIR/downloads` (ou `DOWNLOADS_DIR`), ils sont proposés automatiquement (repli sur les releases GitHub)
- 🔐 **Chiffrement AES-256-GCM** : une clé aléatoire par envoi, qui n'existe **que dans le lien** (`/d/<id>#<clé>`). Le serveur ne l'enregistre jamais : sans le lien, fichiers, noms, titre, message et e-mails sont illisibles, même pour l'administrateur.
- 📦 Plusieurs fichiers, jusqu'à 10 Go chacun (réglable), envoi par morceaux de 48 Mo **avec reprise automatique** (coupure réseau, Cloudflare…), téléchargements avec reprise
- ⏳ Expiration (1 à 365 jours), nombre de téléchargements maximum, mot de passe facultatif
- ✉️ E-mail **facultatif** : lien seul, bouton « Par e-mail » (votre messagerie), ou envoi par le serveur si un SMTP est configuré
- 🗑️ Suppression par l'expéditeur (« Mes envois », gardés sur l'appareil), purge automatique des transferts expirés

> Ce que le chiffrement protège : les fichiers **stockés** sur le serveur (vol du disque, sauvegarde, accès au VPS). Pendant un envoi ou un téléchargement, le serveur utilise la clé en mémoire le temps de la requête. Perdre le lien, c'est perdre l'accès aux fichiers.

## Installation sur le VPS (Debian / Ubuntu)

1. Créez l'enregistrement DNS `speedpost.mondomaine.fr` (type A) vers l'IP du VPS.
2. Sur le VPS :
   ```bash
   git clone https://github.com/Heiphaistos/SpeedPost-Web.git && cd SpeedPost-Web
   sudo bash deploy/install.sh speedpost.mondomaine.fr
   ```
   Le script installe Node 22, nginx et le certificat HTTPS (Let's Encrypt), crée le service `speedpost` (systemd) et stocke les données dans `/var/lib/speedpost`.
3. Réglages : `/opt/speedpost/.env` (voir `.env.example`), puis `sudo systemctl restart speedpost`.
   - `UPLOAD_PASSWORD=` vide : tout le monde peut envoyer (sans compte). Renseigné : serveur privé (le mot de passe est demandé une fois, puis mémorisé).
   - `SMTP_URL` : facultatif, pour que le serveur envoie lui-même le lien par e-mail.

Mise à jour : `git pull && sudo cp -r src public package.json /opt/speedpost/ && cd /opt/speedpost && sudo -u speedpost npm install --omit=dev && sudo systemctl restart speedpost`.

Avec Docker : `docker build -t speedpost . && docker run -d -p 127.0.0.1:3080:3080 -v speedpost:/data -e PUBLIC_URL=https://speedpost.mondomaine.fr speedpost` (derrière nginx : `deploy/nginx.conf`).

## Site et pages

| Adresse | Contenu |
| --- | --- |
| `/` | Accueil (vitrine) |
| `/fonctionnalites.html`, `/securite.html`, `/telecharger.html`, `/faq.html`, `/confidentialite.html` | Pages du site |
| `/app` | Application d'envoi (et `/app#envois` : Mes envois) |
| `/d/<id>#<clé>` | Page de téléchargement |

Les pages de la vitrine sont générées par `npm run site` (en-tête et pied de page communs, `scripts/build-site.mjs`).

## Développement

```bash
npm install
npm test          # API, chiffrement, site
PORT=3080 npm start
```

## API

| Méthode | Route | Rôle |
| --- | --- | --- |
| `GET` | `/api/config` | Limites du serveur, mot de passe d'envoi requis ou non |
| `POST` | `/api/transfers` | Démarre un envoi (en-tête `x-transfer-key` : clé base64url de 32 octets générée par le client) → `{ id, uploadToken }` |
| `PUT` | `/api/transfers/:id/files?idx&offset&total&name` | Morceau d'un fichier (`application/octet-stream`, en-têtes `x-transfer-key`, `x-upload-token`) |
| `POST` | `/api/transfers/:id/finish` | Termine l'envoi → `{ url, deleteToken }` |
| `GET` | `/api/transfers/:id` | Infos déchiffrées (`x-transfer-key`) |
| `POST` | `/api/transfers/:id/unlock` | Mot de passe de téléchargement |
| `GET` | `/api/transfers/:id/files/:idx?t&c` | Téléchargement déchiffré à la volée (Range pris en charge) |
| `DELETE` | `/api/transfers/:id` | Suppression (`x-delete-token`) |

Format de stockage : blocs de 1 Mio chiffrés en AES-256-GCM (tag de 16 octets par bloc, nonce = préfixe du fichier + numéro de bloc, drapeau « dernier bloc » authentifié) — identique au module `transfer` de HeiphaisBot.

## Licence

MIT
