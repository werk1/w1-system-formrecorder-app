#!/usr/bin/env bash
set -euo pipefail

############################################
# GLOBAL CONFIG
############################################
WORK_DIR="/workspace"
ROOT_DIR="$WORK_DIR/build_root"

: "${MAIN_PROJECT_NAME:?MAIN_PROJECT_NAME missing}"
: "${DOCKER_IMAGE_NAME:?DOCKER_IMAGE_NAME missing}"
: "${DOCKER_REG_NAME:?DOCKER_REG_NAME missing}"
: "${DOCKER_USERNAME:?DOCKER_USERNAME missing}"
: "${DOCKER_PASSWORD:?DOCKER_PASSWORD missing}"
: "${NPM_TOKEN:?NPM_TOKEN missing}"
: "${RUN_ID:?RUN_ID missing}"
: "${DEPLOY_SSH_PORT:?DEPLOY_SSH_PORT missing}"
: "${DEPLOY_SSH_USER:?DEPLOY_SSH_USER missing}"
: "${DEPLOY_SSH_HOST:?DEPLOY_SSH_HOST missing}"
: "${DEPLOY_SSH_DIR:?DEPLOY_SSH_DIR missing}"

MAIN_PROJECT_DIR="$ROOT_DIR/$MAIN_PROJECT_NAME"
MAIN_GIT_BRANCH="${GIT_BRANCH:-main}"
LOCAL_IMAGE_TAG="$DOCKER_IMAGE_NAME:build-$RUN_ID"
LOCAL_MIGRATOR_TAG="${DOCKER_IMAGE_NAME}-migrator:build-$RUN_ID"
LOCAL_MONGO_TAG="${DOCKER_IMAGE_NAME}-mongo:build-$RUN_ID"
BUNDLE_DIR="$WORK_DIR/bundles"

BUILD_START_EPOCH=$(date +%s)
report_build_duration() {
  local exit_code=$?
  local end_epoch
  end_epoch=$(date +%s)
  local duration=$((end_epoch - BUILD_START_EPOCH))
  echo "[INFO] Beendet um       : $(date '+%Y-%m-%d %H:%M:%S %Z')"
  printf '[INFO] Dauer            : %02dh %02dm %02ds\n' \
    $((duration / 3600)) $((duration % 3600 / 60)) $((duration % 60))
  return "$exit_code"
}
trap report_build_duration EXIT

