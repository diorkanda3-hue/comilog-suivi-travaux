#!/bin/bash
set -e

echo ""
echo "  ====================================================="
echo "   SUIVI TRAVAUX PATRIMOINE - Installation (Comilog)"
echo "  ====================================================="
echo ""

if ! command -v node &> /dev/null; then
    echo "  [!] Node.js n'est pas installé sur cet ordinateur."
    echo "  Ouverture du site officiel de téléchargement..."
    if command -v open &> /dev/null; then open "https://nodejs.org/fr/download"
    elif command -v xdg-open &> /dev/null; then xdg-open "https://nodejs.org/fr/download"
    else echo "  Rendez-vous sur : https://nodejs.org/fr/download"
    fi
    exit 1
fi

echo "  [OK] Node.js détecté : $(node --version)"
echo ""

INSTALL_DIR="$HOME/SuiviTravauxPatrimoine"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "  Installation dans : $INSTALL_DIR"
echo ""
mkdir -p "$INSTALL_DIR"

echo "  Copie des fichiers de l'application..."
cp "$SCRIPT_DIR/server.js" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/package.json" "$INSTALL_DIR/"
mkdir -p "$INSTALL_DIR/public"
cp -R "$SCRIPT_DIR/public/." "$INSTALL_DIR/public/"

if [ ! -d "$INSTALL_DIR/data" ]; then
    mkdir -p "$INSTALL_DIR/data"
    cp -R "$SCRIPT_DIR/data/." "$INSTALL_DIR/data/"
else
    echo "  [i] Un dossier de données existe déjà - conservé tel quel (comptes et dossiers préservés)."
fi

echo "  Création du lanceur..."
cat > "$INSTALL_DIR/Lancer Suivi Travaux.command" << EOF
#!/bin/bash
cd "$INSTALL_DIR"
( sleep 2 && open "http://localhost:3001" ) &
node server.js
EOF
chmod +x "$INSTALL_DIR/Lancer Suivi Travaux.command"

echo ""
echo "  ====================================================="
echo "   INSTALLATION TERMINÉE"
echo "  ====================================================="
echo ""
echo "  Pour relancer l'application plus tard, double-cliquez sur :"
echo "  $INSTALL_DIR/Lancer Suivi Travaux.command"
echo ""
echo "  IMPORTANT - Première ouverture :"
echo "  Aucun compte n'existe encore. L'écran de connexion va vous"
echo "  proposer de créer le premier compte, qui deviendra"
echo "  automatiquement administrateur. Depuis ce compte, vous"
echo "  pourrez ensuite créer les comptes de vos collègues"
echo "  (bouton « Administration » en haut de l'application)."
echo ""

cd "$INSTALL_DIR"
( sleep 2 && (open "http://localhost:3001" 2>/dev/null || xdg-open "http://localhost:3001" 2>/dev/null) ) &
node server.js
