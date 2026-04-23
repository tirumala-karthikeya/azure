# GitHub Actions — A Beginner's Guide

**Audience**: interns and first-time users of GitHub Actions.
**Goal**: by the end of this document, you will know how to **create**, **use**, and **automate** workflows.
**How to read this**: sections 1–3 build the vocabulary, sections 4–10 cover everyday features, sections 11–12 show real-world pipeline patterns, sections 13–16 are operational topics (reuse, debugging, security, cost), and section 17 is a reference list of every abbreviation used.

---

## Table of Contents

| # | Section | What it covers |
|---|---------|----------------|
| 1 | What is GitHub Actions? | The platform, why it matters, and how it works. |
| 2 | Core Concepts | The six words you must know. |
| 3 | YAML Basics | The syntax rules every workflow file follows. |
| 4 | Your First Workflow | A hello-world walkthrough and the Actions UI tour. |
| 5 | Anatomy of a Workflow File | Every key in a real workflow, explained. |
| 6 | Triggers | When workflows run. |
| 7 | Jobs and Steps | Parallel vs. sequential; sharing data. |
| 8 | Using Actions from the Marketplace | Reusable building blocks. |
| 9 | Secrets and Environment Variables | Safe handling of sensitive values. |
| 10 | Permissions, Contexts, and Built-in Variables | The survival kit for real workflows. |
| 11 | Automation Recipes | Eight ready-to-copy examples. |
| 12 | Use Case Scenarios | Real-world pipeline patterns. |
| 13 | Reusable Workflows and Composite Actions | DRY patterns for mature projects. |
| 14 | Debugging and Local Testing | How to fix what's broken, and iterate without pushing. |
| 15 | Security Scanning | CodeQL, Dependabot, dependency review, secret scanning. |
| 16 | Billing and Runner Costs | Free minutes, multipliers, and how to save money. |
| 17 | Abbreviations and Definitions | Reference glossary. |

---

## 1. What is GitHub Actions?

GitHub Actions is GitHub's built-in automation platform. It lets you run scripts automatically when something happens in your repository — for example, when someone pushes code, opens a pull request, or on a schedule (such as every night at midnight).

### Why use it?

- **CI/CD**: Automatically test and deploy your code.
- **Automation**: Label issues, close stale PRs, post comments.
- **Scheduled tasks**: Run cleanup jobs, send reports.
- **Any script**: If it runs on Linux, Mac, or Windows, it can run on GitHub Actions.

### How it works (the 10-second version)

1. You write a YAML file describing what should happen.
2. You commit it to `.github/workflows/` in your repository.
3. GitHub watches for triggers (for example, a push).
4. When triggered, GitHub spins up a fresh virtual machine (called a **runner**) and executes your steps.

---

## 2. Core Concepts

Learn these six words and you will understand most of any workflow file.

| Term | Meaning |
|------|---------|
| **Workflow** | A YAML file in `.github/workflows/` that defines the automation. |
| **Event** | Something that triggers a workflow (push, pull request, schedule, and so on). |
| **Job** | A group of steps that run on the same runner. |
| **Step** | A single task — either a shell command or an action. |
| **Action** | A reusable, pre-packaged unit of code (like a function) that a step can call. |
| **Runner** | The virtual machine that executes your jobs (Ubuntu, macOS, or Windows). |

**Mental model**: a workflow contains jobs, jobs contain steps, and steps run commands or call actions.

---

## 3. YAML Basics

Every workflow file is YAML. Learn the five rules below and the rest of this document will read cleanly.

### Rule 1 — Indentation defines structure

Use **spaces, never tabs**. Pick a width (2 spaces is standard) and stay consistent.

```yaml
jobs:
  build:           # 2 spaces in
    runs-on: ubuntu-latest   # 4 spaces in
    steps:
      - run: echo hi         # 6 spaces in
```

### Rule 2 — Key-value pairs use a colon and a space

```yaml
name: CI
runs-on: ubuntu-latest
```

The space after the colon is required.

### Rule 3 — Lists use a leading dash

```yaml
branches:
  - main
  - develop
```

A list of maps (like workflow steps) uses `-` on each item:

```yaml
steps:
  - name: Checkout
    uses: actions/checkout@v4
  - name: Test
    run: npm test
```

### Rule 4 — Strings: quote when in doubt

Plain strings usually work:

```yaml
name: My Workflow
```

Quote when the value contains special characters (`:`, `#`, `{`, `}`, `*`) or when you want to be explicit:

```yaml
cron: '0 3 * * *'
version: '3.10'          # without quotes, YAML reads this as the number 3.1
```

### Rule 5 — Multiline strings: `|` keeps newlines, `>` folds them

```yaml
steps:
  - name: Literal block (newlines preserved)
    run: |
      echo "line one"
      echo "line two"

  - name: Folded block (newlines become spaces)
    run: >
      this becomes
      one single line
```

For shell scripts, **always use `|`** so each command runs on its own line.

### Comments

Anything after `#` on a line is a comment:

