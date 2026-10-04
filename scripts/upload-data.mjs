#!/usr/bin/env node
/**
 * upload-data.mjs – Datei- und Datenbank-Upload auf den Deploy-Server
 * Plattformübergreifend: Windows, macOS, Linux
 *
 * Verwendung:
 *   node scripts/upload-data.mjs [--no-media] [--no-assets] [--no-db]
 *
 * Liest Zugangsdaten aus .env.autodeploy im Projekt-Root.
 */

import { execSync, execFileSync, spawnSync } from 'child_process'
import {
  existsSync, readFileSync, writeFileSync, unlinkSync,
  readdirSync, statSync, mkdirSync, rmSync,
} from 'fs'
import { createInterface } from 'readline'
import { join, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { homedir, tmpdir, platform } from 'os'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)
const PROJECT_DIR = resolve(__dirname, '..')

// ── .env.autodeploy laden ─────────────────────────────────────────────────────
const ENV_FILE = join(PROJECT_DIR, '.env.autodeploy')
if (!existsSync(ENV_FILE)) {
  console.error('[error] .env.autodeploy nicht gefunden:', ENV_FILE)
  process.exit(1)
}
for (const line of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=][^=]*)=(.*)$/)
  if (m) process.env[m[1].trim()] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

// ── Konfiguration ─────────────────────────────────────────────────────────────
const DEPLOY_SSH_HOST = process.env.DEPLOY_SSH_HOST || ''
const DEPLOY_SSH_USER = process.env.DEPLOY_SSH_USER || ''
const DEPLOY_SSH_PORT = process.env.DEPLOY_SSH_PORT || '22'
const DEPLOY_SSH_DIR  = process.env.DEPLOY_SSH_DIR  || 'w1-system-pdfedit-app'
const DEPLOY_SSH_KEY  = (process.env.DEPLOY_SSH_PRIVATE_KEY || '').replace(/^~/, homedir())
const DEPLOY_SSH_PW   = process.env.DEPLOY_SSH_PASSWORD || ''

const DB_NAME = 'w1-system-pdfedit-app'

function readProjectEnvValue(name, fallback) {
  const processValue = process.env[name]?.trim()
  if (processValue) return processValue

  const projectEnvFile = join(PROJECT_DIR, '.env')
  if (!existsSync(projectEnvFile)) return fallback

  const line = readFileSync(projectEnvFile, 'utf8')
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${name}=`))
  if (!line) return fallback

  return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') || fallback
}

function parseLocalPort(value, name) {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} muss ein numerischer TCP-Port sein.`)
  }

  const port = Number(value)
  if (port < 1 || port > 65535) {
    throw new Error(`${name} muss zwischen 1 und 65535 liegen.`)
  }
  return String(port)
}

const MONGO_PORT = parseLocalPort(readProjectEnvValue('MONGO_PORT', '27018'), 'MONGO_PORT')
const LOCAL_MONGO_URI = `mongodb://127.0.0.1:${MONGO_PORT}/${DB_NAME}`

for (const [k, v] of Object.entries({ DEPLOY_SSH_HOST, DEPLOY_SSH_USER, DEPLOY_SSH_DIR })) {
  if (!v) { console.error(`[error] ${k} fehlt in .env.autodeploy`); process.exit(1) }
}

// ── CLI-Argumente ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const SKIP_MEDIA  = args.includes('--no-media')
const SKIP_ASSETS = args.includes('--no-assets')
const SKIP_DB     = args.includes('--no-db')

const IS_WIN = platform() === 'win32'

// ── SSH-Hilfsfunktionen ───────────────────────────────────────────────────────
function sshBaseArgs() {
  const a = ['-p', DEPLOY_SSH_PORT, '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=15']
  if (DEPLOY_SSH_KEY && existsSync(DEPLOY_SSH_KEY)) {
    a.push('-i', DEPLOY_SSH_KEY, '-o', 'BatchMode=yes')
  } else if (DEPLOY_SSH_PW) {
    a.push('-o', 'BatchMode=no')
  } else {
    a.push('-o', 'BatchMode=yes')
  }
  return a
}

