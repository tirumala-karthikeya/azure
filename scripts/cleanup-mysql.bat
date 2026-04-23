@echo off
setlocal EnableDelayedExpansion

if "%~1"=="--inner" goto main

set "LOGDIR=%~dp0logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set "DATESTAMP=%%i"
set "LOGFILE=%LOGDIR%\mysql-test-%DATESTAMP%.log"
forfiles /p "%LOGDIR%" /m "mysql-test-*.log" /d -7 /c "cmd /c del @path" >nul 2>&1

call "%~f0" --inner >> "%LOGFILE%" 2>&1
set "RC=%ERRORLEVEL%"
type "%LOGFILE%"
echo.
echo Log saved to: %LOGFILE%
exit /b %RC%

:main
set "SERVICE_NAME=MySQL80"
set "PROCESS_NAME=mysqld.exe"
set "DIR1=C:\mysql-test-1"
set "DIR2=C:\mysql-test-2"
set "STOP_TIMEOUT=60"
set "START_TIMEOUT=60"

echo ============================================================
echo [%date% %time%] ===== Cleanup started =====
echo   Run by  : %USERDOMAIN%\%USERNAME%
echo   Host    : %COMPUTERNAME%
echo   Service : %SERVICE_NAME%
echo ============================================================

net session >nul 2>&1
if errorlevel 1 ( echo ERROR: Must run as Administrator. & exit /b 1 )

sc query "%SERVICE_NAME%" >nul 2>&1
if errorlevel 1 ( echo ERROR: Service "%SERVICE_NAME%" not found. & exit /b 1 )

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
echo [%time%] Did not stop in %STOP_TIMEOUT%s. Force-killing %PROCESS_NAME%...
taskkill /F /IM "%PROCESS_NAME%" /T >nul 2>&1
timeout /t 3 /nobreak >nul

:stopped_ok
echo [%time%] Service stopped.
tasklist /FI "IMAGENAME eq %PROCESS_NAME%" 2>nul | find /i "%PROCESS_NAME%" >nul
if not errorlevel 1 (
    echo [%time%] NOTE: %PROCESS_NAME% still in task list (another MySQL instance).
)

:do_cleanup
call :clean "%DIR1%"
call :clean "%DIR2%"

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
echo ERROR: Service did not reach RUNNING in %START_TIMEOUT%s.
exit /b 2

:started_ok
echo [%time%] Service is running.
echo [%date% %time%] ===== Completed by %USERDOMAIN%\%USERNAME% =====
exit /b 0

:clean
set "TARGET=%~1"
if "%TARGET%"=="" ( echo ERROR: empty path & exit /b 3 )
if "%TARGET:~3%"=="" ( echo ERROR: refusing drive root "%TARGET%" & exit /b 3 )
for %%P in ("C:\Windows" "C:\Windows\System32" "C:\Program Files" "C:\Program Files (x86)" "C:\Users" "C:\ProgramData") do (
    if /i "%TARGET%"=="%%~P" ( echo ERROR: protected path "%%~P" & exit /b 3 )
)
if not exist "%TARGET%" (
    echo [%time%] %TARGET% missing, creating.
    mkdir "%TARGET%"
    goto :eof
)
echo [%time%] Cleaning %TARGET% ...
rmdir /S /Q "%TARGET%"
if exist "%TARGET%" ( echo WARNING: could not fully remove %TARGET% ) else ( mkdir "%TARGET%" )
goto :eof