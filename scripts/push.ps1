# Klassischer Push – SSH zum Build-Server, Build remote triggern.
# Zugangsdaten werden aus .env.autodeploy im Projekt-Root gelesen.
#
# HINWEIS: Workspace-Modus – lokale Packages vorhanden.
#           Fuer Workspace-Transfers bitte: node scripts/workspace-push-node.mjs
#           Dieses Script triggert nur den Build-Server (clont App von GitHub).

$PushStart = Get-Date
Write-Host "[info] Gestartet um     : $($PushStart.ToString('yyyy-MM-dd HH:mm:ss'))"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnvFile = Join-Path $ScriptDir "..\.env.autodeploy"
$errors = @()

# ── .env.autodeploy prüfen ────────────────────────────────────────────────────
if (-not (Test-Path $EnvFile)) {
    Write-Host "[error] .env.autodeploy nicht gefunden: $EnvFile" -ForegroundColor Red
    Write-Host "        Kopiere .env.autodeploy.example und trage deine Zugangsdaten ein."
    exit 1
}

# .env.autodeploy einlesen
Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*([^#=][^=]*)=(.*)$') {
        [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process')
    }
}

# ── Modus-Hinweis ────────────────────────────────────────────────────────────
Write-Host "[hinweis] Workspace-Modus: lokale Packages vorhanden." -ForegroundColor Yellow
Write-Host "          Dieses Script (push.ps1) triggert nur den Build-Server (clont von GitHub)." -ForegroundColor Yellow
Write-Host "          Fuer Workspace-Transfers bitte: node scripts/workspace-push-node.mjs" -ForegroundColor Yellow
Write-Host ""

# ── Migrator-Image: interaktive Abfrage ──────────────────────────────────────
if ($env:BUILD_MIGRATOR_IMAGE -ne "true" -and $env:BUILD_MIGRATOR_IMAGE -ne "false") {
    $buildMigratorAnswer = Read-Host "Migrator-Image erstellen? [j/N]"
    $env:BUILD_MIGRATOR_IMAGE = "false"
    if ($buildMigratorAnswer -match '^[jJyY]$') { $env:BUILD_MIGRATOR_IMAGE = "true" }
}
Write-Host "[info] BUILD_MIGRATOR_IMAGE=$($env:BUILD_MIGRATOR_IMAGE)"
Write-Host ""
# ── Mongo-Image: interaktive Abfrage ──────────────────────────────────────────
if ($env:BUILD_MONGO_IMAGE -ne "true" -and $env:BUILD_MONGO_IMAGE -ne "false") {
    $buildMongoAnswer = Read-Host "Mongo-Image erstellen? [j/N]"
    $env:BUILD_MONGO_IMAGE = "false"
    if ($buildMongoAnswer -match '^[jJyY]$') { $env:BUILD_MONGO_IMAGE = "true" }
}
Write-Host "[info] BUILD_MONGO_IMAGE=$($env:BUILD_MONGO_IMAGE)"
Write-Host ""

# ── Pflichtfelder + Default-Wert-Erkennung ────────────────────────────────────
function Check-Required($name, $value) {
    if (-not $value) { $script:errors += "[error] $name ist nicht gesetzt in .env.autodeploy" }
}
function Check-Default($name, $value, $placeholder) {
    if ($value -eq $placeholder) { $script:errors += "[error] $name hat noch den Platzhalter-Wert '$placeholder' - bitte anpassen" }
}

Check-Required "BUILD_SSH_HOST"          $env:BUILD_SSH_HOST
Check-Required "BUILD_SSH_USER"          $env:BUILD_SSH_USER
Check-Required "DOCKER_PASSWORD"         $env:DOCKER_PASSWORD
Check-Required "NPM_TOKEN"               $env:NPM_TOKEN
Check-Required "DEPLOY_SSH_PRIVATE_KEY" $env:DEPLOY_SSH_PRIVATE_KEY
Check-Required "BUILD_SSH_PASSWORD"      $env:BUILD_SSH_PASSWORD

Check-Default "DOCKER_PASSWORD"         $env:DOCKER_PASSWORD         "DEIN_DOCKER_PASSWORT"
Check-Default "NPM_TOKEN"               $env:NPM_TOKEN               "DEIN_NPM_TOKEN"
Check-Default "DEPLOY_SSH_PRIVATE_KEY" $env:DEPLOY_SSH_PRIVATE_KEY "~/.ssh/DEIN_BUILDER_KEY"
Check-Default "BUILD_SSH_PASSWORD"      $env:BUILD_SSH_PASSWORD      "DEIN_BUILD_PASSWORT"

if ($errors.Count -gt 0) {
    $errors | ForEach-Object { Write-Host $_ -ForegroundColor Red }
    Write-Host ""
    Write-Host "[$($errors.Count) Fehler] Push abgebrochen. Bitte .env.autodeploy vervollstaendigen." -ForegroundColor Red
    exit 1
}

$BUILD_SSH_PORT  = if ($env:BUILD_SSH_PORT)  { $env:BUILD_SSH_PORT  } else { "22" }
$BUILD_SSH_DIR   = if ($env:BUILD_SSH_DIR)   { $env:BUILD_SSH_DIR   } else { "w1-system-formrecorder-app" }
$BUILD_SSH_HOST  = $env:BUILD_SSH_HOST
$BUILD_SSH_USER  = $env:BUILD_SSH_USER
$DEPLOY_SSH_PORT = if ($env:DEPLOY_SSH_PORT) { $env:DEPLOY_SSH_PORT } else { "22" }
$DEPLOY_SSH_DIR  = if ($env:DEPLOY_SSH_DIR)  { $env:DEPLOY_SSH_DIR  } else { "w1-system-formrecorder-app" }
$DEPLOY_SSH_HOST = $env:DEPLOY_SSH_HOST
$DEPLOY_SSH_USER = $env:DEPLOY_SSH_USER

# ── BUILD_SSH_PASSWORD: interaktiv abfragen wenn auf Default ───────────────────
if ($env:BUILD_SSH_PASSWORD -eq "DEIN_BUILD_PASSWORT" -or -not $env:BUILD_SSH_PASSWORD) {
    $securePassword = Read-Host "BUILD_SSH_PASSWORD eingeben" -AsSecureString
    $env:BUILD_SSH_PASSWORD = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword))
}

