
---
title: 'Your first workflow (and what you''ll see after)'
description: 'Section 4 of the GitHub Actions Handbook.'
sidebar:
  order: 4
---
Let's build the smallest workflow that works, so you have something real to look at.

### Step 1 — Create the file

In your repo, create `.github/workflows/hello.yml`:

```yaml
name: Hello World

on: [push]

jobs:
  greet:
    runs-on: ubuntu-latest
    steps:
      - name: Say hello
        run: echo "Hello, world!"
```

### What this file actually says

Read it left to right, top to bottom:

- `name: Hello World` — the friendly name you'll see in the Actions tab.
- `on: [push]` — the trigger. Every time *anyone* pushes a commit to *any* branch in this repo, this workflow fires. So pushing to `main`, pushing to a feature branch, or merging a PR (which results in a push to the target branch) all trigger it. We'll narrow this later — `on: { push: { branches: [main] } }` would only fire on `main`.
- `jobs:` — start of the jobs list. We have one job called `greet`.
- `runs-on: ubuntu-latest` — run this job on a fresh GitHub-hosted Ubuntu VM.
- `steps:` — the work this job does. One step here, named "Say hello", which runs a shell command.

That's the whole file. The shape never gets more complicated than that — only longer.

### Step 2 — Commit and push

```bash
git add .github/workflows/hello.yml
git commit -m "Add hello workflow"
git push
```

### Step 3 — Watch it run

Open your repository on GitHub, click the **Actions** tab, and you'll see your workflow running. Click into it and you can see the logs.

That's the full cycle. You just automated something. Useless, but still — the shape of this file is the shape of every workflow you'll ever write. Everything else is just more of the same.

### The Actions UI, in a quick tour

![The Actions UI, in a quick tour](/diagrams/ui-layout.png)

Before you write any more workflows, spend two minutes getting familiar with the Actions tab. You'll spend a lot of time here.

- **Left sidebar** lists your workflows — one entry per YAML file. Click one to filter runs.
- **Main pane** is the list of runs. Each row shows the event that triggered it, the branch, the commit, and the status (green check, red X, yellow dot).
- **Click a run** and you see the **job graph** — boxes connected by arrows, matching your `needs:` structure.
- **Click a job** and you see its steps with collapsible logs. Red = this step failed.
- **Top right** has the "Re-run all jobs" and "Re-run failed jobs" buttons. The second one is faster and keeps artifacts from the successful jobs.
- **Summary tab** shows high-level status, artifact download links, and billable minutes for this run.
- **Artifacts** sit at the bottom of the Summary tab and stick around for 90 days by default.

