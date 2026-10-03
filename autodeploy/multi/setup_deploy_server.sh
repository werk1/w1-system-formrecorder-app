#!/bin/sh
# setup_deploy_server.sh
# Bereitet das Deploy-Verzeichnis auf dem Zielserver vor.
# Wird vom Build-Server per SSH aufgerufen, wenn DEPLOY_SSH_DIR noch nicht vorhanden ist.
# Erwartet als Argumente: <deploy_dir>
# Wird mit diesen env-Variablen ausgeführt (via SSH heredoc): keine – alles via $1

set -eu

DEPLOY_DIR="${1:?Kein DEPLOY_DIR übergeben}"

echo "[SETUP] Erstelle Verzeichnisstruktur: $DEPLOY_DIR"
mkdir -p \
  "$DEPLOY_DIR" \
  "$DEPLOY_DIR/media" \
  "$DEPLOY_DIR/assets" \
  "$DEPLOY_DIR/app-font-assets" \
  "$DEPLOY_DIR/data"

echo "[SETUP] Verzeichnisse angelegt:"
echo "  $DEPLOY_DIR"
echo "  $DEPLOY_DIR/media"
echo "  $DEPLOY_DIR/assets"
echo "  $DEPLOY_DIR/app-font-assets"
echo "  $DEPLOY_DIR/data"
