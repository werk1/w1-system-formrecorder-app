@echo off
SETLOCAL EnableDelayedExpansion

REM Klassischer Push – SSH zum Build-Server, Build remote triggern.
REM Zugangsdaten werden aus .env.autodeploy im Projekt-Root gelesen.
REM
REM HINWEIS: Workspace-Modus – lokale Packages vorhanden.
REM           Fuer Workspace-Transfers bitte: node scripts/workspace-push-node.mjs
REM           Dieses Script triggert nur den Build-Server (clont App von GitHub).

SET PUSH_START_TIME=%TIME%
echo [info] Gestartet um     : %DATE% %TIME%

SET SCRIPT_DIR=%~dp0
SET ENV_FILE=%SCRIPT_DIR%..\.env.autodeploy
SET ERRORS=0

REM ── .env.autodeploy prüfen ───────────────────────────────────────────────────
IF NOT EXIST "%ENV_FILE%" (
  echo [error] .env.autodeploy nicht gefunden: %ENV_FILE%
  echo         Kopiere .env.autodeploy.example und trage deine Zugangsdaten ein.
  exit /b 1
)

FOR /F "usebackq tokens=1,* delims== eol=#" %%A IN ("%ENV_FILE%") DO (
  SET "%%A=%%B"
)

REM ── Modus-Hinweis ───────────────────────────────────────────────────────────
echo [hinweis] Workspace-Modus: lokale Packages vorhanden.
echo           Dieses Script (push.bat) triggert nur den Build-Server (clont von GitHub).
echo           Fuer Workspace-Transfers bitte: node scripts/workspace-push-node.mjs
echo.

REM ── Migrator-Image: interaktive Abfrage ─────────────────────────────────────
IF NOT "%BUILD_MIGRATOR_IMAGE%"=="true" IF NOT "%BUILD_MIGRATOR_IMAGE%"=="false" (
  SET BUILD_MIGRATOR_IMAGE=false
  set /p _BUILD_MIGRATOR_ANSWER="Migrator-Image erstellen? [j/N]: "
  IF /I "!_BUILD_MIGRATOR_ANSWER!"=="j" SET BUILD_MIGRATOR_IMAGE=true
  IF /I "!_BUILD_MIGRATOR_ANSWER!"=="y" SET BUILD_MIGRATOR_IMAGE=true
)
echo [info] BUILD_MIGRATOR_IMAGE=!BUILD_MIGRATOR_IMAGE!
REM ── Mongo-Image: interaktive Abfrage ─────────────────────────────────────────
IF NOT "%BUILD_MONGO_IMAGE%"=="true" IF NOT "%BUILD_MONGO_IMAGE%"=="false" (
  SET BUILD_MONGO_IMAGE=false
  set /p _BUILD_MONGO_ANSWER="Mongo-Image erstellen? [j/N]: "
  IF /I "!_BUILD_MONGO_ANSWER!"=="j" SET BUILD_MONGO_IMAGE=true
  IF /I "!_BUILD_MONGO_ANSWER!"=="y" SET BUILD_MONGO_IMAGE=true
)
echo [info] BUILD_MONGO_IMAGE=!BUILD_MONGO_IMAGE!
echo.

REM ── Pflichtfelder + Default-Wert-Erkennung ───────────────────────────────────
IF "%BUILD_SSH_HOST%"==""                        ( echo [error] BUILD_SSH_HOST nicht gesetzt & SET /A ERRORS+=1 )
IF "%BUILD_SSH_USER%"==""                        ( echo [error] BUILD_SSH_USER nicht gesetzt & SET /A ERRORS+=1 )
IF "%DOCKER_PASSWORD%"==""                       ( echo [error] DOCKER_PASSWORD nicht gesetzt & SET /A ERRORS+=1 )
IF "%DOCKER_PASSWORD%"=="DEIN_DOCKER_PASSWORT"   ( echo [error] DOCKER_PASSWORD hat noch Platzhalter-Wert & SET /A ERRORS+=1 )
IF "%NPM_TOKEN%"==""                             ( echo [error] NPM_TOKEN nicht gesetzt & SET /A ERRORS+=1 )
IF "%NPM_TOKEN%"=="DEIN_NPM_TOKEN"               ( echo [error] NPM_TOKEN hat noch Platzhalter-Wert & SET /A ERRORS+=1 )
IF "%DEPLOY_SSH_PRIVATE_KEY%"==""               ( echo [error] DEPLOY_SSH_PRIVATE_KEY nicht gesetzt & SET /A ERRORS+=1 )
IF "%DEPLOY_SSH_PRIVATE_KEY%"=="~/.ssh/DEIN_BUILDER_KEY" ( echo [error] DEPLOY_SSH_PRIVATE_KEY hat noch Platzhalter-Wert & SET /A ERRORS+=1 )
IF "%BUILD_SSH_PASSWORD%"==""                   ( echo [error] BUILD_SSH_PASSWORD nicht gesetzt & SET /A ERRORS+=1 )
IF "%BUILD_SSH_PASSWORD%"=="DEIN_BUILD_PASSWORT" ( echo [error] BUILD_SSH_PASSWORD hat noch Platzhalter-Wert & SET /A ERRORS+=1 )