```yaml
runs-on: ubuntu-latest   # GitHub-hosted Ubuntu runner
```

### Common YAML pitfalls

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Mixing tabs and spaces | "mapping values are not allowed here" | Use spaces only. |
| Forgetting the space after `:` | Parse error | `key: value`, not `key:value`. |
| Inconsistent indentation | Keys go missing silently | Pick 2 spaces and stick to it. |
| Unquoted version numbers | `3.10` becomes `3.1` | Quote: `'3.10'`. |
| Missing `-` on list items | Only the last item is kept | Each item needs its own `-`. |

---

## 4. Your First Workflow

The simplest possible workflow.

### Step 1 — Create the file

In your repository, create a file at `.github/workflows/hello.yml`.

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

### Step 2 — Commit and push

```bash
git add .github/workflows/hello.yml
git commit -m "Add hello workflow"
git push
```

### Step 3 — Watch it run

Go to your repository on GitHub, click the **Actions** tab, and you will see the workflow running. Click into it to view logs.

That is the full cycle. You have just automated a task.

### The Actions UI at a glance

Before writing more workflows, get comfortable with the screen you'll spend the most time on.

- **Left sidebar** — one entry per workflow file. Clicking a workflow filters runs to that workflow only.
- **Main pane** — the list of runs. Each row shows the triggering event (push, PR), the branch or tag, the commit message, and the status (green check, red X, yellow dot for in-progress).
- **Click a run** — you see the **job graph**: boxes connected by arrows, mirroring the `needs:` structure.
- **Click a job** — you see its steps with collapsible logs. Red steps are the failed ones.
- **Re-run button** (top right) — two options: "Re-run all jobs" or "Re-run failed jobs" (faster, keeps artifacts from successful jobs).
- **Summary tab** — high-level status, artifact download links, and the billable time for this run.
- **Artifacts** — files saved by `upload-artifact` appear at the bottom of the Summary tab. They stay available for 90 days by default.

---

## 5. Anatomy of a Workflow File

A more realistic example, broken down line by line.

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: '20'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test
```

### Key elements

- **`name`** — display name shown in the Actions tab. Optional but recommended.
- **`on`** — the trigger. Here the workflow runs on pushes and pull requests to `main`.
- **`env`** — variables available to all jobs. You can also set them per-job or per-step.
- **`jobs`** — the list of jobs. Each key (like `test`) is a job ID.
- **`runs-on`** — which runner OS to use. Common values: `ubuntu-latest`, `macos-latest`, `windows-latest`.
- **`uses`** — calls a pre-built action. For example, `actions/checkout@v4` clones your repository.
- **`with`** — arguments passed to the action.
- **`run`** — executes a shell command directly.

---

## 6. Triggers

The `on:` key controls when a workflow fires. Below are the most useful triggers.

### Push and pull request

```yaml
on:
  push:
    branches: [main, develop]
    paths: ['src/**']
  pull_request:
    branches: [main]
```

### Schedule (cron)

```yaml
on:
  schedule:
    - cron: '0 0 * * *'
```

Cron format: `minute hour day-of-month month day-of-week`. Use [crontab.guru](https://crontab.guru) to build expressions.

### Manual trigger

```yaml
on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Where to deploy'
        required: true
        default: 'staging'
        type: choice
        options: [staging, production]
```

Reference the input as `${{ inputs.environment }}`.

### Other useful triggers

- `issues` — fires when an issue is opened, edited, or closed.
- `issue_comment` — fires when someone comments on an issue or PR.
- `release` — fires when a release is published.
- `workflow_call` — makes the workflow reusable from other workflows.

---

## 7. Jobs and Steps

### Jobs run in parallel by default

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm run lint

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test
```

`lint` and `test` run simultaneously on separate runners, giving faster feedback.

### Sequential jobs

Use `needs:` to run jobs in order.

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo "building"

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - run: echo "deploying"
```

### Share data between steps (outputs)

```yaml
steps:
  - name: Generate version
    id: version
    run: echo "tag=v1.2.3" >> $GITHUB_OUTPUT

  - name: Use version
    run: echo "Tag is ${{ steps.version.outputs.tag }}"
```

### Share data between jobs (artifacts)

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo "result" > output.txt
      - uses: actions/upload-artifact@v4
        with:
          name: my-output
          path: output.txt

  use-it:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: my-output
      - run: cat output.txt
```

---

## 8. Using Actions from the Marketplace

