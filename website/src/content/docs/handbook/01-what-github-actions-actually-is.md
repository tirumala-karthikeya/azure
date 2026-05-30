---
title: 'What GitHub Actions actually is'
description: 'Section 1 of the GitHub Actions Handbook.'
sidebar:
  order: 1
---
Here's the honest one-sentence version: GitHub Actions is a way to run scripts when stuff happens in your repo. That's it.

Someone pushes code, you can run a script. Someone opens a pull request, you can run a script. It's 3 AM on a Tuesday, you can run a script. All the vocabulary — workflows, jobs, steps, runners — is just names for the pieces of the system that does exactly this one thing.

The point of the tool is to do the boring reliable work so humans can do the interesting unreliable work. Run your tests automatically. Deploy when a tag is cut. Label new issues. Clean up stale branches. Anything you'd otherwise ask someone to remember to do, a workflow can do for you, every single time, without complaint.

### How it works under the hood

![How it works under the hood](/diagrams/lifecycle.png)

When a triggering event fires in your repository, GitHub looks in `.github/workflows/` for YAML files that care about that event. For any that do, GitHub spins up a brand new virtual machine (called a **runner**), clones your code onto it, runs the steps you listed, and then throws the machine away.

**Yes — GitHub really spins up a fresh VM each time.** Not a container, not a reused machine. A real Ubuntu / macOS / Windows VM that boots, runs your job, and gets destroyed. It comes pre-loaded with the tools most workflows need: `git`, Docker, Node, Python, Java, the GitHub CLI, kubectl, and dozens more. If your job needs something that isn't there, you install it as a step.

Fresh machine every time is why CI is reliable. There's no leftover state from yesterday's broken run, no `node_modules` from a different branch, no half-installed dependencies. Every run starts from zero.

### What people use it for

Four big buckets, roughly:

- **CI** — testing, linting, type-checking, building. Every push, every PR.
- **CD** — deploying code to dev, staging, or production when certain events happen.
- **Chores** — labeling issues, closing stale PRs, generating changelogs.
- **Scheduled tasks** — nightly cleanups, weekly reports, monthly cache resets.

If you can express the work as a script, you can automate it here.

