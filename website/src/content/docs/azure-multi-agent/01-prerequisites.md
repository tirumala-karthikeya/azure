---
title: Prerequisites & setup
description: Azure tenant, subscriptions, Foundry resource and project, and gpt-5.5 model deployment.
sidebar:
  order: 2
---

This chapter covers everything needed before you start building agents — the Azure tenant, both subscriptions, the Foundry resource, the project, and the model deployment.

## Azure tenant and subscriptions

This build assumes one tenant with two subscriptions — one for non-production work where the agent is allowed to make changes, and one for production where it must escalate via Jira.

| Field | Value | Purpose |
| --- | --- | --- |
| Tenant ID | `6577bae2-a3fd-40d6-a992-949168c7ca0f` | Single Entra tenant for both subs |
| Tenant domain | `jiayunyilianapi.onmicrosoft.com` | UPN suffix |
| Nonprod sub | `Azure subscription 1` (`64d347f2-7434-4ae2-9b7d-618fbffc37ac`) | Agent writes allowed here |
| Prod sub | `Subscription Prod` (`a31708fa-027e-453d-9126-c86e7f9e54b4`) | Agent only reads — writes escalate to Jira |

The subscription **name** is significant — SubDiscovery uses substring matching on names to classify env. Anything containing `prod` (but not `nonprod`) is treated as prod; anything containing `nonprod`, `non-prod`, `sandbox`, `dev`, or `test` is nonprod. If your sub names don't follow this pattern, rename them before deploying.

Verify both subs are visible to your identity:

```bash
az login --tenant 6577bae2-a3fd-40d6-a992-949168c7ca0f
az account list --output table
```

Both subs should appear and be `Enabled`.

## Foundry resource

In the Azure portal, create a Microsoft Foundry (formerly Azure AI Foundry) resource:

| Field | Value |
| --- | --- |
| Resource name | `jirasotiresscrum-resource` |
| Subscription | Nonprod (`Azure subscription 1`) |
| Resource group | `copilot-rg` |
| Region | East US |
| Pricing tier | Standard S0 |

The resource hosts your projects, agents, and workflows. One resource can hold many projects.

## Foundry project

From `ai.azure.com/nextgen` ("New Foundry"), create a project inside the resource:

| Field | Value |
| --- | --- |
| Project name | `jirasotiresscrum` |
| Parent resource | `jirasotiresscrum-resource` |
| Project URL | `https://ai.azure.com/nextgen/r/ZNNH8nQ0SuKbfWGPv_w3rA,copilot-rg,,jirasotiresscrum-resource,jirasotiresscrum/...` |

After creation, the project gets a system-assigned managed identity automatically. You'll grant RBAC to that identity in [chapter 02](/azure-multi-agent/02-permissions-identity/).

## Model deployment

All five agents use the same model. Go to **Models** in the project sidebar:

1. Click **Deploy model**
2. Select **gpt-5.5**
3. Deployment name: `gpt-5.5`
4. Deployment type: Standard
5. Tokens-per-minute quota: 250K (sufficient for ~20 concurrent users in this workload)
6. Click **Deploy**

You only need one deployment — every agent references it by the name `gpt-5.5`.

### Why gpt-5.5

The agents in this build rely on:

- Long context windows (the AzureRetrieve agent receives the full sub list + the user's request in one input)
- Strict instruction adherence (SubDiscovery's "ignore the input message" rule)
- Reliable tool selection across 5+ MCP servers per agent

gpt-5.5 handles all three. Sonnet 4.6 or Haiku 4.5 would work too if you prefer Claude — adjust the deployment accordingly. Smaller open-source models tend to drift on the strict output format SubDiscovery requires.

## Tooling on your laptop

You'll need these locally for the next chapter (RBAC + managed identity):

```bash
# Azure CLI
az --version  # any v2.55+ works
az login --tenant 6577bae2-a3fd-40d6-a992-949168c7ca0f

# Optional but useful
az extension add --name bot
az extension add --name application-insights
```

## What's next

You have a Foundry project with a model deployed but no permissions yet. The project's managed identity can't read or write anything in Azure. Next chapter wires up the RBAC roles and (optionally) creates a separate user-assigned MI for MCP-server outgoing calls.

Continue to [Azure permissions & managed identity](/azure-multi-agent/02-permissions-identity/).
