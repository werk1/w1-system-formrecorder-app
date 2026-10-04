# w1-system-pdfedit-app

PDF pdfedit

**Workspace-Modus** – alle `@werk1/…`-Pakete liegen als Geschwister-Verzeichnisse (`../w1-system-*`) und werden als `file:`-Deps eingebunden.

> Automatisch erzeugt vom `w1-system-app-creator`. Siehe auch `W1_GENERATION_REPORT.md` fuer Modul- und Datei-Details.

---

## Lokale Regeln und Dokumentation

Diese App ist standalone bearbeitbar. Die verbindlichen Regeln liegen lokal in diesem Repository; W1_SYSTEM Workspace-Root-Dokumente oder GitHub-Blob-Links sind keine Pflichtquellen.

Pflicht-Einstiegspunkte:

- `AGENTS.md`
- `CLAUDE.md`
- `SYSTEM_DOCUMENTATION.md`
- `SYSTEM_MAP.md`
- `SYSTEM_CONTRACTS.md`
- `SYSTEM_TESTING.md`
- `docs/README.md`
- `docs/DOCUMENTATION_STRUCTURE.md`

---

## Setup ab GitHub (Ersteinrichtung)

Workspace-Verzeichnis anlegen, App hineinclonen und fehlende `@werk1`-Pakete automatisch klonen + bauen:

```bash
# 1. Workspace-Root anlegen und App clonen
mkdir workspace-w1-system-pdfedit-app
cd workspace-w1-system-pdfedit-app
git clone <REPO_URL> w1-system-pdfedit-app

# 2. In den App-Ordner wechseln
cd w1-system-pdfedit-app

# 3. update-Script ausfuehren:
#    - klont alle fehlenden @werk1-Pakete aus GitHub ins Workspace-Root
#    - baut sie in der richtigen Reihenfolge
node scripts/workspace-update.mjs

# 4. App-Abhaengigkeiten installieren (findet jetzt alle file:-Deps)
npm install

# 5. Payload-Artefakte generieren
npm run generate:importmap
npm run generate:types
```

> Das `update`-Script liest alle `file:`-Eintraege aus `package.json`, klont fehlende Pakete automatisch von GitHub und baut sie. Git-Host, Org und Branch sind im Script eingebettet (`CLONE_GIT_HOST`, `CLONE_ORG`, `CLONE_BRANCH`).

---

## Schnellstart

```bash
# 1. Abhaengigkeiten installieren (findet alle file:-Deps)
npm install

# 2. Payload-Artefakte generieren (zwingend nach install)
npm run generate:importmap
npm run generate:types

# 3. Dev-Server lokal starten (benoetigt laufenden MongoDB-Container)
npm run dev
```

---

## NPM-Scripts

| Script | Zweck |
|---|---|
| `npm run dev` | Next.js Dev-Server auf Port 3600 |
| `npm run build` | Production-Build (Next.js + Payload) |
| `npm run start` | Production-Server starten (nach `build`) |
| `npm run payload` | Payload CLI (z.B. `payload migrate`) |
| `npm run generate:importmap` | Payload-Admin-Importmap erzeugen (nach install / Blockaenderungen) |
| `npm run generate:types` | `payload-types.ts` aus Payload-Config neu generieren |
| `npm run dev:docker` | Dev-Stack ueber `docker-compose.dev.yml` starten |
| `npm run dev:docker:down` | Dev-Stack herunterfahren |
| `npm run dev:docker:logs` | Dev-Container-Logs (`-f`) |
| `npm run dev:docker:ps` | Dev-Container-Status |
| `npm run update` | Alle geklonten `@werk1`-Pakete im Workspace aktualisieren + bauen |

---

## Lokaler Dev-Stack via Docker

`docker-compose.dev.yml` startet Mongo + App-Container fuer lokale Entwicklung/Tests.
MongoDB und Mongo Express sind dabei nur lokal unter `127.0.0.1:27018` bzw.
`127.0.0.1:8082` erreichbar. Die Host-Ports lassen sich in `.env` ueber
`MONGO_PORT` und `MONGO_EXPRESS_PORT` aendern; Container-intern bleibt die
Verbindung `mongo:27017`.

```bash
# Hochfahren (baut das Image nur beim ersten Mal)
npm run dev:docker

# Logs verfolgen
npm run dev:docker:logs

# Status
npm run dev:docker:ps

# Herunterfahren
npm run dev:docker:down
```

Das Script `scripts/docker-dev-app.sh` wird im App-Container als Entrypoint ausgefuehrt und startet `npm run dev` im gemounteten Projektverzeichnis.

`npm run dev:docker` gibt vor dem Start plattformspezifische Performance-Hinweise als orange Warnungen aus — nur wenn eine Empfehlung nicht umgesetzt ist: WSL2-Backend + Repo im WSL-Dateisystem unter Windows, VirtioFS als File-Sharing-Mechanismus unter macOS und mindestens 6–8 GiB RAM fuer die Docker-VM auf macOS/Windows.



## App Fonts

