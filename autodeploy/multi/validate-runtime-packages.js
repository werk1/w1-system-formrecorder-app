#!/usr/bin/env node
// Validate that locally-owned workspace packages (originally consumed via a
// `file:` dependency and packaged into node_modules by multi_repo_build.sh)
// have every file referenced in their package.json `exports` map present in
// the final image. This is intentionally scoped to packages we build and
// stage ourselves: we control their full dist output, so every declared
// export must exist. Third-party packages are deliberately NOT checked here,
// since they legitimately ship export variants (browser/react-server/platform
// builds, etc.) that are never bundled for a given app and would otherwise
// produce false positives.
const fs = require('fs')
const path = require('path')

// pdfjs-dist (server-side PDF extraction) loads @napi-rs/canvas through a
// dynamic require the standalone tracer cannot see. Without it pdf.js has no
// ImageData/Path2D, so apps that ship pdfjs-dist must also ship a loadable
// canvas with its native binary for this image's platform.
if (fs.existsSync('/app/node_modules/pdfjs-dist/package.json')) {
  try {
    require('/app/node_modules/@napi-rs/canvas')
  } catch (error) {
    console.error(`[validate-runtime-packages] pdfjs-dist is installed but @napi-rs/canvas cannot be loaded: ${error.message}`)
    console.error('[validate-runtime-packages] check outputFileTracingIncludes in next.config.mjs and reinstall-optional-deps.sh')
    process.exit(1)
  }
  console.log('[validate-runtime-packages] @napi-rs/canvas loads (pdfjs-dist canvas polyfills available)')
}

const manifestFile = '/app/.local-runtime-packages.json'
if (!fs.existsSync(manifestFile)) {
  console.log('[validate-runtime-packages] no local runtime package manifest found, skipping')
  process.exit(0)
}

let packageNames = []
try {
  packageNames = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
} catch (error) {
  console.error(`[validate-runtime-packages] failed to read manifest: ${error.message}`)
  process.exit(1)
}

let errors = 0

const checkExport = (value, condition, packageDir, packageName) => {
  if (condition === 'types' || value == null) return
  if (typeof value === 'string') {
    if (!value.startsWith('.') || value.includes('*')) return
    const target = path.resolve(packageDir, value)
    if (!fs.existsSync(target)) {
      console.error(`[validate-runtime-packages] ${packageName}: missing export target ${value}`)
      errors++
    }
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item) => checkExport(item, condition, packageDir, packageName))
    return
  }
  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      checkExport(item, key, packageDir, packageName)
    }
  }
}

for (const packageName of packageNames) {
  const packageDir = path.join('/app/node_modules', packageName)
  const packageFile = path.join(packageDir, 'package.json')
  if (!fs.existsSync(packageFile)) {
    console.error(`[validate-runtime-packages] ${packageName}: not found under node_modules`)
    errors++
    continue
  }
  let pkg
  try {
    pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'))
  } catch (error) {
    console.error(`[validate-runtime-packages] ${packageName}: invalid package.json (${error.message})`)
    errors++
    continue
  }
  checkExport(pkg.exports, null, packageDir, packageName)
}

if (errors > 0) {
  console.error(`[validate-runtime-packages] ${errors} error(s) in locally-owned runtime packages`)
  process.exit(1)
}

console.log(`[validate-runtime-packages] ${packageNames.length} locally-owned runtime package(s) verified`)