echo "[INFO] Gestartet um     : $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "[INFO] Workspace        : $WORK_DIR"
echo "[INFO] Build root       : $ROOT_DIR"
echo "[INFO] Main project     : $MAIN_PROJECT_NAME"
echo "[INFO] Main git branch  : $MAIN_GIT_BRANCH"
echo "[INFO] Local deps       : ${LOCAL_DEPS_ENABLED:-n/a}"
if [ -d "$BUNDLE_DIR" ] && ls "$BUNDLE_DIR"/*.bundle >/dev/null 2>&1; then
  echo "[INFO] Bundle-Modus     : ja ($BUNDLE_DIR)"
  USE_BUNDLES=true
else
  echo "[INFO] Bundle-Modus     : nein (kein bundles/ Verzeichnis)"
  USE_BUNDLES=false
fi

############################################
# PREPARE WORKSPACE
############################################
rm -rf "$ROOT_DIR"
mkdir -p "$ROOT_DIR"
cd "$ROOT_DIR"

############################################
# SSH (readonly mount is OK)
############################################
if [ -f /home/builder/.ssh/id_rsa ]; then
  export GIT_SSH_COMMAND="ssh -i /home/builder/.ssh/id_rsa -o StrictHostKeyChecking=no"
fi

if [ "$USE_BUNDLES" = "false" ]; then
  : "${REPO_URL:?REPO_URL missing (benoetigt im klassischen Modus ohne Bundles)}"
  : "${GITHUB_ORG:?GITHUB_ORG missing (benoetigt im klassischen Modus ohne Bundles)}"
  : "${LOCAL_DEPS_ENABLED:?LOCAL_DEPS_ENABLED missing}"
  # LOCAL_DEPS ist optional: wird aus package.json abgeleitet
fi

############################################
# CLONE / UNBUNDLE MAIN PROJECT
############################################
if [ "$USE_BUNDLES" = "true" ]; then
  MAIN_BUNDLE="$BUNDLE_DIR/${MAIN_PROJECT_NAME}.bundle"
  if [ ! -f "$MAIN_BUNDLE" ]; then
    echo "[ERROR] Bundle fuer Hauptprojekt nicht gefunden: $MAIN_BUNDLE" >&2
    exit 1
  fi
  echo "[INFO] Klone Hauptprojekt aus Bundle: $MAIN_BUNDLE"
  git clone "$MAIN_BUNDLE" "$MAIN_PROJECT_DIR"
else
  echo "[INFO] Cloning main project from GitHub"
  git clone "$REPO_URL" "$MAIN_PROJECT_DIR"

  echo "[INFO] Checking out main project branch: $MAIN_GIT_BRANCH"
  (
    cd "$MAIN_PROJECT_DIR"
    git fetch --prune origin "$MAIN_GIT_BRANCH" || git fetch --prune origin
    git checkout -B "$MAIN_GIT_BRANCH" "origin/$MAIN_GIT_BRANCH" || git checkout "$MAIN_GIT_BRANCH"
  )
fi

############################################
# RESOLVE NEEDED LOCAL REPOS
############################################
# Liest package.json und LOCAL_DEPS, um nur Repos zu bauen, die auch
# vom Hauptprojekt verwendet werden (direkte file:../ Abhaengigkeiten).
NEEDED_REPOS_FILE=$(mktemp)
node - "$MAIN_PROJECT_DIR/package.json" "${LOCAL_DEPS:-}" > "$NEEDED_REPOS_FILE" <<'NODE'
const fs = require('fs')
const mainPkgPath = process.argv[2]
const localDeps = process.argv[3] || ''
const mainPkg = (() => { try { return JSON.parse(fs.readFileSync(mainPkgPath, 'utf8')) } catch { return {} } })()
const needed = new Set()
for (const dep of localDeps.split(/\s+/).filter(Boolean)) {
  const repo = dep.split(':')[0]
  if (repo) needed.add(repo)
}
for (const group of [mainPkg.dependencies, mainPkg.devDependencies, mainPkg.optionalDependencies, mainPkg.peerDependencies]) {
  if (!group) continue
  for (const spec of Object.values(group)) {
    if (typeof spec !== 'string' || !spec.startsWith('file:../')) continue
    const repo = spec.slice('file:../'.length).replace(/\/+$/, '').split('/')[0]
    if (repo) needed.add(repo)
  }
}
console.log([...needed].sort().join('\n'))
NODE
NEEDED_REPOS=$(cat "$NEEDED_REPOS_FILE")
if [ -z "$NEEDED_REPOS" ]; then
  if [ "${LOCAL_DEPS_ENABLED:-false}" = "true" ] || [ "$USE_BUNDLES" = "true" ]; then
    echo "[ERROR] Keine lokalen Repos ermittelt. Bitte LOCAL_DEPS setzen oder file:../ Dependencies in package.json pruefen." >&2
    exit 1
  fi
fi
echo "[INFO] Benoetigte lokale Repos:"
echo "$NEEDED_REPOS" | sed 's/^/  -> /'

get_repo_branch() {
  local repo="$1"
  local branch="main"
  if [ -n "${LOCAL_DEPS:-}" ]; then
    for dep in ${LOCAL_DEPS:-}; do
      local dep_repo="${dep%%:*}"
      local dep_branch="${dep##*:}"
      [ "$dep_branch" = "$dep_repo" ] && dep_branch="main"
      if [ "$dep_repo" = "$repo" ]; then
        branch="$dep_branch"
        break
      fi
    done
  fi
  echo "$branch"
}

is_needed_repo() {
  [ -n "$NEEDED_REPOS" ] && echo "$NEEDED_REPOS" | grep -qFx "$1"
}


############################################
# LOCAL @werk1 DEPENDENCIES
############################################
DEP_REPOS=""

if [ "$USE_BUNDLES" = "true" ]; then
  echo "[INFO] Bundle-Modus: Klone Bundles in definierter Reihenfolge"
  mkdir -p "$MAIN_PROJECT_DIR/node_modules/@werk1"

  for repo in $NEEDED_REPOS; do
    [ "$repo" = "$MAIN_PROJECT_NAME" ] && continue
    bundle_file="$BUNDLE_DIR/${repo}.bundle"
    if [ ! -f "$bundle_file" ]; then
      echo "[WARN] Bundle nicht gefunden: $bundle_file – uebersprungen" >&2
      continue
    fi
    REPO_DIR="$ROOT_DIR/$repo"
    echo "[INFO] -> $repo (aus Bundle)"
    git clone "$bundle_file" "$REPO_DIR"
    DEP_REPOS="$DEP_REPOS $REPO_DIR"
  done

elif [ "${LOCAL_DEPS_ENABLED:-false}" = "true" ]; then
  echo "[INFO] Klassischer Modus: Klone lokale @werk1 Repositories von GitHub"
  mkdir -p "$MAIN_PROJECT_DIR/node_modules/@werk1"

  for repo in $NEEDED_REPOS; do
    [ "$repo" = "$MAIN_PROJECT_NAME" ] && continue
    branch="$(get_repo_branch "$repo")"
    REPO_DIR="$ROOT_DIR/$repo"
    echo "[INFO] -> $repo ($branch)"
    git clone --depth 1 --branch "$branch" \
      "git@github.com:${GITHUB_ORG}/${repo}.git" \
      "$REPO_DIR"
    DEP_REPOS="$DEP_REPOS $REPO_DIR"
  done
fi

########################################
# PASS 1: NPM INSTALL für alle Dep-Repos
########################################
# These repositories are independent at install time: package links are only
# created in PASS 2. Install them concurrently, while using npm ci whenever a
# lockfile is available for deterministic and faster resolution.
install_dep_repo() {
  local repo_dir="$1"
  echo "[INFO] npm install: $repo_dir"
  (
    cd "$repo_dir"
    if [ -f package-lock.json ]; then
      npm ci --include=dev --no-audit --no-fund || npm install --include=dev --no-audit --no-fund
    else
      npm install --include=dev --no-audit --no-fund
    fi
  )
}

MAX_PARALLEL="${BUILD_PARALLELISM:-$(nproc 2>/dev/null || echo 4)}"
case "$MAX_PARALLEL" in
  ''|*[!0-9]*) MAX_PARALLEL=4 ;;
  0) MAX_PARALLEL=1 ;;
esac
INSTALL_PIDS=""
INSTALL_COUNT=0
for REPO_DIR in $DEP_REPOS; do
  install_dep_repo "$REPO_DIR" &
  INSTALL_PIDS="$INSTALL_PIDS $!"
  INSTALL_COUNT=$((INSTALL_COUNT + 1))
  if [ "$INSTALL_COUNT" -ge "$MAX_PARALLEL" ]; then
    for pid in $INSTALL_PIDS; do
      wait "$pid"
    done
    INSTALL_PIDS=""
    INSTALL_COUNT=0
  fi
done
for pid in $INSTALL_PIDS; do
  wait "$pid"
done

ORDERED_DEP_REPOS_FILE=$(mktemp)
node - "$ORDERED_DEP_REPOS_FILE" $DEP_REPOS <<'NODE'
const fs = require('fs')
const path = require('path')

const outputFile = process.argv[2]
const repoDirs = process.argv.slice(3)

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

const repos = repoDirs.map((dir, index) => {
  const pkg = readJson(path.join(dir, 'package.json')) || {}
  return {
    dir,
    index,
    name: pkg.name || path.basename(dir),
    deps: {
      ...(pkg.dependencies || {}),
      ...(pkg.optionalDependencies || {}),
      ...(pkg.peerDependencies || {}),
      ...(pkg.devDependencies || {}),
    },
  }
})

const nameToRepo = new Map(repos.map((repo) => [repo.name, repo]))
const outgoing = new Map(repos.map((repo) => [repo.dir, []]))
const indegree = new Map(repos.map((repo) => [repo.dir, 0]))

for (const repo of repos) {
  for (const depName of Object.keys(repo.deps)) {
    const depRepo = nameToRepo.get(depName)
    if (!depRepo || depRepo.dir === repo.dir) continue
    outgoing.get(depRepo.dir).push(repo.dir)
    indegree.set(repo.dir, (indegree.get(repo.dir) || 0) + 1)
  }
}

const repoByDir = new Map(repos.map((repo) => [repo.dir, repo]))
const level = new Map(repos.map((repo) => [repo.dir, 0]))
const queue = repos
  .filter((repo) => (indegree.get(repo.dir) || 0) === 0)
  .sort((a, b) => a.index - b.index)
  .map((repo) => repo.dir)
const processed = []

while (queue.length > 0) {
  const dir = queue.shift()
  processed.push(dir)
  const nextDirs = [...(outgoing.get(dir) || [])].sort((a, b) =>
    repoByDir.get(a).index - repoByDir.get(b).index,
  )
  for (const nextDir of nextDirs) {
    level.set(nextDir, Math.max(level.get(nextDir) || 0, (level.get(dir) || 0) + 1))
    indegree.set(nextDir, (indegree.get(nextDir) || 0) - 1)
    if ((indegree.get(nextDir) || 0) === 0) queue.push(nextDir)
  }
}

// Cycles are not expected, but retain deterministic behavior if one exists.
const remaining = repos
  .filter((repo) => !processed.includes(repo.dir))
  .sort((a, b) => a.index - b.index)
remaining.forEach((repo, index) => level.set(repo.dir, repos.length + index))

const ordered = [...repos].sort((a, b) =>
  (level.get(a.dir) - level.get(b.dir)) || (a.index - b.index),
)
fs.writeFileSync(outputFile, ordered.map((repo) => `${level.get(repo.dir)}\t${repo.dir}`).join('\n') + '\n')
NODE

########################################
# PASS 2: BUILD + LINK alle @werk1 Packages
########################################
mkdir -p "$MAIN_PROJECT_DIR/node_modules/@werk1"

build_link_repo() {
  local repo_dir="$1"
  while IFS= read -r pkg; do
    local pkg_dir pkg_name pkg_basename target
    pkg_dir="$(dirname "$pkg")"
    pkg_name="$(node -e "console.log(require('$pkg').name || '')")"

    if [[ "$pkg_name" == @werk1/* ]]; then
      pkg_basename="${pkg_name##*/}"
      target="$MAIN_PROJECT_DIR/node_modules/@werk1/$pkg_basename"

      echo "[INFO]   build $pkg_name"
      (
        cd "$pkg_dir"
        npm run build
      )

      echo "[INFO]   link  $pkg_name → node_modules/@werk1/$pkg_basename"
      rm -rf "$target"
      ln -s "$pkg_dir" "$target"
    fi
  done < <(find "$repo_dir" -name package.json -not -path "*/node_modules/*")
}

