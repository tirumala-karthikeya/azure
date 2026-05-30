---
title: Jellyfish backfill commits
description: Two-file patch for the Jellyfish Deployment Pipeline Task that auto-manages the backfillCommits baseline for Classic Releases.
sidebar:
  order: 1
---

A two-file patch for the [Jellyfish Deployment Pipeline Task](https://github.com/jellyfish-co/jellyfish-deployment-pipeline-task). It makes the `backfillCommits` flag self-managing for **Classic Releases**: the first release publishes a single baseline commit, and every release after that backfills automatically — no manual pipeline edits in between.

## What changed

Drop these two files into `buildandreleasetask/` of the upstream repo, rebuild, and re-publish the VSIX. Nothing else needs to move.

| File | Change |
|---|---|
| `buildandreleasetask/index.ts` | Adds auto-baseline logic: reads a release-definition variable (`jellyfishBaselined`), decides `backfillCommits` from it, and flips the variable to `true` after a successful first publish. |
| `buildandreleasetask/task.json` | Updates the `adoPat` and `backfillCommits` help text so the task UI reflects that the value is auto-managed for Classic Releases. |

## How the auto-baseline works

```text
1. First Classic Release runs
   ↓
2. Task reads `jellyfishBaselined` from the release *definition*
   - unset/false → uses backfillCommits=false (baseline this commit only)
   ↓
3. Publish succeeds
   ↓
4. Task flips `jellyfishBaselined = true` on the release *definition*
   (not the current run's variable snapshot, so this run is unaffected)
   ↓
5. Next Classic Release runs
   ↓
6. Task reads `jellyfishBaselined` = 'true' → uses backfillCommits=true
   (every release from now on backfills automatically)
```

If any publish in step 3 fails, the flip is **skipped** — the next release retries the baseline. Azure Pipelines / Build runs are untouched and still use the `backfillCommits` input directly.

## Prerequisites

| Item | Why |
|---|---|
| Azure DevOps PAT with **Release (read & write)** scope | The task now edits the release definition to flip the baseline variable. Pass it via the `adoPat` task input. Classic Releases will fail fast if it's missing. |
| Node 20 build of the task | Rebuild `index.js` from `index.ts` with the existing `tsconfig.json` before packaging the VSIX. |

## Folder layout

```text
buildandreleasetask/
├── index.ts        ← replace
├── task.json       ← replace
├── index.js        ← regenerate (tsc)
├── package.json
└── ...
```

## `buildandreleasetask/index.ts`

```ts
const tl = require('azure-pipelines-task-lib/task');
const http = require('follow-redirects/http');
const https = require('follow-redirects/https');
const parse = require('date-fns/parse');
const format = require('date-fns/format');

async function run() {
  try {
    let ADO_KEY = tl.getInput('adoPat', false);
    if(ADO_KEY){
      console.log("Using custom ADO Personal Access Token");
      ADO_KEY = "Basic " + Buffer.from(`:${ADO_KEY}`).toString('base64');
    } else {
      // Throws 404	The resource doesn't exist, or the authenticated user doesn't have permission to see that it exists.
      // for getAllBuildSources
      console.log("Using 'Project Collection Build Service Accounts' token");
      ADO_KEY = `Bearer ${tl.getEndpointAuthorizationParameter("SystemVssConnection", "AccessToken", false)}`;
    }

    const JELLYFISH_KEY = tl.getInput('jellyfishKey', true);
    const JELLYFISH_Testing : boolean = tl.getInput('isTesting', true).toLowerCase().trim() == "true";
    let JELLYFISH_BACKFILL : boolean = tl.getInput('backfillCommits', true).toLowerCase().trim() == "true";
    // Classic Releases auto-manage baseline state via this release-definition variable.
    const BASELINE_VAR_NAME : string = 'jellyfishBaselined';

    tl.debug(`ADO_KEY present? ${!!ADO_KEY}`);

    console.log(`Jellyfish TestRun: ${JELLYFISH_Testing}`);
    console.log(`Jellyfish Backfill: ${JELLYFISH_BACKFILL}`);

    // Classic Release*: The identifier of the current release record.
    // Example: 118
    const releaseId = tl.getVariable("Release.ReleaseId");

    // The URI of the TFS collection or Azure DevOps organization.
    // For example: https://dev.azure.com/fabrikamfiber/.
    const collectionUri = tl.getVariable('System.TeamFoundationCollectionUri');

    // The URL of the service connection in TFS or Azure Pipelines. Use this from your scripts or tasks to call Azure Pipelines REST APIs.
    // Example: https://fabrikam.vsrm.visualstudio.com/
    const tfsUri = tl.getVariable('System.TeamFoundationServerUri');

    // The ID of the project that this build belongs to.
    const teamProjectId = tl.getVariable('System.TeamProjectId');

    // The name of the project that this build belongs to.
    const teamProject = tl.getVariable('System.TeamProject');

    // The URI of current release.
    // Example: vstfs://ReleaseManagement/Release/118
    const releaseUri = tl.getVariable('Release.ReleaseUri');

    // The ID of the release definition this release was created from.
    const releaseDefinitionId = tl.getVariable('Release.DefinitionId');

    // The URL for the build.
    // Azure Pipelines example: vstfs://build-release/Build/130
    const buildUri = tl.getVariable("Build.BuildUri");

    // The build identifier.
    // Azure Pipelines example: 130
    let buildId = tl.getVariable('Build.BuildId');

    if (!!releaseUri) {
      console.log("Classic Release");

      // Auto-baseline: read the release-definition variable, decide backfill, remember to flip after.
      // Only the *definition* is edited (not the current release's variable snapshot), so the next
      // release picks up the flipped value while the current run is unaffected.
      let needToFlipBaseline = false;
      let baselineDefinition: any = null;
      if (!tl.getInput('adoPat', false)) {
        throw new Error("Classic Releases require the 'adoPat' input (Azure DevOps PAT with Release read/write scope) so baseline state can be auto-managed.");
      }
      if (!releaseDefinitionId) {
        throw new Error("Release.DefinitionId is not set; cannot auto-manage baseline.");
      }
      baselineDefinition = await getReleaseDefinition({
        rootUri: tfsUri,
        projectId: teamProjectId,
        definitionId: releaseDefinitionId,
        apiKey: ADO_KEY
      });
      const currentBaseline = baselineDefinition?.variables?.[BASELINE_VAR_NAME]?.value;
      if (currentBaseline === 'true') {
        console.log(`Baseline: ${BASELINE_VAR_NAME} is 'true' -> using backfillCommits=true`);
        JELLYFISH_BACKFILL = true;
      } else {
        console.log(`Baseline: ${BASELINE_VAR_NAME} is '${currentBaseline ?? "unset"}' -> using backfillCommits=false (first run, will flip after publish)`);
        JELLYFISH_BACKFILL = false;
        needToFlipBaseline = true;
      }

      const release = await getRelease({
        rootUri: tfsUri,
        projectId: teamProjectId,
        releaseId,
        apiKey: ADO_KEY
      });

      let allPublishesSucceeded = true;
      await Promise.all(release.artifacts.map(async (artifact : any, index: number) => {
        const repoName = artifact?.definitionReference?.repository?.name;
        const commit = artifact?.definitionReference?.sourceVersion?.id;

        if (!repoName || !commit) {
          console.log(`Skipping release artifact [${index}] - missing repository name or source version`);
          return;
        }

        console.log(`Publishing commit [${repoName} : ${commit}] to jellyfish`);
        tl.debug(`Deployment Date (before parse): ${release.createdOn}`);
        const publishDate = format(parse(release.createdOn, "yyyy-MM-dd'T'HH:mm:ss.SSSSSSS'Z'", new Date()), "yyyy-MM-dd'T'HH:mm:ss");
        console.log(`Deployment Date (UTC): ${publishDate}`);
        console.log(`Jellyfish ReferenceId: ${repoName}_${releaseId}`);
        try {
          const response = await addJellyFishCommit({
            referenceId: `${repoName}_${releaseId}`,
            repoName,
            commit,
            sourceUrl: getDeploymentUri(),
            deployedAt: publishDate,
            testRun: JELLYFISH_Testing,
            backfill: JELLYFISH_BACKFILL,
            apiKey: JELLYFISH_KEY
          });
          console.log(response);
        } catch (err: any) {
            allPublishesSucceeded = false;
            tl.setResult(tl.TaskResult.Failed, err.message);
        }
      }));

      if (needToFlipBaseline) {
        if (!allPublishesSucceeded) {
          console.log(`Skipping baseline flip because one or more publishes failed. Baseline will be retried on the next release.`);
        } else {
          if (!baselineDefinition.variables) {
            baselineDefinition.variables = {};
          }
          if (baselineDefinition.variables[BASELINE_VAR_NAME]) {
            baselineDefinition.variables[BASELINE_VAR_NAME].value = 'true';
          } else {
            baselineDefinition.variables[BASELINE_VAR_NAME] = { value: 'true', allowOverride: true };
          }
          console.log(`Flipping ${BASELINE_VAR_NAME} to 'true' on release definition ${baselineDefinition.id}`);
          await updateReleaseDefinition({
            rootUri: tfsUri,
            projectId: teamProjectId,
            definitionId: baselineDefinition.id,
            apiKey: ADO_KEY,
            definition: baselineDefinition
          });
          console.log(`Done. Next release will use backfillCommits=true.`);
        }
      }

    } else if (!!buildUri) {
      console.log("Azure Pipeline");

      const stageName = tl.getVariable('System.StageName');

      const build = await getBuild({
        rootUri: collectionUri,
        project: teamProject,
        buildId,
        apiKey: ADO_KEY
      });

      let startTime = build.startTime;

      let sources = [];
      try {
        const details = await getFullBuildDetails({
          rootUri: collectionUri,
          project: teamProject,
          buildId,
          apiKey: ADO_KEY
        });
        sources = details.fps.dataProviders.data['ms.vss-build-web.run-details-data-provider'].repositoryResources;
        startTime = details.fps.dataProviders.data["ms.vss-build-web.run-details-data-provider"].stages.find((x : any) => x.refName == stageName).startTime;
        tl.debug(`found startTime, ${startTime}, for ${stageName} stage`);
        startTime = new Date(parseInt(startTime.replace("/Date(", "").replace(")/", ""), 10)).toISOString();
        tl.debug(`parsed startTime as ${startTime} for ${stageName} stage`);
      } catch (err : any) {
        console.log(err.message);
        console.log(`Could not retrieve full build details (404). Supply an ADO PAT to use this stage's (${stageName}) start time for the deployment time or if you're using multiple source repositories`);
        console.log("Defaulting to Single Repository");
        console.log("Defaulting to the build's start time for the Deployment Date");
        sources = [
          {
            name: build.repository.id,
            version: build.sourceVersion
          }
        ];
      }

      sources.forEach(async ({name, version} : any) => {
        try {
          console.log(`Publishing commit [${name} : ${version}] to jellyfish`);
          tl.debug(`Deployment Date (before parse): ${startTime}`);
          let publishDate = format(parse(startTime, "yyyy-MM-dd'T'HH:mm:ss.SSSSSSS'Z'", new Date()), "yyyy-MM-dd'T'HH:mm:ss");
          console.log(`Deployment Date (UTC): ${publishDate}`);
          console.log(`Jellyfish ReferenceId: ${name}_${buildId}`);

          const response = await addJellyFishCommit({
            referenceId: `${name}_${buildId}`,
            repoName: name,
            commit: version,
            sourceUrl: getDeploymentUri(),
            deployedAt: publishDate,
            testRun: JELLYFISH_Testing,
            backfill: JELLYFISH_BACKFILL,
            apiKey: JELLYFISH_KEY
          });
          console.log(response);
        } catch (err: any) {
            tl.setResult(tl.TaskResult.Failed, err.message);
        }
      });
    }

    tl.setResult(tl.TaskResult.Succeeded, "success");
  }
  catch (err: any) {
    console.log(err);
    tl.setResult(tl.TaskResult.Failed, err.message);
  }
}

function getDeploymentUri(): string {
  let buildUri = tl.getVariable("Build.BuildUri");
  let releaseWebUrl = tl.getVariable("Release.ReleaseWebUrl");
  let collectionUrl = tl.getVariable('System.TeamFoundationCollectionUri');
  let teamProject = tl.getVariable('System.TeamProjectId');
  let buildId = tl.getVariable('Build.BuildId');

  if (!!releaseWebUrl) {
      return releaseWebUrl;
  }

  if (!!buildUri) {
      return `${collectionUrl}${teamProject}/_build?buildId=${buildId}&_a=summary`;
  }

  return "";
}

const addJellyFishCommit = async (
  {referenceId, repoName, commit, deployedAt, sourceUrl = "", testRun = true, backfill = false, apiKey } :
  {referenceId: string, repoName: string, commit: string, deployedAt: string, sourceUrl: string, testRun: boolean, backfill: boolean, apiKey: string}
) => {

  const url = `https://webhooks.jellyfish.co/deployment`;
  const postData = JSON.stringify({
    reference_id: referenceId, // uuidv4(),
    name: repoName,
    deployed_at: deployedAt,
    repo_name: repoName,
    commit_shas : [commit],
    source_url: sourceUrl
  });

  const response : any = await request({
      url,
      headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'X-jf-api-token': apiKey,
          'X-jf-api-dry-run': testRun ? 'true' : 'false',
          'X-jf-api-backfill-commits': backfill ? 'true' : 'false'
      },
      method: "POST",
      postData
  });
  return response;
}