# ── SSH_ASKPASS-Hilfsskript (kein sshpass noetig) ─────────────────────────────
$askpassFile = [System.IO.Path]::GetTempFileName() + ".cmd"
Set-Content -Path $askpassFile -Value "@echo off`r`necho $($env:BUILD_SSH_PASSWORD)"
$env:SSH_ASKPASS = $askpassFile
$env:SSH_ASKPASS_REQUIRE = "force"
$env:DISPLAY = ""
function ssh_pw { ssh -o PasswordAuthentication=yes -o StrictHostKeyChecking=no @args }
function scp_pw { scp -o PasswordAuthentication=yes -o StrictHostKeyChecking=no @args }

# ── Workspace-Modus Warnung ───────────────────────────────────────────────────
$WorkspaceDir = Resolve-Path (Join-Path $ScriptDir "..\..")
$repoCount = (Get-ChildItem -Path $WorkspaceDir -Directory | Where-Object { Test-Path (Join-Path $_.FullName ".git") }).Count
if ($repoCount -gt 1) {
    Write-Host ""
    Write-Host "[warnung] Workspace-Modus erkannt: $repoCount Git-Repositories in $WorkspaceDir" -ForegroundColor Yellow
    Write-Host "          Fuer Workspace-Transfers ist 'node scripts/workspace-push-node.mjs' vorgesehen." -ForegroundColor Yellow
    Write-Host "          Dieses Script (push.ps1) triggert nur den Build-Server (clont von GitHub)." -ForegroundColor Yellow
    Write-Host ""
    $confirm = Read-Host "          Trotzdem fortfahren? [j/N]"
    if ($confirm -notmatch '^[jJyY]$') { Write-Host "Abgebrochen."; exit 0 }
    Write-Host ""
}

# ── Remote-Verzeichnisse prüfen ───────────────────────────────────────────────
$remoteErrors = @()

