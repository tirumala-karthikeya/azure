---
title: 'Triggers — when things run'
description: 'Section 6 of the GitHub Actions Handbook.'
sidebar:
  order: 6
---
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