Actions are reusable building blocks. Browse them at [github.com/marketplace](https://github.com/marketplace?type=actions).

### How to call an action

```yaml
- uses: owner/repo@version
  with:
    input-name: value
```

### Must-know actions

| Action | Purpose |
|--------|---------|
| `actions/checkout@v4` | Clones your repository into the runner. Almost every workflow needs this. |
| `actions/setup-node@v4` | Installs Node.js. |
| `actions/setup-python@v5` | Installs Python. |
| `actions/setup-java@v4` | Installs Java. |
| `actions/cache@v4` | Caches dependencies between runs for speed. |
| `actions/upload-artifact@v4` | Saves files from a run. |
| `actions/download-artifact@v4` | Downloads saved files. |

### Pinning versions

- `@v4` — latest v4.x (recommended for most cases).
- `@v4.1.2` — exact version (most stable).
- `@<commit-sha>` — pinned to a specific commit (most secure; recommended for third-party actions).
- `@main` — bleeding edge (avoid in production).

---

## 9. Secrets and Environment Variables

Never commit passwords, API keys, or tokens to your repository. Use secrets instead.

### Adding a secret

Repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.

### Using a secret

```yaml
steps:
  - name: Deploy
    env:
      API_KEY: ${{ secrets.API_KEY }}
    run: ./deploy.sh
```

### Built-in secrets

`secrets.GITHUB_TOKEN` is auto-generated for every run and scoped to the repository. Use it to interact with the GitHub API without creating a personal token.

### Environment variables

Three scopes:

```yaml
env:
  APP_ENV: production

jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      REGION: us-east-1
    steps:
      - name: Deploy
        env:
          DRY_RUN: 'false'
        run: ./deploy.sh
```

### Setting env vars dynamically

```yaml
- run: echo "BUILD_ID=$(date +%s)" >> $GITHUB_ENV
- run: echo "Build ID is $BUILD_ID"
```

---

## 10. Permissions, Contexts, and Built-in Variables

This section is the survival kit. Most "it worked in the tutorial but fails in my repo" problems trace back to one of these three topics.

### 10.1 The `permissions:` model

Every workflow run gets an automatic token called `GITHUB_TOKEN`, exposed as `secrets.GITHUB_TOKEN`. Since 2023, new repositories ship with **read-only defaults** for this token. If your workflow tries to comment on a PR, label an issue, or push a tag, it will fail with:

```
Error: Resource not accessible by integration
```

The fix is to explicitly request the permissions you need.

**Set at the workflow level** (applies to all jobs):

```yaml
permissions:
  contents: read
  issues: write
  pull-requests: write
```

**Or set per-job** (more secure — least privilege):

```yaml
jobs:
  label:
    runs-on: ubuntu-latest
    permissions:
      issues: write
    steps:
      - run: echo "label the issue"
```

**Common scopes**:

| Scope | When you need it |
|-------|------------------|
| `contents: write` | Pushing commits, creating tags or releases. |
| `issues: write` | Creating, commenting on, or labeling issues. |
| `pull-requests: write` | Commenting on or updating PRs. |
| `packages: write` | Publishing to GitHub Packages / GHCR. |
| `actions: write` | Triggering other workflows, cancelling runs. |
| `id-token: write` | OIDC auth to cloud providers (AWS, Azure, GCP). |

Use `permissions: {}` to explicitly grant nothing (maximum lockdown).

---

### 10.2 Contexts and the `${{ ... }}` expression syntax

Anywhere you see `${{ something }}`, that's an expression — evaluated when the workflow runs. Expressions read from **contexts**, which are pre-populated objects of runtime data.

**The contexts you'll actually use**:

| Context | Holds | Example |
|---------|-------|---------|
| `github` | Info about the event, repo, actor, SHA, ref. | `${{ github.actor }}` |
| `env` | Environment variables set in the workflow. | `${{ env.NODE_VERSION }}` |
| `secrets` | Secrets from repo/org settings. | `${{ secrets.API_KEY }}` |
| `vars` | Non-secret configuration variables. | `${{ vars.DEPLOY_REGION }}` |
| `steps` | Outputs from prior steps in the same job. | `${{ steps.build.outputs.tag }}` |
| `jobs` | Outputs from prior jobs (used in `needs:` chains). | `${{ needs.build.outputs.version }}` |
| `runner` | The runner's OS, architecture, and temp dirs. | `${{ runner.os }}` |
| `inputs` | Inputs from `workflow_dispatch` or `workflow_call`. | `${{ inputs.environment }}` |

**Using an expression in `if:`** (conditional execution):

```yaml
steps:
  - name: Deploy only from main
    if: github.ref == 'refs/heads/main'
    run: ./deploy.sh

  - name: Run on failure
    if: failure()
    run: echo "something went wrong"

  - name: Skip for dependabot PRs
    if: github.actor != 'dependabot[bot]'
    run: npm test
```

Useful status functions: `success()`, `failure()`, `cancelled()`, `always()`.

---

### 10.3 Built-in environment variables

Every step automatically has these variables available — no setup required. Use them in shell commands via `$VAR` (Linux/Mac) or `$env:VAR` (Windows PowerShell).

| Variable | What it contains | Typical use |
|----------|------------------|-------------|
| `GITHUB_SHA` | The commit SHA that triggered the run. | Tagging Docker images. |
| `GITHUB_REF` | The full ref (e.g. `refs/heads/main`, `refs/tags/v1.0`). | Conditional logic. |
| `GITHUB_REF_NAME` | Short ref name (e.g. `main`, `v1.0`). | Human-readable tagging. |
| `GITHUB_ACTOR` | The username that triggered the workflow. | Audit logs, gated actions. |
| `GITHUB_REPOSITORY` | `owner/repo`. | API calls, clone URLs. |
| `GITHUB_WORKSPACE` | Absolute path to the checked-out repo. | Building paths in scripts. |
| `GITHUB_RUN_ID` | Unique ID of this run. | Linking back to logs from external systems. |
| `GITHUB_EVENT_NAME` | The triggering event (`push`, `pull_request`, etc.). | Branching workflow logic. |
| `RUNNER_OS` | `Linux`, `macOS`, or `Windows`. | OS-specific script paths. |
| `RUNNER_ARCH` | `X64`, `ARM64`, etc. | Downloading the right binary. |
| `RUNNER_TEMP` | Path to a scratch directory, cleaned after the job. | Temp files. |

**Example putting it together**:

```yaml
- name: Build and tag image
  run: |
    docker build -t myapp:$GITHUB_SHA .
    docker tag myapp:$GITHUB_SHA myapp:$GITHUB_REF_NAME
    echo "Built by $GITHUB_ACTOR on $RUNNER_OS"
```

---

## 11. Automation Recipes

### Recipe 1 — Run tests on every PR

```yaml
name: Tests

on:
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm test
```

### Recipe 2 — Deploy to production on tag push

```yaml
name: Deploy

on:
  push:
    tags: ['v*']

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - name: Deploy
        env:
          DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}
        run: ./deploy.sh
```

### Recipe 3 — Nightly cleanup job

```yaml
name: Nightly Cleanup

on:
  schedule:
    - cron: '0 3 * * *'
  workflow_dispatch:

jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - run: ./scripts/cleanup.sh
```

### Recipe 4 — Auto-label new issues

```yaml
name: Label Issues

on:
  issues:
    types: [opened]

jobs:
  label:
    runs-on: ubuntu-latest
    permissions:
      issues: write
    steps:
      - uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.addLabels({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              labels: ['needs-triage']
            })
```

### Recipe 5 — Build across multiple OS and versions (matrix)

```yaml
jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
      - run: npm test
```

This runs nine jobs (three operating systems × three Node versions) in parallel.

### Recipe 6 — Build and push a Docker image to GitHub Container Registry

```yaml
name: Build and Push Image

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: |
            ghcr.io/${{ github.repository }}:latest
            ghcr.io/${{ github.repository }}:${{ github.sha }}
```

The built-in `GITHUB_TOKEN` authenticates to GHCR — no personal token needed.

### Recipe 7 — Cache dependencies for faster builds

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Restore npm cache
        uses: actions/cache@v4
        with:
          path: ~/.npm
          key: ${{ runner.os }}-npm-${{ hashFiles('**/package-lock.json') }}
          restore-keys: |
            ${{ runner.os }}-npm-

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm ci
      - run: npm test
```

The `key` changes only when `package-lock.json` changes, so unchanged dependencies come straight from cache. Typical 5–10× speedup.

### Recipe 8 — Notify Slack on workflow failure

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy
        run: ./deploy.sh

      - name: Notify Slack on failure
        if: failure()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": ":x: Deploy failed on ${{ github.ref_name }} by ${{ github.actor }}\n<${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}|View run>"
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
          SLACK_WEBHOOK_TYPE: INCOMING_WEBHOOK
```

`if: failure()` makes the step run only when an earlier step in the job failed.

---

## 12. Use Case Scenarios

The goal of this section is to move beyond syntax and look at real-world pipeline patterns. Each scenario describes a problem, the trigger, the YAML concept, and how it behaves.

### Scenario 1 — Release Tag Deployment

**Goal**: deploy when a release tag is created.

**Example commands**:

```bash
git tag v1.0.0
git push origin v1.0.0
```

**Workflow trigger**:

```yaml
on:
  push:
    tags:
      - 'v*'
```

**How it works**: pushing `v1.0.0` triggers the workflow. This pattern is mostly used for production deployments — a clean, controlled release method that does not fire on every commit.

---

### Scenario 2 — Sequential Execution (one after another)

**Goal**: Task B should run only after Task A completes.

**Example flow**: `Build → Test → Deploy`

**YAML concept**:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest

  test:
    needs: build
    runs-on: ubuntu-latest

  deploy:
    needs: test
    runs-on: ubuntu-latest
```

**Behavior**: strict-order pipeline. Each stage waits for the previous stage to succeed.

---

### Scenario 3 — Parallel Execution

**Goal**: multiple jobs run at the same time.

**Example**: backend tests, frontend tests, and API tests should all run simultaneously.

**YAML concept**:

```yaml
jobs:
  backend-test:
    runs-on: ubuntu-latest

  frontend-test:
    runs-on: ubuntu-latest

  api-test:
    runs-on: ubuntu-latest
```

**Behavior**: all three jobs run in parallel because none of them declare `needs:`. This is the default behavior.

---

### Scenario 4 — Mixed (Sequential + Parallel)

**Goal**: some stages in series, some in parallel — a common real-world shape.

**Example flow**:

1. Build
2. Deploy three services in parallel
3. Final validation

**YAML concept**:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest

  service-a:
    needs: build
    runs-on: ubuntu-latest

  service-b:
    needs: build
    runs-on: ubuntu-latest

  service-c:
    needs: build
    runs-on: ubuntu-latest

  final-check:
    needs: [service-a, service-b, service-c]
    runs-on: ubuntu-latest
```

**Visual flow**:

```
            → service-a →
build →     → service-b →     → final-check
            → service-c →
```

The `final-check` job waits on all three service jobs by listing them in `needs:` as an array.

---

### Scenario 5 — Microservices Deployment (real-world)

**Question**: should microservices deploy one by one, or in parallel?

**Answer**: it depends on dependencies.

**Case A — Independent services**

```
service-a
service-b
service-c
```

If the services do not depend on each other, deploy them in parallel. This is faster.

**Case B — Dependent services**

```
service-b depends on service-a
```

Flow: `service-a → service-b`. Sequential deployment is required.

**Key insight**: microservice deployment is rarely a single straight line. Forcing every service into a sequential chain is slow and unnecessary when there is no real dependency between them.

**Best practice**:

- Independent services → parallel.
- Dependent services → sequential.

---

### Scenario 6 — Series Deployment (staged rollout, for example 5.1 → 5.2 → 5.3)

**Goal**: roll out versions in a controlled sequence.

This pattern is a version rollout or staged deployment — also known as canary-style release.

**Example**:

```
deploy v5.1 → check
deploy v5.2 → check
deploy v5.3
```

Each stage verifies health before the next one begins. Use this when blast radius matters — for example, when rolling out to production tenants one group at a time.

---

### Scenario 7 — Environment-Based Deployment with Approval Gates

**Goal**: promote a single build through `dev → staging → production`, with a human approval before production.

**The idea**: GitHub has a feature called **Environments** (Settings → Environments). Each environment can require reviewers before any job targeting it runs. You reference the environment with `environment:` on a job.

**YAML concept**:

```yaml
on:
  push:
    branches: [main]

jobs:
  deploy-dev:
    runs-on: ubuntu-latest
    environment: dev
    steps:
      - run: ./deploy.sh dev

  deploy-staging:
    needs: deploy-dev
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - run: ./deploy.sh staging

  deploy-prod:
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment: production        # Configured with required reviewers
    steps:
      - run: ./deploy.sh production
```

**How it works**: `deploy-dev` and `deploy-staging` run automatically. `deploy-prod` pauses and waits for a human to click "Approve" in the Actions UI. Environments can also hold environment-scoped secrets (different API keys per stage).

---

### Scenario 8 — Monorepo / Path-Filtered Builds

**Goal**: in a repository holding multiple projects, run only the workflows affected by the change.

**The problem**: without filters, changing a README triggers the full backend test suite. Wasteful.

**YAML concept**:

```yaml
on:
  push:
    paths:
      - 'backend/**'
      - '.github/workflows/backend.yml'
  pull_request:
    paths:
      - 'backend/**'
```

**How it works**: the workflow runs only when files under `backend/` (or the workflow file itself) change. Pair one such workflow per project (`backend.yml`, `frontend.yml`, `docs.yml`) and each one stays independent.

For finer control across jobs inside one workflow, use `dorny/paths-filter@v3`:

```yaml
jobs:
  changes:
    runs-on: ubuntu-latest
    outputs:
      backend: ${{ steps.filter.outputs.backend }}
      frontend: ${{ steps.filter.outputs.frontend }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            backend: 'backend/**'
            frontend: 'frontend/**'

  backend-test:
    needs: changes
    if: needs.changes.outputs.backend == 'true'
    runs-on: ubuntu-latest
    steps: [...]
```

---

### Scenario 9 — Concurrency Control (prevent overlapping runs)

**Goal**: make sure only one deploy runs at a time, and cancel any older in-progress deploy when a newer one starts.

**The problem**: two deploys for the same branch racing each other is a common cause of broken environments. Also wastes runner minutes.

**YAML concept**:

```yaml
concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - run: ./deploy.sh
```

**How it works**: all runs that compute the same `group` string queue in the same lane. `cancel-in-progress: true` kills the older run as soon as a newer one starts. For production pipelines where cancelling mid-deploy is dangerous, set it to `false` — newer runs will wait instead.

---

### Scenario 10 — Fork PR Security (`pull_request` vs `pull_request_target`)

**Goal**: understand why secrets are empty when a contributor opens a PR from their fork, and how to handle it safely.

**The rule**: on `pull_request` events from forks, GitHub intentionally strips access to secrets and gives the `GITHUB_TOKEN` read-only scope. This prevents a malicious PR from running `cat .env > public-leak.txt` using *your* credentials.

**Two events, two behaviors**:

| Event | Runs on | Has secrets? | Checks out |
|-------|---------|--------------|------------|
| `pull_request` | Forked PR code | ❌ No (for external forks) | The PR branch |
| `pull_request_target` | Base branch code | ✅ Yes | The base branch by default |

**Safe pattern**: use `pull_request` for tests (no secrets needed) and **never** check out PR code inside a `pull_request_target` workflow that has secrets. If you must (for coverage comments, preview deploys), check out the PR code in a separate job that has no secrets.

```yaml
on:
  pull_request:                # Safe: runs on fork code without secrets
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test
```

---

### Scenario 11 — Auto-Rollback on Health Check Failure

**Goal**: deploy, verify health, and automatically roll back if the new version is unhealthy.

**YAML concept**:

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Capture current version
        id: prev
        run: echo "sha=$(cat current-version.txt)" >> $GITHUB_OUTPUT

      - name: Deploy new version
        run: ./deploy.sh ${{ github.sha }}

      - name: Health check
        id: health
        run: ./scripts/health-check.sh
        continue-on-error: true

      - name: Roll back if unhealthy
        if: steps.health.outcome == 'failure'
        run: ./deploy.sh ${{ steps.prev.outputs.sha }}

      - name: Fail the workflow if rolled back
        if: steps.health.outcome == 'failure'
        run: exit 1
```

**How it works**: `continue-on-error: true` lets the health check "fail softly" so the next step can react. Using `steps.health.outcome` (not `status`) lets the rollback step see that the check failed.

---

### Scenario 12 — Workflow Chaining with `workflow_run`

**Goal**: have one workflow start automatically when another completes — useful for decoupling CI (tests) from CD (deploy).

**Workflow A (`ci.yml`)** — runs on every push:

```yaml
name: CI
on:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test
```

**Workflow B (`deploy.yml`)** — runs only after CI succeeds:

```yaml
name: Deploy
on:
  workflow_run:
    workflows: [CI]
    types: [completed]
    branches: [main]

jobs:
  deploy:
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-latest
    steps:
      - run: ./deploy.sh
```

**How it works**: Workflow B listens for CI finishing and only deploys on success. Keeps test logic and deploy logic in separate files — easier to read and safer to change.

---

### Real-world combined pipeline

A realistic production pipeline tends to look like this:

```
Trigger:
  - PR  → CI
  - Tag → Production CD

Pipeline:
  Build
     ↓
  Parallel Tests
     ↓
  Parallel Microservices Deploy
     ↓
  Final Health Check
```

### Simple rule book

- PR → CI.
- Tag → Release / CD.
- `needs:` → sequential.
- No `needs:` → parallel.
- Microservices → mostly parallel, unless there is a real dependency.

### Practical advice

To internalize these patterns, build four or five use-case scenarios manually. For each scenario, define:

- the trigger,
- the jobs,
- the dependencies.

Treat it as lab practice. The goal is to think in terms of **use cases and dependencies**, not just YAML syntax.

> **Final takeaway**: CI/CD design is not about workflows — it is about use cases and dependencies.

---

## 13. Reusable Workflows and Composite Actions

When the same steps appear in multiple workflows, it is time to extract them. GitHub Actions offers two units of reuse — each solves a different problem.

### 13.1 Reusable workflows (reuse whole jobs)

One workflow file calls another. The callee lives in `.github/workflows/` and declares `workflow_call:` as its trigger.

**Callee** — `.github/workflows/reusable-test.yml`:

```yaml
on:
  workflow_call:
    inputs:
      node-version:
        required: true
        type: string
    secrets:
      NPM_TOKEN:
        required: false

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ inputs.node-version }}
      - run: npm ci
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      - run: npm test
```

**Caller** — any other workflow:

```yaml
jobs:
  unit:
    uses: ./.github/workflows/reusable-test.yml
    with:
      node-version: '20'
    secrets:
      NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Reusable workflows are right when the unit of reuse is a **whole job** — for example, a test job that several teams share.