$buildCmd = "test -d $BUILD_SSH_DIR && echo OK || echo MISSING"
$buildCheck = (ssh_pw -p $BUILD_SSH_PORT -o ConnectTimeout=10 "$BUILD_SSH_USER@$BUILD_SSH_HOST" $buildCmd 2>$null)
if (-not $buildCheck) { $buildCheck = "CONNECT_FAILED" }

if ($buildCheck -eq "CONNECT_FAILED") {
    $remoteErrors += "[error] Build-Server nicht erreichbar: $BUILD_SSH_USER@$BUILD_SSH_HOST:$BUILD_SSH_PORT"
} elseif ($buildCheck -ne "OK") {
    Write-Host "[warn] Buildverzeichnis auf Server $BUILD_SSH_HOST nicht vorhanden." -ForegroundColor Yellow
    Write-Host "       Pfad: $BUILD_SSH_HOST`:$BUILD_SSH_DIR" -ForegroundColor Yellow
    $createDir = Read-Host "Verzeichnis erstellen? [j/N]"
    if ($createDir -match "^[jJyY]$") {
        ssh_pw -p $BUILD_SSH_PORT "$BUILD_SSH_USER@$BUILD_SSH_HOST" "mkdir -p $BUILD_SSH_DIR" | Out-Null
        if ($LASTEXITCODE -ne 0) { Write-Host "[error] Konnte Verzeichnis nicht erstellen" -ForegroundColor Red; exit 1 }
    } else {
        $remoteErrors += "[error] Buildverzeichnis fehlt. Push abgebrochen."
    }
}

if ($remoteErrors.Count -eq 0) {
    # ── Docker-Modus auf dem Build-Server erkennen (rootless oder system) ──
    # Kein System-Docker (/var/run/docker.sock) -> rootless wird angenommen; das
    # Remote-Build-Script loest den Socket-Pfad selbst auf.
    $dockerCmd = 'if docker info --format "{{.SecurityOptions}}" 2>/dev/null | grep -qi rootless; then echo ROOTLESS; elif docker info >/dev/null 2>&1 || [ -S /var/run/docker.sock ]; then echo SYSTEM; else echo ROOTLESS; fi'
    $dockerProbe = (ssh_pw -p $BUILD_SSH_PORT -o ConnectTimeout=10 "$BUILD_SSH_USER@$BUILD_SSH_HOST" $dockerCmd 2>$null)
    if ($dockerProbe) {
        Write-Host "[info] Docker-Modus Build-Server: $($dockerProbe.ToLower())"
    }

    # ── Docker-Modus auf dem Deploy-Server erkennen (rootless oder system) ──
    # Dort laeuft docker compose; erreicht per SSH-Hop ueber den Build-Server
    # (DEPLOY_SSH_PRIVATE_KEY liegt auf dem Build-Server). Gleiche Annahme:
    # kein System-Docker -> rootless.
    $deployDockerCmd = 'ssh -i "' + $DEPLOY_SSH_PRIVATE_KEY + '" -p ' + $DEPLOY_SSH_PORT + ' ' + $DEPLOY_SSH_USER + '@' + $DEPLOY_SSH_HOST + ' -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o BatchMode=yes "if docker info --format ''{{.SecurityOptions}}'' 2>/dev/null | grep -qi rootless; then echo ROOTLESS; elif docker info >/dev/null 2>&1 || [ -S /var/run/docker.sock ]; then echo SYSTEM; else echo ROOTLESS; fi"'
    $deployDockerProbe = (ssh_pw -p $BUILD_SSH_PORT -o ConnectTimeout=10 "$BUILD_SSH_USER@$BUILD_SSH_HOST" $deployDockerCmd 2>$null)
    if ($deployDockerProbe) {
        Write-Host "[info] Docker-Modus Deploy-Server: $($deployDockerProbe.ToLower())"
    }
}

if ($remoteErrors.Count -gt 0) {
    $remoteErrors | ForEach-Object { Write-Host $_ -ForegroundColor Red }
    Write-Host ""
    Write-Host "Push abgebrochen." -ForegroundColor Red
    exit 1
}

