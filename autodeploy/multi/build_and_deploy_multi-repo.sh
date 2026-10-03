#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

# Usage: ./w1-system-core_build_and_deploy_multi-repo.sh [env-file]
env_file="${1:-$SCRIPT_DIR/docker.env}"

if [ ! -f "$env_file" ]; then
  echo "$env_file file not found!" >&2
  exit 1
fi

set -a
. "$env_file"
set +a

# ── Migrator-Image: interaktive Abfrage ──────────────────────────────────────
# Default ist nein. Wird nur gebaut/deployt, wenn der Benutzer mit j/J bestätigt.
# Push-Scripts setzen BUILD_MIGRATOR_IMAGE bereits vor dem Aufruf; in diesem Fall
# wird die Abfrage hier übersprungen.
if [ -z "${BUILD_MIGRATOR_IMAGE:-}" ]; then
  printf "Migrator-Image erstellen? [j/N]: "
  read -r _BUILD_MIGRATOR_ANSWER
  case "$_BUILD_MIGRATOR_ANSWER" in
    j|J|y|Y) BUILD_MIGRATOR_IMAGE=true ;;
    *)       BUILD_MIGRATOR_IMAGE=false ;;
  esac
fi
export BUILD_MIGRATOR_IMAGE
echo "[INFO] BUILD_MIGRATOR_IMAGE=$BUILD_MIGRATOR_IMAGE"

# ── Mongo-Image: interaktive Abfrage ─────────────────────────────────────────
# Default ist nein. Wird nur gebaut/deployt, wenn der Benutzer mit j/J bestätigt.
# Push-Scripts setzen BUILD_MONGO_IMAGE bereits vor dem Aufruf; in diesem Fall
# wird die Abfrage hier übersprungen.
if [ -z "${BUILD_MONGO_IMAGE:-}" ]; then
  printf "Mongo-Image erstellen? [j/N]: "
  read -r _BUILD_MONGO_ANSWER
  case "$_BUILD_MONGO_ANSWER" in
    j|J|y|Y) BUILD_MONGO_IMAGE=true ;;
    *)       BUILD_MONGO_IMAGE=false ;;
  esac
fi
export BUILD_MONGO_IMAGE
echo "[INFO] BUILD_MONGO_IMAGE=$BUILD_MONGO_IMAGE"

# ── Docker-Daemon erkennen (rootless oder system-weit) ────────────────────────
# Rootless Docker lauscht auf $XDG_RUNTIME_DIR/docker.sock (ueblich
# /run/user/<uid>/docker.sock), nicht auf /var/run/docker.sock. In
# nicht-interaktiven SSH-Sessions ist DOCKER_HOST meist nicht gesetzt, darum
# wird der Socket-Pfad hier explizit aufgeloest. Ein gesetztes DOCKER_HOST
# (z.B. aus docker.env) hat Vorrang.
DOCKER_SOCK=""
case "${DOCKER_HOST:-}" in
  unix://*) DOCKER_SOCK="${DOCKER_HOST#unix://}" ;;
esac
if [ -z "$DOCKER_SOCK" ] && [ -z "${DOCKER_HOST:-}" ]; then
  if [ -S /var/run/docker.sock ]; then
    DOCKER_SOCK=/var/run/docker.sock
  else
    for _docker_sock_candidate in \
      "${XDG_RUNTIME_DIR:-}/docker.sock" \
      "/run/user/$(id -u)/docker.sock" \
      "$HOME/.docker/run/docker.sock"; do
      if [ -n "$_docker_sock_candidate" ] && [ -S "$_docker_sock_candidate" ]; then
        DOCKER_SOCK="$_docker_sock_candidate"
        break
      fi
    done
    if [ -n "$DOCKER_SOCK" ]; then
      export DOCKER_HOST="unix://$DOCKER_SOCK"
    fi
  fi
fi

if ! docker version >/dev/null 2>&1; then
  echo "[ERROR] Docker-Daemon auf dem Build-Server nicht erreichbar." >&2
  echo "        Weder /var/run/docker.sock noch ein Rootless-Socket" >&2
  echo "        (/run/user/<uid>/docker.sock) wurde gefunden." >&2
  echo "        Bei abweichendem Pfad DOCKER_HOST in docker.env setzen." >&2
  exit 1