### 13.2 Composite actions (reuse a few setup steps)

A composite action bundles multiple steps into a single reusable step. Lives at `.github/actions/<name>/action.yml`.

**`.github/actions/setup-node-cached/action.yml`**:

```yaml
name: 'Setup Node with cache'
description: 'Checkout, install Node with npm cache, and run npm ci'
inputs:
  node-version:
    required: true
    default: '20'
runs:
  using: 'composite'
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: ${{ inputs.node-version }}
        cache: 'npm'
    - run: npm ci
      shell: bash
```

**Usage from any workflow**:

```yaml
steps:
  - uses: ./.github/actions/setup-node-cached
    with:
      node-version: '20'
```

Composite actions are right when the unit of reuse is a **cluster of steps** — for example, "checkout + setup + install" that appears at the top of every job.

### Choosing between them

| You want to reuse | Use |
|-------------------|-----|
| A whole job (or several jobs) | Reusable workflow |
| A setup pattern of 2–5 steps | Composite action |
| Something across multiple repos | Publish as a standalone repo action |
| Logic that triggers its own runner | Reusable workflow (it owns `runs-on`) |

---

## 14. Debugging and Local Testing

Workflows will fail. This section is about how to investigate quickly and how to iterate without a "push, wait two minutes, fix a typo" loop.