Write-Host "[info] Kopiere Autodeploy-Dateien (immer aktuell)..."
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
scp_pw -P $BUILD_SSH_PORT "$scriptDir/../autodeploy/multi/build_and_deploy_multi-repo.sh" "$BUILD_SSH_USER@$BUILD_SSH_HOST`:$BUILD_SSH_DIR/" | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "[error] Konnte build_and_deploy_multi-repo.sh nicht kopieren" -ForegroundColor Red; exit 1 }
scp_pw -P $BUILD_SSH_PORT "$scriptDir/../autodeploy/multi/multi_repo_build.sh" "$BUILD_SSH_USER@$BUILD_SSH_HOST`:$BUILD_SSH_DIR/" | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "[error] Konnte multi_repo_build.sh nicht kopieren" -ForegroundColor Red; exit 1 }
scp_pw -P $BUILD_SSH_PORT "$scriptDir/../autodeploy/multi/Dockerfile_Multi" "$BUILD_SSH_USER@$BUILD_SSH_HOST`:$BUILD_SSH_DIR/" | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "[error] Konnte Dockerfile_Multi nicht kopieren" -ForegroundColor Red; exit 1 }
scp_pw -P $BUILD_SSH_PORT "$scriptDir/../autodeploy/multi/Dockerfile_Migrator" "$BUILD_SSH_USER@$BUILD_SSH_HOST`:$BUILD_SSH_DIR/" | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "[error] Konnte Dockerfile_Migrator nicht kopieren" -ForegroundColor Red; exit 1 }
if ($env:USE_INFISICAL -eq "true") {
    scp_pw -P $BUILD_SSH_PORT "$scriptDir/../autodeploy/multi/Dockerfile_Mongo" "$BUILD_SSH_USER@$BUILD_SSH_HOST`:$BUILD_SSH_DIR/" | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Host "[error] Konnte Dockerfile_Mongo nicht kopieren" -ForegroundColor Red; exit 1 }
}
scp_pw -P $BUILD_SSH_PORT "$scriptDir/../autodeploy/multi/reinstall-optional-deps.sh" "$BUILD_SSH_USER@$BUILD_SSH_HOST`:$BUILD_SSH_DIR/" | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "[error] Konnte reinstall-optional-deps.sh nicht kopieren" -ForegroundColor Red; exit 1 }
scp_pw -P $BUILD_SSH_PORT "$scriptDir/../autodeploy/multi/validate-runtime-packages.js" "$BUILD_SSH_USER@$BUILD_SSH_HOST`:$BUILD_SSH_DIR/" | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "[error] Konnte validate-runtime-packages.js nicht kopieren" -ForegroundColor Red; exit 1 }
scp_pw -P $BUILD_SSH_PORT "$scriptDir/../autodeploy/multi/Dockerfile_Multi_Autodeploy_Builder" "$BUILD_SSH_USER@$BUILD_SSH_HOST`:$BUILD_SSH_DIR/" | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "[error] Konnte Dockerfile_Multi_Autodeploy_Builder nicht kopieren" -ForegroundColor Red; exit 1 }
scp_pw -P $BUILD_SSH_PORT "$scriptDir/../autodeploy/multi/setup_deploy_server.sh" "$BUILD_SSH_USER@$BUILD_SSH_HOST`:$BUILD_SSH_DIR/" | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "[error] Konnte setup_deploy_server.sh nicht kopieren" -ForegroundColor Red; exit 1 }
scp_pw -P $BUILD_SSH_PORT "$scriptDir/../autodeploy/multi/test_setup_and_copy_multi-repo.sh" "$BUILD_SSH_USER@$BUILD_SSH_HOST`:$BUILD_SSH_DIR/" | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "[error] Konnte test_setup_and_copy_multi-repo.sh nicht kopieren" -ForegroundColor Red; exit 1 }
scp_pw -P $BUILD_SSH_PORT "$scriptDir/../.env.autodeploy" "$BUILD_SSH_USER@$BUILD_SSH_HOST`:$BUILD_SSH_DIR/docker.env" | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "[error] Konnte docker.env nicht kopieren" -ForegroundColor Red; exit 1 }
if (Test-Path "$scriptDir/../create-nfs-volume.sh") {
    scp_pw -P $BUILD_SSH_PORT "$scriptDir/../create-nfs-volume.sh" "$BUILD_SSH_USER@$BUILD_SSH_HOST`:$BUILD_SSH_DIR/create-nfs-volume.sh" | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Host "[error] Konnte create-nfs-volume.sh nicht kopieren" -ForegroundColor Red; exit 1 }
}
if (Test-Path "$scriptDir/../docker-compose.yml") {
    scp_pw -P $BUILD_SSH_PORT "$scriptDir/../docker-compose.yml" "$BUILD_SSH_USER@$BUILD_SSH_HOST`:$BUILD_SSH_DIR/docker-compose.yml" | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Host "[error] Konnte docker-compose.yml nicht kopieren" -ForegroundColor Red; exit 1 }
}
if (Test-Path "$scriptDir/../.env") {
    scp_pw -P $BUILD_SSH_PORT "$scriptDir/../.env" "$BUILD_SSH_USER@$BUILD_SSH_HOST`:$BUILD_SSH_DIR/.env" | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Host "[error] Konnte .env nicht kopieren" -ForegroundColor Red; exit 1 }
} elseif (Test-Path "$scriptDir/../.env.example") {
    scp_pw -P $BUILD_SSH_PORT "$scriptDir/../.env.example" "$BUILD_SSH_USER@$BUILD_SSH_HOST`:$BUILD_SSH_DIR/.env" | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Host "[error] Konnte .env.example nicht kopieren" -ForegroundColor Red; exit 1 }
}
Write-Host "[info] Autodeploy-Dateien aktualisiert."

