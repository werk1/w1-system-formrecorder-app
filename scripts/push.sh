#!/bin/sh
# Klassischer Push – SSH zum Build-Server, Build remote triggern.
# Zugangsdaten werden aus .env.autodeploy im Projekt-Root gelesen.
#
# HINWEIS: Diese App wurde im Workspace-Modus erzeugt.
# Für Workspace-Transfers (lokale Packages) ist "node scripts/workspace-push-node.mjs" vorgesehen.
# Dieses Script triggert nur den Build-Server – er clont die App von GitHub.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env.autodeploy"

PUSH_START_EPOCH="$(date +%s)"
report_push_duration() {
  end_epoch="$(date +%s)"
  duration=$((end_epoch - PUSH_START_EPOCH))
  echo "[info] Beendet um       : $(date '+%Y-%m-%d %H:%M:%S %Z')" >&2
  printf '[info] Dauer            : %02dh %02dm %02ds\n' \
    $((duration / 3600)) $((duration % 3600 / 60)) $((duration % 60)) >&2
}
trap report_push_duration EXIT
echo "[info] Gestartet um     : $(date '+%Y-%m-%d %H:%M:%S %Z')" >&2

# ── .env.autodeploy prüfen ────────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  echo "[error] .env.autodeploy nicht gefunden: $ENV_FILE" >&2
  echo "        Kopiere .env.autodeploy.example und trage deine Zugangsdaten ein." >&2
  exit 1
fi

set -a
. "$ENV_FILE"
set +a

# ── Modus-Hinweis ─────────────────────────────────────────────────────────────
echo "[hinweis] Workspace-Modus: lokale Packages vorhanden." >&2
echo "          Dieses Script (push.sh) triggert nur den Build-Server – er clont von GitHub." >&2
echo "          Fuer Workspace-Transfers (lokale Packages) bitte: node scripts/workspace-push-node.mjs" >&2
echo "" >&2
printf "Trotzdem fortfahren? [j/N]: " >&2
read -r _CONTINUE_ANYWAY
if [ "$_CONTINUE_ANYWAY" != "j" ] && [ "$_CONTINUE_ANYWAY" != "J" ]; then
  echo "[abbruch] Push abgebrochen." >&2
  exit 1
fi
echo "" >&2

# ── Migrator-Image: interaktive Abfrage ──────────────────────────────────────
# Default ist nein. Wird als BUILD_MIGRATOR_IMAGE an den Build-Server übergeben.
BUILD_MIGRATOR_IMAGE="${BUILD_MIGRATOR_IMAGE:-false}"
if [ "$BUILD_MIGRATOR_IMAGE" != "true" ] && [ "$BUILD_MIGRATOR_IMAGE" != "false" ]; then
  printf "Migrator-Image erstellen? [j/N]: " >&2
  read -r _BUILD_MIGRATOR_ANSWER
  case "$_BUILD_MIGRATOR_ANSWER" in
    j|J|y|Y) BUILD_MIGRATOR_IMAGE=true ;;
    *)       BUILD_MIGRATOR_IMAGE=false ;;
  esac
fi
export BUILD_MIGRATOR_IMAGE
echo "[info] BUILD_MIGRATOR_IMAGE=$BUILD_MIGRATOR_IMAGE" >&2
echo "" >&2

# ── Mongo-Image: interaktive Abfrage ─────────────────────────────────────────
# Default ist nein. Wird als BUILD_MONGO_IMAGE an den Build-Server übergeben.
BUILD_MONGO_IMAGE="${BUILD_MONGO_IMAGE:-false}"
if [ "$BUILD_MONGO_IMAGE" != "true" ] && [ "$BUILD_MONGO_IMAGE" != "false" ]; then
  printf "Mongo-Image erstellen? [j/N]: " >&2
  read -r _BUILD_MONGO_ANSWER
  case "$_BUILD_MONGO_ANSWER" in
    j|J|y|Y) BUILD_MONGO_IMAGE=true ;;
    *)       BUILD_MONGO_IMAGE=false ;;
  esac
