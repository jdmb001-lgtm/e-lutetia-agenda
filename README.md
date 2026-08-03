# 📅 E-Lutetia Agenda

Une application **auto-hébergeable** et **open-source** de planification de rendez-vous,
nommée **E-Lutetia Agenda** : prise de rendez-vous, types d'événements, disponibilités,
gestion des réservations et page de réservation publique.

Le serveur (Node.js + Express), la base de données (SQLite) et l'interface (HTML/CSS/JS)
sont **entièrement auto-contenus** : une seule app à déployer, aucune dépendance externe
(service de base de données, cache, etc.). Parfait pour un VPS.

---

## ✨ Fonctionnalités

| Fonctionnalité | Description |
|---|---|
| 🔗 **Lien de réservation public** | Page `/nomutilisateur/evenement` partageable, sans compte pour l'invité |
| 🗓️ **Calendrier mensuel** | L'invité choisit un jour parmi les jours disponibles |
| ⏰ **Créneaux horaires** | Sélection d'un créneau, converti dans le fuseau de l'invité |
| 📝 **Formulaire invité** | Nom, email, notes, puis confirmation |
| 🧮 **Moteur de planification** | Anti-double-réservation, buffers avant/après, délai minimum, limite par jour |
| 🌍 **Multi-fuseaux** | Disponibilités définies dans le fuseau de l'hôte, affichées dans celui de l'invité |
| 📑 **Types d'événements** | CRUD complet : durée, lieu (visio/personne/téléphone/autre), description, couleur |
| 🕰️ **Disponibilités hebdo** | Éditeur par jour (lun→dim), fenêtres multiples, jours indisponibles |
| 📥 **Réservations** | Vue À venir / Passés / Annulés, annulation par l'hôte |
| ⚙️ **Paramètres** | Nom, nom d'utilisateur, fuseau, couleur de marque, mot de passe |
| 🔔 **Rappels automatiques** | Workflow planifié : email de rappel avant le rendez-vous |
| 📧 **Notifications** | Emails de confirmation (invité + hôte) au moment de la réservation |

---

## 🧱 Stack technique

- **Backend** : Node.js + Express
- **Base de données** : SQLite (`better-sqlite3`) — un simple fichier, facile à sauvegarder
- **Emails** : journal local par défaut, SMTP réel via variables d'environnement (Nodemailer)
- **Frontend** : HTML / CSS / JS vanilla (aucun build, aucune dépendance front)
- **Fuseaux horaires** : bibliothèque Luxon

---

## 📁 Structure du projet

```
elutetia-agenda/
├── server/
│   ├── index.js            # Serveur Express (routes, pages, démarrage)
│   ├── db.js               # Connexion SQLite + schéma
│   ├── seed.js             # Crée un compte & des événements de démo
│   ├── routes/
│   │   ├── auth.js         # Inscription / connexion / sessions
│   │   ├── events.js       # CRUD types d'événements
│   │   ├── bookings.js     # Réservations côté hôte
│   │   ├── settings.js     # Paramètres du compte
│   │   └── public.js       # Parcours de réservation public
│   └── lib/
│       ├── scheduling.js   # ★ Moteur de planification (le cœur)
│       ├── mailer.js       # Emails (journal ou SMTP)
│       └── workflows.js    # Rappels automatiques planifiés
├── public/                 # Frontend (HTML/CSS/JS)
│   ├── index.html          # Page d'accueil
│   ├── login.html / signup.html
│   ├── dashboard.html      # Tableau de bord hôte (SPA)
│   ├── booking.html        # Page de réservation publique
│   ├── css/styles.css
│   └── js/...
├── data/                   # Fichier SQLite + journal emails (gitignored)
├── Dockerfile / docker-compose.yml
└── package.json
```

---

## 🚀 Démarrage rapide (local)

Prérequis : **Node.js ≥ 18**.

```bash
npm install
node server/seed.js     # (optionnel) crée le compte de démo
npm start               # ou : node server/index.js
```

Puis ouvrez :

- **Application** : http://localhost:3000/
- **Page de réservation démo** : http://localhost:3000/demo/decouverte-30min
- **Connexion démo** : `demo@example.com` / `demo1234`

> Supprimez le compte de démo en production ou modifiez son mot de passe.

