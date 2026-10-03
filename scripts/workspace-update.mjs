#!/usr/bin/env node
/**
 * workspace-update.mjs
 * Aktualisiert alle @werk1-Pakete im Workspace per `git pull`.
 * Fehlt ein Paket-Verzeichnis, wird es automatisch von GitHub geklont.
 *
 * Liest file:-Eintraege (file:../<pkg>) aus package.json und fuehrt in jedem
 * Paket ein `git pull` aus. Fehlende Pakete werden geklont.
 *
 * Aufruf (aus Projekt-Root):
 *   node scripts/workspace-update.mjs
 * oder via npm-Script:
 *   npm run update
 */

import { execSync, execFileSync } from 'child_process'
import { existsSync, readFileSync, statSync, mkdirSync, copyFileSync } from 'fs'
import { basename, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

// Git-Konfiguration fuer fehlende Pakete (aus Creator-Konfiguration)
const CLONE_GIT_HOST = process.env.CLONE_GIT_HOST || 'github.com'
const CLONE_ORG      = process.env.CLONE_ORG      || 'werk1'
const CLONE_BRANCH   = process.env.CLONE_BRANCH   || 'main'

// Build-Reihenfolge fuer @werk1-Pakete (Dependencies zuerst).
const BUILD_ORDER = [
  'w1-system-gsap-gesture',
  'w1-system-gsap-scroll',
  'w1-system-media-manager',
  'w1-system-timeline-engine',
  'w1-system-carouselblock',
  'w1-system-video-carouselblock',
  'w1-system-imageblock',
  'w1-system-device-info',
  'w1-system-font-manager',
  'w1-system-flipbook',
  'w1-system-renderer',
  'w1-system-shaderblock',
  'w1-system-videoplayer',
  'w1-system-videoblock',
  'w1-system-audioplayer',
  'w1-system-audioblock',
  'w1-system-idml',
  'w1-system-articleblock',
]

function currentHead(cwd) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

function postBuildFixes(dir, localPath) {
  // w1-system-idml: ImageMagick WASM in dist kopieren
  if (dir === 'w1-system-idml') {
    const wasmSource = resolve(localPath, 'node_modules/@imagemagick/magick-wasm/dist/magick.wasm')
    const wasmDest   = resolve(localPath, 'dist/magick.wasm')
    try {
      if (existsSync(wasmSource)) {
        mkdirSync(dirname(wasmDest), { recursive: true })
        copyFileSync(wasmSource, wasmDest)
        console.log('  [post-build] WASM-Datei kopiert nach dist/')
      }
    } catch (err) {
      console.warn(`  [warn] Konnte WASM-Datei nicht kopieren: ${err.message}`)
    }
  }
}

const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)

const PROJECT_ROOT = resolve(__dirname, '..')
const PKG_JSON     = resolve(PROJECT_ROOT, 'package.json')

if (!existsSync(PKG_JSON)) {
  console.error('[error] package.json nicht gefunden:', PKG_JSON)
  process.exit(1)
}

const pkg = JSON.parse(readFileSync(PKG_JSON, 'utf8'))
const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }

const fileDeps = []
for (const [name, version] of Object.entries(allDeps)) {
  if (typeof version === 'string' && version.startsWith('file:')) {
    const relPath = version.slice('file:'.length)
    const absPath = resolve(PROJECT_ROOT, relPath)
    fileDeps.push({ name, relPath, absPath })
  }
}

if (fileDeps.length === 0) {
  console.log('[info] Keine file:-Abhaengigkeiten in package.json gefunden – nichts zu aktualisieren.')
  process.exit(0)
}

console.log(`[workspace-update] ${fileDeps.length} Paket(e) gefunden.\n`)

const SKIP_BUILD = process.argv.includes('--skip-build')

const results = { cloned: [], updated: [], unchanged: [], skipped: [], pullFailed: [], buildFailed: [] }
const changed = [] // Pakete, deren HEAD sich geaendert hat → brauchen Build