App Fonts werden vollständig in Payload verwaltet. Die Bereiche
`App-Font-Assets`, `App-Font-Familien`, `App-Font-Einstellungen` und
`Veröffentlichte Font-Sets` steuern Uploads, Familien, semantische Rollen,
Entwürfe und unveränderliche Veröffentlichungen. Das Frontend und der Payload
Admin laden ausschließlich `/api/app-fonts.css` aus dem aktiven Font-Set.

Lokale Fontbytes liegen unter `app-font-assets/` und werden nicht committed.
Google-Fonts-Importe benötigen optional den serverseitigen
`APP_FONTS_GOOGLE_API_KEY`. Built-in Inter bleibt als geprüfter letzter
Fallback verfügbar. Der alte `w1-system-local-font-manager` ist nicht Teil
generierter Apps.

Die W1 Font Validator Extension liest `/api/app-fonts/current` und prüft CSS
gegen die tatsächlich veröffentlichten Rollen, Schnitte, Variable-Font-Bereiche
und Weight-Ersetzungen. Payload-Entwürfe und Legacy-JSON werden dabei nicht
verwendet.

Article-/IDML-Fonts bleiben bei aktivem IDML-Modul vollständig separat über
ihre bestehenden Fontpfade, Aliase und Styles.

## Flipbook

PDFs werden im Admin unter **Flipbooks** einer PDF-Quelle zugewiesen und
serverseitig in Seitenbilder konvertiert (`pdfinfo`/`pdftoppm`, lange Kante
2400 px). Anzeige als Page-Section (`w1-flipbook-block`), Übersicht
`/flipbooks` und Reader `/flipbooks/[slug]?page=N`.

- Runtime: `poppler-utils`, `fontconfig`, `font-dejavu`, `font-liberation`
  sind in `Dockerfile`, `docker/dev/Dockerfile` und (über `w1RuntimeApk` in
  `package.json`) im Autodeploy-Image enthalten.
- **Eine App-Instanz** pro Deployment: Die Konvertierung läuft in einer
  In-Process-Queue ohne Persistenz. Ein Neustart setzt laufende Jobs auf
  `error`; Neustart über „Neu konvertieren" im Flipbook.
- Grenzen: 500 MB und 300 Seiten pro PDF. Das Upload-Limit des Reverse-Proxy
  muss mindestens 500 MB erlauben.
- Aufbewahrung ersetzter Seiten: `W1_FLIPBOOK_RETENTION_HOURS` (24, ab dem
  Ersetzen); Seitenbilder `fb-*` werden 1 h gecacht (`next.config.mjs`).
- Vertrag: `docs/contracts/flipbook-app-integration-contract.md`.

---

## Scripts (`scripts/`)

### Push auf den Build-Server

Uebertraegt das Projekt (als Bundles) und die `autodeploy/`-Scripts per SSH auf den Build-Server, der dort das Docker-Image baut und auf den Deploy-Server schiebt.

```bash
node scripts/workspace-push-node.mjs        # Workspace-Push (empfohlen)
```

Die klassischen Varianten (`scripts/push.sh`, `push.bat`, `push.ps1`) geben im Workspace-Modus einen Hinweis aus, dass das Node-Script verwendet werden soll.

### `npm run update`  (nur Workspace-Modus)

Aktualisiert alle via `file:`-Deps eingebundenen `@werk1/…`-Pakete im Workspace:

1. Fuer jedes Paket `git rev-parse HEAD` merken.
2. `git pull --ff-only` in jedem Paket-Verzeichnis.
3. Wenn sich der HEAD geaendert hat → `npm install && npm run build` in diesem Paket (in definierter Build-Reihenfolge, damit Dependencies zuerst gebaut werden).
4. Pakete ohne neue Commits werden **nicht** neu gebaut.

Aufruf-Varianten:

```bash
npm run update                           # pull + build geaenderter Pakete
node scripts/workspace-update.mjs --skip-build   # nur pull, kein Build
```

Am Ende gibt das Script eine Zusammenfassung aus: aktualisiert / unveraendert / uebersprungen / pull-fehlgeschlagen / build-fehlgeschlagen.

### Daten auf den Deploy-Server hochladen

`scripts/upload-data.mjs` uebertraegt lokale Mediendateien und die MongoDB auf den Deploy-Server.
Liest Zugangsdaten aus `.env.autodeploy`. Laeuft auf Windows, macOS und Linux.

```bash
# Alles hochladen (media + assets + DB)
node scripts/upload-data.mjs

# Nur Dateien (ohne DB)
node scripts/upload-data.mjs --no-db

# Nur DB
node scripts/upload-data.mjs --no-media --no-assets

# Nur media oder assets
node scripts/upload-data.mjs --no-assets --no-db
node scripts/upload-data.mjs --no-media --no-db
```

**media / assets**: werden via `rsync --checksum` uebertragen – gleiche Dateien werden uebersprungen, geoeschte lokal werden remote entfernt. Auf Windows ohne rsync: Fallback auf scp (Groessenvergleich).

**MongoDB**: `mongodump` lokal gegen `127.0.0.1:${MONGO_PORT}` (standardmaessig Port `27018`) → tar.gz → scp → `mongorestore --drop` im Mongo-Container auf dem Deploy-Server. Wenn die Remote-DB bereits Daten enthaelt, wird vor dem Import gefragt.