const getBuild = async ({rootUri, project, buildId, apiKey} :{rootUri: string, project: string, buildId: string, apiKey: string}) => {
  const url = `${rootUri}${project}/_apis/build/builds/${buildId}?api-version=6.0`;
  const response : any = await request({ url, headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'curl/7.55.1', // a user agent is required for Azure Dev Ops
      'Authorization': apiKey
  } });
  return JSON.parse(response);
}

//https://stackoverflow.com/a/63571353/402706
const getFullBuildDetails = async ({rootUri, project, buildId, apiKey} :{rootUri: string, project: string, buildId: string, apiKey: string}) => {
  const url = `${rootUri}${project}/_build/results?buildId=${buildId}&__rt=fps&__ver=2`;
  const response : any = await request({ url, headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'curl/7.55.1', // a user agent is required for Azure Dev Ops
      'Authorization': apiKey,
  } });
  return JSON.parse(response);
}

const getRelease = async ({rootUri, projectId, releaseId, apiKey} :{rootUri: string, projectId: string, releaseId: string, apiKey: string}) => {
  const url = `${rootUri}${projectId}/_apis/release/releases/${releaseId}?api-version=6.1-preview.8`;

  const response : any = await request({ url, headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'curl/7.55.1', // a user agent is required for Azure Dev Ops
      'Authorization': apiKey
  } });
  return JSON.parse(response);
}

