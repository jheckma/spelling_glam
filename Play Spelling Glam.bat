@echo off
rem Opens the game in its own window with sound allowed from the first moment.
rem A separate profile folder makes the setting apply even if the browser is already open.
set "GAME=%~dp0glam-bee\index.html"
set "PROFILE_DIR=%LOCALAPPDATA%\SpellingGlam"
set "BROWSER="
for %%B in (
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
  "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
) do if not defined BROWSER if exist "%%~B" set "BROWSER=%%~B"
if not defined BROWSER (
  start "" "%GAME%"
  exit /b
)
start "" "%BROWSER%" --app="file:///%GAME:\=/%" --start-maximized --autoplay-policy=no-user-gesture-required --user-data-dir="%PROFILE_DIR%" --no-first-run --no-default-browser-check %*