# Repositories in the same dependency level do not depend on one another and
# can build concurrently. The level file is emitted by the topological pass.
CURRENT_LEVEL=""
LEVEL_PIDS=""
while IFS=$'\t' read -r LEVEL REPO_DIR; do
  [ -n "$REPO_DIR" ] || continue
  if [ -n "$CURRENT_LEVEL" ] && [ "$LEVEL" != "$CURRENT_LEVEL" ]; then
    for pid in $LEVEL_PIDS; do
      wait "$pid"
    done
    LEVEL_PIDS=""
  fi
  CURRENT_LEVEL="$LEVEL"
  build_link_repo "$REPO_DIR" &
  LEVEL_PIDS="$LEVEL_PIDS $!"
done < "$ORDERED_DEP_REPOS_FILE"
for pid in $LEVEL_PIDS; do
  wait "$pid"
done

rm -f "$ORDERED_DEP_REPOS_FILE"
rm -f "$NEEDED_REPOS_FILE"

############################################
# INSTALL MAIN DEPENDENCIES (nach Dep-Links)
############################################
echo "[INFO] Installing main project dependencies"
(
  cd "$MAIN_PROJECT_DIR"
  # Keep npm install here: npm ci removes node_modules and would delete the
  # local @werk1 symlinks created in PASS 2.
  npm install --include=dev --no-audit --no-fund
)

