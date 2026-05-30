---
title: Jira (Composio) setup
description: Composio workspace, Jira connection, and the composio-jira MCP server attached to AzureRetrieve, Devops, and MicrosoftEntra.
sidebar:
  order: 5
---

Composio is the bridge between Foundry agents and Jira. Foundry doesn't have a first-party Jira MCP server, so Composio's hosted MCP provides one. Three agents — AzureRetrieve, Devops, MicrosoftEntra — file Stories in the `SCRUM` project whenever they hit a write they can't perform.

## Why Composio (vs Logic Apps or direct REST)

We previously tried two other approaches:

| Approach | Verdict |
| --- | --- |
| Logic App with HTTP Jira action | Worked but required two Azure resources and a second auth flow. Replaced. |
| Direct REST from agent via `run_az` or curl | Token management was a mess. Rejected. |
| Composio MCP | One URL, one OAuth flow, works inside any Foundry agent. Chosen. |

Composio gives you a managed MCP endpoint per integration. The integration ("Jira") handles OAuth refresh and tool schema. Your agent just calls `JIRA_CREATE_ISSUE` and gets back a key.

## Composio workspace

1. Sign up at `connect.composio.dev`
2. Create a workspace (or use the existing one for your org)
3. Note the workspace ID — it ends up in the MCP URL

## Adding the Jira connection

In Composio:

1. **Connections → New connection → Jira**
2. Choose authentication: **OAuth 2.0** (Atlassian-hosted) for the company instance, or **API token** if you have a service account
3. Approve the OAuth consent screen against `yilianapijiayun.atlassian.net`
4. Test the connection — Composio will list your reachable Jira projects

Confirm `SCRUM` shows up. If it doesn't, the Jira user behind the connection lacks Browse permission on that project; fix that in Jira's project settings first.

## Configuring allowed Jira tools

Composio exposes ~80 Jira tools by default. The agents need exactly **one**: `JIRA_CREATE_ISSUE`. Lock everything else off:

1. In the Jira integration page, click **Tools**
2. Disable every tool except `JIRA_CREATE_ISSUE`
3. Save

This is defense in depth. The agent prompts already forbid the agent from reading or modifying existing Jira issues, but a leaner tool surface reduces the chance of the LLM picking a wrong tool when context is ambiguous.

## Getting the MCP URL

In Composio:

1. **MCP → New MCP server**
2. Name: `composio-jira`
3. Integration: Jira (the one you just connected)
4. Auth mode: **Use my connection** (so the agent doesn't need per-user auth)
5. Click **Create** → copy the URL

The URL looks like:

```
https://connect.composio.dev/mcp/<workspace-id>/<server-id>
```

In the Foundry agents it appears as `composio-jira (https://connect.composio.dev/mcp)` — the suffix is truncated in the UI but stored in full in the config.

## Attaching to agents

For each of the three agents that need to file Jira:

1. Open the agent in Foundry
2. **Tools → Add → Custom MCP**
3. Name: `composio-jira`
4. URL: the Composio MCP URL above
5. Authentication: **None** (Composio handles auth on its side via the connection)
6. Save

Do this for **AzureRetrieve**, **Devops**, and **MicrosoftEntra**. Do **not** attach it to ParentAgent or SubDiscovery — they're not allowed to file tickets.

## Story shape

Each agent fills Jira issues with the same shape (see [chapter 05](/azure-multi-agent/05-agents/) for the exact prompt text):

```text
Project: SCRUM
Issue type: Story
Summary: "[<Domain>] <short description>"
Description (free text):
  Original user request: <verbatim user message>
  Reason: <why the agent escalated — RBAC denial, read-only domain, prod-write, etc.>
  Action requested: <what the user wanted>
  Target: <resource ID, repo name, user UPN, whatever applies>
  Source: <agent name — AzureRetrieve / Devops / MicrosoftEntra>
```

The `Source:` line is the single most useful field when triaging. It tells you which agent decided to escalate, which often pinpoints the policy that triggered it.

## Smoke test

After attaching, run this in the **MicrosoftEntra** Playground:

```
Please create a user named test.user@jiayunyilianapi.onmicrosoft.com
```

Expected flow:

1. MicrosoftEntra refuses the write
2. Agent asks: "I'm read-only for Entra. File a Jira ticket? (yes/no)"
3. You reply: "yes"
4. Agent calls `JIRA_CREATE_ISSUE`
5. Composio creates the Story, returns the key (e.g. `SCRUM-42`)
6. Agent replies: "Filed Jira SCRUM-42: https://yilianapijiayun.atlassian.net/browse/SCRUM-42"

Open the link, confirm the Story exists, then delete it (it was just a smoke test). The link click also confirms that the URL pattern in your agent prompts matches your Jira instance.

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| "Ticket creation failed: 401" | Composio connection token expired | Refresh the Jira connection in Composio → re-authorize OAuth |
| "Ticket creation failed: project not found" | Wrong project key in prompt | Confirm the project key is `SCRUM` in Jira; some instances use `SCRM` |
| Agent files ticket but never replies with the key | Composio response truncated | Increase `max_tokens` on the agent's model deployment; or check that `JIRA_CREATE_ISSUE` returns `result.key` |
| Agent files a ticket on a *read* request | Prompt regression | Re-check the rule "Never call composio-jira for normal read requests" is still in the agent's instructions |

## What's next

All six MCP servers are connected. The agents have everything they need to do work. Now you write the instructions that turn them into focused, predictable specialists.

Continue to [Agents & system prompts](/azure-multi-agent/05-agents/).
