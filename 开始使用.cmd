@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
 echo 请先从 https://nodejs.org/ 安装 Node.js 24 LTS，再重新打开本文件。
 pause
 exit /b 1
)
node scripts\start-web.mjs
pause
