# .github/copilot/

Source of truth for AI-powered capabilities in this repo.

Each subfolder is one **capability** — a self-contained set of agents and the schema they share. The runtime (`src/agents/`) is replaceable; the contracts in this folder are not.

> Lives under `.github/copilot/` (not `.github/workflows/`) — `.github/workflows/` is reserved by GitHub Actions for CI/CD YAML.

## Layout

```
.github/copilot/
├── README.md                  This file.
└── jira-story/                Capability: AI-powered Jira backlog grooming.
    ├── schema.yaml            Strict schema every story must satisfy.
    ├── generator.md           Free text -> structured story.
    ├── validator.md           Story -> verdict (approved/flagged/rejected).
    └── planner.md             Story -> tasks, effort review, readiness score.
```

## Capabilities

| Folder | Purpose |
|---|---|
| `jira-story/` | Standardize and validate Jira backlog stories before grooming. |

To add a new capability (e.g. `pr-review/`, `slack-triage/`), create a new folder with a `schema.yaml` (if relevant), one or more agent prompt files, and wire it into a runtime in `src/agents/`.

## Conventions

- Each agent prompt has YAML frontmatter declaring `name`, `purpose`, `input`, `output`.
- All agents emit YAML, never prose. This keeps them composable in pipelines.
- The schema for a capability lives next to its agents, not in a global `schemas/` folder. Each capability owns its contracts.
- Agent file names use the role only (`generator.md`, `validator.md`) — the capability folder name supplies the domain context.

## Why prompts live in this folder

- They are versioned with code, reviewed in PRs, and survive runtime swaps.
- The Anthropic API supports prompt caching with a 5 minute TTL. Loading these files once and caching them cuts cost roughly 90% on repeat calls.
- A new team member can read this folder and understand the system without running any code.