function makeAskpassEnv(password) {
  if (IS_WIN) {
    // Windows: SSH_ASKPASS funktioniert nicht zuverlässig – sshpass-Fallback nicht vorhanden
    // Hier Passwort via env übergeben (funktioniert nur wenn ssh-agent oder key vorhanden)
    return { env: process.env, cleanup: () => {} }
  }
  const f = join(tmpdir(), `askpass_${process.pid}.sh`)
  writeFileSync(f, `#!/bin/sh\nprintf '%s' ${JSON.stringify(password)}\n`, { mode: 0o700 })
  return {
    env: { ...process.env, SSH_ASKPASS: f, SSH_ASKPASS_REQUIRE: 'force', DISPLAY: '' },
    cleanup: () => { try { unlinkSync(f) } catch {} },
  }
}

function runSsh(cmd) {
  const remote = `${DEPLOY_SSH_USER}@${DEPLOY_SSH_HOST}`
  const base = sshBaseArgs()
  if (DEPLOY_SSH_PW && !DEPLOY_SSH_KEY) {
    const { env, cleanup } = makeAskpassEnv(DEPLOY_SSH_PW)
    try {
      return execFileSync('ssh', [...base, remote, cmd], { encoding: 'utf8', env }).trim()
    } finally { cleanup() }
  }
  return execFileSync('ssh', [...base, remote, cmd], { encoding: 'utf8' }).trim()
}

function runSshInherit(cmd) {
  const remote = `${DEPLOY_SSH_USER}@${DEPLOY_SSH_HOST}`
  const base = sshBaseArgs()
  if (DEPLOY_SSH_PW && !DEPLOY_SSH_KEY) {
    const { env, cleanup } = makeAskpassEnv(DEPLOY_SSH_PW)
    try {
      execFileSync('ssh', [...base, remote, cmd], { stdio: 'inherit', env })
    } finally { cleanup() }
    return
  }
  execFileSync('ssh', [...base, remote, cmd], { stdio: 'inherit' })
}

function runScp(localPath, remotePath) {
  const remote = `${DEPLOY_SSH_USER}@${DEPLOY_SSH_HOST}:${remotePath}`
  const base = ['-P', DEPLOY_SSH_PORT, '-o', 'StrictHostKeyChecking=no']
  if (DEPLOY_SSH_KEY && existsSync(DEPLOY_SSH_KEY)) base.push('-i', DEPLOY_SSH_KEY)
  if (DEPLOY_SSH_PW && !DEPLOY_SSH_KEY) {
    const { env, cleanup } = makeAskpassEnv(DEPLOY_SSH_PW)
    try {
      execFileSync('scp', [...base, localPath, remote], { stdio: 'inherit', env })
    } finally { cleanup() }
    return
  }
  execFileSync('scp', [...base, localPath, remote], { stdio: 'inherit' })
}

// rsync: verfügbar auf macOS/Linux; auf Windows Fallback auf scp-basiertes Kopieren
function hasRsync() {
  try { execSync('rsync --version', { stdio: 'ignore' }); return true } catch { return false }
}

function rsyncDir(localDir, remotePath) {
  const remote = `${DEPLOY_SSH_USER}@${DEPLOY_SSH_HOST}:${remotePath}`
  const sshCmd = ['ssh', ...sshBaseArgs()].join(' ')
  const base = ['-avz', '--checksum', '--delete', '-e', sshCmd]
  if (DEPLOY_SSH_KEY && existsSync(DEPLOY_SSH_KEY)) {
    execFileSync('rsync', [...base, localDir + '/', remote], { stdio: 'inherit' })
    return
  }
  if (DEPLOY_SSH_PW) {
    const { env, cleanup } = makeAskpassEnv(DEPLOY_SSH_PW)
    try { execFileSync('rsync', [...base, localDir + '/', remote], { stdio: 'inherit', env }) }
    finally { cleanup() }
    return
  }
  execFileSync('rsync', [...base, localDir + '/', remote], { stdio: 'inherit' })
}

