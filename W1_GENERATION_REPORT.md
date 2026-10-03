# W1 System – Generierungs-Report

**Generiert am:** 2026-10-03 18:01:05 UTC

---

## 1. Projektkonfiguration

| Feld | Wert |
|---|---|
| Projektname | `w1-system-formrecorder-app` |
| Zielverzeichnis | `<workspace>/w1-system-formrecorder-app` |
| Beschreibung | PDF formrecorder |
| Docker Registry | `reg.werk1.at` |
| Image | `w1-system-formrecorder-app` |
| Repo URL | `git@werk1.github.com:werk1/w1-system-formrecorder-app.git` |
| Git Branch | `main` |
| GitHub Org | `werk1` |
| SSH Host | `–` |
| SSH User | `–` |
| SSH Port | `22` |
| SSH Dir | `–` |
| APP_PORT | `3600` (externer Container-Port; steht in `.env.example` und als Default in `docker-compose.yml` / `docker-compose.dev.yml`) |

---

## 2. Ausgewählte Module

### 2.1 Direkt ausgewählt

- **`formrecorder`**

### 2.2 Automatisch aufgelöste Abhängigkeiten (Auto-Deps)

- `flipbook` (automatisch aktiviert)

### 2.3 Alle aktiven Module

- `formrecorder`
- `flipbook`

---

## 3. Installierte Pakete

### Paket-Integration

| Modus | Pakete |
|---|---|
| **Workspace** (file:../, lokal vorhanden) | w1-system-device-info, w1-system-gsap-gesture, w1-system-gsap-scroll, w1-system-timeline-engine, w1-system-imageblock, w1-system-media-manager, w1-system-carouselblock, w1-system-font-manager, w1-system-formrecorder, w1-system-flipbook, w1-system-ui, w1-system-widgets, w1-system-calendar |

### 3.1 @werk1-Pakete – Geklont (dependencies)

- `@werk1/w1-system-device-info` → `file:../w1-system-device-info`
- `@werk1/w1-system-gsap-gesture` → `file:../w1-system-gsap-gesture`
- `@werk1/w1-system-gsap-scroll` → `file:../w1-system-gsap-scroll`
- `@werk1/w1-system-timeline-engine` → `file:../w1-system-timeline-engine`
- `@werk1/w1-system-imageblock` → `file:../w1-system-imageblock`
- `@werk1/w1-system-media-manager` → `file:../w1-system-media-manager`
- `@werk1/w1-system-carouselblock` → `file:../w1-system-carouselblock`
- `@werk1/w1-system-font-manager` → `file:../w1-system-font-manager`
- `@werk1/w1-system-formrecorder` → `file:../w1-system-formrecorder`
- `@werk1/w1-system-flipbook` → `file:../w1-system-flipbook`
- `@werk1/w1-system-ui` → `file:../w1-system-ui`
- `@werk1/w1-system-widgets` → `file:../w1-system-widgets`
- `@werk1/w1-system-calendar` → `file:../w1-system-calendar`

---

## 4. Kopierte Dateien

### Skeleton-Basis

_(keine)_

### Modul-Dateien (aus core-v2)