### 14.1 Reading logs effectively

- Click into a failed run → click the failed job → expand the red step. The error is usually in the last 20 lines of output.
- Use the search box in the top right to find a keyword across every step.
- For the full log archive: click the gear icon on the run page → **Download log archive**. You'll get a zip with one text file per step.

### 14.2 Re-running failed jobs

Three options live at the top right of every run page:

- **Re-run all jobs** — full restart, new run ID.
- **Re-run failed jobs** — skips the green jobs, retries only the red ones, and keeps artifacts from successful jobs. Much faster.
- **Re-run from the CLI**: `gh run rerun <run-id> --failed`.

### 14.3 Enable debug logging

Two repository secrets unlock verbose output:

| Secret | Effect |
|--------|--------|
| `ACTIONS_STEP_DEBUG=true` | Shows step-level setup, env resolution, and expression evaluation. |
| `ACTIONS_RUNNER_DEBUG=true` | Shows runner-level diagnostics (network, disk, shell spawning). |

Add them at **Settings → Secrets and variables → Actions**. Remove them when you are done — debug logs are noisy and slower.

### 14.4 Print the context when you're lost

Paste this step when a workflow behaves mysteriously:

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

### 14.5 SSH into the runner for hard bugs

`tmate` pauses the job and gives you an SSH address to the live runner.

