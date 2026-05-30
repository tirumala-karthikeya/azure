---
title: Azure Multi-Agent Foundry
description: End-to-end build of a multi-agent Azure operations assistant on Microsoft Foundry — ParentAgent router, SubDiscovery, AzureRetrieve, Devops, MicrosoftEntra, MCP tools, workflow orchestration, and Composio Jira escalation.
sidebar:
  order: 1
---

This section documents the **multi-agent Azure operations assistant** running on Microsoft Foundry — the "New Foundry" UI at `ai.azure.com/nextgen`. A workflow routes user requests to specialist agents that read and selectively write across Azure resources, Azure DevOps, and Microsoft Entra ID. Anything the agents can't perform directly — prod-subscription writes, DevOps writes, Entra writes — is escalated to Jira via Composio MCP.

## What this delivers

The `AzureEndToEnd` workflow exposes one chat endpoint that:

- Classifies the user request into one of three domains: Azure, DevOps, or Entra
- Enumerates Azure subscriptions and classifies them as `prod` / `nonprod` by name
- Routes to a domain agent that lists/inspects resources or performs nonprod writes
- For prod-write or out-of-scope writes, files a Jira Story in the `SCRUM` project via Composio

## Architecture

```text
User
 │
 ▼
Microsoft Foundry workflow: AzureEndToEnd
 │
 ├─ Set variable (capture user message → Local.OriginalRequest)
 ├─ ParentAgent (classifier — emits: AZURE / DEVOPS / ENTRA / GREETING / UNKNOWN)
 │
 └─ If / Else condition
     ├─ AZURE  → SubDiscovery → Set variable (combine subs + request) → AzureRetrieve
     ├─ DEVOPS → Devops
     ├─ ENTRA  → MicrosoftEntra
     └─ Else   → fallback / menu
                  │
                  ▼
            Agent tool calls
              ├─ AzureMCPServer       (Azure RM reads/writes via official MCP)
              ├─ AzureCLIServer       (run_az for arbitrary CRUD on nonprod)
              ├─ Foundry MCP Server   (Foundry project introspection)
              ├─ Azure DevOps MCP     (read-only DevOps)
              ├─ MicrosoftMCPEnterprise (read-only Entra / M365)
              └─ composio-jira        (escalation Stories in SCRUM)
```

## Tenant and subscriptions

| Field | Value |
| --- | --- |
| Tenant ID | `6577bae2-a3fd-40d6-a992-949168c7ca0f` |
| Tenant domain | `jiayunyilianapi.onmicrosoft.com` |
| Nonprod sub | `Azure subscription 1` (`64d347f2-7434-4ae2-9b7d-618fbffc37ac`) |
| Prod sub | `Subscription Prod` (`a31708fa-027e-453d-9126-c86e7f9e54b4`) |
| Foundry project | `jirasotiresscrum` |
| Resource group | `copilot-rg` |
| Model | `gpt-5.5` (all agents) |
| Jira project key | `SCRUM` |
| Jira base URL | `https://yilianapijiayun.atlassian.net` |

## Why multi-agent (vs single agent)

A single agent with every MCP server attached suffers from tool sprawl — the LLM has 100+ functions to choose from and picks wrong tools or fabricates parameters. Splitting by domain (Azure / DevOps / Entra) keeps each agent's tool surface small and its system prompt focused. The ParentAgent does pure classification; each domain agent only needs to know its own tools.

SubDiscovery is a separate node because subscription enumeration is the same for every Azure request — extracting it into one agent keeps the per-turn cost down and the AzureRetrieve prompt simpler.

## Reading order

1. [Prerequisites & setup](/azure-multi-agent/01-prerequisites/) — Azure tenant, Foundry project, model deployment
2. [Azure permissions & managed identity](/azure-multi-agent/02-permissions-identity/) — RBAC on both subs, single MI for MCP
3. [MCP tools](/azure-multi-agent/03-mcp-tools/) — six MCP servers wired to the right agents
4. [Jira (Composio) setup](/azure-multi-agent/04-jira-composio/) — Composio account, Jira connection, MCP URL
5. [Agents & system prompts](/azure-multi-agent/05-agents/) — full system prompts for all five agents
6. [Workflow (AzureEndToEnd)](/azure-multi-agent/06-workflow/) — node-by-node workflow build
7. [Prod vs non-prod handling](/azure-multi-agent/07-prod-vs-nonprod/) — env classification, Jira-for-prod / create-for-nonprod
8. [Publishing to Teams](/azure-multi-agent/08-publishing/) — Bot Service, M365 Copilot store
9. [Testing & troubleshooting](/azure-multi-agent/09-testing-troubleshooting/) — test plan, common workflow piping issues
10. [Evaluations](/azure-multi-agent/10-evaluations/) — Foundry's Evaluations panel, dataset shape, the six evaluators we use, regression cadence

## What this section does NOT cover

- Composio account creation (covered briefly in chapter 4 — assumes a Composio workspace already exists).
- Azure Bot Service and M365 Copilot publishing pipeline beyond initial registration.
- Per-environment managed identity split (queued — currently a single MI is used for both subs).
- Guardrails configuration and formal CI/CD for agent prompts.

The **Evaluations** chapter covers the regression suite we use, but a fully automated publish gate (block release if scores drop) is out of scope.
