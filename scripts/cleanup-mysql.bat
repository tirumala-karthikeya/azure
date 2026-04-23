@echo off
setlocal EnableDelayedExpansion

REM ============================================================
REM  Tomcat 9 cleanup script
REM  1. Stops the tomcat9 service (waits up to STOP_TIMEOUT sec)
REM  2. Force-kills the process if it will not stop
REM  3. Recursively wipes two folders and recreates them
REM  4. Starts the tomcat9 service again
REM  Output is written to .\logs\cleanup-YYYY-MM-DD.log
REM  Logs older than 7 days are purged automatically.
REM ============================================================

REM --- Logging wrapper: re-invoke self with output redirected ---
if "%~1"=="--inner" goto main

set "LOGDIR=%~dp0logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set "DATESTAMP=%%i"
set "LOGFILE=%LOGDIR%\cleanup-%DATESTAMP%.log"
forfiles /p "%LOGDIR%" /m "cleanup-*.log" /d -7 /c "cmd /c del @path" >nul 2>&1

call "%~f0" --inner >> "%LOGFILE%" 2>&1
set "RC=%ERRORLEVEL%"
type "%LOGFILE%"
echo.
echo Log saved to: %LOGFILE%
exit /b %RC%

:main
REM ----- EDIT THESE FOR YOUR MACHINE --------------------------
set "SERVICE_NAME=tomcat9"
set "PROCESS_NAME=tomcat9.exe"
set "DIR1=C:\Program Files\Apache Software Foundation\Tomcat 9.0\work"
set "DIR2=C:\Program Files\Apache Software Foundation\Tomcat 9.0\temp"
set "STOP_TIMEOUT=120"
set "START_TIMEOUT=120"
REM ------------------------------------------------------------

echo ============================================================
echo [%date% %time%] ===== Tomcat cleanup started =====
echo   Run by     : %USERDOMAIN%\%USERNAME%
echo   Host       : %COMPUTERNAME%
echo   Script     : %~f0
echo   Service    : %SERVICE_NAME%
echo   Process    : %PROCESS_NAME%
echo   Folders    : %DIR1%
echo                %DIR2%
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
goto do_cleanup

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
echo [%time%] Service did not stop within %STOP_TIMEOUT%s. Force-killing %PROCESS_NAME%...
taskkill /F /IM "%PROCESS_NAME%" /T >nul 2>&1
timeout /t 5 /nobreak >nul

:stopped_ok
echo [%time%] Service stopped.

REM --- Condition: orphan process after service reports STOPPED ---
tasklist /FI "IMAGENAME eq %PROCESS_NAME%" 2>nul | find /i "%PROCESS_NAME%" >nul
if not errorlevel 1 (
    echo [%time%] WARNING: Orphan %PROCESS_NAME% still running. Killing it.
    taskkill /F /IM "%PROCESS_NAME%" /T >nul 2>&1
    timeout /t 3 /nobreak >nul
)

:do_cleanup

REM --- Clean folders ---
call :clean "%DIR1%"
call :clean "%DIR2%"

REM --- Start the service (with start timeout) ---
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

echo [%date% %time%] ===== Tomcat cleanup completed by %USERDOMAIN%\%USERNAME% =====
exit /b 0

REM ------------------------------------------------------------
:clean
set "TARGET=%~1"

REM --- Path safety guard ---
if "%TARGET%"=="" (
    echo ERROR: empty path passed to :clean. Aborting.
    exit /b 3
)
if "%TARGET:~3%"=="" (
    echo ERROR: refusing to clean drive root "%TARGET%". Aborting.
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
        echo ERROR: refusing to clean protected path "%%~P". Aborting.
        exit /b 3
    )
)

if not exist "%TARGET%" (
    echo [%time%] %TARGET% does not exist, creating.
    mkdir "%TARGET%"
    goto :eof
)
echo [%time%] Cleaning %TARGET% ...
rmdir /S /Q "%TARGET%"
if exist "%TARGET%" (
    echo WARNING: Could not fully remove %TARGET% (files may still be locked).
) else (
    mkdir "%TARGET%"
)
goto :eof
