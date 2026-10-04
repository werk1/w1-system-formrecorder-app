# App Font Management Contract

Status: active
App: `w1-system-pdfedit-app`

## Ownership

Payload owns App Font assets, families, semantic roles, settings and immutable
published Font-Set snapshots. `@werk1/w1-system-font-manager` owns neutral
font analysis, derivatives, validation, CSS publication and server/artifact
font-bundle contracts.

## Runtime Contract

- The frontend and Payload Admin load `/api/app-fonts.css`.
- Consumers use only the current verified published snapshot; drafts never
  become runtime authority.
- `primary` is required. `secondary` explicitly inherits `primary` when
  it has no separate family.
- Built-in Inter Variable, static Inter and the generic system family form the
  verified final fallback chain.
- Missing assets, hash mismatches, invalid role graphs and disallowed delivery
  targets fail publication without replacing the last valid snapshot.
- App Font binaries are stored under `app-font-assets/` and are never
  committed.

## Editor Validation

`GET /api/app-fonts/current` returns only the server-verified current public
snapshot or `{ snapshot: null }`; it never returns a Draft. The W1 Font
Validator extension uses this endpoint to validate semantic role variables,
published static or Variable Faces, Weight, Style, Stretch, axes and explicit
Weight substitutions. It may retain a last-known-good cache for temporary
offline work, while a live unpublished response invalidates that cache.

Migrated generated apps do not expose legacy `fontConfig.json` or
`localFontConfig.json` as a second editor authority.

## Administration

Payload provides App-Font-Assets, App-Font-Families, App-Font-Einstellungen and
Veröffentlichte Font-Sets. Imports support individual TTF/OTF files, folders,
ZIP packages, Google Fonts and Adobe Fonts Web Projects. Google catalog access
uses the server-only `APP_FONTS_GOOGLE_API_KEY`.

## Legacy Cutoff

The generated app must not contain `@werk1/w1-system-local-font-manager`,
`local-fonts.css`, `localFontConfig`, `primary_local` or a copied
`public/local-fonts` runtime authority.

## Article/IDML Boundary

Article/IDML fonts remain a separate system. When the IDML module is active,
its `/data/fonts`, `/api/fonts.css`, Adobe-kit, aliases and IDML style
contracts remain unchanged and do not become App Font roles.