fi
export BUILD_MONGO_IMAGE
echo "[info] BUILD_MONGO_IMAGE=$BUILD_MONGO_IMAGE" >&2
echo "" >&2

# ── Pflichtfelder + Default-Wert-Erkennung ────────────────────────────────────
ERRORS=0

check_required() {
  var_name="$1"
  var_value="$2"
  if [ -z "$var_value" ]; then
    echo "[error] $var_name ist nicht gesetzt in .env.autodeploy" >&2
    ERRORS=$((ERRORS + 1))
  fi
}

check_default() {
  var_name="$1"
  var_value="$2"
  default_value="$3"
  if [ "$var_value" = "$default_value" ]; then
    echo "[error] $var_name hat noch den Platzhalter-Wert '$default_value' – bitte anpassen" >&2
    ERRORS=$((ERRORS + 1))
  fi
}

check_required "BUILD_SSH_HOST"  "$BUILD_SSH_HOST"
check_required "BUILD_SSH_USER"  "$BUILD_SSH_USER"
check_required "DOCKER_PASSWORD" "$DOCKER_PASSWORD"
check_required "NPM_TOKEN"       "$NPM_TOKEN"
check_required "DEPLOY_SSH_PRIVATE_KEY" "$DEPLOY_SSH_PRIVATE_KEY"

check_default "DOCKER_PASSWORD"       "$DOCKER_PASSWORD"       "DEIN_DOCKER_PASSWORT"
check_default "NPM_TOKEN"             "$NPM_TOKEN"             "DEIN_NPM_TOKEN"
check_default "DEPLOY_SSH_PRIVATE_KEY" "$DEPLOY_SSH_PRIVATE_KEY" "~/.ssh/DEIN_BUILDER_KEY"
check_default "BUILD_SSH_PASSWORD"    "$BUILD_SSH_PASSWORD"    "DEIN_BUILD_PASSWORT"

BUILD_SSH_PORT="${BUILD_SSH_PORT:-22}"
BUILD_SSH_DIR="${BUILD_SSH_DIR:-w1-system-pdfedit-app}"
DEPLOY_SSH_PORT="${DEPLOY_SSH_PORT:-22}"
DEPLOY_SSH_DIR="${DEPLOY_SSH_DIR:-w1-system-pdfedit-app}"

if [ "$ERRORS" -gt 0 ]; then
  echo "" >&2
  echo "[$ERRORS Fehler] Push abgebrochen. Bitte .env.autodeploy vervollständigen." >&2
  exit 1
fi

# ── BUILD_SSH_PASSWORD: interaktiv abfragen wenn auf Default ────────────────────
if [ "$BUILD_SSH_PASSWORD" = "DEIN_BUILD_PASSWORT" ] || [ -z "$BUILD_SSH_PASSWORD" ]; then
  printf "BUILD_SSH_PASSWORD eingeben: " >&2
  read -s BUILD_SSH_PASSWORD
  echo "" >&2
  export BUILD_SSH_PASSWORD
fi

# ── SSH_ASKPASS-Hilfsskript (ersetzt sshpass, kein externes Tool nötig) ──────────
ASKPASS_SCRIPT="$(mktemp /tmp/askpass.XXXXXX)"
printf '#!/bin/sh
printf "%%s" "%s"
' "$BUILD_SSH_PASSWORD" > "$ASKPASS_SCRIPT"
chmod +x "$ASKPASS_SCRIPT"
trap 'rm -f "$ASKPASS_SCRIPT"' EXIT INT TERM

ssh_pw() {
  SSH_ASKPASS="$ASKPASS_SCRIPT" SSH_ASKPASS_REQUIRE=force DISPLAY=     setsid ssh -o PasswordAuthentication=yes -o StrictHostKeyChecking=no "$@"
}
scp_pw() {
  SSH_ASKPASS="$ASKPASS_SCRIPT" SSH_ASKPASS_REQUIRE=force DISPLAY=     setsid scp -o PasswordAuthentication=yes -o StrictHostKeyChecking=no "$@"
}

# ── Remote-Verzeichnisse prüfen ───────────────────────────────────────────────
REMOTE_ERRORS=0