- `../w1-system-formrecorder-app/src/payload/collections/Formrecorders.ts`
- `../w1-system-formrecorder-app/src/payload/collections/Formrecords.ts`
- `../w1-system-formrecorder-app/src/payload/components/FormrecorderEditor.tsx`
- `../w1-system-formrecorder-app/src/payload/components/FormrecorderEditorLink.tsx`
- `../w1-system-formrecorder-app/src/app/(payload)/api/formrecorder-data/route.ts`
- `../w1-system-formrecorder-app/src/app/(payload)/api/formrecorder-records/route.ts`
- `../w1-system-formrecorder-app/src/app/(payload)/api/formrecorder-export/route.ts`
- `../w1-system-formrecorder-app/src/payload/collections/Flipbooks.ts`
- `../w1-system-formrecorder-app/src/payload/components/FlipbookConvertButton.tsx`
- `../w1-system-formrecorder-app/src/payload/components/FlipbookEmbedLink.tsx`
- `../w1-system-formrecorder-app/src/app/(payload)/api/flipbook-convert/route.ts`
- `../w1-system-formrecorder-app/src/lib/flipbook/README.md`
- `../w1-system-formrecorder-app/src/lib/flipbook/index.ts`
- `../w1-system-formrecorder-app/src/lib/flipbook/pdfConverter.ts`
- `../w1-system-formrecorder-app/src/lib/flipbook/payloadFlipbookConversion.ts`
- `../w1-system-formrecorder-app/src/lib/flipbook/cleanup.ts`
- `../w1-system-formrecorder-app/src/lib/flipbook/cover.ts`
- `../w1-system-formrecorder-app/src/payload/blocks/FlipbookSection.ts`
- `../w1-system-formrecorder-app/src/components/flipbook/FlipbookHeader.module.css`
- `../w1-system-formrecorder-app/src/components/flipbook/FlipbookHeader.tsx`
- `../w1-system-formrecorder-app/src/components/flipbook/FlipbookHome.tsx`
- `../w1-system-formrecorder-app/src/components/flipbook/FlipbookNavigationWidget.module.css`
- `../w1-system-formrecorder-app/src/components/flipbook/FlipbookNavigationWidget.tsx`
- `../w1-system-formrecorder-app/src/components/flipbook/FlipbookReader.module.css`
- `../w1-system-formrecorder-app/src/components/flipbook/FlipbookReader.tsx`
- `../w1-system-formrecorder-app/src/components/flipbook/FlipbookSideChrome.module.css`
- `../w1-system-formrecorder-app/src/components/flipbook/FlipbookSideChrome.tsx`
- `../w1-system-formrecorder-app/src/components/flipbook/FlipbookThumbnailRail.module.css`
- `../w1-system-formrecorder-app/src/components/flipbook/FlipbookThumbnailRail.tsx`
- `../w1-system-formrecorder-app/src/components/flipbook/FlipbookToolbar.module.css`
- `../w1-system-formrecorder-app/src/components/flipbook/FlipbookToolbar.tsx`
- `../w1-system-formrecorder-app/src/components/flipbook/W1SystemMark.module.css`
- `../w1-system-formrecorder-app/src/components/flipbook/W1SystemMark.tsx`
- `../w1-system-formrecorder-app/src/components/flipbook/dev/ColorSchemeEditor.tsx`
- `../w1-system-formrecorder-app/src/components/flipbook/dev/CurlTuningPanel.tsx`
- `../w1-system-formrecorder-app/src/components/flipbook/dev/DevTools.module.css`
- `../w1-system-formrecorder-app/src/components/flipbook/dev/DevToolsButton.tsx`
- `../w1-system-formrecorder-app/src/components/flipbook/dev/devCurlTuning.ts`
- `../w1-system-formrecorder-app/src/components/flipbook/readerDevice.ts`
- `../w1-system-formrecorder-app/src/components/page/W1FlipbookSectionRenderer.tsx`
- `../w1-system-formrecorder-app/src/lib/blocks/flipbook/config.ts`
- `../w1-system-formrecorder-app/src/lib/blocks/flipbook/labels.ts`
- `../w1-system-formrecorder-app/src/lib/blocks/flipbook/locale.ts`
- `../w1-system-formrecorder-app/src/lib/blocks/flipbook/resolveFlipbookBlockInput.ts`
- `../w1-system-formrecorder-app/src/lib/blocks/flipbook/types.ts`
- `../w1-system-formrecorder-app/src/lib/theme/appColorScheme.ts`
- `../w1-system-formrecorder-app/src/lib/theme/clientLogo.ts`
- `../w1-system-formrecorder-app/src/lib/theme/clientLogoVariants.ts`
- `../w1-system-formrecorder-app/src/lib/theme/colorSchemeTokens.ts`
- `../w1-system-formrecorder-app/src/app/(frontend)/flipbooks/[slug]/page.tsx`
- `../w1-system-formrecorder-app/src/app/(frontend)/flipbooks/flipbooks.module.css`
- `../w1-system-formrecorder-app/src/app/(frontend)/flipbooks/page.tsx`
- `../w1-system-formrecorder-app/src/app/(frontend)/theme/palettes.css`
- `../w1-system-formrecorder-app/src/payload/collections/ColorSchemes.ts`

---

## 5. Gerenderte Template-Dateien

