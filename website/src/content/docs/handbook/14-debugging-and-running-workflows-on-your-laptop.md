---
title: 'Debugging, and running workflows on your laptop'
description: 'Section 14 of the GitHub Actions Handbook.'
sidebar:
  order: 14
---
Workflows will fail. Your first instinct might be panic — don't. The tooling for figuring out what went wrong is pretty good once you know where to look.

### Reading logs

The failure is almost always in the last ten lines of the failed step. Click into the run, click the failed job, expand the red step, scroll to the bottom. That's usually enough.

When it isn't: the search box (top right) searches every step's output in one go. And the gear icon offers **Download log archive**, which gives you a zip with one text file per step — sometimes easier to grep through locally.

### Re-running

Three buttons live at the top right of every run page:

- **Re-run all jobs** — full restart, new run ID.
- **Re-run failed jobs** — skips the green jobs, retries the red ones, keeps the successful jobs' artifacts. Usually what you want.
- **From the CLI** — `gh run rerun <run-id> --failed`.

### Turning on verbose logging

Two repo secrets unlock noisy-but-useful output:

| Secret | Effect |
|--------|--------|
| `ACTIONS_STEP_DEBUG=true` | Shows step-level setup, env resolution, expression evaluation. |
| `ACTIONS_RUNNER_DEBUG=true` | Shows runner-level network, disk, shell diagnostics. |

Add them at Settings → Secrets and variables → Actions. Turn them off when you're done — they make every run slower and the logs harder to read.

### The "what is even in my environment right now" step

Paste this whenever a workflow is being weird:

```yaml
- name: Dump context
  run: |
    echo "=== GITHUB ==="
    echo "ref:    $GITHUB_REF"
    echo "sha:    $GITHUB_SHA"
    echo "actor:  $GITHUB_ACTOR"
    echo "event:  $GITHUB_EVENT_NAME"
    echo "=== ENV ==="
    env | sort
```

Half the time, that alone points at the problem.

### SSH into the runner (the nuclear option)

When nothing else works, `tmate` pauses the job and gives you an SSH address into the live runner:

```yaml
- name: Open SSH on failure
  if: failure()
  uses: mxschmitt/action-tmate@v3
  timeout-minutes: 15
```

Use this only on private repos and private branches. Anyone with the SSH address can connect. The `timeout-minutes` is a guardrail against forgotten open sessions.

### Iterating without pushing — `act`

`act` runs your workflows locally in Docker, so you don't have to push a commit for every tiny change.

```bash
brew install act               # macOS (other installers on the repo)
act                             # runs workflows triggered by 'push'
act pull_request                # simulates a PR event
act -j test                     # runs only the job named 'test'
act -s GITHUB_TOKEN=...         # pass secrets
```

One warning: `act` approximates GitHub-hosted runners, but doesn't replicate them exactly. Caches and some pre-installed tools differ. Use it to catch YAML errors and basic logic — not as your final verification before production.

