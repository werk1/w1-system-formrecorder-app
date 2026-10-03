#!/usr/bin/env node

/**
 * Docker dev runner for w1-system-core-v2 (cross-platform: macOS/Windows/Linux).
 *
 * Purpose:
 * - Keep the compose filename consistent (`docker-compose.dev.yml`)
 * - Provide one stable entrypoint for common docker dev actions
 * - Print browser URLs after startup/restart
 *
 * Usage:
 *   node ./scripts/run-docker-dev.mjs                # default: up -d
 *   node ./scripts/run-docker-dev.mjs up             # up -d
 *   node ./scripts/run-docker-dev.mjs up --build
 *   node ./scripts/run-docker-dev.mjs logs           # logs -f app
 *   node ./scripts/run-docker-dev.mjs logs mongo
 *   node ./scripts/run-docker-dev.mjs down
 *   node ./scripts/run-docker-dev.mjs ps
 *   node ./scripts/run-docker-dev.mjs help
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const scriptDir = path.dirname(scriptPath)
const projectRoot = path.resolve(scriptDir, '..')
const composeFile = path.join(projectRoot, 'docker-compose.dev.yml')
const envFile = path.join(projectRoot, '.env')

function readEnvValue(name, fallback) {
  if (!existsSync(envFile)) return fallback

  const env = readFileSync(envFile, 'utf8')
  const line = env
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${name}=`))

  if (!line) return fallback

  return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') || fallback
}

// Asks Docker for the host port a running service actually publishes, so the
// printed URLs match whatever defaults and .env overrides the compose file
// applies (core-v2 and generated apps use different defaults).
function publishedPort(service, containerPort) {
  const result = spawnSync('docker', ['compose', '-f', composeFile, 'port', service, String(containerPort)], {
    cwd: projectRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  if (result.error || result.status !== 0) return null
  const match = result.stdout.trim().split(/\r?\n/)[0]?.match(/:(\d+)$/)
  return match ? match[1] : null
}

function printUrls() {
  const appPort = publishedPort('app', 3000) ?? readEnvValue('APP_PORT', '3000')
  const appUrl = `http://localhost:${appPort}`
  const mongoExpressPort = publishedPort('mongo-express', 8081)

  console.log('\nDev services:')
  console.log(`- App:           ${appUrl}`)
  console.log(`- Payload Admin: ${appUrl}/admin`)
  if (mongoExpressPort) console.log(`- Mongo Express: http://localhost:${mongoExpressPort}`)
}

const ORANGE = process.env.NO_COLOR ? '' : '\x1b[38;5;208m'
const COLOR_RESET = process.env.NO_COLOR ? '' : '\x1b[0m'

function warn(message) {
  console.warn(`${ORANGE}WARNING: ${message}${COLOR_RESET}`)
}

function dockerInfoMemGiB() {
  const result = spawnSync('docker', ['info', '--format', '{{.MemTotal}}'], { encoding: 'utf8' })
  if (result.error || result.status !== 0) return null
  const bytes = Number(result.stdout.trim())
  return Number.isFinite(bytes) && bytes > 0 ? bytes / 1024 ** 3 : null
}

function macOsFileSharingIsVirtioFS() {
  const settingsPath = [
    'Library/Group Containers/group.com.docker/settings-store.json',
    'Library/Group Containers/group.com.docker/settings.json',
  ]
    .map((rel) => path.join(homedir(), rel))
    .find(existsSync)
  if (!settingsPath) return null

  const settings = JSON.parse(readFileSync(settingsPath, 'utf8'))
  if (settings.VirtualFileSystemSharingMechanism) {
    return settings.VirtualFileSystemSharingMechanism === 'virtiofs'
  }
  if (typeof settings.useVirtualizationFrameworkVirtioFS === 'boolean') {
    return settings.useVirtualizationFrameworkVirtioFS
  }
  if (typeof settings.useGrpcfuse === 'boolean') return !settings.useGrpcfuse
  return null
}

// Prints host-platform performance hints before stack startup. Detection
// failures are ignored: hints must never block or break `docker compose up`.
function printPlatformHints() {
  try {
    if (process.platform === 'win32') {
      warn('Running natively on Windows. For best performance use the WSL2 backend')
      warn('and clone this repo inside the WSL filesystem (~/... instead of C:\\...).')
      warn('Bind mounts from the NTFS host are the slowest dev path. If hot reload')
      warn('misses file changes, set WATCHPACK_POLLING=true / CHOKIDAR_USEPOLLING=true.')
    } else if (process.platform === 'darwin') {
      if (macOsFileSharingIsVirtioFS() === false) {
        warn('Docker Desktop file sharing is not VirtioFS. Enable it via')
        warn('Docker Desktop -> Settings -> General -> "VirtioFS" for faster bind mounts.')
      }
    }

    if (process.platform !== 'linux') {
      const memGiB = dockerInfoMemGiB()
      if (memGiB !== null && memGiB < 6) {
        warn(`Docker Desktop VM has ~${memGiB.toFixed(1)} GiB RAM. Assign at least 6-8 GiB`)
        warn('(Settings -> Resources) or the Next.js dev compile may run out of memory.')
      }
    }
  } catch {
    // ignore
  }
}

function usage() {
  console.log(`Usage:
  node ./scripts/run-docker-dev.mjs [action] [args...]

Actions:
  up        Start dev stack (default flags: -d)
  down      Stop and remove dev containers
  logs      Follow logs (default: -f app)
  ps        Show container status
  restart   Restart services
  help      Show this help

Examples:
  node ./scripts/run-docker-dev.mjs
  node ./scripts/run-docker-dev.mjs up --build
  node ./scripts/run-docker-dev.mjs logs
  node ./scripts/run-docker-dev.mjs logs mongo
  node ./scripts/run-docker-dev.mjs down`)
}

function runDocker(composeArgs) {
  const result = spawnSync('docker', ['compose', '-f', composeFile, ...composeArgs], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  if (result.error) {
    const code = result.error && 'code' in result.error ? String(result.error.code) : 'UNKNOWN'
    if (code === 'ENOENT') {
      console.error('Docker was not found in PATH. Please install Docker Desktop/Engine first.')
    } else {
      console.error(`Failed to execute docker compose: ${String(result.error)}`)
    }
    process.exit(1)
  }

  return result.status ?? 1
}

if (!existsSync(composeFile)) {
  console.error(`Compose file not found: ${composeFile}`)
  console.error('Expected filename: docker-compose.dev.yml')
  process.exit(1)
}

const [action = 'up', ...rest] = process.argv.slice(2)
let exitCode

switch (action) {
  case 'up': {
    printPlatformHints()
    const args = rest.length > 0 ? ['up', ...rest] : ['up', '-d']
    exitCode = runDocker(args)
    break
  }
  case 'down':
    exitCode = runDocker(['down', ...rest])
    break
  case 'logs': {
    const args = rest.length > 0 ? ['logs', ...rest] : ['logs', '-f', 'app']
    exitCode = runDocker(args)
    break
  }
  case 'ps':
    exitCode = runDocker(['ps', ...rest])
    break
  case 'restart':
    printPlatformHints()
    exitCode = runDocker(['restart', ...rest])
    break
  case 'help':
  case '-h':
  case '--help':
    usage()
    break
  default:
    console.error(`Unknown action: ${action}`)
    usage()
    process.exit(1)
}

if (exitCode === 0 && (action === 'up' || action === 'restart')) {
  printUrls()
}

if (typeof exitCode === 'number') {
  process.exit(exitCode)
}
