@echo off
title CineSense
cd /d "%~dp0"
echo Checking Docker...
docker info >nul 2>&1
if errorlevel 1 (
  echo Starting Docker Desktop...
  start "" "C:\Users\Prithvi\Prithvi\Docker\Docker Desktop.exe"
  :waitdocker
  timeout /t 3 >nul
  docker info >nul 2>&1
  if errorlevel 1 goto waitdocker
)
echo Starting database container cinesense-db...
docker start cinesense-db
if errorlevel 1 (
  echo Could not start cinesense-db. Does the container exist? Run: docker ps -a
  pause
  exit /b 1
)
timeout /t 3 >nul
echo Starting CineSense at http://localhost:3000 ...
call npm run dev
pause
