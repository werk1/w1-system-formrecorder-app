#!/usr/bin/env node
/**
 * Variante B: Node.js Workspace Transfer
 * Plattformübergreifend: macOS, Linux, Windows
 *
 * Liest Konfiguration aus .env.autodeploy im Projekt-Root.
 * Erstellt Git-Bundles, überträgt sie auf den Build-Server und startet den Build.
 */

import { execFileSync, execSync } from 'child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { basename, dirname, join, relative, resolve } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const PUSH_START = Date.now()
function formatDuration(ms) {
  const totalSeconds = Math.round(ms / 1000)
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0')
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0')
  const s = String(totalSeconds % 60).padStart(2, '0')
  return `${h}h ${m}m ${s}s`
}
console.log(`[info] Gestartet um     : ${new Date(PUSH_START).toLocaleString()}`)

// ── .env.autodeploy laden ─────────────────────────────────────────────────────
const ENV_FILE = resolve(__dirname, '../.env.autodeploy')

if (!existsSync(ENV_FILE)) {
  console.error('[error] .env.autodeploy nicht gefunden:', ENV_FILE)
  console.error('        Kopiere .env.autodeploy.example und trage deine Zugangsdaten ein.')
  process.exit(1)
}

// Einfacher .env Parser (KEY=VALUE, # Kommentare ignorieren)
for (const line of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=][^=]*)=(.*)$/)
  if (m) process.env[m[1].trim()] ??= m[2].trim()
}

// ── Modus-Hinweis ─────────────────────────────────────────────────────────────
// Workspace-Modus – dieses Script ist korrekt.

// ── Konfiguration ─────────────────────────────────────────────────────────────
const BUILD_SSH_HOST  = process.env.BUILD_SSH_HOST
const BUILD_SSH_USER  = process.env.BUILD_SSH_USER
const BUILD_SSH_PORT  = process.env.BUILD_SSH_PORT  || '22'
const BUILD_SSH_DIR   = process.env.BUILD_SSH_DIR   || 'w1-system-formrecorder-app'
const DEPLOY_SSH_HOST = process.env.DEPLOY_SSH_HOST
const DEPLOY_SSH_USER = process.env.DEPLOY_SSH_USER
const DEPLOY_SSH_PORT = process.env.DEPLOY_SSH_PORT || '22'
const DEPLOY_SSH_DIR  = process.env.DEPLOY_SSH_DIR  || 'w1-system-formrecorder-app'
const DOCKER_PASSWORD = process.env.DOCKER_PASSWORD || ''
const NPM_TOKEN       = process.env.NPM_TOKEN       || ''

const DEPLOY_SSH_KEY  = process.env.DEPLOY_SSH_PRIVATE_KEY || ''
let BUILD_SSH_PASSWORD = process.env.BUILD_SSH_PASSWORD || ''

// ── Validierung: Pflichtfelder + Platzhalter ──────────────────────────────────
const PLACEHOLDERS = {
  DOCKER_PASSWORD:        'DEIN_DOCKER_PASSWORT',
  NPM_TOKEN:              'DEIN_NPM_TOKEN',
  DEPLOY_SSH_PRIVATE_KEY: '~/.ssh/DEIN_BUILDER_KEY',
  BUILD_SSH_PASSWORD:     'DEIN_BUILD_PASSWORT',

}

const validationErrors = []

for (const [key, val] of Object.entries({ BUILD_SSH_HOST, BUILD_SSH_USER, DOCKER_PASSWORD, NPM_TOKEN, DEPLOY_SSH_KEY })) {
  const envKey = key === 'DEPLOY_SSH_KEY' ? 'DEPLOY_SSH_PRIVATE_KEY' : key
  if (!val) validationErrors.push(`[error] ${envKey} ist nicht gesetzt in .env.autodeploy`)
}
if (!BUILD_SSH_PASSWORD) validationErrors.push('[error] BUILD_SSH_PASSWORD ist nicht gesetzt in .env.autodeploy')
for (const [key, placeholder] of Object.entries(PLACEHOLDERS)) {
  if (process.env[key] === placeholder)
    validationErrors.push(`[error] ${key} hat noch den Platzhalter-Wert '${placeholder}' – bitte anpassen`)
}

