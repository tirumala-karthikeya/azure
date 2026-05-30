---
title: 'Abbreviations, defined'
description: 'Section 19 of the GitHub Actions Handbook.'
sidebar:
  order: 19
---
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
