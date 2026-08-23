@echo off
setlocal enabledelayedexpansion
title Suivi Travaux Patrimoine - Installation
color 0E

echo.
echo   =====================================================
echo    SUIVI TRAVAUX PATRIMOINE - Installation (Comilog)
echo   =====================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo   [!] Node.js n'est pas installe sur cet ordinateur.
    echo.
    echo   Le site officiel de telechargement va s'ouvrir. Installez
    echo   Node.js ^(version LTS recommandee^), puis relancez ce fichier.
    echo.
    pause
    start https://nodejs.org/fr/download
    exit /b 1
)

echo   [OK] Node.js detecte :
node --version
echo.

set "INSTALL_DIR=%LOCALAPPDATA%\SuiviTravauxPatrimoine"
echo   Installation dans : %INSTALL_DIR%
echo.

if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

echo   Copie des fichiers de l'application...
xcopy /E /I /Y "%~dp0server.js" "%INSTALL_DIR%\" >nul
xcopy /E /I /Y "%~dp0package.json" "%INSTALL_DIR%\" >nul
xcopy /E /I /Y "%~dp0public" "%INSTALL_DIR%\public\" >nul
if not exist "%INSTALL_DIR%\data" (
    xcopy /E /I /Y "%~dp0data" "%INSTALL_DIR%\data\" >nul
) else (
    echo   [i] Un dossier de donnees existe deja - conserve tel quel ^(comptes et dossiers preserves^).
)

echo   Creation du lanceur...
(
    echo @echo off
    echo title Suivi Travaux Patrimoine
    echo cd /d "%INSTALL_DIR%"
    echo start "Suivi Travaux Patrimoine - Serveur" cmd /k "node server.js"
    echo timeout /t 3 /nobreak ^>nul
    echo start "" http://localhost:3001
) > "%INSTALL_DIR%\Lancer Suivi Travaux.bat"

set "DESKTOP=%USERPROFILE%\Desktop"
set "SHORTCUT=%DESKTOP%\Suivi Travaux Patrimoine.lnk"

powershell -NoProfile -Command ^
  "$s = New-Object -ComObject WScript.Shell; " ^
  "$sc = $s.CreateShortcut('%SHORTCUT%'); " ^
  "$sc.TargetPath = '%INSTALL_DIR%\Lancer Suivi Travaux.bat'; " ^
  "$sc.WorkingDirectory = '%INSTALL_DIR%'; " ^
  "$sc.WindowStyle = 7; " ^
  "$sc.Description = 'Suivi Travaux Patrimoine - Comilog'; " ^
  "$sc.Save()"

echo.
echo   =====================================================
echo    INSTALLATION TERMINEE
echo   =====================================================
echo.
echo   Un raccourci "Suivi Travaux Patrimoine" a ete cree sur
echo   votre Bureau. Double-cliquez dessus pour lancer
echo   l'application a tout moment.
echo.
echo   IMPORTANT - Premiere ouverture :
echo   Aucun compte n'existe encore. L'ecran de connexion va
echo   vous proposer de creer le premier compte, qui deviendra
echo   automatiquement administrateur. C'est depuis ce compte
echo   que vous pourrez ensuite creer les comptes de vos collegues
echo   ^(bouton "Administration" en haut de l'application^).
echo.
pause

cd /d "%INSTALL_DIR%"
start "Suivi Travaux Patrimoine - Serveur" cmd /k "node server.js"
timeout /t 3 /nobreak >nul
start "" http://localhost:3001