// ── Phase 1: git pull ────────────────────────────────────────────────────────
for (const dep of fileDeps) {
  const { name, relPath, absPath } = dep
  const dir = basename(absPath)

  if (!existsSync(absPath)) {
    // Paket fehlt → von GitHub klonen
    const repoName = basename(absPath)
    const cloneUrl = `git@${CLONE_GIT_HOST}:${CLONE_ORG}/${repoName}.git`
    const parentDir = dirname(absPath)
    console.log(`[clone] ${name}: nicht vorhanden – klone ${cloneUrl}`)
    try {
      mkdirSync(parentDir, { recursive: true })
      execSync(`git clone --branch ${CLONE_BRANCH} ${cloneUrl} "${absPath}"`, { stdio: 'inherit' })
      console.log(`  [ok] geklont nach ${relPath}`)
      changed.push({ name, dir: repoName, absPath })
      results.cloned.push({ name })
    } catch (err) {
      console.error(`  [fail] Klonen fehlgeschlagen – ${err.message}`)
      results.pullFailed.push({ name, error: err.message })
    }
    console.log('')
    continue
  }

  let isDir = false
  try { isDir = statSync(absPath).isDirectory() } catch { /* noop */ }
  if (!isDir) {
    console.warn(`[skip] ${name}: ${relPath} ist kein Verzeichnis`)
    results.skipped.push({ name, reason: 'not-a-directory' })
    continue
  }

  const gitDir = resolve(absPath, '.git')
  if (!existsSync(gitDir)) {
    console.warn(`[skip] ${name}: kein Git-Repository in ${relPath}`)
    results.skipped.push({ name, reason: 'not-a-git-repo' })
    continue
  }

  const headBefore = currentHead(absPath)

  console.log(`[pull] ${name}  (${relPath})`)
  try {
    execSync('git pull --ff-only', { cwd: absPath, stdio: 'inherit' })
  } catch (err) {
    console.error(`[fail] ${name}: git pull fehlgeschlagen – ${err.message}`)
    results.pullFailed.push({ name, error: err.message })
    console.log('')
    continue
  }

  const headAfter = currentHead(absPath)

  if (headBefore && headAfter && headBefore !== headAfter) {
    console.log(`  [changed] ${headBefore.slice(0, 7)} → ${headAfter.slice(0, 7)}`)
    changed.push({ name, dir, absPath })
    results.updated.push({ name })
  } else {
    console.log('  [unchanged] keine neuen Commits')
    results.unchanged.push({ name })
  }
  console.log('')
}

// ── Phase 2: Build geaenderte Pakete (in Dependency-Reihenfolge) ─────────────
if (changed.length > 0 && !SKIP_BUILD) {
  changed.sort((a, b) => {
    const ia = BUILD_ORDER.indexOf(a.dir)
    const ib = BUILD_ORDER.indexOf(b.dir)
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    return a.dir.localeCompare(b.dir)
  })

  console.log(`\n[workspace-update] Baue ${changed.length} geaenderte(s) Paket(e)...\n`)

  for (const { name, dir, absPath } of changed) {
    console.log(`[build] ${name}`)
    try {
      execSync('npm install', { cwd: absPath, stdio: 'inherit' })
      execSync('npm run build', { cwd: absPath, stdio: 'inherit' })
      postBuildFixes(dir, absPath)
    } catch (err) {
      console.error(`[fail] ${name}: build fehlgeschlagen – ${err.message}`)
      results.buildFailed.push({ name, error: err.message })
    }
    console.log('')
  }
} else if (changed.length > 0 && SKIP_BUILD) {
  console.log('\n[workspace-update] --skip-build: kein Build trotz Aenderungen.')
}

// ── Zusammenfassung ──────────────────────────────────────────────────────────
console.log('─'.repeat(60))
console.log('[workspace-update] Zusammenfassung:')
if (results.cloned.length)   console.log(`  neu geklont:       ${results.cloned.length}`)
console.log(`  aktualisiert:      ${results.updated.length}`)
console.log(`  unveraendert:      ${results.unchanged.length}`)
console.log(`  uebersprungen:     ${results.skipped.length}`)
console.log(`  pull/clone fehl.:  ${results.pullFailed.length}`)
console.log(`  build fehlgeschl.: ${results.buildFailed.length}`)

if (results.pullFailed.length > 0 || results.buildFailed.length > 0) process.exit(1)