IF %ERRORS% GTR 0 (
  echo.
  echo [%ERRORS% Fehler] Push abgebrochen. Bitte .env.autodeploy vervollstaendigen.
  exit /b 1
)

IF "%BUILD_SSH_PORT%"==""  SET BUILD_SSH_PORT=22
IF "%BUILD_SSH_DIR%"==""   SET BUILD_SSH_DIR=w1-system-formrecorder-app
IF "%DEPLOY_SSH_PORT%"=="" SET DEPLOY_SSH_PORT=22
IF "%DEPLOY_SSH_DIR%"==""  SET DEPLOY_SSH_DIR=w1-system-formrecorder-app

REM ── BUILD_SSH_PASSWORD: interaktiv abfragen wenn auf Default ────────────────
IF "%BUILD_SSH_PASSWORD%"=="DEIN_BUILD_PASSWORT" (
  set /p BUILD_SSH_PASSWORD="BUILD_SSH_PASSWORD eingeben: "
)

REM ── SSH_ASKPASS-Hilfsskript (kein sshpass noetig) ──────────────────────────
SET ASKPASS_FILE=%TEMP%\ssh_askpass_%RANDOM%.bat
echo @echo off> "%ASKPASS_FILE%"
echo echo %BUILD_SSH_PASSWORD%>> "%ASKPASS_FILE%"
SET SSH_ASKPASS=%ASKPASS_FILE%
SET SSH_ASKPASS_REQUIRE=force
SET DISPLAY=

REM ── Remote-Verzeichnisse prüfen ──────────────────────────────────────────────
FOR /F "delims=" %%R IN ('ssh -p %BUILD_SSH_PORT% -o PasswordAuthentication=yes -o StrictHostKeyChecking=no -o ConnectTimeout=10 "%BUILD_SSH_USER%@%BUILD_SSH_HOST%" "test -d \"%BUILD_SSH_DIR%\" && echo OK || echo MISSING" 2^>nul') DO SET BUILD_CHECK=%%R
IF NOT DEFINED BUILD_CHECK SET BUILD_CHECK=CONNECT_FAILED
IF "%BUILD_CHECK%"=="CONNECT_FAILED" ( echo [error] Build-Server nicht erreichbar: %BUILD_SSH_USER%@%BUILD_SSH_HOST%:%BUILD_SSH_PORT% & SET /A ERRORS+=1 )
IF NOT "%BUILD_CHECK%"=="OK" IF NOT "%BUILD_CHECK%"=="CONNECT_FAILED" (
  echo [warn] Buildverzeichnis auf Server %BUILD_SSH_HOST% nicht vorhanden.
  echo        Pfad: %BUILD_SSH_HOST%:%BUILD_SSH_DIR%
  set /p CREATE_DIR="Verzeichnis erstellen? [j/N]: "
  IF /I "!CREATE_DIR!"=="j" (
    ssh -p %BUILD_SSH_PORT% -o PasswordAuthentication=yes -o StrictHostKeyChecking=no "%BUILD_SSH_USER%@%BUILD_SSH_HOST%" "mkdir -p %BUILD_SSH_DIR%" || ( echo [error] Konnte Verzeichnis nicht erstellen & exit /b 1 )
  ) ELSE (
    echo [error] Buildverzeichnis fehlt. Push abgebrochen.
    SET /A ERRORS+=1
  )
)

