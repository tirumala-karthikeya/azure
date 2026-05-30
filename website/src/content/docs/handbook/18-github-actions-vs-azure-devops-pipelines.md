---
title: 'GitHub Actions vs Azure DevOps Pipelines'
description: 'Section 18 of the GitHub Actions Handbook.'
sidebar:
  order: 18
---
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