############################################
# VERIFY @werk1 RESOLUTION
############################################
echo "[INFO] Verifying @werk1 resolution"
ls -la "$MAIN_PROJECT_DIR/node_modules/@werk1"

############################################
# GENERATE PAYLOAD IMPORTMAP
############################################
echo "[INFO] Generating Payload importMap"
(
  cd "$MAIN_PROJECT_DIR"
  npm run generate:importmap
  npm run generate:types
)

############################################
# FINAL BUILD
############################################
echo "[INFO] Running Next.js build"
(
  cd "$MAIN_PROJECT_DIR"
  npm run build
)

############################################
# STAGE STANDALONE OUTPUT
############################################
STAGE_DIR="$ROOT_DIR/_docker_stage"
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"

echo "[INFO] Staging standalone output"

# Copy standalone server + traced node_modules (follow symlinks)
# Next.js nests standalone output under the project directory name
STANDALONE_APP="$MAIN_PROJECT_DIR/.next/standalone/$MAIN_PROJECT_NAME"
if [ ! -d "$STANDALONE_APP" ]; then
  # Fallback: server.js directly in standalone root
  STANDALONE_APP="$MAIN_PROJECT_DIR/.next/standalone"
fi
cp -rL "$STANDALONE_APP/." "$STAGE_DIR/"

