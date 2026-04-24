# Scheduled Folder Cleanup for a Windows Service — MySQL Walkthrough

**Audience**: Windows admins or developers who need to automate folder cleanup for a running service.
**Goal**: stop the `MySQL80` Windows service safely, delete two folders recursively, and start the service back up — all automatically on a schedule.
**Why this matters**: a running service holds file handles on its folders. Deleting those folders while the service runs leaves locked files behind or fails outright. This guide shows the safe, repeatable pattern.

> **Note on scope**: this guide uses MySQL 8 as the example service because it is commonly installed locally and easy to test against. The same script works for any Windows service (Tomcat, Jenkins, Apache, etc.) — you only change four variables at the top.

---

## Table of Contents

| # | Section | What it covers |
|---|---------|----------------|
| 1 | Introduction | What the script does and why each step exists. |
| 2 | Requirements | What you need on your machine before you start. |
| 3 | The Six Conditions the Script Handles | Every state the service can be in, and what the script does about it. |
| 4 | Step 1 — Verify the Service Exists | Check that MySQL80 is installed and its state. |
| 5 | Step 2 — Create Dummy Test Folders | Why we never point the script at real MySQL data. |
| 6 | Step 3 — Create the Script File | Save the `.bat` file to disk. |
| 7 | Step 4 — Understand the Script | Walkthrough of each block before you run it. |
| 8 | Step 5 — Run the Script as Administrator | Execute and watch the output. |
| 9 | Step 6 — Verify the Results | Confirm the service came back, folders are empty, log is saved. |
| 10 | Step 7 — Schedule It (Optional) | Two ways to schedule: Task Scheduler GUI or `schtasks` one-liner. |
| 10.5 | Low-Downtime Variant | Rename-then-delete pattern using two scripts. |
| 11 | Full Script | Ready-to-copy code block. |
| 12 | Troubleshooting | Common failure modes and fixes. |

---

## 1. Introduction

### What the script does

1. Stops the `MySQL80` Windows service gracefully (`net stop`).
2. Waits up to 60 seconds for the service to reach the `STOPPED` state.
3. If it doesn't stop, **force-kills** the `mysqld.exe` process as a last resort.
4. Checks for any **orphan** `mysqld.exe` still in the task list and kills it.
5. Recursively deletes two folders (`rmdir /S /Q`) and recreates them empty.
6. Starts the service again (`net start`) and waits up to 60 seconds for it to reach `RUNNING`.
7. Writes the full output to a timestamped log file, kept for 7 days.

### Why it exists

MySQL (and services like it) **locks its data folders** while running. If you just schedule `rmdir /S /Q` on those folders without stopping the service first, you'll get "file in use" errors and leave partial junk behind. This script handles the whole lifecycle — stop, verify, clean, restart — and logs everything so unattended failures can be debugged later.

### Who runs it

The script must run as **Administrator** because `net stop`, `taskkill /F`, and `sc query` on services all require elevated privileges. Under Task Scheduler, configure the task with "Run with highest privileges" checked.

---

## 2. Requirements

