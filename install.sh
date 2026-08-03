#!/usr/bin/env bash
# =============================================================================
#  Installation automatique de E-Lutetia Agenda (Oracle Cloud / VPS Ubuntu/Debian)
# -----------------------------------------------------------------------------
#  Usage :
#     git clone <URL_de_votre_depot> && cd elutetia-agenda
#     sudo bash install.sh
#
#  (Optionnel) Si vous avez un nom de domaine :
#     DOMAIN=agenda.votredomaine.fr sudo -E bash install.sh
#
#  Le script installe Node.js, compile la base de données, configure un
#  service systemd et Nginx. Puis il affiche l'adresse de votre application.
# =============================================================================
set -e

# --- Variables --------------------------------------------------------------
APP_NAME="elutetia-agenda"
APP_DIR="$(pwd)"                 # dossier où se trouve le projet
SYSTEMD_DIR="/etc/systemd/system"
NGINX_DIR="/etc/nginx/sites-available"
DOMAIN="${DOMAIN:-}"             # vide = on utilise l'adresse IP
NODE_MAJOR="20"

# --- Couleurs d'affichage ---------------------------------------------------
R='\033[0;31m'; V='\033[0;32m'; J='\033[0;33m'; B='\033[0;34m'; N='\033[0m'
ok()  { echo -e "${V}✔${N} $1"; }
info(){ echo -e "${B}→${N} $1"; }
warn(){ echo -e "${J}⚠${N} $1"; }
err() { echo -e "${R}✖${N} $1"; }

echo -e "${B}==============================================${N}"
echo -e "${B} Installation de ${APP_NAME} (E-Lutetia Agenda)${N}"
echo -e "${B}==============================================${N}"

# --- Vérifier qu'on est bien dans le dossier du projet -----------------------
if [ ! -f "$APP_DIR/package.json" ] || [ ! -d "$APP_DIR/server" ]; then
  err "Impossible de trouver le projet. Lancez ce script depuis le dossier du projet :"
  err "  cd elutetia-agenda && sudo bash install.sh"
  exit 1
fi

# --- Vérifier les droits root -------------------------------------------------
if [ "$EUID" -ne 0 ]; then
  err "Veuillez lancer ce script avec sudo :"
  err "  sudo bash install.sh"
  exit 1
fi

# --- Mise à jour du système --------------------------------------------------
info "Mise à jour du système..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y >/dev/null 2>&1 || true
apt-get install -y curl git build-essential python3 unzip >/dev/null 2>&1
ok "Outils système installés (git, curl, compilateurs...)."

# --- Installation de Node.js -------------------------------------------------
if command -v node >/dev/null 2>&1 && [ "$(node -v | cut -d. -f1 | sed 's/v//')" -ge 18 ]; then
  ok "Node.js déjà installé : $(node -v)"
else
  info "Installation de Node.js ${NODE_MAJOR} (nécessaire pour la base de données)..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null 2>&1
  apt-get install -y nodejs >/dev/null 2>&1
  ok "Node.js installé : $(node -v)"
fi

# --- Installation des dépendances du projet -----------------------------------
info "Installation des dépendances (compilation de la base SQLite)..."
cd "$APP_DIR"
npm install --omit=dev >/dev/null 2>&1
ok "Dépendances installées."

# --- Créer le dossier de données (persistant) ---------------------------------
mkdir -p "$APP_DIR/data"
chmod 755 "$APP_DIR/data"
ok "Dossier de données prêt (les rendez-vous y seront sauvegardés)."

# --- Préparer le compte de démo ------------------------------------------------
info "Préparation des données de démarrage..."
node server/seed.js || true
ok "Données de base créées."

# --- Créer le service systemd ---------------------------------------------------
info "Création du service systemd (relance automatique)..."
cat > "$SYSTEMD_DIR/$APP_NAME.service" <<EOF
[Unit]
Description=E-Lutetia Agenda
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
ExecStart=$(command -v node) $APP_DIR/server/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=DATA_DIR=$APP_DIR/data
EOF
systemctl daemon-reload
systemctl enable "$APP_NAME" >/dev/null 2>&1
systemctl restart "$APP_NAME"
sleep 2
if systemctl is-active --quiet "$APP_NAME"; then
  ok "Service $APP_NAME actif."