# Next.js standalone output may include large parts of the repository depending on file tracing.
# Strip everything that is not required at runtime to keep the image small and avoid leaking files.
rm -rf \
  "$STAGE_DIR/src" \
  "$STAGE_DIR/doc" \
  "$STAGE_DIR/docs" \
  "$STAGE_DIR/scripts" \
  "$STAGE_DIR/test" \
  "$STAGE_DIR/tests" \
  "$STAGE_DIR/.git" \
  "$STAGE_DIR/.github" \
  "$STAGE_DIR/.vscode" \
  "$STAGE_DIR/mongo-data" \
  "$STAGE_DIR/media" \
  "$STAGE_DIR/Dockerfile" \
  "$STAGE_DIR/Dockerfile_Multi" \
  "$STAGE_DIR/docker-compose.yml" \
  "$STAGE_DIR/docker-compose.dev.yml" \
  "$STAGE_DIR/docker-compose.prod.yml" \
  "$STAGE_DIR/dev-local.bat" \
  "$STAGE_DIR/README.md" \
  "$STAGE_DIR/eslint.config.mjs" \
  "$STAGE_DIR/next.config.mjs" \
  "$STAGE_DIR/playwright.config.ts" \
  "$STAGE_DIR/tsconfig.json" \
  "$STAGE_DIR/vitest.config.mts" \
  "$STAGE_DIR/tsconfig.tsbuildinfo" \
  "$STAGE_DIR/package-lock.json" \
  "$STAGE_DIR/package-version-update.json" \
  "$STAGE_DIR/app-font-assets" \
  "$STAGE_DIR/.env" \
  || true

# Copy static assets
mkdir -p "$STAGE_DIR/.next/static"
cp -r "$MAIN_PROJECT_DIR/.next/static/." "$STAGE_DIR/.next/static/"
if [ -f "$MAIN_PROJECT_DIR/.next/server/webpack-runtime.js" ]; then
  mkdir -p "$STAGE_DIR/.next/server"
  cp "$MAIN_PROJECT_DIR/.next/server/webpack-runtime.js" "$STAGE_DIR/.next/server/webpack-runtime.js"
fi
if [ ! -f "$STAGE_DIR/.next/server/webpack-runtime.js" ]; then
  echo "[ERROR] Missing staged .next/server/webpack-runtime.js" >&2
  find "$MAIN_PROJECT_DIR/.next" -maxdepth 4 -name webpack-runtime.js >&2 || true
  exit 1
fi

# Copy public dir if present
if [ -d "$MAIN_PROJECT_DIR/public" ]; then
  cp -r "$MAIN_PROJECT_DIR/public" "$STAGE_DIR/public"

  # Exclude runtime uploads from the production image
  # (media should be provided via volume / external storage)
  rm -rf "$STAGE_DIR/public/media" || true
fi

# Package local file: dependencies according to their package contract so
# externalized runtime packages are present even when Next tracing follows a
# symlink incompletely. This is intentionally package-agnostic.
LOCAL_PACKAGE_MANIFEST=$(mktemp)
node - "$MAIN_PROJECT_DIR/package.json" <<'NODE' > "$LOCAL_PACKAGE_MANIFEST"
const fs = require('fs')
const path = require('path')
const packageFile = process.argv[2]
const packageRoot = path.dirname(packageFile)
const packageJson = JSON.parse(fs.readFileSync(packageFile, 'utf8'))
for (const group of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
  for (const [name, spec] of Object.entries(packageJson[group] || {})) {
    if (typeof spec === 'string' && spec.startsWith('file:')) {
      const source = path.resolve(packageRoot, spec.slice('file:'.length))
      process.stdout.write(`${name}\t${source}\n`)
    }
  }
}
NODE
LOCAL_PACKAGE_NAMES_FILE="$STAGE_DIR/.local-runtime-packages.json"
: > "$LOCAL_PACKAGE_MANIFEST.names"
while IFS=$'\t' read -r PACKAGE_NAME PACKAGE_SOURCE; do
  [ -n "$PACKAGE_NAME" ] || continue
  [ -f "$PACKAGE_SOURCE/package.json" ] || continue
  PACKAGE_TMP=$(mktemp -d)
  PACKAGE_TARBALL=$(cd "$PACKAGE_SOURCE" && npm pack --ignore-scripts --silent --pack-destination "$PACKAGE_TMP")
  PACKAGE_TARGET="$STAGE_DIR/node_modules/$PACKAGE_NAME"
  rm -rf "$PACKAGE_TARGET"
  mkdir -p "$(dirname "$PACKAGE_TARGET")"
  tar -xzf "$PACKAGE_TMP/$PACKAGE_TARBALL" -C "$PACKAGE_TMP"
  mv "$PACKAGE_TMP/package" "$PACKAGE_TARGET"
  rm -rf "$PACKAGE_TMP"
  echo "$PACKAGE_NAME" >> "$LOCAL_PACKAGE_MANIFEST.names"