// Fallback für Windows ohne rsync: einzelne Dateien per scp übertragen
// Überträgt nur Dateien die remote fehlen oder neuer sind (via Größenvergleich)
function scpDirFallback(localDir, remoteDir) {
  function walk(dir, base = '') {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = base ? base + '/' + entry.name : entry.name
      const full = join(dir, entry.name)
      if (entry.isDirectory()) { walk(full, rel); continue }
      const localSize = statSync(full).size
      let remoteSize = -1
      try {
        remoteSize = parseInt(runSsh(`stat -c%s "${remoteDir}/${rel}" 2>/dev/null || echo -1`), 10)
      } catch {}
      if (remoteSize === localSize) {
        console.log(`  [skip] ${rel} (gleiche Größe)`)
        continue
      }
      console.log(`  [scp]  ${rel}`)
      runSsh(`mkdir -p "${remoteDir}/${dirname(rel) === '.' ? '' : dirname(rel)}"`)
      runScp(full, `${remoteDir}/${rel}`)
    }
  }
  walk(localDir)
}

function uploadDir(label, localDir, remoteDir) {
  if (!existsSync(localDir) || readdirSync(localDir).length === 0) {
    console.log(`[skip] ${label} leer oder nicht vorhanden.`)
    return
  }
  console.log(`\n── ${label} → ${DEPLOY_SSH_USER}@${DEPLOY_SSH_HOST}:${remoteDir}/ `)
  runSsh(`mkdir -p "${remoteDir}"`)
  if (hasRsync()) {
    rsyncDir(localDir, remoteDir)
  } else {
    console.log('[info] rsync nicht verfügbar – Fallback auf scp (nur neue/geänderte Dateien).')
    scpDirFallback(localDir, remoteDir)
  }
  console.log(`[ok] ${label} übertragen.`)
}

// ── Interaktive Bestätigung ───────────────────────────────────────────────────
function ask(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()) })
  })
}

// ── Hauptablauf ───────────────────────────────────────────────────────────────
console.log('[upload-data] Deploy-Server:', `${DEPLOY_SSH_USER}@${DEPLOY_SSH_HOST}:${DEPLOY_SSH_PORT}`)
console.log('[upload-data] Remote-Dir   :', DEPLOY_SSH_DIR)
console.log()

// 1. media
if (!SKIP_MEDIA) {
  uploadDir('./media', join(PROJECT_DIR, 'media'), `${DEPLOY_SSH_DIR}/media`)
}

// 2. assets
if (!SKIP_ASSETS) {
  uploadDir('./assets', join(PROJECT_DIR, 'assets'), `${DEPLOY_SSH_DIR}/assets`)
}