| Requirement | Why |
|-------------|-----|
| Windows 10 / 11 / Server | The script uses `sc`, `net`, `taskkill`, `forfiles`, `powershell` — all Windows-native. |
| MySQL Community Server 8.x installed as a Windows service | Provides the `MySQL80` service to test against. |
| Administrator account | Needed to stop/start services. |
| CMD or Task Scheduler | The script is a `.bat` file. No PowerShell required except for date formatting. |
| A folder you can write to | For example `C:\scripts\` to hold the `.bat` and its log folder. |

### Before you start — check MySQL is there

Open CMD (normal) and run:

```cmd
sc query | findstr /i mysql
```

You should see something like:

```
SERVICE_NAME: MySQL80
```

> 📷 **Screenshot placeholder**: output of `sc query | findstr /i mysql` showing MySQL80 present.

If you don't see a MySQL service listed, install MySQL Community Server from [dev.mysql.com/downloads/installer](https://dev.mysql.com/downloads/installer/) first. Pick the **Server only** setup type. The installer registers `MySQL80` as a Windows service automatically.

---

## 3. The Six Conditions the Script Handles

A robust cleanup script has to handle every realistic state the service can be in. Here is each condition and how the script reacts.

| # | Condition | What the script does |
|---|-----------|----------------------|
| 1 | Service **already stopped** | Skip the stop step, go straight to cleanup. |
| 2 | Service **running**, stops gracefully in time | Send `net stop`, poll every 5s until `STOPPED`. |
| 3 | Service **running but won't stop** in the timeout | Force-kill with `taskkill /F /IM mysqld.exe /T`. |
| 4 | Service reports STOPPED but process is **orphaned** | Detect lingering `mysqld.exe` in `tasklist` and kill it. |
| 5 | Path passed to `:clean` is **dangerous** (empty / drive root / system folder) | Abort with exit code 3 before any deletion. |
| 6 | Service **does not come back up** after cleanup | Exit with code 2 so Task Scheduler flags failure. |

Conditions 1–3 are the core service-state branches. Conditions 4–6 are safety guards that catch real-world edge cases: crashed processes that didn't clean up, typos in the folder path, and a failed restart that would otherwise go unnoticed.

---

## 4. Step 1 — Verify the Service Exists

### What to do

Open a **normal** CMD window and run three commands:

```cmd
sc query | findstr /i mysql
sc query MySQL80
tasklist | findstr /i mysql
```

### Why each one

| Command | Purpose |
|---------|---------|
| `sc query \| findstr /i mysql` | Lists every service with "mysql" in the name. Confirms `MySQL80` exists. |
| `sc query MySQL80` | Shows the current state (`RUNNING`, `STOPPED`, etc.) of that specific service. |
| `tasklist \| findstr /i mysql` | Shows the actual process(es). Confirms the executable name is `mysqld.exe`. |

### What you should see

`sc query MySQL80` should include:

```
STATE : 4 RUNNING
```

and `tasklist` should include at least one `mysqld.exe` row.

> 📷 **Screenshot placeholder**: terminal showing all three commands and their output.

---

## 5. Step 2 — Create Dummy Test Folders

### Why dummies?

MySQL's real data lives in `C:\ProgramData\MySQL\MySQL Server 8.0\Data`. **Never point the cleanup script at that folder** — it deletes every database you have. For testing, create two throwaway folders instead so the service-stop/start logic can be verified without risking data.

### What to run

In any CMD window:

```cmd
mkdir C:\mysql-test-1
mkdir C:\mysql-test-2
echo hello > C:\mysql-test-1\a.txt
echo world > C:\mysql-test-2\b.txt
mkdir C:\mysql-test-1\sub
echo nested > C:\mysql-test-1\sub\c.txt
```

This creates two folders with a mix of files and a subfolder, so the recursive delete (`rmdir /S /Q`) actually has something to do.

> 📷 **Screenshot placeholder**: `dir C:\mysql-test-1 /s` showing the folder structure before cleanup.

---

## 6. Step 3 — Create the Script File

### Create the folder

If you don't have `C:\scripts` yet:

```cmd
mkdir C:\scripts
```

### Open Notepad

```cmd
notepad C:\scripts\cleanup-mysql.bat
```

When Notepad asks "Do you want to create a new file?", click **Yes**.

### Paste the script

Copy the full script from **Section 11 (Full Script)** at the bottom of this document into Notepad, then **File → Save**.

### Verify the file exists

```cmd
dir C:\scripts\cleanup-mysql.bat
```

You should see the file with a size around 3 KB.

> 📷 **Screenshot placeholder**: `dir C:\scripts\` showing `cleanup-mysql.bat`.

---

## 7. Step 4 — Understand the Script

Before running any script as Administrator, you should know what each part does. The script has five logical sections.

### Section A: Logging wrapper (top of file)

```bat
if "%~1"=="--inner" goto main

set "LOGDIR=%~dp0logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set "DATESTAMP=%%i"
set "LOGFILE=%LOGDIR%\cleanup-%DATESTAMP%.log"
forfiles /p "%LOGDIR%" /m "cleanup-*.log" /d -7 /c "cmd /c del @path" >nul 2>&1

call "%~f0" --inner >> "%LOGFILE%" 2>&1
set "RC=%ERRORLEVEL%"
type "%LOGFILE%"
exit /b %RC%
```

**What it does**: when the script is first launched, it re-invokes itself with a hidden `--inner` flag and redirects **all output** (stdout + stderr) to a dated log file. The first copy of the script just waits, then prints the log to the console at the end. The `forfiles` line deletes log files older than 7 days automatically.

### Section B: Configuration

```bat
set "SERVICE_NAME=MySQL80"
set "PROCESS_NAME=mysqld.exe"
set "DIR1=C:\mysql-test-1"
set "DIR2=C:\mysql-test-2"
set "STOP_TIMEOUT=60"
set "START_TIMEOUT=60"
```

**What it does**: these are the only six values you should ever need to change. Swap them to match any other service/folder pair.

### Section C: Pre-flight checks

```bat
net session >nul 2>&1
if errorlevel 1 ( echo ERROR: Must run as Administrator. & exit /b 1 )

