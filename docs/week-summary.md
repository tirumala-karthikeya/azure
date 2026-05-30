# Jira Story Agent — Week Summary

A short, honest overview of what we tried this week, what worked, what is still open, and what each path actually costs. All numbers and capabilities below are verified against the live Azure resources and current Microsoft docs.

---

## 1. Goal

Turn a rough product idea ("As a user I want password reset") into a real Jira Story with title, acceptance criteria, risks, tasks, and a readiness score — without an engineer typing it out.

The demo target: **share a single URL** that anyone can hit and see a Jira ticket appear.

---

## 2. What we tried this week

| # | Attempt | Status |
|---|---------|--------|
| 1 | Local Node.js script using Anthropic Claude (Opus 4.7) | ✅ Worked. Created SCRUM-5. ~₹3 per story with prompt caching. |
| 2 | Microsoft Copilot Studio via M365 license | ❌ Blocked. Required M365 Copilot license we couldn't get. |
| 3 | Microsoft Copilot Studio via Pay-As-You-Go | 🟡 Resource provisioned (`CopilotStudioPAYG`), bot not yet built |
| 4 | Azure AI Foundry — Foundry Agent (`Agent966`) | ✅ Created, runs in Playground |
| 5 | Logic App (`jira-create-story-la`) | ✅ Working. Used as the agent's "Jira hand". |
| 6 | Azure Function App (`jirastoryagent-fn-29033`) | ✅ Deployed. **Public demo URL.** |
| 7 | MCP server as agent tool | ⏸️ Researched only. Foundry supports it now; we didn't wire one up yet. |
| 8 | Astro Starlight docs site | ✅ Live. Architecture, setup, live-example, troubleshooting pages. |

---

## 3. The four paths (and which we actually built)

### Path A — Foundry Agent (chatbot in the Playground)

**What it is:** A no-code agent built in Microsoft Foundry. The agent is `Agent966` (`asst_qnTsgJlfmT16fSDBlzjzKYOe`) running on `gpt-4o (version:2024-11-20)`. The agent itself has no Jira credentials — it calls a tool when it needs to act.

**What we did:** Created the agent in the portal, set instructions ("You are a Jira story creation agent..."), wired it to a deployment.

**What still needs doing:** Connect the Logic App as a tool inside the agent so the chatbot can actually create Jira tickets. Today the agent can *generate* Jira-shaped text but can't *post* it. The Foundry Agent setup page in our docs walks through this.

**Auth:** Microsoft Entra ID. Endpoint: `https://jirastoryagent.services.ai.azure.com/api/projects/proj-default`.

**Public?** ❌ Tenant-only. Anyone outside the Azure tenant can't open it.

### Path B — Logic App direct (no AI, just plumbing)

**What it is:** A visual workflow in `jira-create-story-la`. Receives JSON, calls Jira REST API.