```yaml
- name: Open SSH session on failure
  if: failure()
  uses: mxschmitt/action-tmate@v3
  timeout-minutes: 15
```

**Use only on private repos and private branches** — anyone with the address can connect. The `timeout-minutes` keeps the session from running forever.

### 14.6 Testing workflows locally with `act`

`act` runs your workflows on your laptop inside Docker, so you can iterate without committing.

```bash
brew install act          # macOS (or see the repo for other installers)
act                        # runs workflows triggered by 'push'
act pull_request           # simulates a PR event
act -j test                # runs only the job named 'test'
act -s GITHUB_TOKEN=...    # pass secrets
```

**Caveats**: `act` approximates but does not perfectly replicate GitHub-hosted runners. GitHub-specific caches and some pre-installed tools will differ. Use `act` to catch YAML errors and logic bugs, not as final verification before production.

---

## 15. Security Scanning

GitHub provides several built-in security features. Most are configured through settings or short workflow files — you don't need to write scanners from scratch.

### 15.1 CodeQL — static analysis

Finds common vulnerabilities (SQL injection, XSS, path traversal) by analyzing your source.

Easiest setup: **Security tab → Code scanning → Set up → Default**. Or add the workflow manually:

```yaml
name: CodeQL

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 0 * * 1'

jobs:
  analyze:
    runs-on: ubuntu-latest
    permissions:
      security-events: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with:
          languages: javascript, python
      - uses: github/codeql-action/analyze@v3
```