else
  err "Le service n'a pas démarré. Vérifiez les logs : journalctl -u $APP_NAME"
fi

# --- Installation de Nginx (reverse proxy) ---------------------------------------
info "Configuration de Nginx..."
apt-get install -y nginx >/dev/null 2>&1 || true

# Détection de l'adresse IP publique
IP=$(curl -4 -s ifconfig.me 2>/dev/null || curl -4 -s icanhazip.com 2>/dev/null || echo "VOTRE_IP")
SERVER_NAME="${DOMAIN:-$IP}"

if [ -n "$DOMAIN" ]; then
  # Avec domaine : redirection http -> https sera faite par certbot
  CONF="server {
    listen 80;
    server_name $DOMAIN;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}"
else
  # Sans domaine : réponse directe sur l'IP
  CONF="server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}"
fi

echo "$CONF" > "$NGINX_DIR/$APP_NAME"
# Désactiver le site par défaut pour éviter les conflits
rm -f /etc/nginx/sites-enabled/default
ln -sf "$NGINX_DIR/$APP_NAME" "/etc/nginx/sites-enabled/$APP_NAME"
nginx -t >/dev/null 2>&1 && systemctl reload nginx || systemctl restart nginx
ok "Nginx configuré."

# --- (Option) HTTPS avec Let's Encrypt si domaine fourni ------------------------
if [ -n "$DOMAIN" ]; then
  info "Ajout du HTTPS (certificat Let's Encrypt) pour $DOMAIN..."
  apt-get install -y certbot python3-certbot-nginx >/dev/null 2>&1
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "admin@$DOMAIN" --redirect >/dev/null 2>&1 \
    && ok "HTTPS activé pour https://$DOMAIN" \
    || warn "Certbot n'a pas pu configurer le HTTPS (domaine doit pointer vers ce serveur). L'app reste accessible en http."
fi

# --- Sécurisation du cookie derrière HTTPS -------------------------------------
if [ -n "$DOMAIN" ] && grep -q "listen 443" /etc/nginx/sites-available/"$APP_NAME" 2>/dev/null; then
  # On ajoute la variable COOKIE_SECURE au service
  sed -i '/Environment=DATA_DIR/a Environment=COOKIE_SECURE=true' "$SYSTEMD_DIR/$APP_NAME.service"
  systemctl daemon-reload
  systemctl restart "$APP_NAME"
fi

# --- Récapitulatif ---------------------------------------------------------------
echo ""
echo -e "${V}=======================================================${N}"
echo -e "${V} Installation terminée avec succès ! 🎉${N}"
echo -e "${V}=======================================================${N}"
if [ -n "$DOMAIN" ]; then
  echo -e "   🌐 Application  :  https://$DOMAIN"
  echo -e "   🔐 Page démo    :  https://$DOMAIN/demo/decouverte-30min"
  echo -e "   👤 Connexion    :  https://$DOMAIN/login"
else
  echo -e "   🌐 Application  :  http://$IP:80  (ou http://$IP)"
  echo -e "   🔐 Page démo    :  http://$IP/demo/decouverte-30min"
  echo -e "   👤 Connexion    :  http://$IP/login"
fi
echo ""
echo -e "   👥 Compte démo   :  demo@example.com  /  demo1234"
echo -e "   📁 Données       :  $APP_DIR/data/ (sauvegardez ce dossier)"
echo ""
echo -e "   ${J}⚠ IMPORTANT${N} : si vous utilisez l'adresse IP (pas de domaine),"
echo -e "   la connexion s'affichera comme non-sécurisée (http). C'est normal."
echo -e "   Pour un vrai nom de domaine, relancez le script avec :"
echo -e "   ${B}DOMAIN=votre.domaine.fr sudo -E bash install.sh${N}"
echo ""
