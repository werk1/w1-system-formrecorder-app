#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
env_file="${1:-$SCRIPT_DIR/docker.env}"

if [ ! -f "$env_file" ]; then
  echo "$env_file file not found!" >&2
  exit 1
fi

set -a
. "$env_file"
set +a

: "${DEPLOY_SSH_PRIVATE_KEY:?DEPLOY_SSH_PRIVATE_KEY missing}"
: "${DEPLOY_SSH_PORT:?DEPLOY_SSH_PORT missing}"
: "${DEPLOY_SSH_USER:?DEPLOY_SSH_USER missing}"
: "${DEPLOY_SSH_HOST:?DEPLOY_SSH_HOST missing}"
: "${DEPLOY_SSH_DIR:?DEPLOY_SSH_DIR missing}"

if [ ! -f "$DEPLOY_SSH_PRIVATE_KEY" ]; then
  echo "[ERROR] DEPLOY_SSH_PRIVATE_KEY nicht gefunden: $DEPLOY_SSH_PRIVATE_KEY" >&2
  exit 1
fi

deploy_ssh() {
  ssh -i "$DEPLOY_SSH_PRIVATE_KEY" \
    -p "$DEPLOY_SSH_PORT" "$DEPLOY_SSH_USER@$DEPLOY_SSH_HOST" \
    -o StrictHostKeyChecking=no -o BatchMode=yes -o IdentitiesOnly=yes \
    "$@"
}

deploy_scp() {
  scp -i "$DEPLOY_SSH_PRIVATE_KEY" \
    -P "$DEPLOY_SSH_PORT" \
    -o StrictHostKeyChecking=no -o BatchMode=yes -o IdentitiesOnly=yes \
    "$@"
}

find_first_existing() {
  for candidate in "$@"; do
    if [ -n "$candidate" ] && [ -f "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

require_source_file() {
  label="$1"
  shift

  source_file=$(find_first_existing "$@" || true)
  if [ -n "$source_file" ]; then
    printf '%s\n' "$source_file"
    return 0
  fi

  echo "[ERROR] Pflichtdatei fehlt auf Build-Server: $label" >&2
  for candidate in "$@"; do
    if [ -n "$candidate" ]; then
      echo "[ERROR] Geprüfter Pfad: $candidate" >&2
    fi
  done
  exit 1
}

if [ ! -f "$SCRIPT_DIR/setup_deploy_server.sh" ]; then
  echo "[ERROR] setup_deploy_server.sh fehlt: $SCRIPT_DIR/setup_deploy_server.sh" >&2
  exit 1
fi

echo "[INFO] Prüfe Autodeploy-Server: ${DEPLOY_SSH_USER}@${DEPLOY_SSH_HOST}:${DEPLOY_SSH_PORT}"
DEPLOY_REACHABLE=$(deploy_ssh "echo OK" 2>/dev/null || echo "CONNECT_FAILED")

if [ "$DEPLOY_REACHABLE" = "CONNECT_FAILED" ]; then
  echo "[ERROR] Autodeploy-Server nicht erreichbar per SSH-Key oder Key-Anmeldung fehlgeschlagen: ${DEPLOY_SSH_USER}@${DEPLOY_SSH_HOST}:${DEPLOY_SSH_PORT}" >&2
  echo "[ERROR] Verwendeter Key: $DEPLOY_SSH_PRIVATE_KEY" >&2
  exit 1
fi

if [ "$DEPLOY_REACHABLE" != "OK" ]; then
  echo "[ERROR] Unerwartete Antwort vom Autodeploy-Server: $DEPLOY_REACHABLE" >&2
  exit 1
fi

echo "[INFO] Verzeichnisstruktur sicherstellen: ${DEPLOY_SSH_USER}@${DEPLOY_SSH_HOST}:${DEPLOY_SSH_DIR}"
deploy_ssh "sh -s -- '$DEPLOY_SSH_DIR'" <<SETUP_EOF
$(cat "$SCRIPT_DIR/setup_deploy_server.sh")
SETUP_EOF

copy_if_missing() {
  local_source="$1"
  remote_name="$2"

  if [ ! -f "$local_source" ]; then
    echo "[WARN] Datei fehlt auf Build-Server – übersprungen: $local_source"
    return 0
  fi

  remote_exists=$(deploy_ssh "test -f '$DEPLOY_SSH_DIR/$remote_name' && echo YES || echo NO" 2>/dev/null || echo NO)

  if [ "$remote_exists" = "NO" ]; then
    echo "[INFO] Kopiere $remote_name nach ${DEPLOY_SSH_HOST}:${DEPLOY_SSH_DIR}/"
    deploy_scp "$local_source" "$DEPLOY_SSH_USER@$DEPLOY_SSH_HOST:$DEPLOY_SSH_DIR/$remote_name"
  else
    echo "[INFO] $remote_name bereits vorhanden – übersprungen."
  fi
}

compose_source=$(require_source_file "docker-compose.yml" \
  "$SCRIPT_DIR/docker-compose.yml" \
  "$PWD/docker-compose.yml")

env_source=$(require_source_file ".env/.env.example" \
  "$SCRIPT_DIR/.env" \
  "$SCRIPT_DIR/.env.example" \
  "$PWD/.env" \
  "$PWD/.env.example")

if [ "$compose_source" != "$SCRIPT_DIR/docker-compose.yml" ]; then
  echo "[INFO] Verwende docker-compose.yml aus: $compose_source"
fi

if [ "$env_source" != "$SCRIPT_DIR/.env" ]; then
  echo "[INFO] Verwende Env-Quelle aus: $env_source"
fi

copy_if_missing "$compose_source" "docker-compose.yml"
copy_if_missing "$env_source" ".env"

echo "[SUCCESS] Test-Setup abgeschlossen. Kein Build, kein Registry-Push, kein Deploy ausgeführt."