sc query "%SERVICE_NAME%" >nul 2>&1
if errorlevel 1 ( echo ERROR: Service not found. & exit /b 1 )
```

**What it does**: refuses to continue if you forgot "Run as Administrator" or if the service name is wrong. Fails fast with a clear error instead of a confusing failure later.

### Section D: Stop → clean → start (the main work)

The core flow: check running state → `net stop` → poll for STOPPED → fallback to `taskkill /F` → orphan check → delete both folders → `net start` → poll for RUNNING.

This is where the **six conditions** from Section 3 are implemented.

### Section E: The `:clean` subroutine

```bat
:clean
set "TARGET=%~1"
if "%TARGET%"=="" ( echo ERROR: empty path & exit /b 3 )
if "%TARGET:~3%"=="" ( echo ERROR: refusing drive root "%TARGET%" & exit /b 3 )
for %%P in ("C:\Windows" "C:\Windows\System32" "C:\Program Files" ...) do (
    if /i "%TARGET%"=="%%~P" ( echo ERROR: protected path & exit /b 3 )
)
rmdir /S /Q "%TARGET%"
mkdir "%TARGET%"
goto :eof
```

**What it does**: before deleting, checks that the path isn't empty, isn't a drive root (`C:\`), and isn't a system directory. If any of those fail, it aborts with exit code 3. This prevents a typo like `DIR1=C:\` from wiping the whole disk.

---

## 8. Step 5 — Run the Script as Administrator

### Open an elevated CMD

1. Click **Start**.
2. Type `cmd`.
3. **Right-click** "Command Prompt" → **Run as administrator**.
4. Click **Yes** on the UAC prompt.

The title bar should now say **Administrator: Command Prompt**.

### Execute the script

```cmd
cd C:\scripts
cleanup-mysql.bat
```

### What you should see

Execution takes roughly 15–30 seconds. Expected sequence:

```
============================================================
[<date> <time>] ===== Cleanup started =====
  Run by  : <YOUR_DOMAIN>\<YOUR_USERNAME>
  Host    : <YOUR_MACHINE>
  Service : MySQL80
============================================================
[<time>] Service is running. Requesting stop...
  still stopping... (5s elapsed)
[<time>] Service stopped.
[<time>] Cleaning C:\mysql-test-1 ...
[<time>] Cleaning C:\mysql-test-2 ...
[<time>] Starting service...
  still starting... (5s elapsed)
[<time>] Service is running.
[<date> <time>] ===== Completed by <DOMAIN>\<USER> =====