**What we did:** Built and tested it. Two actions: `Create_Jira_Issue` (HTTP POST to `/rest/api/3/issue`) and `Response` (returns Jira's response to the caller).

**Verified payload:** `{title, description, projectKey, issueType}`.

**Callback URL:** `https://prod-74.eastus.logic.azure.com:443/workflows/efbeaf2f65f7440087a81ea398b35c0a/triggers/manual/paths/invoke?...&sig=...`

**Auth:** HMAC-signed callback URL (the `?sig=...` query string).

**Public?** Yes if you have the URL — but the URL itself is a secret.

**Smoke tests:** Created `SCRUM-9`, `SCRUM-10`, `SCRUM-11` during setup.

### Path C — Function App (full AI pipeline) ⭐ DEMO URL

**What it is:** A Node.js Azure Function that runs the full 3-stage GPT-4o pipeline (generator → validator → planner) and creates the Jira ticket itself.

**What we did:**
- Wrote `src/agents/index.js` (256 lines) — the 3-stage pipeline
- Wrote `src/functions/createStory.js` (42 lines) — HTTP wrapper
- Tested locally with `func start`, then deployed to `jirastoryagent-fn-29033`
- Configured 11 App Settings (Azure OpenAI endpoint/key/deployment, Jira creds, etc.)
- Verified live response with a dry-run cold start

**Public URL:** `https://jirastoryagent-fn-29033.azurewebsites.net/api/createstory`

**Auth:** Anonymous. No key in URL.

**Sample call:**
```bash
curl "https://jirastoryagent-fn-29033.azurewebsites.net/api/createstory?input=As%20a%20user%20I%20want%20to%20reset%20my%20password&dryRun=true"
```

Returns `{ok, story, validation, plan, jira}` with the full pipeline output.

### Path D — MCP server as an agent tool ⏸️ RESEARCHED, NOT BUILT

**What it is:** Model Context Protocol — Anthropic's open standard for connecting LLMs to tools. Replaces the Logic App with a code-based MCP server that exposes many Jira operations through one endpoint.

**What we found:**
- Foundry supports MCP server tools as of **April 2026**. Doc: [Connect to MCP Server Endpoints for agents](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/model-context-protocol).
- All SDKs (Python, C#, JS, Java, REST) support it.
- Both Basic and Standard agent setups work.
- Public and private MCP endpoints supported (private requires Azure Container Apps with internal-only ingress).
- **Foundry Toolboxes (preview)** = bundle multiple tools (Web Search, Code Interpreter, File Search, Azure AI Search, MCP servers, OpenAPI tools, A2A connections) into a single MCP-compatible endpoint.
- Built-in approval workflow for high-risk operations (`require_approval: "always"`).
- Auth via project connections (API key, Entra ID, OAuth passthrough).

**What we did:** Just research. We did **not** create an MCP server. The Logic App is doing that job for now.

**When MCP would be worth building:** If we expand from "create story" to a real Jira integration (search, update, link, transition, comment, query Confluence, etc.). One MCP server is cleaner than 8 Logic Apps.

---

## 4. Cost analysis (verified)

### Token usage from a real run

Numbers from a live dry-run on Azure GPT-4o on May 1:

| Stage | Prompt tokens | Completion tokens | Total |
|-------|--------------:|------------------:|------:|
| Generator | 1,628 | 284 | 1,912 |
| Validator | 1,621 | 325 | 1,946 |
| Planner | 1,907 | 551 | 2,458 |
| **Per story** | **5,156** | **1,160** | **~6,316** |

### Cost per story

GPT-4o standard pay-as-you-go on Azure (`gpt-4o-2024-11-20`): roughly $2.50 per 1M input tokens, $10 per 1M output tokens.

| Calculation | Amount |
|-------------|-------:|
| Input cost (5,156 × $2.50/1M) | $0.0129 |
| Output cost (1,160 × $10/1M) | $0.0116 |
| **Per-story cost** | **~$0.025** (~ ₹2.10) |
| Logic App execution | < $0.001 |
| Function App invocation | $0 (consumption plan free tier) |

Using a slightly more conservative rate ($5/1M input, $15/1M output for older 4o variants), per-story cost = ~$0.043. **Range: $0.025 to $0.05 per story.**

### Azure Foundry credit burn

- **Credit available:** $1,000 (Azure Foundry / OpenAI credit on `Azure subscription 1`)
- **Per-story cost:** $0.025 to $0.05
- **Stories possible on credit alone:** 20,000 to 40,000
- **Function App + Logic App + storage + Application Insights:** ~$0/month at this volume (everything is consumption / scale-to-zero / free tier)
- **Foundry resource (`jirastoryagent`, S0 tier):** $0 baseline, pay only for token usage

**Practical conclusion:** at demo + light internal usage (say 100 stories/month), the credit lasts ~2 years. We will not run out before stakeholder review.

### Copilot Studio PAYG cost (research only — we have not built a bot yet)

- Pay-as-you-go: **$0.01 per Copilot Credit** (no upfront commitment)
- An Azure subscription is required — we have it.
- An M365 license is **not** required for PAYG (this is the key finding — we previously thought it was a hard blocker).
- Credits used per message vary by agent type, knowledge sources used, and answer complexity.
- A `CopilotStudioPAYG` resource (`Microsoft.PowerPlatform/accounts`) already exists in `copilot-rg` — billing path is provisioned, just no bot yet.

Source: [Copilot Studio licensing - Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-copilot-studio/billing-licensing)

---

## 5. Pros and cons of each path

### Path A — Foundry Agent (chatbot)

**Pros**
- "It's a real Microsoft AI agent" looks great to stakeholders
- No code needed — wired in the portal
- Conversational UX out of the box
- Now supports MCP tools natively

**Cons**
- Endpoint not publicly shareable — Entra ID + RBAC required
- Agent itself can't call Jira; needs a tool (Logic App / Function / MCP)
- East US region we picked has only OpenAI / Llama / Cohere — no Claude
- Threads are stateful — overkill for a one-shot pipeline

### Path B — Logic App

**Pros**
- Visual workflow, easy to inspect and edit
- Microsoft-managed, very low maintenance
- Hundreds of pre-built connectors if we expand
- Verified working, with three real Jira tickets created during setup

**Cons**
- No AI — just a Jira worker
- One workflow per operation (create / update / search would each need a separate workflow)
- Callback URL is a long secret — leaking it lets anyone spam Jira
- Fundamentally just a wrapper over the Jira REST call

### Path C — Function App ⭐

**Pros**
- Full AI pipeline (3 GPT-4o calls) and Jira creation in one HTTP request
- Anonymous public URL — anyone can use the demo, no Microsoft account needed
- All code lives in our Node.js repo — fully version-controlled
- Same prompts work across providers (swap one client class to switch Claude ↔ GPT-4o)

**Cons**
- We host the code (vs. Logic App's clicked-together flow)
- Anyone can burn tokens on a public URL — needs `dryRun=true` default for safety
- Cold start on consumption plan (~30–60s on first call, instant after)

### Path D — MCP server (not built)

**Pros**
- Cross-LLM portable (Claude, GPT, Copilot, Foundry — all speak MCP)
- One server can expose many Jira operations (create / search / link / update)
- Foundry Toolboxes can wrap MCP + Web Search + Code Interpreter into one endpoint
- Standard protocol, well-documented, growing community

**Cons**
- We host the MCP server (Function App or Container App)
- Real implementation work (not just clicks)
- For *one* Jira operation, MCP is overkill — Logic App is faster to ship
- Worth building only if we expand the agent's tool surface

### Path E — Copilot Studio PAYG (not built)

**Pros**
- The "Microsoft Copilot brand" optics on the demo
- PAYG model with no M365 license — doable on our existing Azure subscription
- Resource group already has `CopilotStudioPAYG` provisioned

**Cons**
- Pricing per Copilot Credit is fuzzier than per-token cost
- No-code Copilot Studio is a different mental model than what we have built
- Unclear whether the agent would expose a public URL or stay tenant-only

---

## 6. What we built (concrete artifacts)

### Azure resources (resource group `copilot-rg`, eastus)

| Resource | Type | Purpose |
|---|---|---|
| `jirastoryagent` | `Microsoft.CognitiveServices/accounts` (kind: AIServices, S0) | Foundry account |
| `jirastoryagent/proj-default` | Foundry project | Project that owns the agent |
| `Agent966` (`asst_qnTsgJlfmT16fSDBlzjzKYOe`) | Foundry Agent | The chatbot |
| `jira-create-story-la` | Logic App | The "Jira hand" workflow |
| `jirastoryagent-fn-29033` | Function App (Linux, Node 22) | Public demo endpoint |
| `EastUSLinuxDynamicPlan` | App Service Plan (consumption) | Hosts the function |
| `jstoryfn777931617` | Storage Account | Function App backing storage |
| `Application Insights Smart Detection` | Monitoring | Function logs / traces |
| `CopilotStudioPAYG` | `Microsoft.PowerPlatform/accounts` | Copilot Studio PAYG billing path |

### Code in the repo

| File | Lines | Purpose |
|---|---:|---|
| `src/agents/index.js` | 256 | 3-stage pipeline (generator → validator → planner) calling Azure GPT-4o, then Jira |
| `src/functions/createStory.js` | 42 | HTTP wrapper exposing the pipeline as a Function endpoint |
| `host.json` | — | Functions runtime config |
| `local.settings.json` | — | Local dev env vars (gitignored) |
| `.github/copilot/jira-story/generator.md` | — | LLM prompt: rough idea → YAML story |
| `.github/copilot/jira-story/validator.md` | — | LLM prompt: story → approved/flagged |
| `.github/copilot/jira-story/planner.md` | — | LLM prompt: story → tasks + readiness score |
| `.github/copilot/jira-story/schema.yaml` | — | YAML schema enforced by all three prompts |

### Documentation site (`website/`)

- Astro Starlight, dark navy theme
- Pages: architecture, resources, Logic App action, Foundry Agent setup, live end-to-end example (now merged into the index), Azure setup proof, troubleshooting
- Home dashboard: single Azure AI card (we collapsed two cards into one this week)
- Build verified: 28 pages built clean

---

## 7. Still to check next week

### Microsoft Copilot — actually try the PAYG path

- The `CopilotStudioPAYG` resource is sitting there unused. Build a minimal bot in Copilot Studio that calls our existing Logic App, and measure the actual Copilot Credit cost per conversation.
- Compare per-conversation cost to our per-story Function App cost — which is cheaper for the same outcome?

### Azure AI Foundry — the surface area we haven't explored

- **MCP tool wiring** — concrete next step: rewrite the Function App as an MCP server, wire it into the Foundry agent as the agent's tool, retire the Logic App. Test with the GitHub MCP server first as a sanity check.
- **Foundry Toolboxes (preview)** — bundle MCP + Web Search + File Search into one endpoint and see whether the agent benefits.
- **Azure AI Search grounding** — index past Jira tickets so the agent learns "how stories should look in this team."
- **Foundry Evaluations** — auto-grade story quality across many test prompts. Real metric for "how good is this agent."
- **Foundry Tracing** — does it trace cross-resource calls (Agent → MCP server → Jira) end-to-end? Useful for debug.
- **Guardrails / Content Safety** — per-call cost overhead and whether to turn on for the public URL.
- **Azure OpenAI prompt caching** — if available on `gpt-4o-2024-11-20` standard, cuts our input tokens roughly in half (Anthropic has it; Azure was rolling it out).

### Cost discipline

- Set an Azure **budget alert** (e.g. $50/week) so we get a heads-up if usage spikes
- Default the public Function URL to `dryRun=true` and require an opt-in for real ticket creation
- Confirm Foundry credit burn rate after a real demo week and project the runway

---

## 8. Decision summary

| Question | Answer |
|----------|--------|
| What's the demo URL we share? | **Path C — Function App.** `https://jirastoryagent-fn-29033.azurewebsites.net/api/createstory` |
| What do we show internal stakeholders? | **Path A — Foundry Playground chat** with `Agent966`, plus the live demo URL |
| What's the runtime model? | GPT-4o (`gpt-4o-2024-11-20`) on Azure (eastus), via the `jirastoryagent` Foundry resource |
| Why not Claude on Foundry? | Not available in the East US region of Foundry we provisioned |
| Why not Copilot Studio? | M365-license path was blocked. PAYG path is unblocked but we haven't built the bot yet. |
| Why not MCP? | Foundry supports it (April 2026 GA), but for one Jira operation the Logic App is faster. Worth revisiting when we expand tools. |
| What pays for it? | The $1,000 Azure Foundry credit. At ~$0.025–$0.05/story, this lasts ~20,000–40,000 stories. |

The key insight from this week: **a Foundry "agent" is a chatbot frame around an LLM, not a do-things-on-the-internet primitive.** Anything that touches Jira / Slack / GitHub / Confluence still needs a tool — Logic App, Function, MCP server, or OpenAPI spec. The Function App we built is the simplest, most portable, most demo-ready of those tools, and it doubles as the public URL.

---

## Sources

- [Connect to MCP Server Endpoints for agents — Microsoft Learn](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/model-context-protocol) (last updated 2026-04-28)
- [Agent tools overview for Microsoft Foundry Agent Service — Microsoft Learn](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/tool-catalog)
- [What is Microsoft Foundry Agent Service? — Microsoft Learn](https://learn.microsoft.com/en-us/azure/foundry/agents/overview)
- [Copilot Studio licensing — Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-copilot-studio/billing-licensing)
- [Copilot Studio Pay-as-you-go pricing — Azure](https://azure.microsoft.com/en-us/pricing/details/copilot-studio/)
- [Azure OpenAI Service pricing — Azure](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/openai-service/)
- [Microsoft Previews Cloud-Hosted Foundry MCP Server — Visual Studio Magazine, Dec 2025](https://visualstudiomagazine.com/articles/2025/12/04/microsoft-previews-cloud-hosted-foundry-mcp-server-for-ai-agent-development.aspx)
