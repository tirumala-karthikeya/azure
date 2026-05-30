---
title: 'Secrets and environment variables'
description: 'Section 9 of the GitHub Actions Handbook.'
sidebar:
  order: 9
---
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

