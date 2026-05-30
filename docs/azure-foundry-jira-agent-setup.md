# Azure Foundry Jira Story Agent Setup

This document explains what we built, why each Azure resource exists, and how a new teammate can reproduce or troubleshoot the setup.

The goal is to let a user chat with an Azure AI Foundry Agent and have that agent create Jira stories through Azure-managed services.

## Final Architecture

```text
User
  -> Azure AI Foundry Agent
  -> Logic App action
  -> Jira REST API
  -> Jira Story created in SCRUM project
```

We also created an Azure Function earlier as a custom backend endpoint. That works, but the preferred architecture for "Azure runtime only" is Foundry Agent plus Logic Apps.

## Resources Created

| Resource | Name / Value | Purpose |
| --- | --- | --- |
| Azure subscription | Azure subscription 1 | Subscription used for all resources |
| Resource group | copilot-rg | Main resource group |
| Region | eastus | Deployment region |
| Azure AI Foundry resource | jirastoryagent | Foundry / Agents resource |
| Foundry endpoint | https://jirastoryagent.services.ai.azure.com/ | Azure Agent Service endpoint |
| Logic App | jira-create-story-la | Creates Jira issues |
| Jira project | SCRUM | Destination Jira project |
| Jira issue type | Story | Created issue type |
| Azure Function | jirastoryagent-fn-29033 | Optional custom backend created earlier |

Do not commit API keys, Jira tokens, or Logic App callback URLs. The Logic App callback URL contains a `sig` query parameter and must be treated like a password.

## What We Built

### 1. Azure Function Backend

We first created an Azure Function endpoint:

```text
https://jirastoryagent-fn-29033.azurewebsites.net/api/createstory
```

This endpoint runs the repo's custom Node.js pipeline:

```text
Input idea
  -> Generate story with Azure OpenAI
  -> Validate story
  -> Plan implementation tasks
  -> Optionally create Jira ticket
```

This is useful for demos and direct API calls, but it is not the same as the Azure AI Foundry Agent runtime.

Important issue we found: Linux Consumption Function Apps did not run correctly on `Node|24`. We changed the runtime to:

```text
Node|22
```

After that, Azure indexed the function trigger correctly.

### 2. Azure Logic App Jira Action

We then created a Logic App named:

```text
jira-create-story-la
```

This Logic App has:

- HTTP request trigger
- HTTP action that calls Jira REST API
- HTTP response action that returns Jira's response

The Logic App accepts this request body:

```json
{
  "title": "Reset password flow",
  "description": "As a user, I want to reset my password so that I can recover access.",
  "projectKey": "SCRUM",
  "issueType": "Story"
}
```

It calls Jira:

```text
POST /rest/api/3/issue
```

and returns a response like:

```json
{
  "id": "10073",
  "key": "SCRUM-10",
  "self": "https://xpectrum-ai-team-p5xivz4o.atlassian.net/rest/api/3/issue/10073"
}
```

### 3. Foundry Agent Action

The next step is to attach the Logic App as an action/tool inside Azure AI Foundry Agent.

Expected final flow:

```text
User chats in Foundry Playground
  -> Agent creates a clean Jira story
  -> Agent calls jira-create-story-la
  -> Jira creates SCRUM ticket
  -> Agent replies with the ticket key/link
```

## Required Local Tools

Install or verify these:

```bash
az --version
func --version
node --version
```

We used:

```text
Azure CLI: 2.84.0
Azure Functions Core Tools: 4.10.0
Node: 24.x locally
```

The local Node version can be newer than the Azure Function runtime. The deployed Function App runtime was changed to `Node|22`.

## Azure Login

Log in with the Azure account that owns the Foundry resource:

```bash
az login --use-device-code
```

Verify the selected subscription:

```bash
az account show -o table
az group list -o table
```

Expected resource group:

```text
copilot-rg
```

## Logic App Setup

### Register Microsoft.Logic Provider

Fresh subscriptions may not have the Logic Apps provider enabled.

```bash
az provider register --namespace Microsoft.Logic
az provider show --namespace Microsoft.Logic --query registrationState -o tsv
```

Wait until it returns:

```text
Registered
```

### Create the Logic App

We created `jira-create-story-la` in `copilot-rg`.

The workflow definition contains:

- Request trigger named `manual`
- Jira HTTP action named `Create_Jira_Issue`
- Response action named `Response`

The Jira credentials are passed as Logic App parameters:

- `jiraBaseUrl`
- `jiraEmail`
- `jiraApiToken` as `SecureString`