# Autodeploy-Server: Check via Build-Server (SSH-Hop) – nur Hinweis, kein Abbruch
$deployKey = $env:DEPLOY_SSH_PRIVATE_KEY
$deployHopCmd = "ssh -i $deployKey -p $DEPLOY_SSH_PORT ${DEPLOY_SSH_USER}@${DEPLOY_SSH_HOST} -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o BatchMode=yes test -d $DEPLOY_SSH_DIR && echo OK || echo MISSING"
$deployCheck = (ssh_pw -p $BUILD_SSH_PORT -o ConnectTimeout=10 "$BUILD_SSH_USER@$BUILD_SSH_HOST" $deployHopCmd 2>$null)
if (-not $deployCheck) { $deployCheck = "CONNECT_FAILED" }
if ($deployCheck -eq "CONNECT_FAILED") {
    Write-Host "[warn] Autodeploy-Server vom Build-Server nicht erreichbar: $DEPLOY_SSH_USER@$DEPLOY_SSH_HOST:$DEPLOY_SSH_PORT" -ForegroundColor Yellow
    Write-Host "       Bitte Verbindung und SSH-Key auf dem Build-Server pruefen." -ForegroundColor Yellow
} elseif ($deployCheck -ne "OK") {
    Write-Host "[warn] Autodeployverzeichnis auf Server $DEPLOY_SSH_HOST nicht vorhanden: $DEPLOY_SSH_DIR" -ForegroundColor Yellow
    Write-Host "       Bitte Verzeichnis auf dem Autodeploy-Server anlegen." -ForegroundColor Yellow
}

# ── Optional: Lokale Änderungen committen und pushen ─────────────────────────
# git add -A
# git commit -a -m "push and deploy"
# git push

ssh_pw -p $BUILD_SSH_PORT "$BUILD_SSH_USER@$BUILD_SSH_HOST" "BUILD_MIGRATOR_IMAGE=$($env:BUILD_MIGRATOR_IMAGE) BUILD_MONGO_IMAGE=$($env:BUILD_MONGO_IMAGE) bash $BUILD_SSH_DIR/build_and_deploy_multi-repo.sh"
Remove-Item -Force $askpassFile -ErrorAction SilentlyContinue

$PushEnd = Get-Date
$PushDuration = $PushEnd - $PushStart
Write-Host "[info] Beendet um       : $($PushEnd.ToString('yyyy-MM-dd HH:mm:ss'))"
Write-Host ("[info] Dauer            : {0:D2}h {1:D2}m {2:D2}s" -f [int]$PushDuration.TotalHours, $PushDuration.Minutes, $PushDuration.Seconds)
