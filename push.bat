@echo off
REM ============================================================
REM  Metfraa EHS — Push helper
REM  Stages, commits and pushes the current repo to GitHub.
REM ============================================================

setlocal
cd /d "%~dp0"

echo ============================================================
echo  Metfraa EHS — Git Push
echo ============================================================
echo.

REM Confirm we're in a git repo
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo ERROR: This folder is not a git repository.
    echo Make sure push.bat lives inside your metfraa-ehs project folder.
    echo.
    pause
    exit /b 1
)

REM Show pending changes
echo --- Changes detected ---
git status --short
echo.

REM Check if there's anything to commit
git diff --cached --quiet
set CACHED_DIFF=%errorlevel%
git diff --quiet
set WORKING_DIFF=%errorlevel%
git ls-files --others --exclude-standard >nul 2>&1
set "UNTRACKED="
for /f %%i in ('git ls-files --others --exclude-standard') do set UNTRACKED=1

if "%CACHED_DIFF%"=="0" if "%WORKING_DIFF%"=="0" if not defined UNTRACKED (
    echo No changes to commit. Working tree is clean.
    echo.
    pause
    exit /b 0
)

REM Ask for a commit message
echo --- Commit message ---
set /p MSG="Enter commit message (or press Enter to cancel): "

if "%MSG%"=="" (
    echo Cancelled. No commit made.
    echo.
    pause
    exit /b 0
)

echo.
echo --- Staging all changes ---
git add -A
if errorlevel 1 (
    echo.
    echo ERROR: git add failed.
    pause
    exit /b 1
)

echo --- Committing ---
git commit -m "%MSG%"
if errorlevel 1 (
    echo.
    echo ERROR: git commit failed.
    pause
    exit /b 1
)

echo.
echo --- Pushing to GitHub ---
git push
if errorlevel 1 (
    echo.
    echo ERROR: git push failed.
    echo Check your internet connection and GitHub credentials.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo  SUCCESS — Pushed to GitHub
echo  Render should auto-deploy in 1-2 minutes.
echo ============================================================
echo.
pause