Do not hardcode these values in committed files.

### Recreate the Logic App from CLI

Use this when setting up a fresh environment. It creates a temporary workflow definition in `/private/tmp`, deploys it to Azure, and removes the temp file afterward.

Before running this, make sure `.env` contains:

```text
JIRA_BASE_URL=...
JIRA_EMAIL=...
JIRA_API_TOKEN=...
```

Run from the repo root:

```bash
set -a
source .env
set +a

node <<'NODE'
const fs = require('fs');

const required = ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  throw new Error(`Missing env vars: ${missing.join(', ')}`);
}

const workflow = {
  definition: {
    $schema: 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
    contentVersion: '1.0.0.0',
    parameters: {
      jiraBaseUrl: { type: 'String' },
      jiraEmail: { type: 'String' },
      jiraApiToken: { type: 'SecureString' }
    },
    triggers: {
      manual: {
        type: 'Request',
        kind: 'Http',
        description: 'Creates a Jira Story issue from a generated title and description.',
        inputs: {
          schema: {
            type: 'object',
            description: 'Request body for creating a Jira Story from an Azure AI Foundry agent.',
            properties: {
              title: {
                type: 'string',
                description: 'Jira issue summary/title.'
              },
              description: {
                type: 'string',
                description: 'Jira issue description in plain text.'
              },
              projectKey: {
                type: 'string',
                description: 'Jira project key, for example SCRUM.'
              },
              issueType: {
                type: 'string',
                description: 'Jira issue type, for example Story.'
              },
              acceptanceCriteria: {
                type: 'array',
                items: { type: 'string' }
              }
            },
            required: ['title', 'description', 'projectKey', 'issueType']
          }
        }
      }
    },
    actions: {
      Create_Jira_Issue: {
        type: 'Http',
        inputs: {
          method: 'POST',
          uri: "@{concat(parameters('jiraBaseUrl'), '/rest/api/3/issue')}",
          headers: {
            'Content-Type': 'application/json',
            Authorization: "@{concat('Basic ', base64(concat(parameters('jiraEmail'), ':', parameters('jiraApiToken'))))}"
          },
          body: {
            fields: {
              project: {
                key: "@triggerBody()?['projectKey']"
              },
              summary: "@triggerBody()?['title']",
              description: {
                type: 'doc',
                version: 1,
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: "@triggerBody()?['description']"
                      }
                    ]
                  }
                ]
              },
              issuetype: {
                name: "@triggerBody()?['issueType']"
              }
            }
          }
        },
        runAfter: {}
      },
      Response: {
        type: 'Response',
        kind: 'Http',
        inputs: {
          statusCode: 200,
          body: "@body('Create_Jira_Issue')"
        },
        runAfter: {
          Create_Jira_Issue: ['Succeeded']
        }
      }
    },
    outputs: {}
  },
  parameters: {
    jiraBaseUrl: { value: process.env.JIRA_BASE_URL },
    jiraEmail: { value: process.env.JIRA_EMAIL },
    jiraApiToken: { value: process.env.JIRA_API_TOKEN }
  }
};

fs.writeFileSync('/private/tmp/logicapp-jira.json', JSON.stringify(workflow, null, 2));
NODE

az logic workflow create \
  --resource-group copilot-rg \
  --location eastus \
  --name jira-create-story-la \
  --definition /private/tmp/logicapp-jira.json

rm /private/tmp/logicapp-jira.json
```

### Get the Logic App Callback URL

The Azure CLI Logic extension did not include a trigger callback helper, so we used `az rest`:

```bash
SUB=$(az account show --query id -o tsv)

az rest --method post \
  --uri "https://management.azure.com/subscriptions/$SUB/resourceGroups/copilot-rg/providers/Microsoft.Logic/workflows/jira-create-story-la/triggers/manual/listCallbackUrl?api-version=2016-06-01" \
  --query value -o tsv
```

The returned URL contains `sig=...`. Treat it as secret.

### Test the Logic App

```bash
LOGIC_URL='PASTE_CALLBACK_URL_HERE'

curl -X POST "$LOGIC_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Agent-created Jira story",
    "description": "As a user, I want the Azure Foundry agent to create Jira stories through Logic Apps so that the runtime is fully Azure-managed.",
    "projectKey": "SCRUM",
    "issueType": "Story"
  }'
```

Successful response:

```json
{
  "id": "10073",
  "key": "SCRUM-10",
  "self": "https://xpectrum-ai-team-p5xivz4o.atlassian.net/rest/api/3/issue/10073"
}
```