REM ── Docker-Modus auf dem Build-Server erkennen (rootless oder system) ────────
REM Kein System-Docker (/var/run/docker.sock) -> rootless wird angenommen; das
REM Remote-Build-Script loest den Socket-Pfad selbst auf.
IF NOT "%BUILD_CHECK%"=="CONNECT_FAILED" (
  FOR /F "delims=" %%R IN ('ssh -p %BUILD_SSH_PORT% -o PasswordAuthentication=yes -o StrictHostKeyChecking=no -o ConnectTimeout=10 "%BUILD_SSH_USER%@%BUILD_SSH_HOST%" "if docker info --format '{{.SecurityOptions}}' 2>/dev/null | grep -qi rootless; then echo ROOTLESS; elif docker info >/dev/null 2>&1 || [ -S /var/run/docker.sock ]; then echo SYSTEM; else echo ROOTLESS; fi" 2^>nul') DO SET DOCKER_PROBE=%%R
  IF "!DOCKER_PROBE!"=="ROOTLESS" echo [info] Docker-Modus Build-Server: rootless
  IF "!DOCKER_PROBE!"=="SYSTEM" echo [info] Docker-Modus Build-Server: system

  REM ── Docker-Modus auf dem Deploy-Server erkennen (rootless oder system) ──
  REM Dort laeuft docker compose; erreicht per SSH-Hop ueber den Build-Server.
  REM Gleiche Annahme: kein System-Docker -> rootless.
  FOR /F "delims=" %%R IN ('ssh -p %BUILD_SSH_PORT% -o PasswordAuthentication=yes -o StrictHostKeyChecking=no -o ConnectTimeout=10 "%BUILD_SSH_USER%@%BUILD_SSH_HOST%" "ssh -i \"%DEPLOY_SSH_PRIVATE_KEY%\" -p %DEPLOY_SSH_PORT% %DEPLOY_SSH_USER%@%DEPLOY_SSH_HOST% -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o BatchMode=yes \"if docker info --format '{{.SecurityOptions}}' 2>/dev/null | grep -qi rootless; then echo ROOTLESS; elif docker info >/dev/null 2>&1 || [ -S /var/run/docker.sock ]; then echo SYSTEM; else echo ROOTLESS; fi\"" 2^>nul') DO SET DEPLOY_DOCKER_PROBE=%%R
  IF "!DEPLOY_DOCKER_PROBE!"=="ROOTLESS" echo [info] Docker-Modus Deploy-Server: rootless
  IF "!DEPLOY_DOCKER_PROBE!"=="SYSTEM" echo [info] Docker-Modus Deploy-Server: system
)

IF %ERRORS% GTR 0 ( echo. & echo Push abgebrochen. & exit /b 1 )

