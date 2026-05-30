---
title: 'From push to production — the end-to-end flow'
description: 'Section 17 of the GitHub Actions Handbook.'
sidebar:
  order: 17
---
Everything in this handbook is one piece of a larger picture. This section draws that picture. Follow a single code change from the moment a developer pushes it, all the way to a running version in production on a cloud provider. Every box in the diagram below maps back to something you've already read.

### The full flow

![The full flow](/diagrams/end-to-end.png)

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

