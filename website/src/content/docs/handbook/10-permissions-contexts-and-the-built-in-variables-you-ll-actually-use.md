---
title: 'Permissions, contexts, and the built-in variables you''ll actually use'
description: 'Section 10 of the GitHub Actions Handbook.'
sidebar:
  order: 10
---
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

