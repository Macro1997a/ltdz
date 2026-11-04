@echo off
chcp 65001 >nul
cd /d "%~dp0"
node --use-env-proxy lan.mjs
pause