Findings appear under the **Security** tab.

### 15.2 Dependabot — dependency updates

Monitors your dependency files and opens PRs that bump versions with known CVEs fixed.

Turn it on at **Settings → Code security → Dependabot alerts / security updates**. Fine-tune via `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
```

### 15.3 Dependency review — block risky PRs

Fails a PR that introduces a dependency with a high-severity CVE.

```yaml
name: Dependency Review

on: [pull_request]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/dependency-review-action@v4
        with:
          fail-on-severity: high
```

### 15.4 Secret scanning

Built-in — no workflow needed. GitHub scans every push for known-format secrets (AWS keys, Stripe tokens, GCP service accounts, etc.) and alerts the repo owner. Turn on **push protection** at **Settings → Code security** to reject the push itself before the secret lands in history.

---

## 16. Billing and Runner Costs

GitHub Actions is free for public repos. For private repos, minutes are metered — and it's easy to burn through them without noticing.

### Free tier

| Plan | Free minutes per month | Free storage |
|------|------------------------|--------------|
| Free | 2,000 | 500 MB |
| Pro / Team | 3,000 | 1 GB |
| Enterprise | 50,000 | 50 GB |

Public repositories get **unlimited** minutes. The numbers above apply only to private repos.

### Cost multipliers

Each runner OS bills at a different rate. The multiplier applies to your minute quota:

| Runner | Multiplier |
|--------|------------|
| `ubuntu-latest` | 1× |
| `windows-latest` | 2× |
| `macos-latest` (ARM64 or Intel) | 10× |
| Larger GitHub-hosted runners | 2–16× (tier-dependent) |

A 10-minute macOS job consumes **100 minutes** from your quota. Ubuntu is the default for a reason — use macOS only when you must (iOS builds, Mac-specific testing).

### Monitoring usage

Go to **Settings → Billing and plans → Usage this month**. You will see a breakdown by repository and workflow. Review it monthly, especially after adding a scheduled workflow.

