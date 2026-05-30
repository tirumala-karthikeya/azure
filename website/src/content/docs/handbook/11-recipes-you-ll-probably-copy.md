---
title: 'Recipes you''ll probably copy'
description: 'Section 11 of the GitHub Actions Handbook.'
sidebar:
  order: 11
---
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