fi

DOCKER_MODE="system"
if docker info --format '{{json .SecurityOptions}}' 2>/dev/null | grep -qi rootless; then
  DOCKER_MODE="rootless"
fi
if [ -n "$DOCKER_SOCK" ]; then
  echo "[INFO] Docker-Modus       : $DOCKER_MODE (Socket: $DOCKER_SOCK)"
else
  echo "[INFO] Docker-Modus       : $DOCKER_MODE (DOCKER_HOST: ${DOCKER_HOST:-default})"
fi

RUN_ID="$(date +%s)-$$"
BUILDER_CONTAINER_NAME="autodeploy-builder-$RUN_ID"
BUILDER_IMAGE_TAG="autodeploy-builder:$RUN_ID"

BUILD_START_EPOCH="$(date +%s)"
DURATION_REPORTED=0
report_duration() {
  if [ "$DURATION_REPORTED" = "1" ]; then return; fi
  DURATION_REPORTED=1
  end_epoch="$(date +%s)"
  duration=$((end_epoch - BUILD_START_EPOCH))
  echo "[INFO] Beendet um       : $(date '+%Y-%m-%d %H:%M:%S %Z')"
  printf '[INFO] Dauer            : %02dh %02dm %02ds\n' \
    $((duration / 3600)) $((duration % 3600 / 60)) $((duration % 60))
}
echo "[INFO] Gestartet um     : $(date '+%Y-%m-%d %H:%M:%S %Z')"

cleanup() {
  docker rm -f "$BUILDER_CONTAINER_NAME" 2>/dev/null || true
  report_duration
}

trap cleanup EXIT INT TERM

# ── Autodeploy-Server erreichbarkeit prüfen ─────────────────────────────
echo "[INFO] Prüfe Autodeploy-Server: ${DEPLOY_SSH_USER}@${DEPLOY_SSH_HOST}:${DEPLOY_SSH_PORT}"
DEPLOY_REACHABLE=$(ssh -i "$DEPLOY_SSH_PRIVATE_KEY" \
  -p "$DEPLOY_SSH_PORT" "$DEPLOY_SSH_USER@$DEPLOY_SSH_HOST" \
  -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o BatchMode=yes \
  "echo OK" 2>/dev/null || echo "CONNECT_FAILED")

if [ "$DEPLOY_REACHABLE" = "CONNECT_FAILED" ]; then
  echo "[ERROR] Autodeploy-Server nicht erreichbar: ${DEPLOY_SSH_USER}@${DEPLOY_SSH_HOST}:${DEPLOY_SSH_PORT}" >&2
  echo "        Bitte SSH-Key und Verbindung prüfen. Build wird nicht gestartet." >&2
  exit 1
fi
echo "[INFO] Autodeploy-Server erreichbar."

echo "[INFO] Building autodeploy-builder"
echo "[INFO] Builder container: $BUILDER_CONTAINER_NAME"
echo "[INFO] Builder image tag : $BUILDER_IMAGE_TAG"

DOCKER_GID=""
if [ -n "$DOCKER_SOCK" ] && [ -S "$DOCKER_SOCK" ]; then
  DOCKER_GID=$(stat -c '%g' "$DOCKER_SOCK" 2>/dev/null || true)
fi
echo "[INFO] Docker socket GID: ${DOCKER_GID:-n/a}"