done < "$LOCAL_PACKAGE_MANIFEST"
# Persist the list of locally-owned workspace packages so the Dockerfile build
# can validate their full export contract (we control their full dist output,
# unlike third-party packages, which legitimately ship export variants that
# are never bundled, e.g. platform/browser/react-server conditions).
node -e "
const fs = require('fs')
const names = fs.readFileSync(process.argv[1], 'utf8').split('\n').filter(Boolean)
fs.writeFileSync(process.argv[2], JSON.stringify(names, null, 2) + '\n')
" "$LOCAL_PACKAGE_MANIFEST.names" "$LOCAL_PACKAGE_NAMES_FILE"
rm -f "$LOCAL_PACKAGE_MANIFEST" "$LOCAL_PACKAGE_MANIFEST.names"

for FONT_RUNTIME_DEP in fflate fontkit woff2-encode-wasm; do
  if [ -d "$MAIN_PROJECT_DIR/node_modules/$FONT_RUNTIME_DEP" ]; then
    mkdir -p "$STAGE_DIR/node_modules/$FONT_RUNTIME_DEP"
    cp -rL "$MAIN_PROJECT_DIR/node_modules/$FONT_RUNTIME_DEP/." "$STAGE_DIR/node_modules/$FONT_RUNTIME_DEP/"
  fi
done

for FONTKIT_DEP in @swc/helpers brotli clone dfa fast-deep-equal restructure tiny-inflate unicode-properties unicode-trie; do
  if [ -d "$MAIN_PROJECT_DIR/node_modules/$FONTKIT_DEP" ]; then
    # Create the *parent* only and remove any pre-existing target first:
    # `cp -r src dst` nests src inside an already-existing dst directory
    # (e.g. producing node_modules/brotli/brotli/*) instead of replacing it.
    DEST_PATH="$STAGE_DIR/node_modules/$FONTKIT_DEP"
    mkdir -p "$(dirname "$DEST_PATH")"
    rm -rf "$DEST_PATH"
    cp -rL "$MAIN_PROJECT_DIR/node_modules/$FONTKIT_DEP" "$DEST_PATH"
  fi
done

# Copy ImageMagick WASM explicitly for runtime image conversion support
if [ -f "$MAIN_PROJECT_DIR/node_modules/@imagemagick/magick-wasm/dist/magick.wasm" ]; then
  cp "$MAIN_PROJECT_DIR/node_modules/@imagemagick/magick-wasm/dist/magick.wasm" "$STAGE_DIR/magick.wasm"
elif [ -f "$STAGE_DIR/node_modules/@imagemagick/magick-wasm/dist/magick.wasm" ]; then
  cp "$STAGE_DIR/node_modules/@imagemagick/magick-wasm/dist/magick.wasm" "$STAGE_DIR/magick.wasm"
fi

# Re-installing platform-specific optional native dependencies now happens
# inside the Dockerfile build itself (Dockerfile_Multi COPYs and runs
# reinstall-optional-deps.sh), so it isn't duplicated here in the staging
# step.

node -e "const fs=require('fs');const p='$STAGE_DIR/package.json';if(fs.existsSync(p)){const pkg=JSON.parse(fs.readFileSync(p,'utf8'));delete pkg.type;fs.writeFileSync(p,JSON.stringify(pkg,null,2)+'\n')}"

# Copy Dockerfile + shared helper scripts into staging dir
cp /workspace/Dockerfile_Multi "$STAGE_DIR/Dockerfile_Multi"
cp /workspace/reinstall-optional-deps.sh "$STAGE_DIR/reinstall-optional-deps.sh"
cp /workspace/validate-runtime-packages.js "$STAGE_DIR/validate-runtime-packages.js"