# Build-Server: Verzeichnis prüfen
BUILD_CHECK=$(ssh_pw -p "$BUILD_SSH_PORT" -o ConnectTimeout=10 "$BUILD_SSH_USER@$BUILD_SSH_HOST"   "test -d "$BUILD_SSH_DIR" && echo OK || echo MISSING" 2>/dev/null || echo "CONNECT_FAILED")

if [ "$BUILD_CHECK" = "CONNECT_FAILED" ]; then
  echo "[error] Build-Server nicht erreichbar: $BUILD_SSH_USER@$BUILD_SSH_HOST:$BUILD_SSH_PORT" >&2
  REMOTE_ERRORS=$((REMOTE_ERRORS + 1))
elif [ "$BUILD_CHECK" != "OK" ]; then
  echo "[warn] Buildverzeichnis auf Server $BUILD_SSH_HOST nicht vorhanden." >&2
  echo "       Pfad: $BUILD_SSH_HOST:$BUILD_SSH_DIR" >&2
  printf "Verzeichnis erstellen? [j/N]: " >&2
  read -r CREATE_DIR
  if [ "$CREATE_DIR" = "j" ] || [ "$CREATE_DIR" = "J" ]; then
    ssh_pw -p "$BUILD_SSH_PORT" "$BUILD_SSH_USER@$BUILD_SSH_HOST" "mkdir -p $BUILD_SSH_DIR" || { echo "[error] Konnte Verzeichnis nicht erstellen" >&2; exit 1; }
  else
    echo "[error] Buildverzeichnis fehlt. Push abgebrochen." >&2
    REMOTE_ERRORS=$((REMOTE_ERRORS + 1))
  fi
fi

# ── Docker-Modus auf dem Build-Server erkennen (rootless oder system) ─────────
# Kein System-Docker (/var/run/docker.sock) -> rootless wird angenommen; das
# Remote-Build-Script loest den Socket-Pfad selbst auf.
DOCKER_PROBE=$(ssh_pw -p "$BUILD_SSH_PORT" -o ConnectTimeout=10 "$BUILD_SSH_USER@$BUILD_SSH_HOST"   'if docker info --format "{{.SecurityOptions}}" 2>/dev/null | grep -qi rootless; then echo ROOTLESS; elif docker info >/dev/null 2>&1 || [ -S /var/run/docker.sock ]; then echo SYSTEM; else echo ROOTLESS; fi'   2>/dev/null || echo "CONNECT_FAILED")

if [ "$DOCKER_PROBE" != "CONNECT_FAILED" ]; then
  echo "[info] Docker-Modus Build-Server: $(echo "$DOCKER_PROBE" | tr '[:upper:]' '[:lower:]')" >&2
fi

# ── Docker-Modus auf dem Deploy-Server erkennen (rootless oder system) ────────
# Dort laeuft docker compose; erreicht per SSH-Hop ueber den Build-Server
# (DEPLOY_SSH_PRIVATE_KEY liegt auf dem Build-Server). Gleiche Annahme:
# kein System-Docker -> rootless.
DEPLOY_DOCKER_PROBE=$(ssh_pw -p "$BUILD_SSH_PORT" -o ConnectTimeout=10 "$BUILD_SSH_USER@$BUILD_SSH_HOST"   "ssh -i \"$DEPLOY_SSH_PRIVATE_KEY\" -p $DEPLOY_SSH_PORT $DEPLOY_SSH_USER@$DEPLOY_SSH_HOST -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o BatchMode=yes \"if docker info --format '{{.SecurityOptions}}' 2>/dev/null | grep -qi rootless; then echo ROOTLESS; elif docker info >/dev/null 2>&1 || [ -S /var/run/docker.sock ]; then echo SYSTEM; else echo ROOTLESS; fi\""   2>/dev/null || echo "CONNECT_FAILED")

if [ "$DEPLOY_DOCKER_PROBE" != "CONNECT_FAILED" ]; then
  echo "[info] Docker-Modus Deploy-Server: $(echo "$DEPLOY_DOCKER_PROBE" | tr '[:upper:]' '[:lower:]')" >&2
fi