Log saved to: C:\scripts\logs\cleanup-<YYYY-MM-DD>.log
```

> 📷 **Screenshot placeholder**: full terminal output of a successful run.

---

## 9. Step 6 — Verify the Results

After the script finishes, run these three verification commands in the **same** CMD window:

```cmd
sc query MySQL80
dir C:\mysql-test-1
dir C:\mysql-test-2
type C:\scripts\logs\cleanup-*.log
```

### What to confirm

| Check | Expected result |
|-------|-----------------|
| `sc query MySQL80` | State is `4 RUNNING`. MySQL is back up. |
| `dir C:\mysql-test-1` | Folder exists but is empty (0 files). |
| `dir C:\mysql-test-2` | Folder exists but is empty (0 files). |
| Log file | Contains the same timestamped output you saw in the terminal. |

### Sanity check your databases (if you had any)

Because the script only touched `C:\mysql-test-1` and `C:\mysql-test-2`, your real MySQL databases under `C:\ProgramData\MySQL\...\Data` are untouched. To confirm:

```cmd
mysql -u root -p -e "SHOW DATABASES;"
```

All your existing schemas should still be listed.

> 📷 **Screenshot placeholder**: verification commands showing service RUNNING, folders empty, log present.

---

## 10. Step 7 — Schedule It (Optional)

There are **two ways** to schedule the script to run automatically every night at 10 PM: a GUI walkthrough using Task Scheduler, or a single command-line call using `schtasks`. Both create the same scheduled task — pick whichever you prefer.

### 10a. GUI method — Task Scheduler

1. **Start → Task Scheduler → Create Task** (not "Create Basic Task" — the basic version doesn't let you tick "highest privileges").
2. **General tab**:
   - Name: `MySQL Nightly Cleanup`
   - Select **Run whether user is logged on or not**.
   - Tick **Run with highest privileges** ✅.
3. **Triggers tab → New**:
   - Daily, start time `22:00:00`.
4. **Actions tab → New**:
   - Action: **Start a program**.
   - Program/script: `C:\scripts\cleanup-mysql.bat`.
5. **Settings tab**:
   - Tick **If the task fails, restart every 5 minutes** (up to 3 times).
   - Tick **Stop the task if it runs longer than 30 minutes**.
6. Click **OK**. Enter your Windows password when prompted.

> 📷 **Screenshot placeholder**: Task Scheduler with the task configured (General, Triggers, and Actions tabs).

### 10b. CLI method — `schtasks` one-liner

If you'd rather skip the clicks, open CMD **as Administrator** and run:

```cmd
schtasks /Create /TN "MySQL Nightly Cleanup" /TR "C:\scripts\cleanup-mysql.bat" /SC DAILY /ST 22:00 /RL HIGHEST /RU SYSTEM /F
```

This creates the exact same task in one shot.

#### What each flag means

| Flag | Meaning |
|------|---------|
| `/TN "MySQL Nightly Cleanup"` | Task name (shown in Task Scheduler). |
| `/TR "C:\scripts\cleanup-mysql.bat"` | The program to run. |
| `/SC DAILY` | Schedule: once per day. |
| `/ST 22:00` | Start time: 10:00 PM. |
| `/RL HIGHEST` | Run with highest privileges (required for `net stop`). |
| `/RU SYSTEM` | Run as the built-in `SYSTEM` account — no password needed, runs even when no user is logged in. |
| `/F` | Force overwrite if a task with this name already exists. |

### Verify the task is scheduled

Either method produces the same task. Confirm it's there:

```cmd
schtasks /Query /TN "MySQL Nightly Cleanup" /V /FO LIST
```

This shows the next run time, account it runs as, and current status.

### Test the schedule immediately

Don't wait until 10 PM — trigger the task manually to make sure the whole scheduled run works:

```cmd
schtasks /Run /TN "MySQL Nightly Cleanup"
```

Wait ~30 seconds, then check the log:

```cmd
type C:\scripts\logs\cleanup-*.log
```

The latest log entry should show the scheduled run, including the `Run by` line showing `NT AUTHORITY\SYSTEM` (if you used the CLI method with `/RU SYSTEM`) or your user account (if you used the GUI).

### Remove the schedule later

```cmd
schtasks /Delete /TN "MySQL Nightly Cleanup" /F
```

> 📷 **Screenshot placeholder**: terminal output of `schtasks /Query` showing the task, plus a log entry from a scheduler-triggered run.

---

## 10.5 Low-Downtime Variant — Rename-Then-Delete Pattern

The single-script approach in Sections 1–10 keeps the service down for the entire duration of the cleanup: stop → delete → start. On a large `work/` or `temp/` folder, the delete phase can take minutes, which means minutes of downtime.

The **rename-then-delete** pattern solves this by splitting the work across two scheduled tasks:

### The idea

| Time | Task | Action | Duration | Service |
|------|------|--------|----------|---------|
| 22:00 | `rename-and-restart.bat` | Stop → **rename** `work`/`temp` to `work_<timestamp>` / `temp_<timestamp>` → create empty ones → start | **~10–15s** | Briefly down, then up |
| 22:30 | `delete-old-renamed.bat` | Delete every `work_*` and `temp_*` folder under the parent | Can take minutes | **Up the whole time** |

### Why it works

- **Renaming is instant** regardless of folder size. The file system just updates an entry — no recursion, no deletion.
- **The service starts on empty folders**, so actual downtime = stop time + start time only. For a service that auto-recreates these folders (Tomcat), this works cleanly.
- **The slow recursive delete runs afterwards**, against the already-renamed folders. The service is running during this phase, so delete failures or slow disks don't cause any outage.

### Tradeoffs

| Concern | Impact |
|---------|--------|
| Disk usage doubles briefly | For ~30 minutes, both the fresh and the renamed folders exist. Fine unless disk is tight. |
| Two scripts, two scheduled tasks | More surface area to monitor. |
| Deletion failures accumulate silently | If `delete-old-renamed.bat` fails repeatedly, `work_*` folders pile up forever. Monitor `dir <parent>\work_* | find /c /v ""` > 7 as a simple alert. |
| Service must auto-recreate the folders on start | Tomcat ✅. MySQL's `Data/` folder ❌ (it needs system tables — don't use this pattern for database data folders). |

### When to use this pattern vs. the single script

| Use the single script when... | Use rename-then-delete when... |
|-------------------------------|-------------------------------|
| Folders are small (few MB) | Folders are large (GB or thousands of files) |
| 30s of downtime doesn't matter | Every second of downtime is visible to users/apps |
| Service doesn't auto-recreate the folder | Service auto-recreates the folder on startup |

### The two scripts

Both are provided alongside the single-script cleanup:

- **`scripts/rename-and-restart.bat`** — Phase 1, runs at 22:00.
- **`scripts/delete-old-renamed.bat`** — Phase 2, runs at 22:30.

Both use the same logging wrapper, admin check, and path-safety guard as the original single script.

### Scheduling both tasks

Run in an elevated CMD:

```cmd
schtasks /Create /TN "Service Rename Restart"   /TR "C:\scripts\rename-and-restart.bat" ^
    /SC DAILY /ST 22:00 /RL HIGHEST /RU SYSTEM /F

