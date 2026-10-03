#!/bin/sh
# Re-install platform-specific optional dependencies (e.g. sharp, @next/swc)
# for the OS/arch/libc this script actually runs on.
#
# Next.js standalone tracing and cross-platform `npm install` runs can leave
# node_modules with optional-dependency entries for the wrong platform (or
# missing entirely). This walks every installed package.json, collects all
# optionalDependencies specs, filters them down to the ones that match the
# current platform, and re-installs only those.
#
# Shared by Dockerfile_Multi and Dockerfile_Migrator so the logic (including
# the platform filter) only needs to be maintained in one place.
set -e

[ -f package.json ] || echo '{}' > package.json

tmp_optional_specs_file="$(mktemp)"
tmp_filtered_specs_file="$(mktemp)"
trap 'rm -f "$tmp_optional_specs_file" "$tmp_filtered_specs_file"' EXIT

for pkg_json in node_modules/*/package.json node_modules/@*/*/package.json; do
  [ -f "$pkg_json" ] || continue
  node -e "try{var p=require('./' + process.argv[1]);var deps=p.optionalDependencies||{};for(var name of Object.keys(deps)){console.log(name+'@'+deps[name])}}catch(e){}" "$pkg_json" >> "$tmp_optional_specs_file"
done

if [ -s "$tmp_optional_specs_file" ]; then
  sort -u "$tmp_optional_specs_file" | node -e '
const fs = require("fs")
const os = process.platform
const arch = process.arch
const isMusl = (() => {
  try {
    return !process.report?.getReport?.().header?.glibcVersionRuntime
  } catch {
    return true
  }
})()
const lines = fs.readFileSync(0, "utf8").split(/\r?\n/).filter(Boolean)
const knownOs = ["darwin", "linux", "linuxmusl", "win32", "android", "freebsd"]
const knownArch = ["arm64", "x64", "arm", "ia32", "ppc64", "riscv64", "s390x"]
for (const spec of lines) {
  const name = spec.replace(/@[^@]+$/, "")
  if (!name.startsWith("@img/sharp-") && !name.startsWith("@img/sharp-libvips-") && !name.startsWith("@next/swc-")) {
    console.log(spec)
    continue
  }
  const hasKnownOs = knownOs.some((token) => name.includes(`-${token}`))
  const hasKnownArch = knownArch.some((token) => name.includes(`-${token}`))
  if (name.includes("-linuxmusl-")) {
    if (os === "linux" && isMusl && name.endsWith(`-linuxmusl-${arch}`)) console.log(spec)
    continue
  }
  if (name.includes("-linux-")) {
    if (os === "linux") {
      if (isMusl && (name.endsWith(`-linux-${arch}-musl`) || name.endsWith(`-linuxmusl-${arch}`))) console.log(spec)
      if (!isMusl && (name.endsWith(`-linux-${arch}-gnu`) || name.endsWith(`-linux-${arch}`))) console.log(spec)
    }
    continue
  }
  if (name.includes("-darwin-")) {
    if (os === "darwin" && name.endsWith(`-darwin-${arch}`)) console.log(spec)
    continue
  }
  if (name.includes("-win32-")) {
    if (os === "win32" && (name.endsWith(`-win32-${arch}-msvc`) || name.endsWith(`-win32-${arch}`))) console.log(spec)
    continue
  }
  if (name.includes("-android-")) {
    if (os === "android" && name.endsWith(`-android-${arch}`)) console.log(spec)
    continue
  }
  if (name.includes("-freebsd-")) {
    if (os === "freebsd" && name.endsWith(`-freebsd-${arch}`)) console.log(spec)
    continue
  }
  if (!hasKnownOs && !hasKnownArch) console.log(spec)
}
' > "$tmp_filtered_specs_file"

  # Resolve and install all matching specs in one npm invocation. Repeated
  # npm installs re-run dependency resolution and registry setup for every
  # package, which made this layer unnecessarily slow.
  set --
  while IFS= read -r optional_spec; do
    [ -n "$optional_spec" ] || continue
    set -- "$@" "$optional_spec"
  done < "$tmp_filtered_specs_file"
  if [ "$#" -gt 0 ]; then
    echo "[INFO]   Re-installing $# platform-compatible optional dependencies"
    npm install --no-save --force --install-strategy=nested "$@" 2>/dev/null || true
  fi
fi