const getReleaseDefinition = async ({rootUri, projectId, definitionId, apiKey} :{rootUri: string, projectId: string, definitionId: string, apiKey: string}) => {
  const url = `${rootUri}${projectId}/_apis/release/definitions/${definitionId}?api-version=6.0`;

  const response : any = await request({ url, headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'curl/7.55.1',
      'Authorization': apiKey
  } });
  return JSON.parse(response);
}

const updateReleaseDefinition = async ({rootUri, projectId, definitionId, apiKey, definition} :{rootUri: string, projectId: string, definitionId: string, apiKey: string, definition: any}) => {
  const url = `${rootUri}${projectId}/_apis/release/definitions/${definitionId}?api-version=6.0`;

  const response : any = await request({
    url,
    method: 'PUT',
    postData: JSON.stringify(definition),
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'curl/7.55.1',
      'Authorization': apiKey
    }
  });
  return JSON.parse(response);
}

const request = async ({url, method = 'GET', postData, headers} : {url: string, method?: string, postData?: string, headers?: any}) => {
  const lib = url.startsWith('https://') ? https : http;

  const [h, ...path] = url.split('://')[1].split('/');
  const [host, port] = h.split(':');

  const params = {
    method,
    host,
    port: port || url.startsWith('https://') ? 443 : 80,
    path: '/' + path.join('/'),
    headers,
  };

  return new Promise((resolve, reject) => {
    const req = lib.request(params, (res : any) => {
      if(!res || !res.statusCode){
        return reject(new Error(`Status Code: no response`));
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`Status Code (${url}): ${res.statusCode}`));
      }

      const data: Uint8Array[] = [];

      res.on('data', (chunk : any) => {
        data.push(chunk);
      });

      res.on('end', () => resolve(Buffer.concat(data).toString()));
    });

    req.on('error', reject);

    if (postData) {
      req.write(postData);
    }

    // IMPORTANT
    req.end();
  });
};

