---
title: 'Security scanning — the stuff you shouldn''t skip'
description: 'Section 15 of the GitHub Actions Handbook.'
sidebar:
  order: 15
---
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

