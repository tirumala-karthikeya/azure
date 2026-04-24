@echo off
setlocal EnableDelayedExpansion

REM ============================================================
REM  Phase 1: Fast restart with folder rename
REM  1. Stops the service (with graceful + force-kill fallback)
REM  2. Renames DIR1 -> DIR1_YYYY-MM-DD_HHMMSS
REM  3. Renames DIR2 -> DIR2_YYYY-MM-DD_HHMMSS
REM  4. Recreates empty DIR1 and DIR2
REM  5. Starts the service (with timeout)
REM  Total downtime: ~10-15s (renaming is instant)
REM  The renamed folders are deleted later by delete-old-renamed.bat
REM ============================================================

REM --- Logging wrapper: re-invoke self with output redirected ---
if "%~1"=="--inner" goto main

set "LOGDIR=%~dp0logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set "LOGDATE=%%i"
set "LOGFILE=%LOGDIR%\rename-restart-%LOGDATE%.log"
forfiles /p "%LOGDIR%" /m "rename-restart-*.log" /d -7 /c "cmd /c del @path" >nul 2>&1

call "%~f0" --inner >> "%LOGFILE%" 2>&1
set "RC=%ERRORLEVEL%"
type "%LOGFILE%"
echo.
echo Log saved to: %LOGFILE%
exit /b %RC%

:main
REM ----- EDIT THESE FOR YOUR MACHINE --------------------------
set "SERVICE_NAME=MySQL80"
set "PROCESS_NAME=mysqld.exe"
set "DIR1=C:\mysql-test-1"
set "DIR2=C:\mysql-test-2"
set "STOP_TIMEOUT=60"
set "START_TIMEOUT=60"
REM ------------------------------------------------------------

REM --- Unique stamp for the renamed folders (date + time) ---
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmmss"') do set "STAMP=%%i"

echo ============================================================
echo [%date% %time%] ===== Rename + restart started =====
echo   Run by  : %USERDOMAIN%\%USERNAME%
echo   Host    : %COMPUTERNAME%
echo   Service : %SERVICE_NAME%
echo   Folders : %DIR1%  ->  %DIR1%_%STAMP%
echo             %DIR2%  ->  %DIR2%_%STAMP%
echo ============================================================

REM --- Must run elevated ---
net session >nul 2>&1
if errorlevel 1 (
    echo ERROR: This script must be run as Administrator.
    exit /b 1
)

REM --- Does the service exist? ---
sc query "%SERVICE_NAME%" >nul 2>&1
if errorlevel 1 (
    echo ERROR: Service "%SERVICE_NAME%" not found.
    exit /b 1
)

REM --- Stop the service if running ---
sc query "%SERVICE_NAME%" | find "RUNNING" >nul
if not errorlevel 1 goto stop_it
echo [%time%] Service already stopped.
goto do_rename

:stop_it
echo [%time%] Service is running. Requesting stop...
net stop "%SERVICE_NAME%" >nul 2>&1

set /a WAITED=0
:waitloop
sc query "%SERVICE_NAME%" | find "STOPPED" >nul
if not errorlevel 1 goto stopped_ok
if !WAITED! GEQ %STOP_TIMEOUT% goto forcekill
timeout /t 5 /nobreak >nul
set /a WAITED+=5
echo   still stopping... (!WAITED!s elapsed)
goto waitloop

:forcekill
echo [%time%] Did not stop in %STOP_TIMEOUT%s. Force-killing %PROCESS_NAME%...
taskkill /F /IM "%PROCESS_NAME%" /T >nul 2>&1
timeout /t 3 /nobreak >nul

:stopped_ok
echo [%time%] Service stopped.

REM --- Orphan process check ---
tasklist /FI "IMAGENAME eq %PROCESS_NAME%" 2>nul | find /i "%PROCESS_NAME%" >nul
if not errorlevel 1 (
    echo [%time%] WARNING: Orphan %PROCESS_NAME% still running. Killing it.
    taskkill /F /IM "%PROCESS_NAME%" /T >nul 2>&1
    timeout /t 3 /nobreak >nul
)

:do_rename

REM --- Rename both folders (instant, no deletion) ---
call :rename "%DIR1%"
call :rename "%DIR2%"

REM --- Start the service ---
echo [%time%] Starting service...
net start "%SERVICE_NAME%" >nul 2>&1

set /a STARTED=0
:startloop
sc query "%SERVICE_NAME%" | find "RUNNING" >nul
if not errorlevel 1 goto started_ok
if !STARTED! GEQ %START_TIMEOUT% goto start_failed
timeout /t 5 /nobreak >nul
set /a STARTED+=5
echo   still starting... (!STARTED!s elapsed)
goto startloop

:start_failed
echo ERROR: Service did not reach RUNNING within %START_TIMEOUT%s. Check Event Viewer.
exit /b 2

:started_ok
echo [%time%] Service is running.
echo [%date% %time%] ===== Rename + restart completed by %USERDOMAIN%\%USERNAME% =====
echo   Renamed folders will be deleted by delete-old-renamed.bat on its next run.
exit /b 0

REM ------------------------------------------------------------
:rename
set "TARGET=%~1"

REM --- Path safety guard ---
if "%TARGET%"=="" (
    echo ERROR: empty path passed to :rename. Aborting.
    exit /b 3
)
if "%TARGET:~3%"=="" (
    echo ERROR: refusing to rename drive root "%TARGET%". Aborting.
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
    if /i "%TARGET%"=="%%~P" (
        echo ERROR: refusing to rename protected path "%%~P". Aborting.
        exit /b 3
    )
)

REM --- Rename if it exists, then recreate empty ---
if exist "%TARGET%" (
    echo [%time%] Renaming %TARGET% -^> %TARGET%_%STAMP%
    move "%TARGET%" "%TARGET%_%STAMP%" >nul
    if errorlevel 1 (
        echo ERROR: Failed to rename %TARGET%. It may be locked.
        exit /b 4
    )
) else (
    echo [%time%] %TARGET% does not exist. Skipping rename.
)

echo [%time%] Creating fresh %TARGET%
mkdir "%TARGET%"
goto :eof