// 3. MongoDB
if (!SKIP_DB) {
  console.log('\n── MongoDB Dump ─────────────────────────────────────────────────────────────')

  // Prüfen ob Remote-DB bereits Daten hat
  let remoteCount = 0
  try {
    const raw = runSsh(
      `docker exec $(docker ps --filter name=mongo --filter status=running -q | head -1) ` +
      `mongosh --quiet --eval "db.getSiblingDB('${DB_NAME}').stats().objects" 2>/dev/null || echo 0`
    )
    remoteCount = parseInt(raw, 10) || 0
  } catch {}

  let doImport = true
  if (remoteCount > 0) {
    console.log(`[warn] Remote-Datenbank '${DB_NAME}' enthält bereits ${remoteCount} Dokumente.`)
    const answer = await ask('       Überschreiben? [y/N] ')
    if (answer.toLowerCase() !== 'y') {
      console.log('[skip] MongoDB-Import übersprungen.')
      doImport = false
    }
  }

  if (doImport) {
    const dumpDir     = join(PROJECT_DIR, '.mongo-dump-tmp')
    const dumpArchive = join(PROJECT_DIR, '.mongo-dump-tmp.tar.gz')

    // Lokalen Dump erstellen
    if (existsSync(dumpDir)) rmSync(dumpDir, { recursive: true, force: true })

    // mongodump muss lokal installiert sein und gegen den konfigurierten
    // Host-Port des Dev-Stacks laufen.
    // Der mongo:7-Container (dev-stack) hat mongodump NICHT eingebaut –
    // stattdessen wird MONGO_PORT vom Host aus verwendet.
    const mdCheck = spawnSync('mongodump', ['--version'], { encoding: 'utf8' })
    if (mdCheck.error || mdCheck.status !== 0) {
      console.error('[error] mongodump nicht gefunden.')
      console.error('        Installiere mongodb-database-tools:')
      console.error('          https://www.mongodb.com/try/download/database-tools')
      console.error('        Oder auf Ubuntu/Debian:')
      console.error('          sudo apt-get install -y mongodb-database-tools')
      process.exit(1)
    }

    // Pruefen, ob Mongo ueber den Host-Port des Dev-Stacks erreichbar ist.
    try {
      execFileSync(
        'mongosh',
        ['--quiet', '--eval', "db.adminCommand('ping')", LOCAL_MONGO_URI, '--norc'],
        { stdio: 'ignore', timeout: 5000 },
      )
    } catch {
      console.error(`[error] MongoDB nicht erreichbar auf 127.0.0.1:${MONGO_PORT}.`)
      console.error('        Starte den Dev-Stack: docker compose -f docker-compose.dev.yml up -d mongo')
      process.exit(1)
    }

    console.log(`[info] Erstelle Dump via mongodump → 127.0.0.1:${MONGO_PORT}/${DB_NAME}`)
    mkdirSync(dumpDir, { recursive: true })
    execFileSync('mongodump', ['--uri', LOCAL_MONGO_URI, '--out', dumpDir], { stdio: 'inherit' })

    // Archiv packen (tar auf macOS/Linux, auf Windows PowerShell Compress-Archive als Fallback)
    console.log('[info] Erstelle Archiv...')
    if (!IS_WIN) {
      execSync(`tar -czf "${dumpArchive}" -C "${dumpDir}" .`, { stdio: 'inherit' })
    } else {
      execSync(`powershell -Command "Compress-Archive -Path '${dumpDir}\\*' -DestinationPath '${dumpArchive}' -Force"`, { stdio: 'inherit' })
    }

    // Archiv übertragen
    console.log('[info] Übertrage Dump...')
    runScp(dumpArchive, `${DEPLOY_SSH_DIR}/.mongo-dump-tmp.tar.gz`)

    // Auf Server entpacken + importieren
    runSshInherit(`
      set -e
      cd "${DEPLOY_SSH_DIR}"
      rm -rf .mongo-dump-restore && mkdir .mongo-dump-restore
      tar -xzf .mongo-dump-tmp.tar.gz -C .mongo-dump-restore
      MONGO_CTR=$(docker ps --filter name=mongo --filter status=running -q | head -1)
      [ -z "$MONGO_CTR" ] && echo "[error] Kein Mongo-Container auf Deploy-Server." && exit 1
      docker cp .mongo-dump-restore/. "$MONGO_CTR:/tmp/mongorestore-data"
      docker exec "$MONGO_CTR" mongorestore --db ${DB_NAME} --drop /tmp/mongorestore-data/${DB_NAME}
      docker exec "$MONGO_CTR" rm -rf /tmp/mongorestore-data
      rm -rf .mongo-dump-restore .mongo-dump-tmp.tar.gz
    `)

    // Lokal aufräumen
    rmSync(dumpDir, { recursive: true, force: true })
    unlinkSync(dumpArchive)
    console.log('[ok] MongoDB importiert.')
  }
}

console.log('\n✓ Upload abgeschlossen.')