run();
```

## `buildandreleasetask/task.json`

```json
{
    "$schema": "https://raw.githubusercontent.com/Microsoft/azure-pipelines-task-lib/master/tasks.schema.json",
    "id": "83a9d7c5-3784-4c1b-894e-e40862b8fbb1",
    "name": "jellyfishDeploymentTask",
    "friendlyName": "Jellyfish Deployment Task",
    "description": "Publish Deployment events from Azure Pipelines or Classic Releases",
    "helpMarkDown": "",
    "category": "Utility",
    "author": "Brandon Boone",
    "version": {
        "Major": 1,
        "Minor": 0,
        "Patch": 6
    },
    "instanceNameFormat": "Jellyfish Deployment Task",
    "inputs": [
        {
            "name": "jellyfishKey",
            "type": "string",
            "label": "Jellyfish Api Key",
            "defaultValue": "",
            "required": true,
            "helpMarkDown": ""
        },
        {
            "name": "adoPat",
            "type": "string",
            "label": "Azure DevOps PAT",
            "defaultValue": "",
            "required": false,
            "helpMarkDown": "Azure DevOps Personal Access Token. Required in Classic Releases (baseline state is auto-managed and needs Release read/write scope). Also needed for Azure Pipelines with multiple source repositories or to use the build stage's start time."
        },
        {
            "name": "backfillCommits",
            "type": "boolean",
            "label": "Backfill Commits",
            "defaultValue": false,
            "required": true,
            "helpMarkDown": "Associates all commits between the last jellyfish deployment and this one. Used for Azure Pipelines/Build runs. In Classic Releases this value is ignored - baseline state is auto-detected via a release-definition variable."
        },
        {
            "name": "isTesting",
            "type": "boolean",
            "label": "Is Dry Run",
            "defaultValue": true,
            "required": true,
            "helpMarkDown": "Dry runs do not save data in jellyfish"
        }
    ],
    "execution": {
        "Node20_1": {
            "target": "index.js"
        },
        "Node10": {
            "target": "index.js"
        }
    },
    "visibility": [
        "Build",
        "Release"
    ],
    "runsOn": [
        "Agent",
        "DeploymentGroup"
    ]
}
```

## Testing checklist

1. Replace the two files in `buildandreleasetask/`, run `tsc`, package the VSIX, install in your Azure DevOps org.
2. Add the task to a **Classic Release** and supply an `adoPat` with Release read/write scope. Leave `Backfill Commits` at `false` — it's ignored.
3. Run the release once. Confirm in the task log: `Baseline: jellyfishBaselined is 'unset' -> using backfillCommits=false (first run, will flip after publish)` followed by `Flipping jellyfishBaselined to 'true'...`.
4. Open the release **definition** → Variables and confirm `jellyfishBaselined = true`.
5. Run a second release. Confirm the log shows `Baseline: jellyfishBaselined is 'true' -> using backfillCommits=true`.
6. Force a publish failure (bad API key) on a fresh definition and confirm the flip is **skipped** — the baseline stays unset and retries next release.