if [ "$REMOTE_ERRORS" -gt 0 ]; then
  echo "" >&2
  echo "Push abgebrochen." >&2
  exit 1
fi

# Autodeploy-Dateien immer aktualisieren
echo "[info] Kopiere Autodeploy-Dateien (immer aktuell)..." >&2
scp_pw -P "$BUILD_SSH_PORT" "$SCRIPT_DIR/../autodeploy/multi/build_and_deploy_multi-repo.sh" "$BUILD_SSH_USER@$BUILD_SSH_HOST:$BUILD_SSH_DIR/" || { echo "[error] Konnte build_and_deploy_multi-repo.sh nicht kopieren" >&2; exit 1; }
scp_pw -P "$BUILD_SSH_PORT" "$SCRIPT_DIR/../autodeploy/multi/multi_repo_build.sh" "$BUILD_SSH_USER@$BUILD_SSH_HOST:$BUILD_SSH_DIR/" || { echo "[error] Konnte multi_repo_build.sh nicht kopieren" >&2; exit 1; }
scp_pw -P "$BUILD_SSH_PORT" "$SCRIPT_DIR/../autodeploy/multi/Dockerfile_Multi" "$BUILD_SSH_USER@$BUILD_SSH_HOST:$BUILD_SSH_DIR/" || { echo "[error] Konnte Dockerfile_Multi nicht kopieren" >&2; exit 1; }
scp_pw -P "$BUILD_SSH_PORT" "$SCRIPT_DIR/../autodeploy/multi/Dockerfile_Migrator" "$BUILD_SSH_USER@$BUILD_SSH_HOST:$BUILD_SSH_DIR/" || { echo "[error] Konnte Dockerfile_Migrator nicht kopieren" >&2; exit 1; }
if [ "${USE_INFISICAL:-false}" = "true" ]; then
  scp_pw -P "$BUILD_SSH_PORT" "$SCRIPT_DIR/../autodeploy/multi/Dockerfile_Mongo" "$BUILD_SSH_USER@$BUILD_SSH_HOST:$BUILD_SSH_DIR/" || { echo "[error] Konnte Dockerfile_Mongo nicht kopieren" >&2; exit 1; }
fi
scp_pw -P "$BUILD_SSH_PORT" "$SCRIPT_DIR/../autodeploy/multi/reinstall-optional-deps.sh" "$BUILD_SSH_USER@$BUILD_SSH_HOST:$BUILD_SSH_DIR/" || { echo "[error] Konnte reinstall-optional-deps.sh nicht kopieren" >&2; exit 1; }
scp_pw -P "$BUILD_SSH_PORT" "$SCRIPT_DIR/../autodeploy/multi/validate-runtime-packages.js" "$BUILD_SSH_USER@$BUILD_SSH_HOST:$BUILD_SSH_DIR/" || { echo "[error] Konnte validate-runtime-packages.js nicht kopieren" >&2; exit 1; }
scp_pw -P "$BUILD_SSH_PORT" "$SCRIPT_DIR/../autodeploy/multi/Dockerfile_Multi_Autodeploy_Builder" "$BUILD_SSH_USER@$BUILD_SSH_HOST:$BUILD_SSH_DIR/" || { echo "[error] Konnte Dockerfile_Multi_Autodeploy_Builder nicht kopieren" >&2; exit 1; }
scp_pw -P "$BUILD_SSH_PORT" "$SCRIPT_DIR/../autodeploy/multi/setup_deploy_server.sh" "$BUILD_SSH_USER@$BUILD_SSH_HOST:$BUILD_SSH_DIR/" || { echo "[error] Konnte setup_deploy_server.sh nicht kopieren" >&2; exit 1; }
scp_pw -P "$BUILD_SSH_PORT" "$SCRIPT_DIR/../autodeploy/multi/test_setup_and_copy_multi-repo.sh" "$BUILD_SSH_USER@$BUILD_SSH_HOST:$BUILD_SSH_DIR/" || { echo "[error] Konnte test_setup_and_copy_multi-repo.sh nicht kopieren" >&2; exit 1; }
scp_pw -P "$BUILD_SSH_PORT" "$SCRIPT_DIR/../.env.autodeploy" "$BUILD_SSH_USER@$BUILD_SSH_HOST:$BUILD_SSH_DIR/docker.env" || { echo "[error] Konnte docker.env nicht kopieren" >&2; exit 1; }
if [ -f "$SCRIPT_DIR/../create-nfs-volume.sh" ]; then
  scp_pw -P "$BUILD_SSH_PORT" "$SCRIPT_DIR/../create-nfs-volume.sh" "$BUILD_SSH_USER@$BUILD_SSH_HOST:$BUILD_SSH_DIR/create-nfs-volume.sh" || { echo "[error] Konnte create-nfs-volume.sh nicht kopieren" >&2; exit 1; }