if (validationErrors.length > 0) {
  validationErrors.forEach(e => console.error(e))
  console.error(`\n[${validationErrors.length} Fehler] Push abgebrochen. Bitte .env.autodeploy vervollständigen.`)
  process.exit(1)
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────
function run(cmd) {
  console.log(`  $ ${cmd}`)
  execSync(cmd, { stdio: 'inherit', shell: true })
}

/**
 * Temporaeres SSH_ASKPASS-Skript erstellen und env-Objekt zurueckgeben.
 * @param {string} password
 * @returns {{ env: object, cleanup: () => void }}
 */
function makeAskpassEnv(password) {
  const isWindows = process.platform === 'win32'
  const askpassFile = join(tmpdir(), `askpass_${process.pid}_${Date.now()}${isWindows ? '.cmd' : '.sh'}`)
  if (isWindows) {
    writeFileSync(
      askpassFile,
      '@echo off\r\npowershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "[Console]::Out.Write($env:W1_SSH_ASKPASS_PASSWORD)"\r\n',
      { mode: 0o700 },
    )
  } else {
    writeFileSync(askpassFile, `#!/bin/sh\nprintf '%s' ${JSON.stringify(password)}\n`, { mode: 0o700 })
  }
  const env = {
    ...process.env,
    SSH_ASKPASS: askpassFile,
    SSH_ASKPASS_REQUIRE: 'force',
    DISPLAY: '',
  }
  if (isWindows) env.W1_SSH_ASKPASS_PASSWORD = password
  const cleanup = () => { try { unlinkSync(askpassFile) } catch {} }
  return { env, cleanup }
}

/**
 * SSH-Befehl ausführen und stdout als String zurückgeben.
 * Gibt 'CONNECT_FAILED' zurück wenn die Verbindung fehlschlägt.
 * @param {string} port
 * @param {string} user
 * @param {string} host
 * @param {string} cmd
 * @param {{ password?: string, identityFile?: string }} [auth]
 */
function sshCheck(port, user, host, cmd, auth = {}) {
  try {
    let cleanup = () => {}
    let sshArgs
    let execEnv = process.env
    if (auth.password) {
      const ap = makeAskpassEnv(auth.password)
      cleanup = ap.cleanup
      execEnv = ap.env
      sshArgs = ['-p', port, `${user}@${host}`, '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=10', '-o', 'PasswordAuthentication=yes', '-o', 'BatchMode=no', cmd]
    } else if (auth.identityFile) {
      const keyPath = auth.identityFile.replace(/^~/, homedir())
      sshArgs = ['-i', keyPath, '-p', port, `${user}@${host}`, '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=10', '-o', 'BatchMode=yes', cmd]
    } else {
      sshArgs = ['-p', port, `${user}@${host}`, '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=10', '-o', 'BatchMode=yes', cmd]
    }
    const result = execFileSync('ssh', sshArgs, { encoding: 'utf8', env: execEnv }).trim()
    cleanup()
    return result
  } catch {
    return 'CONNECT_FAILED'
  }
}

function runSshPw(password, port, userHost, ...args) {
  const { env, cleanup } = makeAskpassEnv(password)
  try {
    execFileSync('ssh', ['-p', port, '-o', 'StrictHostKeyChecking=no', '-o', 'PasswordAuthentication=yes', userHost, ...args], { stdio: 'inherit', env })
  } finally { cleanup() }
}

function runScpPw(password, port, ...args) {
  const { env, cleanup } = makeAskpassEnv(password)
  try {
    execFileSync('scp', ['-P', port, '-o', 'StrictHostKeyChecking=no', '-o', 'PasswordAuthentication=yes', ...args], { stdio: 'inherit', env })
  } finally { cleanup() }
}

function isGitRepo(dir) {
  try { statSync(join(dir, '.git')); return true } catch { return false }
}

function hasGitChanges(dir) {
  return execSync(`git -C "${dir}" status --porcelain`, { encoding: 'utf8', shell: true }).trim().length > 0
}

const ALWAYS_SKIP = new Set([
  '.git', 'node_modules', '.next', '_bundles', 'out', 'build', 'dist',
  '.env', '.env.devel', '.env.autodeploy',
  'dev-server.log', '.DS_Store', 'Thumbs.db',
])
// package-lock.json and .npmrc are not globally skipped: nested sub-packages
// may track them and need them for npm ci.
// Directories like /media, /public/media, /mongo-data, /data are skipped via git check-ignore.
// Do not add 'media' or 'data' here, because that would also skip src/lib/media.

function shouldSkip(name) {
  if (ALWAYS_SKIP.has(name)) return true
  if (name.endsWith('.pem')) return true
  if (name.startsWith('.env') && name.endsWith('.local')) return true
  return false
}

function isGitIgnored(repoDir, absPath) {
  const rel = relative(repoDir, absPath)
  if (!rel || rel.startsWith('..')) return false
  try {
    execSync(`git -C "${repoDir}" check-ignore -q "${rel}"`, { stdio: 'ignore', shell: true })
    return true
  } catch {
    return false
  }
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function stripEnvQuotes(value) {
  const trimmed = String(value || '').trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function findPackageJsons(dir, rel = '') {
  const out = []
  let entries
  try {
    entries = readdirSync(join(dir, rel), { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const name = entry.name
      if (
        name === 'node_modules' ||
        name === '.git' ||
        name === '.next' ||
        name === 'dist' ||
        name === 'build' ||
        name === 'out' ||
        name === '_bundles' ||
        name === 'mongo-data' ||
        name === 'media' ||
        name === 'data' ||
        name.startsWith('.')
      ) continue
      const depth = rel ? rel.split('/').length + 1 : 1
      if (depth > 4) continue
      out.push(...findPackageJsons(dir, join(rel, name)))
    } else if (entry.name === 'package.json') {
      const pkg = readJson(join(dir, rel, entry.name))
      if (pkg) out.push({ path: join(dir, rel, entry.name), pkg })
    }
  }
  return out
}

function collectBundleEntries(workspaceDir, mainProjectDir) {
  const mainProjectName = process.env.MAIN_PROJECT_NAME || basename(mainProjectDir)
  const needed = new Set([mainProjectName])

  const localDeps = stripEnvQuotes(process.env.LOCAL_DEPS)
  for (const dep of (localDeps || '').split(/\s+/).filter(Boolean)) {
    const repo = dep.split(':')[0]
    if (repo) needed.add(repo)
  }

  const mainPkg = readJson(join(mainProjectDir, 'package.json'))
  if (mainPkg) {
    const depGroups = [
      mainPkg.dependencies,
      mainPkg.devDependencies,
      mainPkg.optionalDependencies,
      mainPkg.peerDependencies,
    ]
    for (const group of depGroups) {
      if (!group || typeof group !== 'object') continue
      for (const spec of Object.values(group)) {
        if (typeof spec !== 'string' || !spec.startsWith('file:../')) continue
        const repo = spec.slice('file:../'.length).replace(/\/+$/, '').split('/')[0]
        if (repo) needed.add(repo)
      }
    }
  }

  const pkgToRepo = new Map()
  const repoToPkgs = new Map()
  for (const entry of readdirSync(workspaceDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name.startsWith('_')) continue
    const repoDir = join(workspaceDir, entry.name)
    const pkgs = findPackageJsons(repoDir)
    if (pkgs.length) {
      repoToPkgs.set(entry.name, pkgs)
      for (const { pkg } of pkgs) {
        if (pkg.name && pkg.name.startsWith('@werk1/')) pkgToRepo.set(pkg.name, entry.name)
      }
    }
  }

  // transitive @werk1 dependencies (e.g. w1-system-articleblock -> w1-system-videoblock)
  let changed = true
  while (changed) {
    changed = false
    for (const repo of needed) {
      const pkgs = repoToPkgs.get(repo)
      if (!pkgs) continue
      for (const { pkg } of pkgs) {
        for (const group of [pkg.dependencies, pkg.devDependencies, pkg.optionalDependencies, pkg.peerDependencies]) {
          if (!group || typeof group !== 'object') continue
          for (const depName of Object.keys(group)) {
            if (!depName.startsWith('@werk1/')) continue
            const depRepo = pkgToRepo.get(depName)
            if (depRepo && !needed.has(depRepo)) {
              needed.add(depRepo)
              changed = true
            }
          }
        }
      }
    }
  }

  const missing = [...needed].filter(r => !existsSync(join(workspaceDir, r)))
  if (missing.length) {
    console.warn('[warn] Verwendete Repos fehlen im Workspace:', missing.join(', '))
  }

  console.log(`[bundle] ${needed.size} Repo(s) für Transfer bestimmt`)
  for (const repo of [...needed].sort()) {
    console.log(`         → ${repo}`)
  }

  return [...needed].sort()
}

function copyWorkingTree(sourceDir, targetDir) {
  for (const entry of readdirSync(targetDir, { withFileTypes: true })) {
    if (entry.name === '.git') continue
    rmSync(join(targetDir, entry.name), { recursive: true, force: true })
  }

  function copyDir(src, dst) {
    mkdirSync(dst, { recursive: true })
    for (const entry of readdirSync(src, { withFileTypes: true })) {
      const srcPath = join(src, entry.name)
      if (shouldSkip(entry.name) || isGitIgnored(sourceDir, srcPath)) continue
      const dstPath = join(dst, entry.name)
      if (entry.isDirectory()) {
        copyDir(srcPath, dstPath)
      } else if (entry.isSymbolicLink()) {
        // Preserve symlinks with their original (relative) target.
        // cpSync with recursive:true would resolve to an absolute path,
        // breaking the link when the bundle is cloned to another location.
        const target = readlinkSync(srcPath)
        rmSync(dstPath, { force: true })
        symlinkSync(target, dstPath)
      } else {
        cpSync(srcPath, dstPath, { dereference: false, force: true })
      }
    }
  }

  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const srcPath = join(sourceDir, entry.name)
    if (entry.name === '.git' || shouldSkip(entry.name) || isGitIgnored(sourceDir, srcPath)) continue
    const dstPath = join(targetDir, entry.name)
    if (entry.isDirectory()) {
      copyDir(srcPath, dstPath)
    } else if (entry.isSymbolicLink()) {
      const target = readlinkSync(srcPath)
      rmSync(dstPath, { force: true })
      symlinkSync(target, dstPath)
    } else {
      cpSync(srcPath, dstPath, { dereference: false, force: true })
    }
  }
}

function createDirtyBundleRepo(pkgDir, pkgName) {
  const safeName = pkgName.replace(/[^a-zA-Z0-9_.-]/g, '-')
  const tempDir = join(tmpdir(), `w1-bundle-${safeName}-${process.pid}-${Date.now()}`)

  rmSync(tempDir, { recursive: true, force: true })
  run(`git clone -q "${pkgDir}" "${tempDir}"`)
  copyWorkingTree(pkgDir, tempDir)
  run(`git -C "${tempDir}" add -A`)
  run(`git -C "${tempDir}" -c user.email="bundle@local" -c user.name="bundle" commit --allow-empty -q -m "bundle working tree"`)

  return tempDir
}

console.log('[workspace-push] Build-Server :', `${BUILD_SSH_USER}@${BUILD_SSH_HOST}:${BUILD_SSH_PORT}`)
console.log('[workspace-push] Deploy-Server:', `${DEPLOY_SSH_USER}@${DEPLOY_SSH_HOST}:${DEPLOY_SSH_PORT}`)

;(async () => {
// ── Async-Block Start ───────────────────────────────────────────────────────

// ── BUILD_SSH_PASSWORD: interaktiv abfragen wenn auf Default ──────────────────
if (BUILD_SSH_PASSWORD === 'DEIN_BUILD_PASSWORT' || !BUILD_SSH_PASSWORD) {
  const { default: readline } = await import('readline')
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  BUILD_SSH_PASSWORD = await new Promise((resolve) => {
    rl.question('BUILD_SSH_PASSWORD eingeben: ', (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

// ── Migrator-Image: interaktive Abfrage ──────────────────────────────────────
// Default ist nein. Wird als BUILD_MIGRATOR_IMAGE an den Build-Server übergeben.
let BUILD_MIGRATOR_IMAGE = process.env.BUILD_MIGRATOR_IMAGE || 'false'
if (BUILD_MIGRATOR_IMAGE !== 'true' && BUILD_MIGRATOR_IMAGE !== 'false') {
  const { default: readline } = await import('readline')
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise((resolve) => {
    rl.question('Migrator-Image erstellen? [j/N]: ', (a) => { rl.close(); resolve(a.trim().toLowerCase()) })
  })
  BUILD_MIGRATOR_IMAGE = (answer === 'j' || answer === 'y') ? 'true' : 'false'
}
console.log(`[info] BUILD_MIGRATOR_IMAGE=${BUILD_MIGRATOR_IMAGE}`)

// ── Mongo-Image: interaktive Abfrage ──────────────────────────────────────────
// Default ist nein. Wird als BUILD_MONGO_IMAGE an den Build-Server übergeben.
// Meistens nur beim ersten Deploy oder bei Infisical-CLI-Updates nötig.
let BUILD_MONGO_IMAGE = process.env.BUILD_MONGO_IMAGE || 'false'
if (BUILD_MONGO_IMAGE !== 'true' && BUILD_MONGO_IMAGE !== 'false') {
  const { default: readline } = await import('readline')
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise((resolve) => {
    rl.question('Mongo-Image erstellen? [j/N]: ', (a) => { rl.close(); resolve(a.trim().toLowerCase()) })
  })
  BUILD_MONGO_IMAGE = (answer === 'j' || answer === 'y') ? 'true' : 'false'
}
console.log(`[info] BUILD_MONGO_IMAGE=${BUILD_MONGO_IMAGE}`)

// ── Remote-Verzeichnisse prüfen ───────────────────────────────────────────────
const remoteErrors = []

const buildCheck = sshCheck(
  BUILD_SSH_PORT, BUILD_SSH_USER, BUILD_SSH_HOST,
  `test -d "${BUILD_SSH_DIR}" && echo OK || echo MISSING`,
  { password: BUILD_SSH_PASSWORD }
)
if (buildCheck === 'CONNECT_FAILED') {
  remoteErrors.push(`[error] Build-Server nicht erreichbar: ${BUILD_SSH_USER}@${BUILD_SSH_HOST}:${BUILD_SSH_PORT}`)
} else {
  const scriptDir = resolve(__dirname, '..')
  if (buildCheck !== 'OK') {
    console.log(`[warn] Buildverzeichnis auf Server ${BUILD_SSH_HOST} nicht vorhanden.`)
    console.log(`       Pfad: ${BUILD_SSH_HOST}:${BUILD_SSH_DIR}`)
    const { default: readline } = await import('readline')
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    const createDir = await new Promise((resolve) => {
      rl.question('Verzeichnis erstellen? [j/N]: ', (answer) => {
        rl.close()
        resolve(answer.trim().toLowerCase())
      })
    })
    if (createDir !== 'j' && createDir !== 'y') {
      remoteErrors.push('[error] Buildverzeichnis fehlt. Push abgebrochen.')
    } else {
      console.log('[info] Erstelle Verzeichnis auf Build-Server...')
      try {
        runSshPw(BUILD_SSH_PASSWORD, BUILD_SSH_PORT, `${BUILD_SSH_USER}@${BUILD_SSH_HOST}`, `mkdir -p ${BUILD_SSH_DIR}`)
      } catch {
        console.error('[error] Konnte Verzeichnis nicht erstellen')
        process.exit(1)
      }
    }
  }

  // ── Docker-Modus auf dem Build-Server erkennen (rootless oder system) ──────
  // Kein System-Docker (/var/run/docker.sock) -> rootless wird angenommen;
  // das Remote-Build-Script loest den Socket-Pfad selbst auf.
  const dockerProbe = sshCheck(
    BUILD_SSH_PORT, BUILD_SSH_USER, BUILD_SSH_HOST,
    'if docker info --format "{{.SecurityOptions}}" 2>/dev/null | grep -qi rootless; then echo ROOTLESS; elif docker info >/dev/null 2>&1 || [ -S /var/run/docker.sock ]; then echo SYSTEM; else echo ROOTLESS; fi',
    { password: BUILD_SSH_PASSWORD }
  )
  if (dockerProbe !== 'CONNECT_FAILED') {
    console.log(`[info] Docker-Modus Build-Server: ${dockerProbe === 'ROOTLESS' ? 'rootless' : 'system'}`)
  }

  // ── Docker-Modus auf dem Deploy-Server erkennen (rootless oder system) ─────
  // Dort laeuft docker compose; erreicht per SSH-Hop ueber den Build-Server
  // (DEPLOY_SSH_PRIVATE_KEY liegt auf dem Build-Server). Gleiche Annahme:
  // kein System-Docker -> rootless.
  const deployDockerProbe = sshCheck(
    BUILD_SSH_PORT, BUILD_SSH_USER, BUILD_SSH_HOST,
    'ssh -i "' + DEPLOY_SSH_KEY + '" -p ' + DEPLOY_SSH_PORT + ' ' + DEPLOY_SSH_USER + '@' + DEPLOY_SSH_HOST +
      ' -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o BatchMode=yes ' +
      '"if docker info --format \'{{.SecurityOptions}}\' 2>/dev/null | grep -qi rootless; then echo ROOTLESS; elif docker info >/dev/null 2>&1 || [ -S /var/run/docker.sock ]; then echo SYSTEM; else echo ROOTLESS; fi"',
    { password: BUILD_SSH_PASSWORD }
  )
  if (deployDockerProbe !== 'CONNECT_FAILED') {
    console.log(`[info] Docker-Modus Deploy-Server: ${deployDockerProbe === 'ROOTLESS' ? 'rootless' : 'system'}`)
  }

  if (remoteErrors.length === 0) {
    console.log('[info] Kopiere Autodeploy-Dateien (immer aktuell)...')
    const autoFiles = [
      'autodeploy/multi/build_and_deploy_multi-repo.sh',
      'autodeploy/multi/multi_repo_build.sh',
      'autodeploy/multi/Dockerfile_Multi',
      'autodeploy/multi/Dockerfile_Migrator',
      'autodeploy/multi/reinstall-optional-deps.sh',
      'autodeploy/multi/validate-runtime-packages.js',
      'autodeploy/multi/Dockerfile_Multi_Autodeploy_Builder',
      'autodeploy/multi/setup_deploy_server.sh',
      'autodeploy/multi/test_setup_and_copy_multi-repo.sh',
    ]
    if (process.env.USE_INFISICAL === 'true') {
      autoFiles.push('autodeploy/multi/Dockerfile_Mongo')
    }
    for (const f of autoFiles) {
      try {
        runScpPw(BUILD_SSH_PASSWORD, BUILD_SSH_PORT, `${scriptDir}/${f}`, `${BUILD_SSH_USER}@${BUILD_SSH_HOST}:${BUILD_SSH_DIR}/`)
      } catch {
        console.error(`[error] Konnte ${f.split('/').pop()} nicht kopieren`)
        process.exit(1)
      }
    }
    const normalizedDockerEnv = join(tmpdir(), `docker-env-${process.pid}-${Date.now()}.env`)
    try {
      const dockerEnvContent = readFileSync(`${scriptDir}/.env.autodeploy`, 'utf8')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
      writeFileSync(normalizedDockerEnv, dockerEnvContent, 'utf8')
      runScpPw(BUILD_SSH_PASSWORD, BUILD_SSH_PORT, normalizedDockerEnv, `${BUILD_SSH_USER}@${BUILD_SSH_HOST}:${BUILD_SSH_DIR}/docker.env`)
    } catch {
      console.error('[error] Konnte docker.env nicht kopieren')
      process.exit(1)
    } finally {
      try { unlinkSync(normalizedDockerEnv) } catch {}
    }
    const mainProjectDir = scriptDir
    const composeFile = join(mainProjectDir, 'docker-compose.yml')
    const createNfsVolumeFile = join(mainProjectDir, 'create-nfs-volume.sh')
    const envFile = join(mainProjectDir, '.env')
    const envExampleFile = join(mainProjectDir, '.env.example')
    const envSourceFile = existsSync(envFile) ? envFile : existsSync(envExampleFile) ? envExampleFile : null
    if (existsSync(composeFile)) {
      try {
        runScpPw(BUILD_SSH_PASSWORD, BUILD_SSH_PORT, composeFile, `${BUILD_SSH_USER}@${BUILD_SSH_HOST}:${BUILD_SSH_DIR}/docker-compose.yml`)
      } catch {
        console.error('[error] Konnte docker-compose.yml nicht kopieren')
        process.exit(1)
      }
    }
    if (existsSync(createNfsVolumeFile)) {
      try {
        runScpPw(BUILD_SSH_PASSWORD, BUILD_SSH_PORT, createNfsVolumeFile, `${BUILD_SSH_USER}@${BUILD_SSH_HOST}:${BUILD_SSH_DIR}/create-nfs-volume.sh`)
      } catch {
        console.error('[error] Konnte create-nfs-volume.sh nicht kopieren')
        process.exit(1)
      }
    }
    if (envSourceFile) {
      console.log(`[info] Kopiere ${envSourceFile === envFile ? '.env' : '.env.example'} als .env auf Build-Server`)
      try {
        runScpPw(BUILD_SSH_PASSWORD, BUILD_SSH_PORT, envSourceFile, `${BUILD_SSH_USER}@${BUILD_SSH_HOST}:${BUILD_SSH_DIR}/.env`)
      } catch {
        console.error('[error] Konnte .env nicht kopieren')
        process.exit(1)
      }
    }
    console.log('[info] Autodeploy-Dateien aktualisiert.')
  }
}

if (remoteErrors.length > 0) {
  remoteErrors.forEach(e => console.error(e))
  console.error('\nPush abgebrochen.')
  process.exit(1)
}

// Autodeploy-Server: Check via Build-Server (SSH-Hop) – nur Hinweis, kein Abbruch
const deployHopCmd = 'ssh -i "' + DEPLOY_SSH_KEY + '" -p ' + DEPLOY_SSH_PORT + ' ' + DEPLOY_SSH_USER + '@' + DEPLOY_SSH_HOST + ' -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o BatchMode=yes "test -d \"' + DEPLOY_SSH_DIR + '\" && echo OK || echo MISSING"'
const deployCheck = sshCheck(
  BUILD_SSH_PORT, BUILD_SSH_USER, BUILD_SSH_HOST,
  deployHopCmd,
  { password: BUILD_SSH_PASSWORD }
)
if (deployCheck === 'CONNECT_FAILED') {
  console.warn(`[warn] Autodeploy-Server vom Build-Server nicht erreichbar: ${DEPLOY_SSH_USER}@${DEPLOY_SSH_HOST}:${DEPLOY_SSH_PORT}`)
  console.warn(`       Bitte Verbindung und SSH-Key auf dem Build-Server pruefen.`)
} else if (deployCheck !== 'OK') {
  console.warn(`[warn] Autodeployverzeichnis auf Server ${DEPLOY_SSH_HOST} nicht vorhanden: ${DEPLOY_SSH_DIR}`)
  console.warn(`       Bitte Verzeichnis auf dem Autodeploy-Server anlegen.`)
}

// ── Workspace-Modus Info ──────────────────────────────────────────────────────
// HINWEIS: Workspace-Modus – lokale Packages vorhanden. Dieses Script ist vorgesehen.

// ── Bundles erstellen ─────────────────────────────────────────────────────────
const WORKSPACE_DIR = resolve(__dirname, '../..')
const BUNDLE_DIR = join(WORKSPACE_DIR, '_bundles')
const REMOTE_BUNDLE_DIR = `${BUILD_SSH_DIR}/bundles`

// Alte Bundles entfernen; andere Einträge (z. B. Sicherungsordner) bleiben
if (existsSync(BUNDLE_DIR)) {
  readdirSync(BUNDLE_DIR, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.bundle'))
    .forEach(entry => unlinkSync(join(BUNDLE_DIR, entry.name)))
}
mkdirSync(BUNDLE_DIR, { recursive: true })

console.log('\n[bundle] Erstelle Bundles...')
const mainProjectDir = resolve(__dirname, '..')
const entries = collectBundleEntries(WORKSPACE_DIR, mainProjectDir)

const bundles = []
for (const pkgName of entries) {
  const pkgDir = join(WORKSPACE_DIR, pkgName)
  const bundleFile = join(BUNDLE_DIR, `${pkgName}.bundle`)
  let tempGit = false
  let bundleSourceDir = pkgDir
  let cleanupBundleSourceDir = null
  if (!isGitRepo(pkgDir)) {
    console.log(`  → ${pkgName} (temporäres Git-Repo für Bundle)`)
    run(`git -C "${pkgDir}" init -q`)
    run(`git -C "${pkgDir}" add -A`)
    run(`git -C "${pkgDir}" -c user.email="bundle@local" -c user.name="bundle" commit -q -m "bundle"`)
    tempGit = true
  } else if (hasGitChanges(pkgDir)) {
    console.log(`  → ${pkgName} (inkl. uncommitted Änderungen)`)
    bundleSourceDir = createDirtyBundleRepo(pkgDir, pkgName)
    cleanupBundleSourceDir = bundleSourceDir
  } else {
    console.log(`  → ${pkgName}`)
  }
  run(`git -C "${bundleSourceDir}" bundle create "${bundleFile}" --all HEAD`)
  bundles.push(`${pkgName}.bundle`)
  if (cleanupBundleSourceDir) {
    rmSync(cleanupBundleSourceDir, { recursive: true, force: true })
  }
  if (tempGit) {
    run(`rm -rf "${pkgDir}/.git"`)
  }
}

if (bundles.length === 0) {
  console.error('[error] Keine Git-Repositories im Workspace gefunden')
  process.exit(1)
}
console.log(`\n[bundle] ${bundles.length} Bundle(s) erstellt`)

// ── Transfer + Build ──────────────────────────────────────────────────────────
console.log('\n[transfer] Erstelle/leere Remote-Bundle-Verzeichnis...')
runSshPw(BUILD_SSH_PASSWORD, BUILD_SSH_PORT, `${BUILD_SSH_USER}@${BUILD_SSH_HOST}`, `rm -rf ${REMOTE_BUNDLE_DIR} && mkdir -p ${REMOTE_BUNDLE_DIR}`)

console.log('\n[transfer] Übertrage Bundles auf Build-Server...')
runScpPw(BUILD_SSH_PASSWORD, BUILD_SSH_PORT, ...bundles.map(b => join(BUNDLE_DIR, b)), `${BUILD_SSH_USER}@${BUILD_SSH_HOST}:${REMOTE_BUNDLE_DIR}/`)

console.log('\n[build] Starte Build auf Build-Server...')
runSshPw(BUILD_SSH_PASSWORD, BUILD_SSH_PORT, `${BUILD_SSH_USER}@${BUILD_SSH_HOST}`, `BUILD_MIGRATOR_IMAGE=${BUILD_MIGRATOR_IMAGE} BUILD_MONGO_IMAGE=${BUILD_MONGO_IMAGE} bash ${BUILD_SSH_DIR}/build_and_deploy_multi-repo.sh`)

console.log('\n[done] Transfer und Build abgeschlossen')
console.log(`[info] Beendet um       : ${new Date().toLocaleString()}`)
console.log(`[info] Dauer            : ${formatDuration(Date.now() - PUSH_START)}`)

// ── Async-Block Ende ─────────────────────────────────────────────────────────
})().catch(err => {
  console.error('[error]', err.message)
  console.error(`[info] Beendet um       : ${new Date().toLocaleString()}`)
  console.error(`[info] Dauer            : ${formatDuration(Date.now() - PUSH_START)}`)
  process.exit(1)
})
