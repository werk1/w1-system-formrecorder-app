#!/bin/sh

set -eu

cd /workspace/w1-system-formrecorder-app

TARGET_NPM_VERSION="11.2.0"
DEPENDENCY_HASH_FILE="node_modules/.dependency-install.hash"
IMPORT_MAP_FILE="src/app/(payload)/admin/importMap.js"

log() {
  printf '%s\n' "$1"
}

ensure_build_tools() {
  if command -v python3 >/dev/null 2>&1 &&
    command -v make >/dev/null 2>&1 &&
    command -v g++ >/dev/null 2>&1; then
    return
  fi

  log "[docker-dev-app] installing alpine build tools"
  apk add --no-cache python3 make g++ build-base
}

ensure_npm_version() {
  CURRENT_NPM_VERSION="$(npm --version 2>/dev/null || true)"

  if [ "$CURRENT_NPM_VERSION" = "$TARGET_NPM_VERSION" ]; then
    return
  fi

  log "[docker-dev-app] installing npm@$TARGET_NPM_VERSION"
  npm install -g "npm@$TARGET_NPM_VERSION"
}

hash_file() {
  LABEL="$1"
  FILE="$2"

  if command -v sha1sum >/dev/null 2>&1; then
    printf '%s:%s\n' "$LABEL" "$(sha1sum "$FILE" | awk '{print $1}')"
    return
  fi

  printf '%s:%s\n' "$LABEL" "$(shasum -a 1 "$FILE" | awk '{print $1}')"
}

compute_dependency_hash() {
  if [ -f package-lock.json ]; then
    hash_file "package-lock" "package-lock.json"
    return
  fi

  hash_file "package-json" "package.json"
}

ensure_dependencies() {
  CURRENT_HASH="$(compute_dependency_hash)"
  STORED_HASH=""

  if [ -f "$DEPENDENCY_HASH_FILE" ]; then
    STORED_HASH="$(cat "$DEPENDENCY_HASH_FILE")"
  fi

  if [ -x node_modules/.bin/next ] && [ "$CURRENT_HASH" = "$STORED_HASH" ]; then
    log "[docker-dev-app] reusing existing node_modules"
    return
  fi

  if [ -f package-lock.json ]; then
    log "[docker-dev-app] running npm ci"
    npm ci --no-audit --no-fund
  else
    log "[docker-dev-app] running npm install without package lock"
    npm install --no-audit --no-fund --package-lock=false
  fi

  printf '%s' "$CURRENT_HASH" > "$DEPENDENCY_HASH_FILE"
}

ensure_sharp_runtime() {
  if node -e "require('sharp')" >/dev/null 2>&1; then
    log "[docker-dev-app] sharp runtime is available"
    return
  fi

  SHARP_VERSION="$(node -p "require('./node_modules/sharp/package.json').version" 2>/dev/null || true)"
  if [ -z "$SHARP_VERSION" ]; then
    SHARP_VERSION="$(node -p "require('./package.json').dependencies.sharp" 2>/dev/null || printf '0.34.5')"
  fi

  log "[docker-dev-app] installing sharp linuxmusl-x64 runtime"
  npm install --no-save --no-audit --no-fund --os=linux --libc=musl --cpu=x64 "sharp@$SHARP_VERSION"
}

ensure_import_map() {
  if [ -f "$IMPORT_MAP_FILE" ]; then
    log "[docker-dev-app] reusing existing import map"
    return
  fi

  log "[docker-dev-app] generating import map"
  npm run generate:importmap
}

ensure_build_tools
ensure_npm_version
ensure_dependencies
ensure_sharp_runtime
ensure_import_map

exec npm run dev -- --hostname 0.0.0.0