- `tsconfig.json`
- `package.json`
- `next.config.mjs`
- `Dockerfile`
- `docker-compose.yml`
- `docker-compose.dev.yml`
- `scripts/docker-dev-app.sh`
- `docker/dev/Dockerfile`
- `scripts/push.sh`
- `scripts/push.bat`
- `scripts/push.ps1`
- `scripts/workspace-push-node.mjs`
- `scripts/workspace-update.mjs`
- `scripts/upload-data.mjs`
- `README.md`
- `AGENTS.md`
- `CLAUDE.md`
- `SYSTEM_DOCUMENTATION.md`
- `SYSTEM_MAP.md`
- `SYSTEM_CONTRACTS.md`
- `SYSTEM_TESTING.md`
- `docs/README.md`
- `docs/DOCUMENTATION_STRUCTURE.md`
- `docs/SYSTEM_OVERVIEW.md`
- `docs/SYNC_STATUS.md`
- `docs/contracts/generated-app-standalone-contract.md`
- `docs/contracts/app-host-package-boundary-contract.md`
- `docs/contracts/app-font-management-contract.md`
- `docs/contracts/app-package-boundary-contract.md`
- `docs/templates/bug.md`
- `docs/templates/ticket.md`
- `docs/templates/feature-plan.md`
- `docs/templates/implementation-report.md`
- `docs/templates/REVIEW_TEMPLATE.md`
- `docs/templates/REVIEW_TEMPLATE_STRICT.md`
- `docs/contracts/README.md`
- `docs/contracts/documentation-lifecycle-contract.md`
- `docs/templates/README.md`
- `docs/bugs/README.md`
- `docs/bugs/done/README.md`
- `docs/tickets/README.md`
- `docs/tickets/done/README.md`
- `docs/ideas/README.md`
- `docs/ideas/done/README.md`
- `docs/planning/README.md`
- `docs/planning/done/README.md`
- `docs/plans/README.md`
- `docs/plans/done/README.md`
- `docs/roadmaps/README.md`
- `docs/roadmaps/active/README.md`
- `docs/roadmaps/future/README.md`
- `docs/roadmaps/done/README.md`
- `docs/reports/README.md`
- `docs/reports/implementation/README.md`
- `docs/reports/technical-review/README.md`
- `docs/reports/review/README.md`
- `docs/archive/README.md`
- `docs/audit/README.md`
- `docs/contracts/formrecorder-app-integration-contract.md`
- `docs/contracts/flipbook-app-integration-contract.md`
- `autodeploy/multi/build_and_deploy_multi-repo.sh`
- `autodeploy/multi/multi_repo_build.sh`
- `autodeploy/multi/Dockerfile_Multi`
- `autodeploy/multi/Dockerfile_Multi_Autodeploy_Builder`
- `autodeploy/multi/Dockerfile_Migrator`
- `autodeploy/multi/reinstall-optional-deps.sh`
- `autodeploy/multi/validate-runtime-packages.js`
- `autodeploy/multi/setup_deploy_server.sh`
- `autodeploy/multi/test_setup_and_copy_multi-repo.sh`
- `.env.example`
- `.env.autodeploy`
- `src/types/payload-next-css.d.ts`
- `.gitignore`
- `.gitattributes`
- `.npmrc`
- `src/payload/blocks/index.ts`
- `src/payload/collections/index.ts`
- `src/payload/globals/index.ts`
- `src/payload/collections/Pages.ts`
- `src/payload/collections/Carousels.ts`
- `src/payload.config.ts`
- `src/payload/app-fonts/constants.ts`
- `src/app/(frontend)/[[...slug]]/page.tsx`
- `src/app/(frontend)/layout.tsx`
- `src/payload/globals/SiteSettings.ts`
- `src/stores/boundStore.ts`
- `src/lib/pages/types.ts`
- `src/lib/pages/resolvePageSections.ts`
- `src/lib/payload/getPayloadClient.ts`
- `src/lib/pages/buildPageModel.ts`
- `src/components/page/PageSectionComponents.tsx`
- `src/components/page/SectionRenderer.tsx`
- `src/lib/blocks/carousel/types.ts`
- `src/lib/blocks/carousel/resolveCarouselBlockInput.ts`
- `src/components/page/W1CarouselSectionRenderer.tsx`

---

## 5.1 Rule Snapshot

| Feld | Wert |
|---|---|
| AppCreator Commit | `a28aefc` |
| W1 Rule Snapshot | `0b1538e` |
| Basis Docs Source | `local generation snapshot` |
| Basis Docs Mode | `w1-system-local` |
| Snapshot Datum | `2026-10-03 18:01:05 UTC` |
| Aktive Module | `formrecorder`, `flipbook` |
| Validator | `ok` |
| Snippet Warnungen | `0` |

### Modul-Snippets

