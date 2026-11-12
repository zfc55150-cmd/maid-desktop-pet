@echo off
chcp 65001 >nul
cd /d "%~dp0..\..\.."
"%LOCALAPPDATA%\Programs\DeepSeekActionPet\node.exe" "%~dp0review-session.cjs" "%~dp0..\..\..\work\gpt-playback-lab-20261102-05" --apply
if errorlevel 1 pause