## Make the Logic App Visible in Foundry

Azure Foundry's Logic App action picker only shows Consumption Logic App workflows that have:

- HTTP request trigger
- Trigger description
- Response action

Our first version worked with `curl`, but did not show in Foundry because the HTTP trigger had no description.

We fixed it by adding a trigger description:

```text
Creates a Jira Story issue from a generated title and description.
```

If a Logic App does not appear in Foundry, check:

```bash
az logic workflow show \
  --resource-group copilot-rg \
  --name jira-create-story-la \
  --query "definition.triggers.manual.description" \
  -o tsv
```

It should print a non-empty description.

## Attach Logic App to Azure Foundry Agent

In Azure AI Foundry:

1. Open the `jirastoryagent` project/resource.
2. Go to `Agents`.
3. Open the agent, for example `Agent966`.
4. Go to `Actions` or `Tools`.
5. Click `Add`.
6. Choose `Logic App action`.
7. Open `Your actions`.
8. Search for:

```text
jira
```

9. Select:

```text
jira-create-story-la
```

10. Save or create the action.

If it still does not appear:

- Close the modal.
- Refresh the browser.
- Try the `All` tab.
- Search for `jira`.
- Confirm the Logic App is in the same subscription/resource group as the Foundry project.
- Confirm the trigger description exists.

## Recommended Agent Instructions

Use instructions like this in the Foundry Agent:

```text
You are a Jira story creation agent.

When the user gives a rough product idea, convert it into a clear Jira story.
Use projectKey SCRUM and issueType Story by default.

Create:
- A concise title
- A clear user story description
- Acceptance criteria
- Priority
- Effort estimate

When the story is ready, call the Logic App action with:
- title
- description
- projectKey
- issueType

After the action succeeds, return the Jira issue key and Jira URL.
Ask clarifying questions only when the input is too vague to create a useful story.
```

## Test in Foundry Playground

After the Logic App action is attached, test in the Foundry Agent Playground:

```text
Create a Jira story for: As a user, I want to reset my password so that I can recover access to my account.
```

Expected behavior:

```text
Agent writes a Jira-ready story
Agent calls jira-create-story-la
Jira creates a SCRUM ticket
Agent replies with the Jira key/link
```

## Troubleshooting

### Logic App Works with curl but Does Not Appear in Foundry

Cause:

```text
Missing HTTP trigger description.
```

Fix:

```bash
az logic workflow show \
  --resource-group copilot-rg \
  --name jira-create-story-la \
  --query "definition.triggers.manual.description" \
  -o tsv
```

If blank, add a description to the HTTP trigger and refresh Foundry.

### Function App Trigger Sync Failed

Cause:

```text
Node|24 on Linux Consumption caused the app to return 503 and fail trigger indexing.
```

Fix:

```bash
az functionapp config set \
  --resource-group copilot-rg \
  --name jirastoryagent-fn-29033 \
  --linux-fx-version "Node|22"

az functionapp restart \
  --resource-group copilot-rg \
  --name jirastoryagent-fn-29033
```

Then verify:

```bash
az functionapp function list \
  --resource-group copilot-rg \
  --name jirastoryagent-fn-29033 \
  -o table
```

### Azure Provider Not Registered

If Azure says a provider is not registered:

```bash
az provider register --namespace Microsoft.Web
az provider register --namespace Microsoft.Logic
az provider register --namespace Microsoft.OperationalInsights
```

Check status:

```bash
az provider show --namespace Microsoft.Logic --query registrationState -o tsv
```

### App Settings Show null

Azure CLI often masks Function App settings and returns:

```json
"value": null
```

That does not always mean the value is missing. Verify locally without printing secrets:

```bash
[ -n "$AZURE_OPENAI_API_KEY" ] && echo "Azure key loaded" || echo "Azure key missing"
[ -n "$JIRA_API_TOKEN" ] && echo "Jira token loaded" || echo "Jira token missing"
```

## Security Notes

Rotate any key or token that was shared in chat, screenshots, logs, or demos.

Never commit:

- `.env`
- `local.settings.json`
- Logic App callback URL
- Jira API token
- Azure OpenAI API key

The repo already ignores:

```text
.env
local.settings.json
node_modules/
```

## Current Known Working Jira Tickets

These were created during smoke testing:

```text
SCRUM-9
SCRUM-10
SCRUM-11
```

Use future tests carefully because every successful Logic App call creates a real Jira issue.