| Modul | Paket | Snippet-Modus | Package-Integration | Version | Lokale Quelle |
|---|---|---|---|---|---|
| `formrecorder` | `@werk1/w1-system-formrecorder` | `cloned/file` | `file: sibling package` | `2026-10-03` | `docs/contracts/formrecorder-app-integration-contract.md` |
| `flipbook` | `@werk1/w1-system-flipbook` | `cloned/file` | `file: sibling package` | `2026-09-29` | `docs/contracts/flipbook-app-integration-contract.md` |

### Package-Integration pro Modul

- `formrecorder`: `file: sibling package`
- `flipbook`: `file: sibling package`

### Snippet-Warnungen

_(keine)_

### Basis-Dokumente

- `AGENTS.md` aus lokalem Generation-Snapshot
- `SYSTEM_DOCUMENTATION.md` aus lokalem Generation-Snapshot
- `SYSTEM_MAP.md` aus lokalem Generation-Snapshot
- `SYSTEM_CONTRACTS.md` aus lokalem Generation-Snapshot
- `SYSTEM_TESTING.md` aus lokalem Generation-Snapshot

### Lokale Regel-/Docs-Dateien

- `README.md`
- `AGENTS.md`
- `CLAUDE.md`
- `SYSTEM_DOCUMENTATION.md`
- `SYSTEM_MAP.md`
- `SYSTEM_CONTRACTS.md`
- `SYSTEM_TESTING.md`
- `docs/README.md`
- `docs/DOCUMENTATION_STRUCTURE.md`
- `docs/SYSTEM_OVERVIEW.md`
- `docs/SYNC_STATUS.md`
- `docs/contracts/generated-app-standalone-contract.md`
- `docs/contracts/app-host-package-boundary-contract.md`
- `docs/contracts/app-font-management-contract.md`
- `docs/contracts/app-package-boundary-contract.md`
- `docs/templates/bug.md`
- `docs/templates/ticket.md`
- `docs/templates/feature-plan.md`
- `docs/templates/implementation-report.md`
- `docs/templates/REVIEW_TEMPLATE.md`
- `docs/templates/REVIEW_TEMPLATE_STRICT.md`
- `docs/contracts/README.md`
- `docs/contracts/documentation-lifecycle-contract.md`
- `docs/templates/README.md`
- `docs/bugs/README.md`
- `docs/bugs/done/README.md`
- `docs/tickets/README.md`
- `docs/tickets/done/README.md`
- `docs/ideas/README.md`
- `docs/ideas/done/README.md`
- `docs/planning/README.md`
- `docs/planning/done/README.md`
- `docs/plans/README.md`
- `docs/plans/done/README.md`
- `docs/roadmaps/README.md`
- `docs/roadmaps/active/README.md`
- `docs/roadmaps/future/README.md`
- `docs/roadmaps/done/README.md`
- `docs/reports/README.md`
- `docs/reports/implementation/README.md`
- `docs/reports/technical-review/README.md`
- `docs/reports/review/README.md`
- `docs/archive/README.md`
- `docs/audit/README.md`
- `docs/contracts/formrecorder-app-integration-contract.md`
- `docs/contracts/flipbook-app-integration-contract.md`

---

## 6. Post-Generation

- generated app docs validation: ok
- `npm install`
- `npm run generate:importmap`
- `npm run generate:types`
- `npx tsc --noEmit`

---

## 7. Manuelle Nacharbeiten

Diese Dateien wurden generiert, enthalten aber Platzhalter die manuell befüllt werden müssen:

### .env

```
MONGODB_URI=mongodb://mongo:27017/w1-system-formrecorder-app
PAYLOAD_SECRET=<zufälliger Secret-String>
NEXT_PUBLIC_SERVER_URL=http://localhost:3600
```

### .env.autodeploy

Pflichtfelder mit echten Werten befüllen:

| Variable | Beschreibung |
|---|---|
| `DOCKER_PASSWORD` | Docker Registry Passwort |
| `SSH_PRIVATE_KEY` | Pfad zum SSH-Key für GitHub |
| `SSH_BUILDER_PRIVATE_KEY` | Pfad zum SSH-Key für den Build-Server |
| `NPM_TOKEN` | npm Token für private @werk1-Pakete |
| `SSH_HOST` | IP/Hostname des Deploy-Servers |

> ⚠️ `.env.autodeploy` ist in `.gitignore` ausgeschlossen – nie committen!

### .npmrc

npm Token für private @werk1-Pakete eintragen:

```
//registry.npmjs.org/:_authToken=DEIN_NPM_TOKEN
```

> ⚠️ `.npmrc` ist in `.gitignore` ausgeschlossen – nie committen!

---

_Report automatisch erstellt durch `app-creator/create-project.mjs`_