---

## 🐳 Déploiement avec Docker (recommandé)

```bash
# Construire et lancer
docker compose up -d --build

# Le service tourne sur le port 3000
# Les données persistent dans ./data
```

Ou en une ligne :

```bash
docker build -t elutetia-agenda .
docker run -d --name elutetia-agenda -p 3000:3000 -v "$(pwd)/data:/data" elutetia-agenda
```

---

## 🖥️ Déploiement sur un VPS (sans Docker)

### 1. Mettre le code sur le serveur

```bash
scp -r elutetia-agenda user@VOTRE_IP:/srv/
# ou
git clone https://...  # votre dépôt
cd /srv/elutetia-agenda
npm install --omit=dev
node server/seed.js   # optionnel : données de démo
```

### 2. Servir avec un gestionnaire de processus (systemd)

Créez `/etc/systemd/system/elutetia-agenda.service` :

```ini
[Unit]
Description=E-Lutetia Agenda
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/srv/elutetia-agenda
ExecStart=/usr/bin/node server/index.js
Environment=NODE_ENV=production
Environment=PORT=3000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now elutetia-agenda
sudo systemctl status elutetia-agenda
```

### 3. Exposer en HTTPS (Nginx + Let's Encrypt)

```nginx
server {
    listen 80;
    server_name elutetia.votredomaine.fr;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name elutetia.votredomaine.fr;
    ssl_certificate     /etc/letsencrypt/live/elutetia.votredomaine.fr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/elutetia.votredomaine.fr/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d elutetia.votredomaine.fr
```

---

## 📧 Configuration des emails

Par défaut, les emails (confirmation, rappels) sont **écrits dans un journal**
(`data/mail.log`) — idéal pour tester sans serveur SMTP.

Pour un **vrai envoi**, définissez ces variables d'environnement
(dans `docker-compose.yml`, le fichier systemd, ou `.env`) :

| Variable | Rôle |
|---|---|
| `MAIL_SMTP_HOST` | Serveur SMTP (ex. `smtp.office365.com`, `smtp.gmail.com`, `in-v3.mailjet.com`) |
| `MAIL_SMTP_PORT` | Port (587 par défaut) |
| `MAIL_SMTP_USER` | Utilisateur SMTP |
| `MAIL_SMTP_PASS` | Mot de passe SMTP |
| `MAIL_SMTP_SECURE` | `true` pour SSL/TLS (port 465) |
| `MAIL_FROM` | Adresse d'expéditeur |

---

## ⚙️ Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `3000` | Port HTTP |
| `DB_PATH` | `data/elutetia.sqlite` | Emplacement du fichier SQLite |
| `DATA_DIR` | `data/` | Dossier des données (SQLite + mail.log) |
| `REMINDER_HOURS_BEFORE` | `24` | Rappel envoyé X heures avant le rendez-vous |
| `COOKIE_SECURE` | `false` | `true` si HTTPS |

---

## 🔒 Sécurité & bonnes pratiques

- Mots de passe hachés avec **bcrypt**.
- Sessions **httpOnly** côté serveur (cookies signés), expiration 30 jours.
- **Revalidation serveur** de chaque réservation (impossible de réserver deux fois un créneau).
- Validation des entrées (email, slug, durées) sur le serveur.
- Mettez **COOKIE_SECURE=true** derrière HTTPS.
- Sauvegardez régulièrement le dossier `data/` (contient toute la base).

> ⚠️ Ce projet est un **clone pédagogique** destiné à l'apprentissage et à
> l'auto-hébergement.

---

## 🧪 Tester les API

```bash
# Page publique
curl localhost:3000/api/public/demo/decouverte-30min

# Créneaux d'un jour (date dans le fuseau de l'hôte)
curl "localhost:3000/api/public/demo/decouverte-30min/day?date=2026-08-03"

# Réserver
curl -X POST localhost:3000/api/public/demo/decouverte-30min/book \
  -H 'Content-Type: application/json' \
  -d '{"name":"Jean","email":"j@e.fr","start":"2026-08-03T07:00:00.000Z","timezone":"Europe/Paris"}'

# Connexion
curl -c cookies.txt -X POST localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@example.com","password":"demo1234"}'
```