############################################
# BUILD/PUSH IMAGES
############################################
IMAGE_FULL="$DOCKER_REG_NAME/$DOCKER_IMAGE_NAME:latest"
WORKER_DOCKERFILE="$ROOT_DIR/$MAIN_PROJECT_NAME/renderer-worker/Dockerfile"
LOCAL_WORKER_IMAGE_TAG="$DOCKER_IMAGE_NAME-renderer-worker:build-$RUN_ID"
WORKER_IMAGE_FULL="$DOCKER_REG_NAME/$DOCKER_IMAGE_NAME-renderer-worker:latest"
MIGRATOR_IMAGE_FULL="$DOCKER_REG_NAME/${DOCKER_IMAGE_NAME}-migrator:latest"
MONGO_IMAGE_FULL="$DOCKER_REG_NAME/${DOCKER_IMAGE_NAME}-mongo:latest"

build_app_image() {
  (
    cd "$STAGE_DIR"
    tar -c . | DOCKER_BUILDKIT=1 docker build -f Dockerfile_Multi -t "$LOCAL_IMAGE_TAG" -
    docker tag "$LOCAL_IMAGE_TAG" "$IMAGE_FULL"
    docker push "$IMAGE_FULL"
    docker rmi --force "$LOCAL_IMAGE_TAG" "$IMAGE_FULL" 2>/dev/null || true
  )
}

build_worker_image() {
  [ -f "$WORKER_DOCKERFILE" ] || return 0
  (
    cd "$ROOT_DIR"
    tar -c \
      --exclude='*/node_modules' \
      --exclude='*/.git' \
      --exclude='*/.next' \
      --exclude='*/_bundles' \
      --exclude='*/out' \
      --exclude='*/build' \
      --exclude='*/dist' \
      --exclude='*/media' \
      --exclude='*/mongo-data' \
      --exclude='*/data' \
      . | DOCKER_BUILDKIT=1 docker build \
      --build-arg "MAIN_PROJECT_NAME=$MAIN_PROJECT_NAME" \
      -f "$MAIN_PROJECT_NAME/renderer-worker/Dockerfile" \
      -t "$LOCAL_WORKER_IMAGE_TAG" -
    docker tag "$LOCAL_WORKER_IMAGE_TAG" "$WORKER_IMAGE_FULL"
    docker push "$WORKER_IMAGE_FULL"
    docker rmi --force "$LOCAL_WORKER_IMAGE_TAG" "$WORKER_IMAGE_FULL" 2>/dev/null || true
  )
}

