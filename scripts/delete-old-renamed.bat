@echo off
setlocal EnableDelayedExpansion

REM ============================================================
REM  Phase 2: Delete the renamed folders (service stays UP)
REM  Finds folders matching <DIR1>_* and <DIR2>_* and deletes
REM  them recursively. Service is not touched — zero downtime.
REM  Schedule this ~30 minutes after rename-and-restart.bat.
REM ============================================================

REM --- Logging wrapper ---
if "%~1"=="--inner" goto main

set "LOGDIR=%~dp0logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set "LOGDATE=%%i"
set "LOGFILE=%LOGDIR%\delete-old-%LOGDATE%.log"
forfiles /p "%LOGDIR%" /m "delete-old-*.log" /d -7 /c "cmd /c del @path" >nul 2>&1

call "%~f0" --inner >> "%LOGFILE%" 2>&1
set "RC=%ERRORLEVEL%"
type "%LOGFILE%"
echo.
echo Log saved to: %LOGFILE%
exit /b %RC%

:main
REM ----- EDIT THESE FOR YOUR MACHINE --------------------------
REM  These MUST match the DIR1 / DIR2 in rename-and-restart.bat
set "DIR1=C:\mysql-test-1"
set "DIR2=C:\mysql-test-2"
REM ------------------------------------------------------------

echo ============================================================
echo [%date% %time%] ===== Deferred deletion started =====
echo   Run by  : %USERDOMAIN%\%USERNAME%
echo   Host    : %COMPUTERNAME%
echo   Pattern : %DIR1%_*
echo             %DIR2%_*
echo ============================================================

REM --- Must run elevated (rmdir on system paths needs it) ---
net session >nul 2>&1
if errorlevel 1 (
    echo ERROR: This script must be run as Administrator.
    exit /b 1
)

call :delete_matching "%DIR1%"
call :delete_matching "%DIR2%"

echo [%date% %time%] ===== Deferred deletion completed by %USERDOMAIN%\%USERNAME% =====
exit /b 0

REM ------------------------------------------------------------
:delete_matching
set "BASE=%~1"

REM --- Path safety guard ---
if "%BASE%"=="" (
    echo ERROR: empty base path. Aborting.
    exit /b 3
)
if "%BASE:~3%"=="" (
    echo ERROR: refusing to glob under drive root "%BASE%". Aborting.
    exit /b 3
)
for %%P in (
    "C:\Windows"
    "C:\Windows\System32"
    "C:\Program Files"
    "C:\Program Files (x86)"
    "C:\Users"
    "C:\ProgramData"
) do (
    if /i "%BASE%"=="%%~P" (
        echo ERROR: refusing protected base "%%~P". Aborting.
        exit /b 3
    )
)

set /a FOUND=0
for /d %%D in ("%BASE%_*") do (
    set /a FOUND+=1
    echo [%time%] Deleting %%~fD ...
    rmdir /S /Q "%%~fD"
    if exist "%%~fD" (
        echo WARNING: Could not fully remove %%~fD ^(files may be locked^).
    )
)

if !FOUND!==0 (
    echo [%time%] No folders matching %BASE%_* to delete.
) else (
    echo [%time%] Deleted !FOUND! folder^(s^) matching %BASE%_*.
)
goto :eof