schtasks /Create /TN "Service Delete Old"       /TR "C:\scripts\delete-old-renamed.bat" ^
    /SC DAILY /ST 22:30 /RL HIGHEST /RU SYSTEM /F
```

Verify both are scheduled:

```cmd
schtasks /Query /FO TABLE | findstr /i "Service"
```

### Testing both scripts locally (with dummy folders)

```cmd
REM 1. Create dummy folders with junk
mkdir C:\mysql-test-1\sub
mkdir C:\mysql-test-2
echo hello > C:\mysql-test-1\a.txt
echo world > C:\mysql-test-2\b.txt

REM 2. Run phase 1
C:\scripts\rename-and-restart.bat

REM 3. Verify: C:\mysql-test-1 and C:\mysql-test-2 are fresh/empty,
REM    and C:\mysql-test-1_<stamp> / C:\mysql-test-2_<stamp> exist
dir C:\mysql-test-*

REM 4. Run phase 2 (simulating the 22:30 task)
C:\scripts\delete-old-renamed.bat

REM 5. Verify: the renamed folders are gone
dir C:\mysql-test-*
```

> 📷 **Screenshot placeholder**: output of `dir C:\mysql-test-*` after phase 1 (shows both fresh and renamed folders), and after phase 2 (only fresh folders remain).

---

## 11. Full Script

Save this as `C:\scripts\cleanup-mysql.bat`.

```bat
@echo off
setlocal EnableDelayedExpansion

REM ============================================================
REM  MySQL cleanup script
REM  1. Stops the MySQL80 service (waits up to STOP_TIMEOUT sec)
REM  2. Force-kills the process if it will not stop
REM  3. Recursively wipes two folders and recreates them
REM  4. Starts the service again (waits up to START_TIMEOUT sec)
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
set "SERVICE_NAME=MySQL80"
set "PROCESS_NAME=mysqld.exe"
set "DIR1=C:\mysql-test-1"
set "DIR2=C:\mysql-test-2"
set "STOP_TIMEOUT=60"
set "START_TIMEOUT=60"
REM ------------------------------------------------------------

echo ============================================================
echo [%date% %time%] ===== Cleanup started =====
echo   Run by  : %USERDOMAIN%\%USERNAME%
echo   Host    : %COMPUTERNAME%
echo   Script  : %~f0
echo   Service : %SERVICE_NAME%
echo   Process : %PROCESS_NAME%
echo   Folders : %DIR1%
echo             %DIR2%
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
timeout /t 3 /nobreak >nul

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

echo [%date% %time%] ===== Cleanup completed by %USERDOMAIN%\%USERNAME% =====
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
```

---

## 12. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `'cleanup-mysql.bat' is not recognized` | You're not in `C:\scripts\` or the file wasn't saved. | `dir C:\scripts\cleanup-mysql.bat` — if missing, re-save from Notepad. |
| `ERROR: This script must be run as Administrator.` | CMD wasn't opened with "Run as administrator". | Close CMD, right-click → Run as administrator, re-run. |
| `ERROR: Service "MySQL80" not found.` | MySQL service is named differently on your machine. | Run `sc query \| findstr /i mysql` — update `SERVICE_NAME=` to match the name shown. |
| Script says `Service did not stop within 60s` | MySQL is busy with a long-running query. | Either raise `STOP_TIMEOUT` or accept the force-kill. For production, increase to 300. |
| `ERROR: refusing to clean protected path` | You accidentally set `DIR1` or `DIR2` to a system folder. | Edit the script, use a test-only path like `C:\mysql-test-1`. |
| Service did not start back up | Something the script deleted was required by MySQL. | **Not the case with test folders.** If you ever swap `DIR1`/`DIR2` to real MySQL paths, stop — do not delete `Data\`. |
| Empty log file | `powershell` couldn't resolve the date. | Check PowerShell is on `PATH`: `where powershell`. |

---

## Change log

| Date | Author | Change |
|------|--------|--------|
| <fill in> | <your name> | Initial version. |
