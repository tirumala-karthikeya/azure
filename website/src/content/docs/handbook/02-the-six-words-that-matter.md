---
title: 'The six words that matter'
description: 'Section 2 of the GitHub Actions Handbook.'
sidebar:
  order: 2
---
Almost every conversation about GitHub Actions uses the same handful of words. Learn these and you'll follow 90% of any workflow file.

- **Workflow**. A YAML file in `.github/workflows/`. Defines one piece of automation.
- **Event**. Something that triggers a workflow — push, pull request, schedule, manual click, etc.
- **Job**. A group of steps that run on the same runner.
- **Step**. A single task — either a shell command or a pre-packaged "action."
- **Action**. A reusable unit of code, like a function you can call from a step.
- **Runner**. The virtual machine (Ubuntu, macOS, or Windows) your job runs on.

The mental model is nested: a workflow contains jobs, jobs contain steps, steps run commands or call actions. Hold that picture in your head and the rest is just details.