fi
# docker-compose.yml für Deploy-Server
if [ -f "$SCRIPT_DIR/../docker-compose.yml" ]; then
  scp_pw -P "$BUILD_SSH_PORT" "$SCRIPT_DIR/../docker-compose.yml" "$BUILD_SSH_USER@$BUILD_SSH_HOST:$BUILD_SSH_DIR/docker-compose.yml" || { echo "[error] Konnte docker-compose.yml nicht kopieren" >&2; exit 1; }
fi
# .env oder .env.example für Deploy-Server
if [ -f "$SCRIPT_DIR/../.env" ]; then
  scp_pw -P "$BUILD_SSH_PORT" "$SCRIPT_DIR/../.env" "$BUILD_SSH_USER@$BUILD_SSH_HOST:$BUILD_SSH_DIR/.env" || { echo "[error] Konnte .env nicht kopieren" >&2; exit 1; }
elif [ -f "$SCRIPT_DIR/../.env.example" ]; then
  scp_pw -P "$BUILD_SSH_PORT" "$SCRIPT_DIR/../.env.example" "$BUILD_SSH_USER@$BUILD_SSH_HOST:$BUILD_SSH_DIR/.env" || { echo "[error] Konnte .env.example nicht kopieren" >&2; exit 1; }
fi
echo "[info] Autodeploy-Dateien aktualisiert." >&2

# Autodeploy-Server: Check via Build-Server (SSH-Hop) – nur Hinweis, kein Abbruch
DEPLOY_CHECK=$(ssh_pw -p "$BUILD_SSH_PORT" -o ConnectTimeout=10 "$BUILD_SSH_USER@$BUILD_SSH_HOST" \
  "ssh -i "$DEPLOY_SSH_PRIVATE_KEY" -p $DEPLOY_SSH_PORT $DEPLOY_SSH_USER@$DEPLOY_SSH_HOST -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o BatchMode=yes "test -d \"$DEPLOY_SSH_DIR\" && echo OK || echo MISSING" 2>/dev/null" 2>/dev/null || echo "CONNECT_FAILED")

if [ "$DEPLOY_CHECK" = "CONNECT_FAILED" ]; then
  echo "[warn] Autodeploy-Server vom Build-Server nicht erreichbar: $DEPLOY_SSH_USER@$DEPLOY_SSH_HOST:$DEPLOY_SSH_PORT" >&2
  echo "       Bitte Verbindung und SSH-Key auf dem Build-Server pruefen." >&2
elif [ "$DEPLOY_CHECK" != "OK" ]; then
  echo "[warn] Autodeployverzeichnis auf Server $DEPLOY_SSH_HOST nicht vorhanden: $DEPLOY_SSH_DIR" >&2
  echo "       Bitte Verzeichnis auf dem Autodeploy-Server anlegen." >&2
fi

# ── Optional: Lokale Änderungen committen und pushen ─────────────────────────
# git add -A
# git commit -a -m "push and deploy"
# git push

ssh_pw -p "$BUILD_SSH_PORT" "$BUILD_SSH_USER@$BUILD_SSH_HOST" "BUILD_MIGRATOR_IMAGE=$BUILD_MIGRATOR_IMAGE BUILD_MONGO_IMAGE=$BUILD_MONGO_IMAGE bash $BUILD_SSH_DIR/build_and_deploy_multi-repo.sh"