build_migrator_image() {
  [ -f /workspace/Dockerfile_Migrator ] || return 0
  [ -d "$MAIN_PROJECT_DIR/renderer-worker" ] || return 0
  (
    cd "$MAIN_PROJECT_DIR"
    cp /workspace/Dockerfile_Migrator ./Dockerfile_Migrator
    cp /workspace/reinstall-optional-deps.sh ./reinstall-optional-deps.sh
    # Resolve @werk1 workspace symlinks to real directory copies so tar
    # captures the actual package content (symlinks point outside the
    # project dir and would dangle in the image).
    if [ -d node_modules/@werk1 ]; then
      for link in node_modules/@werk1/*; do
        [ -L "$link" ] || continue
        target=$(readlink -f "$link")
        rm "$link"
        cp -rL "$target" "$link"
      done
    fi
    tar -c --exclude='.next' --exclude='.git' . \
      | DOCKER_BUILDKIT=1 docker build -f Dockerfile_Migrator -t "$LOCAL_MIGRATOR_TAG" -
    docker tag "$LOCAL_MIGRATOR_TAG" "$MIGRATOR_IMAGE_FULL"
    docker push "$MIGRATOR_IMAGE_FULL"
    docker rmi --force "$LOCAL_MIGRATOR_TAG" "$MIGRATOR_IMAGE_FULL" 2>/dev/null || true
  )
}

build_mongo_image() {
  [ -f /workspace/Dockerfile_Mongo ] || return 0
  (
    cd "$MAIN_PROJECT_DIR"
    cp /workspace/Dockerfile_Mongo ./Dockerfile_Mongo
    tar -c Dockerfile_Mongo \
      | DOCKER_BUILDKIT=1 docker build -f Dockerfile_Mongo -t "$LOCAL_MONGO_TAG" -
    docker tag "$LOCAL_MONGO_TAG" "$MONGO_IMAGE_FULL"
    docker push "$MONGO_IMAGE_FULL"
    docker rmi --force "$LOCAL_MONGO_TAG" "$MONGO_IMAGE_FULL" 2>/dev/null || true
  )
}

echo "[INFO] Logging into registry: $DOCKER_REG_NAME"
echo "$DOCKER_PASSWORD" | docker login "$DOCKER_REG_NAME" -u "$DOCKER_USERNAME" --password-stdin

# Migrator-Image ist optional und wird nur gebaut, wenn BUILD_MIGRATOR_IMAGE=true.
# Default ist nein (wird vom aufrufenden Push-Script gesetzt oder interaktiv
# in build_and_deploy_multi-repo.sh abgefragt).
BUILD_MIGRATOR_IMAGE="${BUILD_MIGRATOR_IMAGE:-false}"

# Mongo-Image ist optional und wird nur gebaut, wenn BUILD_MONGO_IMAGE=true.
# Default ist nein (meistens nur beim ersten Deploy oder bei Infisical-Updates nötig).
BUILD_MONGO_IMAGE="${BUILD_MONGO_IMAGE:-false}"

if [ "$BUILD_MIGRATOR_IMAGE" = "true" ] && [ "$BUILD_MONGO_IMAGE" = "true" ]; then
  echo "[INFO] Building app, renderer-worker, migrator and mongo images in parallel"
  build_app_image & APP_IMAGE_PID=$!
  build_worker_image & WORKER_IMAGE_PID=$!
  build_migrator_image & MIGRATOR_IMAGE_PID=$!
  build_mongo_image & MONGO_IMAGE_PID=$!

  BUILD_FAILED=0
  if ! wait "$APP_IMAGE_PID"; then BUILD_FAILED=1; fi
  if ! wait "$WORKER_IMAGE_PID"; then BUILD_FAILED=1; fi
  if ! wait "$MIGRATOR_IMAGE_PID"; then BUILD_FAILED=1; fi
  if ! wait "$MONGO_IMAGE_PID"; then BUILD_FAILED=1; fi
  if [ "$BUILD_FAILED" -ne 0 ]; then
    echo "[ERROR] At least one Docker image build failed" >&2
    exit 1
  fi
elif [ "$BUILD_MIGRATOR_IMAGE" = "true" ]; then
  echo "[INFO] Building app, renderer-worker and migrator images in parallel (mongo skipped)"
  build_app_image & APP_IMAGE_PID=$!
  build_worker_image & WORKER_IMAGE_PID=$!
  build_migrator_image & MIGRATOR_IMAGE_PID=$!

  BUILD_FAILED=0
  if ! wait "$APP_IMAGE_PID"; then BUILD_FAILED=1; fi
  if ! wait "$WORKER_IMAGE_PID"; then BUILD_FAILED=1; fi
  if ! wait "$MIGRATOR_IMAGE_PID"; then BUILD_FAILED=1; fi
  if [ "$BUILD_FAILED" -ne 0 ]; then
    echo "[ERROR] At least one Docker image build failed" >&2
    exit 1
  fi
elif [ "$BUILD_MONGO_IMAGE" = "true" ]; then
  echo "[INFO] Building app, renderer-worker and mongo images in parallel (migrator skipped)"
  build_app_image & APP_IMAGE_PID=$!
  build_worker_image & WORKER_IMAGE_PID=$!
  build_mongo_image & MONGO_IMAGE_PID=$!

  BUILD_FAILED=0
  if ! wait "$APP_IMAGE_PID"; then BUILD_FAILED=1; fi
  if ! wait "$WORKER_IMAGE_PID"; then BUILD_FAILED=1; fi
  if ! wait "$MONGO_IMAGE_PID"; then BUILD_FAILED=1; fi
  if [ "$BUILD_FAILED" -ne 0 ]; then
    echo "[ERROR] At least one Docker image build failed" >&2
    exit 1
  fi
else
  echo "[INFO] Building app and renderer-worker images in parallel (migrator and mongo skipped)"
  build_app_image & APP_IMAGE_PID=$!
  build_worker_image & WORKER_IMAGE_PID=$!

  BUILD_FAILED=0
  if ! wait "$APP_IMAGE_PID"; then BUILD_FAILED=1; fi
  if ! wait "$WORKER_IMAGE_PID"; then BUILD_FAILED=1; fi
  if [ "$BUILD_FAILED" -ne 0 ]; then
    echo "[ERROR] At least one Docker image build failed" >&2
    exit 1
  fi
  echo "[INFO] Migrator image build skipped (BUILD_MIGRATOR_IMAGE != true)"
  echo "[INFO] Mongo image build skipped (BUILD_MONGO_IMAGE != true)"
fi

############################################
# DONE
############################################
echo "[SUCCESS] Multi-repo build completed successfully"