echo [info] Kopiere Autodeploy-Dateien (immer aktuell)...
scp -P %BUILD_SSH_PORT% -o PasswordAuthentication=yes -o StrictHostKeyChecking=no "%~dp0..\autodeploy\multi\build_and_deploy_multi-repo.sh" "%BUILD_SSH_USER%@%BUILD_SSH_HOST%:%BUILD_SSH_DIR%/" || ( echo [error] Konnte build_and_deploy_multi-repo.sh nicht kopieren & exit /b 1 )
scp -P %BUILD_SSH_PORT% -o PasswordAuthentication=yes -o StrictHostKeyChecking=no "%~dp0..\autodeploy\multi\multi_repo_build.sh" "%BUILD_SSH_USER%@%BUILD_SSH_HOST%:%BUILD_SSH_DIR%/" || ( echo [error] Konnte multi_repo_build.sh nicht kopieren & exit /b 1 )
scp -P %BUILD_SSH_PORT% -o PasswordAuthentication=yes -o StrictHostKeyChecking=no "%~dp0..\autodeploy\multi\Dockerfile_Multi" "%BUILD_SSH_USER%@%BUILD_SSH_HOST%:%BUILD_SSH_DIR%/" || ( echo [error] Konnte Dockerfile_Multi nicht kopieren & exit /b 1 )
scp -P %BUILD_SSH_PORT% -o PasswordAuthentication=yes -o StrictHostKeyChecking=no "%~dp0..\autodeploy\multi\Dockerfile_Migrator" "%BUILD_SSH_USER%@%BUILD_SSH_HOST%:%BUILD_SSH_DIR%/" || ( echo [error] Konnte Dockerfile_Migrator nicht kopieren & exit /b 1 )
IF "%USE_INFISICAL%"=="true" scp -P %BUILD_SSH_PORT% -o PasswordAuthentication=yes -o StrictHostKeyChecking=no "%~dp0..\autodeploy\multi\Dockerfile_Mongo" "%BUILD_SSH_USER%@%BUILD_SSH_HOST%:%BUILD_SSH_DIR%/" || ( echo [error] Konnte Dockerfile_Mongo nicht kopieren & exit /b 1 )
scp -P %BUILD_SSH_PORT% -o PasswordAuthentication=yes -o StrictHostKeyChecking=no "%~dp0..\autodeploy\multi\reinstall-optional-deps.sh" "%BUILD_SSH_USER%@%BUILD_SSH_HOST%:%BUILD_SSH_DIR%/" || ( echo [error] Konnte reinstall-optional-deps.sh nicht kopieren & exit /b 1 )
scp -P %BUILD_SSH_PORT% -o PasswordAuthentication=yes -o StrictHostKeyChecking=no "%~dp0..\autodeploy\multi\validate-runtime-packages.js" "%BUILD_SSH_USER%@%BUILD_SSH_HOST%:%BUILD_SSH_DIR%/" || ( echo [error] Konnte validate-runtime-packages.js nicht kopieren & exit /b 1 )
scp -P %BUILD_SSH_PORT% -o PasswordAuthentication=yes -o StrictHostKeyChecking=no "%~dp0..\autodeploy\multi\Dockerfile_Multi_Autodeploy_Builder" "%BUILD_SSH_USER%@%BUILD_SSH_HOST%:%BUILD_SSH_DIR%/" || ( echo [error] Konnte Dockerfile_Multi_Autodeploy_Builder nicht kopieren & exit /b 1 )
scp -P %BUILD_SSH_PORT% -o PasswordAuthentication=yes -o StrictHostKeyChecking=no "%~dp0..\autodeploy\multi\setup_deploy_server.sh" "%BUILD_SSH_USER%@%BUILD_SSH_HOST%:%BUILD_SSH_DIR%/" || ( echo [error] Konnte setup_deploy_server.sh nicht kopieren & exit /b 1 )
scp -P %BUILD_SSH_PORT% -o PasswordAuthentication=yes -o StrictHostKeyChecking=no "%~dp0..\autodeploy\multi\test_setup_and_copy_multi-repo.sh" "%BUILD_SSH_USER%@%BUILD_SSH_HOST%:%BUILD_SSH_DIR%/" || ( echo [error] Konnte test_setup_and_copy_multi-repo.sh nicht kopieren & exit /b 1 )
scp -P %BUILD_SSH_PORT% -o PasswordAuthentication=yes -o StrictHostKeyChecking=no "%~dp0..\.env.autodeploy" "%BUILD_SSH_USER%@%BUILD_SSH_HOST%:%BUILD_SSH_DIR%/docker.env" || ( echo [error] Konnte docker.env nicht kopieren & exit /b 1 )
IF EXIST "%~dp0..\create-nfs-volume.sh" scp -P %BUILD_SSH_PORT% -o PasswordAuthentication=yes -o StrictHostKeyChecking=no "%~dp0..\create-nfs-volume.sh" "%BUILD_SSH_USER%@%BUILD_SSH_HOST%:%BUILD_SSH_DIR%/create-nfs-volume.sh" || ( echo [error] Konnte create-nfs-volume.sh nicht kopieren & exit /b 1 )
IF EXIST "%~dp0..\docker-compose.yml" scp -P %BUILD_SSH_PORT% -o PasswordAuthentication=yes -o StrictHostKeyChecking=no "%~dp0..\docker-compose.yml" "%BUILD_SSH_USER%@%BUILD_SSH_HOST%:%BUILD_SSH_DIR%/docker-compose.yml" || ( echo [error] Konnte docker-compose.yml nicht kopieren & exit /b 1 )
IF EXIST "%~dp0..\.env" (
  scp -P %BUILD_SSH_PORT% -o PasswordAuthentication=yes -o StrictHostKeyChecking=no "%~dp0..\.env" "%BUILD_SSH_USER%@%BUILD_SSH_HOST%:%BUILD_SSH_DIR%/.env" || ( echo [error] Konnte .env nicht kopieren & exit /b 1 )
) ELSE IF EXIST "%~dp0..\.env.example" (
  scp -P %BUILD_SSH_PORT% -o PasswordAuthentication=yes -o StrictHostKeyChecking=no "%~dp0..\.env.example" "%BUILD_SSH_USER%@%BUILD_SSH_HOST%:%BUILD_SSH_DIR%/.env" || ( echo [error] Konnte .env.example nicht kopieren & exit /b 1 )
)
echo [info] Autodeploy-Dateien aktualisiert.