BUNDLE_MOUNT_ARG=""
if [ -d "$SCRIPT_DIR/bundles" ] && ls "$SCRIPT_DIR/bundles"/*.bundle >/dev/null 2>&1; then
  BUNDLE_MOUNT_ARG="-v $SCRIPT_DIR/bundles:/workspace/bundles:ro"
  echo "[INFO] Bundle-Modus: Bundles werden in Container gemountet"
fi

docker build \
  --build-arg DOCKER_GID="$DOCKER_GID" \
  -f "$SCRIPT_DIR/Dockerfile_Multi_Autodeploy_Builder" \
  -t "$BUILDER_IMAGE_TAG" \
  "$SCRIPT_DIR"

SSH_KEY_MOUNT_ARG=""
if [ -n "${SSH_PRIVATE_KEY:-}" ] && [ -f "${SSH_PRIVATE_KEY:-}" ]; then
  SSH_KEY_MOUNT_ARG="-v $SSH_PRIVATE_KEY:/home/builder/.ssh/id_rsa:ro"
fi

DEPLOY_SSH_KEY_MOUNT_ARG=""
if [ -n "${DEPLOY_SSH_PRIVATE_KEY:-}" ] && [ -f "${DEPLOY_SSH_PRIVATE_KEY:-}" ]; then
  DEPLOY_SSH_KEY_MOUNT_ARG="-v $DEPLOY_SSH_PRIVATE_KEY:/home/builder/.ssh/id_builder_rsa:ro"
fi

DOCKER_DAEMON_ARGS=""
if [ -n "$DOCKER_SOCK" ]; then
  # Im Container immer am Standard-Pfad – der CLI dort braucht keine Konfiguration.
  DOCKER_DAEMON_ARGS="-v $DOCKER_SOCK:/var/run/docker.sock"
elif [ -n "${DOCKER_HOST:-}" ]; then
  # tcp:// oder ssh:// Daemon: kein Socket-Mount moeglich, Host-Env weiterreichen.
  DOCKER_DAEMON_ARGS="-e DOCKER_HOST=$DOCKER_HOST"
fi

docker run --rm -d \
  --name "$BUILDER_CONTAINER_NAME" \
  ${DOCKER_DAEMON_ARGS:+$DOCKER_DAEMON_ARGS} \
  ${SSH_KEY_MOUNT_ARG:+$SSH_KEY_MOUNT_ARG} \
  ${DEPLOY_SSH_KEY_MOUNT_ARG:+$DEPLOY_SSH_KEY_MOUNT_ARG} \
  ${BUNDLE_MOUNT_ARG:+$BUNDLE_MOUNT_ARG} \
  -e MAIN_PROJECT_NAME \
  -e REPO_URL \
  -e GIT_BRANCH \
  -e DOCKER_IMAGE_NAME \
  -e DOCKER_REG_NAME \
  -e DOCKER_USERNAME \
  -e DOCKER_PASSWORD \
  -e NPM_TOKEN \
  -e RUN_ID="$RUN_ID" \
  -e DEPLOY_SSH_PORT \
  -e DEPLOY_SSH_USER \
  -e DEPLOY_SSH_HOST \
  -e DEPLOY_SSH_DIR \
  -e GITHUB_ORG \
  -e LOCAL_DEPS_ENABLED \
  -e LOCAL_DEPS \
  -e BUILD_MIGRATOR_IMAGE \
  -e BUILD_MONGO_IMAGE \
  -w /workspace \
  "$BUILDER_IMAGE_TAG" \
  tail -f /dev/null


echo "[INFO] Injecting build script and Dockerfile"

cat "$SCRIPT_DIR/multi_repo_build.sh" \
  | docker exec -i "$BUILDER_CONTAINER_NAME" tee /workspace/multi_repo_build.sh >/dev/null

docker exec "$BUILDER_CONTAINER_NAME" chmod +x /workspace/multi_repo_build.sh

cat "$SCRIPT_DIR/Dockerfile_Multi" \
  | docker exec -i "$BUILDER_CONTAINER_NAME" tee /workspace/Dockerfile_Multi >/dev/null

cat "$SCRIPT_DIR/Dockerfile_Migrator" \
  | docker exec -i "$BUILDER_CONTAINER_NAME" tee /workspace/Dockerfile_Migrator >/dev/null

if [ -f "$SCRIPT_DIR/Dockerfile_Mongo" ]; then
  cat "$SCRIPT_DIR/Dockerfile_Mongo" \
    | docker exec -i "$BUILDER_CONTAINER_NAME" tee /workspace/Dockerfile_Mongo >/dev/null
fi

cat "$SCRIPT_DIR/reinstall-optional-deps.sh" \
  | docker exec -i "$BUILDER_CONTAINER_NAME" tee /workspace/reinstall-optional-deps.sh >/dev/null
cat "$SCRIPT_DIR/validate-runtime-packages.js" \
  | docker exec -i "$BUILDER_CONTAINER_NAME" tee /workspace/validate-runtime-packages.js >/dev/null

cat "$SCRIPT_DIR/setup_deploy_server.sh" \
  | docker exec -i "$BUILDER_CONTAINER_NAME" tee /workspace/setup_deploy_server.sh >/dev/null
docker exec "$BUILDER_CONTAINER_NAME" chmod +x /workspace/setup_deploy_server.sh

echo "[INFO] Running multi-repo build"
docker exec "$BUILDER_CONTAINER_NAME" bash /workspace/multi_repo_build.sh

docker rm -f "$BUILDER_CONTAINER_NAME" 2>/dev/null || true
echo "[INFO] Removing builder image: $BUILDER_IMAGE_TAG"
docker rmi "$BUILDER_IMAGE_TAG" 2>/dev/null || true
trap report_duration EXIT INT TERM

# ── Deploy-Server einrichten (idempotent) ──────────────────────────────────
echo "[INFO] Verzeichnisstruktur sicherstellen: ${DEPLOY_SSH_USER}@${DEPLOY_SSH_HOST}:${DEPLOY_SSH_DIR}"
ssh -i "$DEPLOY_SSH_PRIVATE_KEY" \
  -p "$DEPLOY_SSH_PORT" "$DEPLOY_SSH_USER@$DEPLOY_SSH_HOST" \
  -o StrictHostKeyChecking=no \
  "sh -s -- '$DEPLOY_SSH_DIR'" <<SETUP_EOF
$(cat "$SCRIPT_DIR/setup_deploy_server.sh")
SETUP_EOF

if [ -f "$SCRIPT_DIR/docker-compose.yml" ]; then
  COMPOSE_EXISTS=$(ssh -i "$DEPLOY_SSH_PRIVATE_KEY" \
    -p "$DEPLOY_SSH_PORT" "$DEPLOY_SSH_USER@$DEPLOY_SSH_HOST" \
    -o StrictHostKeyChecking=no \
    "test -f '$DEPLOY_SSH_DIR/docker-compose.yml' && echo YES || echo NO" 2>/dev/null || echo NO)
  if [ "$COMPOSE_EXISTS" = "NO" ]; then
    echo "[INFO] Kopiere docker-compose.yml nach ${DEPLOY_SSH_HOST}:${DEPLOY_SSH_DIR}/"
    scp -i "$DEPLOY_SSH_PRIVATE_KEY" \
      -P "$DEPLOY_SSH_PORT" \
      -o StrictHostKeyChecking=no \
      "$SCRIPT_DIR/docker-compose.yml" \
      "$DEPLOY_SSH_USER@$DEPLOY_SSH_HOST:$DEPLOY_SSH_DIR/docker-compose.yml"
  else
    echo "[INFO] docker-compose.yml bereits vorhanden – übersprungen."
  fi
fi

if [ -f "$SCRIPT_DIR/.env" ]; then
  ENV_EXISTS=$(ssh -i "$DEPLOY_SSH_PRIVATE_KEY" \
    -p "$DEPLOY_SSH_PORT" "$DEPLOY_SSH_USER@$DEPLOY_SSH_HOST" \
    -o StrictHostKeyChecking=no \
    "test -f '$DEPLOY_SSH_DIR/.env' && echo YES || echo NO" 2>/dev/null || echo NO)
  if [ "$ENV_EXISTS" = "NO" ]; then
    echo "[INFO] Kopiere .env nach ${DEPLOY_SSH_HOST}:${DEPLOY_SSH_DIR}/"
    scp -i "$DEPLOY_SSH_PRIVATE_KEY" \
      -P "$DEPLOY_SSH_PORT" \
      -o StrictHostKeyChecking=no \
      "$SCRIPT_DIR/.env" \
      "$DEPLOY_SSH_USER@$DEPLOY_SSH_HOST:$DEPLOY_SSH_DIR/.env"
  else
    echo "[INFO] .env bereits vorhanden – übersprungen."
  fi
fi

if [ -f "$SCRIPT_DIR/create-nfs-volume.sh" ]; then
  echo "[INFO] Kopiere create-nfs-volume.sh nach ${DEPLOY_SSH_HOST}:${DEPLOY_SSH_DIR}/"
  scp -i "$DEPLOY_SSH_PRIVATE_KEY" \
    -P "$DEPLOY_SSH_PORT" \
    -o StrictHostKeyChecking=no \
    "$SCRIPT_DIR/create-nfs-volume.sh" \
    "$DEPLOY_SSH_USER@$DEPLOY_SSH_HOST:$DEPLOY_SSH_DIR/create-nfs-volume.sh"
fi

# ── Deploy ──────────────────────────────────────────────────────────────────
echo "[INFO] Deploye auf Remote-Host"
ssh -i "$DEPLOY_SSH_PRIVATE_KEY" \
  -p "$DEPLOY_SSH_PORT" "$DEPLOY_SSH_USER@$DEPLOY_SSH_HOST" \
  -o StrictHostKeyChecking=no bash <<EOF
# ── Docker-Daemon auf Deploy-Server erkennen (rootless oder system) ──────────
# Nicht-interaktive SSH-Sessions haben kein DOCKER_HOST; rootless Docker
# lauscht auf /run/user/<uid>/docker.sock statt /var/run/docker.sock.
if ! docker version >/dev/null 2>&1; then
  for _deploy_sock in "\${XDG_RUNTIME_DIR:-}/docker.sock" "/run/user/\$(id -u)/docker.sock" "\$HOME/.docker/run/docker.sock"; do
    if [ -n "\$_deploy_sock" ] && [ -S "\$_deploy_sock" ]; then
      export DOCKER_HOST="unix://\$_deploy_sock"
      break
    fi
  done
fi
if ! docker version >/dev/null 2>&1; then
  echo "[ERROR] Docker-Daemon auf dem Deploy-Server nicht erreichbar." >&2
  exit 1
fi
if docker info --format '{{json .SecurityOptions}}' 2>/dev/null | grep -qi rootless; then
  echo "[INFO] Deploy-Server Docker-Modus: rootless"
fi

if [ -f "$DEPLOY_SSH_DIR/create-nfs-volume.sh" ]; then
  chmod +x "$DEPLOY_SSH_DIR/create-nfs-volume.sh"
  (cd "$DEPLOY_SSH_DIR" && ./create-nfs-volume.sh)
fi

# ── Port-Konflikt prüfen ─────────────────────────────────────────────────────
if [ -f "$DEPLOY_SSH_DIR/.env" ]; then
  . "$DEPLOY_SSH_DIR/.env"
  EXTERNAL_PORT="\${APP_PORT%%:*}"
  if [ -n "\$EXTERNAL_PORT" ]; then
    CONFLICT_CONTAINER=\$(docker ps --format "table {{.Names}}\t{{.Ports}}" | grep ":\$EXTERNAL_PORT->" | grep -v "^${DOCKER_IMAGE_NAME}" | awk '{print \$1}' | head -1)
    if [ -n "\$CONFLICT_CONTAINER" ]; then
      echo "[ERROR] Port-Konflikt: Container '\$CONFLICT_CONTAINER' verwendet bereits den externen Port \$EXTERNAL_PORT" >&2
      echo "        Deploy wird abgebrochen, um Port-Kollision zu vermeiden." >&2
      echo "        Bitte stoppen Sie den anderen Container oder verwenden Sie einen anderen APP_PORT." >&2
      exit 1
    fi
    echo "[INFO] Kein Port-Konflikt für externen Port \$EXTERNAL_PORT gefunden."
  fi
fi

echo "$DOCKER_PASSWORD" | docker login "$DOCKER_REG_NAME" -u "$DOCKER_USERNAME" --password-stdin
cd "$DEPLOY_SSH_DIR" && docker compose down && docker compose pull$([ "$BUILD_MIGRATOR_IMAGE" = "true" ] && printf ' && docker compose --profile migrate pull') && docker compose up -d
EOF

echo "[SUCCESS] Build and deploy completed."
