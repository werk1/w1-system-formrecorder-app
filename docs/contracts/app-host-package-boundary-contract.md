# App-Host Package Boundary Contract

Status: active
App: `w1-system-formrecorder-app`

## This App Owns

- Next.js routes, layouts, metadata and frontend route files under `src/app/`.
- Payload config, local collection registration, local globals, admin route wiring and generated `payload-types.ts`.
- App-specific wrappers around package UI, including auth, locale, route params and local data loading.
- Page composer model, section registry, page resolver and app-local renderers.
- App-specific environment files, Docker files, scripts, deployment and generated reports.
- Local documentation in `docs/` and root system files.

## W1 Packages Own

Reusable package behavior belongs in the relevant `@werk1/w1-system-*` package:

- Reusable domain, runtime, UI, block, player, studio, parser and manager behavior.
- Payload collections, globals, hooks, init helpers and endpoint handlers exported from packages.
- Package-internal contracts, tests and build outputs.
- Public package exports consumed by the generated app.

## Import Rules

- App code may import package public exports.
- App code must not import package internals (e.g. `@werk1/w1-system-videoblock/src/...`) unless explicitly documented in a module contract.
- Package code must not import app internals such as `@/payload-types`, `@/stores/boundStore`, app routes or app-specific resolvers.

## Defect Ownership

When a defect is found:

- If the symptom is app-owned: fix it in this repository. Document in `docs/bugs/`.
- If the root cause is package-owned: document the app-facing symptom locally in `docs/bugs/`, then fix the defect in the owning package repository.
- Do not fork reusable package behavior into the app host without an explicit plan.