### How to reduce cost

1. **Cancel redundant runs** — `concurrency: { cancel-in-progress: true }` (Scenario 9). Stops older runs of the same branch when a new push lands.
2. **Cache dependencies** — saves 1–3 minutes per job (Recipe 7).
3. **Path filters** — skip workflows when only unrelated files change (Scenario 8).
4. **Matrix `include` / `exclude`** — test only the combinations you actually care about.
5. **Prefer Ubuntu** — 10× cheaper than macOS, 2× cheaper than Windows.
6. **Set `timeout-minutes`** on jobs — stops runaway loops from eating hours:

   ```yaml
   jobs:
     build:
       runs-on: ubuntu-latest
       timeout-minutes: 15
   ```

7. **Self-hosted runners** (advanced) — zero billed minutes, but you own the OS, patches, and capacity.

---

## 17. Abbreviations and Definitions

This section lists every acronym and short form used in the document. Each entry includes the full form and a short definition so that a new reader has full context.

### Core CI/CD terms

**CI — Continuous Integration**
A development practice where code changes are merged into a shared branch frequently, and each merge is automatically verified by builds and tests. The goal is to catch integration problems early, not after weeks of divergence.

**CD — Continuous Delivery / Continuous Deployment**
Two related ideas that share the same abbreviation:
- *Continuous Delivery*: every change that passes CI is automatically packaged and kept ready to deploy. The actual release is a manual, one-click step.
- *Continuous Deployment*: every change that passes CI is automatically deployed to production with no manual gate.

**CI/CD — Continuous Integration and Continuous Delivery/Deployment**
The combined pipeline that takes a code change from commit all the way to a running environment.

**PR — Pull Request**
A request on GitHub to merge changes from one branch into another. Reviewers can comment, approve, or request changes. Most automation in GitHub Actions is triggered by PR events.

---

### File formats and data

**YAML — YAML Ain't Markup Language**
A human-readable data-serialization format used for configuration files. Indentation (spaces, not tabs) defines structure. All GitHub Actions workflow files are YAML.

**JSON — JavaScript Object Notation**
A lightweight data-exchange format. Most GitHub API responses come back as JSON.

**URL — Uniform Resource Locator**
The address of a resource on the web — for example, `https://github.com/owner/repo`.

---

### Infrastructure and runtime

**VM — Virtual Machine**
A software-emulated computer that runs on shared physical hardware. GitHub Actions runners are VMs that spin up fresh for each job and are destroyed when the job ends.

**OS — Operating System**
The software layer that manages hardware and runs applications. GitHub-hosted runners support three OS families: Ubuntu, macOS, and Windows.

**UTC — Coordinated Universal Time**
The global time standard (the successor to GMT). Cron schedules in GitHub Actions are always evaluated in UTC, not your local timezone.

---

### Interfaces and tools

**API — Application Programming Interface**
A set of rules and endpoints that lets software talk to other software. The GitHub REST and GraphQL APIs let your workflow read issues, create releases, comment on PRs, and so on.

**UI — User Interface**
The visual part of an application that humans interact with. The **Actions** tab on GitHub is the UI for workflow runs.

**CLI — Command Line Interface**
A text-based interface where users type commands. `git`, `gh`, `npm`, and `docker` are all CLIs commonly invoked from workflow steps.

---

### Security and identity

**SHA — Secure Hash Algorithm**
A family of cryptographic hash functions. Git uses SHA-1 (and increasingly SHA-256) to generate the unique 40-character identifier for each commit. Pinning a third-party action to a commit SHA is the most secure reference style.

**HTTPS — Hypertext Transfer Protocol Secure**
HTTP wrapped in TLS encryption. All GitHub API calls use HTTPS.

**PAT — Personal Access Token**
A user-generated token used as a password alternative when authenticating with the GitHub API. Can be scoped to specific permissions and expire on a set date. Prefer the built-in `GITHUB_TOKEN` over PATs whenever possible.

**OIDC — OpenID Connect**
An identity protocol built on top of OAuth 2.0. GitHub Actions can exchange a short-lived OIDC token with cloud providers (AWS, GCP, Azure) to deploy without storing long-lived credentials as secrets.

**IAM — Identity and Access Management**
A framework for managing who (or what) can perform which actions on a system. Relevant when your workflow deploys to a cloud provider — the workflow needs an IAM role or service principal with the right permissions.

**GHCR — GitHub Container Registry**
GitHub's built-in container image registry, reachable at `ghcr.io`. Use it to push and pull Docker images with your `GITHUB_TOKEN`, no external registry account required.

---

### Short forms and common slang

**env — Environment (variable)**
A named value available to processes at runtime. In workflows, set via the `env:` key or exported to `$GITHUB_ENV`.

**repo — Repository**
A Git repository. On GitHub, a repo includes the code, its history, and the issues, PRs, Actions, and settings attached to it.

**GH — GitHub**
The platform that hosts your repositories and runs Actions. Also the name of the official CLI tool (`gh`).