REM Autodeploy-Server: Check via Build-Server (SSH-Hop) - nur Hinweis, kein Abbruch
FOR /F "delims=" %%R IN ('ssh -p %BUILD_SSH_PORT% -o PasswordAuthentication=yes -o StrictHostKeyChecking=no -o ConnectTimeout=10 "%BUILD_SSH_USER%@%BUILD_SSH_HOST%" "ssh -i %DEPLOY_SSH_PRIVATE_KEY% -p %DEPLOY_SSH_PORT% %DEPLOY_SSH_USER%@%DEPLOY_SSH_HOST% -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=10 test -d %DEPLOY_SSH_DIR% 2>nul && echo OK || echo MISSING" 2^>nul') DO SET DEPLOY_CHECK=%%R
IF NOT DEFINED DEPLOY_CHECK SET DEPLOY_CHECK=CONNECT_FAILED
IF "%DEPLOY_CHECK%"=="CONNECT_FAILED" (
  echo [warn] Autodeploy-Server vom Build-Server nicht erreichbar: %DEPLOY_SSH_USER%@%DEPLOY_SSH_HOST%:%DEPLOY_SSH_PORT%
  echo        Bitte Verbindung und SSH-Key auf dem Build-Server pruefen.
)
IF NOT "%DEPLOY_CHECK%"=="OK" IF NOT "%DEPLOY_CHECK%"=="CONNECT_FAILED" (
  echo [warn] Autodeployverzeichnis auf Server %DEPLOY_SSH_HOST% nicht vorhanden: %DEPLOY_SSH_DIR%
  echo        Bitte Verzeichnis auf dem Autodeploy-Server anlegen.
)

REM ── Optional: Lokale Änderungen committen und pushen ─────────────────────────
REM git add -A
REM git commit -a -m "push and deploy"
REM git push

ssh -p %BUILD_SSH_PORT% -o PasswordAuthentication=yes -o StrictHostKeyChecking=no "%BUILD_SSH_USER%@%BUILD_SSH_HOST%" "BUILD_MIGRATOR_IMAGE=!BUILD_MIGRATOR_IMAGE! BUILD_MONGO_IMAGE=!BUILD_MONGO_IMAGE! bash %BUILD_SSH_DIR%/build_and_deploy_multi-repo.sh"
del /F /Q "%ASKPASS_FILE%" 2>nul

echo [info] Beendet um       : %DATE% %TIME%
CALL :PRINT_DURATION "%PUSH_START_TIME%" "%TIME%"
EXIT /B 0

:PRINT_DURATION
SETLOCAL
SET "_START=%~1"
SET "_END=%~2"
FOR /F "tokens=1-4 delims=:.," %%a IN ("%_START%") DO SET /A "_START_S=(((1%%a-100)*60+1%%b-100)*60+1%%c-100)"
FOR /F "tokens=1-4 delims=:.," %%a IN ("%_END%") DO SET /A "_END_S=(((1%%a-100)*60+1%%b-100)*60+1%%c-100)"
SET /A "_DIFF=_END_S-_START_S"
IF %_DIFF% LSS 0 SET /A "_DIFF+=86400"
SET /A "_H=_DIFF/3600, _M=(_DIFF%%3600)/60, _S=_DIFF%%60"
echo [info] Dauer            : %_H%h %_M%m %_S%s
ENDLOCAL
GOTO :EOF