> **Voraussetzung DB-Dump**: `mongodump` muss lokal installiert sein (Teil der _MongoDB Database Tools_) und der Dev-Stack muss auf dem in `.env` konfigurierten `MONGO_PORT` laufen.
>
> **Installation mongodb-database-tools:**
>
> | Plattform | Befehl / Methode |
> |---|---|
> | Ubuntu / Debian | Direktdownload `.deb` von [mongodb.com/try/download/database-tools](https://www.mongodb.com/try/download/database-tools) → `sudo dpkg -i mongodb-database-tools-*.deb` |
> | Ubuntu (MongoDB-Repo) | Repo einrichten → `sudo apt-get install -y mongodb-database-tools` (siehe [docs.mongodb.com/install](https://www.mongodb.com/docs/manual/administration/install-on-linux/)) |
> | macOS (Homebrew) | `brew install mongodb/brew/mongodb-database-tools` |
> | Windows (winget) | `winget install MongoDB.DatabaseTools` |
> | Windows (Chocolatey) | `choco install mongodb-database-tools` |
> | Alle Plattformen | [mongodb.com/try/download/database-tools](https://www.mongodb.com/try/download/database-tools) |

### Weitere Scripts

- `scripts/run-docker-dev.mjs` – Wrapper fuer `docker compose -f docker-compose.dev.yml` (up / down / logs / ps).
- `scripts/docker-dev-app.sh` – Entrypoint im Dev-App-Container.

---

## Autodeploy (`autodeploy/multi/`)

Das Projekt enthaelt einen kompletten Build- und Deploy-Stack fuer Remote-Builds auf einem dedizierten Build-Server (Docker-in-Docker) mit anschliessendem Push auf einen Deploy-Server.

### Ablauf

1. **Push vom Dev-Rechner**:
   `node scripts/workspace-push-node.mjs` – erstellt Git-Bundles aller `@werk1/…`-Pakete und des Projekts, laedt sie per `scp` auf den Build-Server und startet dort den Build.
2. **Auf dem Build-Server**: `autodeploy/multi/build_and_deploy_multi-repo.sh` orchestriert:
   - Git-Bundles entpacken bzw. GitHub-Clone
   - Multi-Repo-Build in einem Docker-in-Docker-Builder (`Dockerfile_Multi_Autodeploy_Builder`)
   - Finales App-Image bauen (`Dockerfile_Multi`)
   - Image in die konfigurierte Docker-Registry pushen
   - Auf dem Deploy-Server (SSH-Hop durch Build-Server) `docker compose pull && up -d` ausloesen
3. **Auf dem Deploy-Server**: laeuft `docker-compose.yml` mit dem gerade gepushten Image.

### Konfiguration

Alle Parameter stehen in `.env.autodeploy` (nicht eingecheckt – siehe `.env.example` fuer die Vorlage).

Wichtige Variablen:

| Variable | Bedeutung |
|---|---|
| `MAIN_PROJECT_NAME` | Projekt-Identifier (identisch mit `name` in `package.json`) |
| `DOCKER_IMAGE_NAME` / `DOCKER_REG_NAME` | Ziel-Registry fuer das Image |
| `DOCKER_USERNAME` / `DOCKER_PASSWORD` | Registry-Credentials |
| `BUILD_SSH_*` | Build-Server (Host / Port / User / Zielverzeichnis) |
| `DEPLOY_SSH_*` | Deploy-Server (Host / Port / User / Zielverzeichnis) |

Bei **jedem Push** werden die Dateien unter `autodeploy/multi/` auf den Build-Server mit-synchronisiert – Aenderungen am Deploy-Stack werden also sofort wirksam.

---

## Verzeichnisse

```text
w1-system-pdfedit-app/
├── src/                      Quellcode (Next.js App Router + Payload)
├── scripts/                  Push- / Update- / Upload- / Dev-Scripts
│   ├── upload-data.mjs       media + assets + MongoDB auf Deploy-Server laden
│   ├── workspace-push-node.mjs  Workspace-Push (Bundles an Build-Server)
│   ├── workspace-update.mjs  @werk1-Pakete aktualisieren + bauen
│   └── docker-dev-app.sh     Entrypoint im Dev-Container
├── autodeploy/multi/         Remote-Build- und Deploy-Stack
├── media/                    Payload-Uploads (MEDIA_STORAGE_ROOT), Volume ausserhalb von public/ – nicht einchecken
├── assets/                   Lokale statische Assets – nicht einchecken
├── docker-compose.yml        Prod-Compose (auf Deploy-Server)
├── docker-compose.dev.yml    Lokaler Dev-Stack (Mongo + App)
├── Dockerfile                App-Image fuer Prod
├── .env.example              Template fuer lokale .env
├── .env.autodeploy           Build-/Deploy-Konfiguration (NICHT einchecken)
├── package.json
└── W1_GENERATION_REPORT.md   vom Creator erzeugt – Modul-Uebersicht
```

---

_Erzeugt durch `w1-system-app-creator` (`create-project.mjs`)._
