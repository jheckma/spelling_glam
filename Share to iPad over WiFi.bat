@echo off
rem Lets an iPad on the same Wi-Fi play the game from this PC. Keep this window open while playing.
cd /d "%~dp0glam-bee"
echo.
echo  On the iPad, open Safari and type one of these addresses:
echo.
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /c:"IPv4"') do (
  for /f "tokens=* delims= " %%B in ("%%A") do echo      http://%%B:8000
)
echo.
echo  (Use the one that starts with 192.168. or 10. and is NOT 192.168.56.x)
echo  If Windows asks about the firewall, click "Allow" for Private networks.
echo  Close this window to stop sharing.
echo.
python -m http.server 8000 --bind 0.0.0.0 2>nul || py -m http.server 8000 --bind 0.0.0.0
pause
