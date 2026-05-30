# Jellyfish Deployment Pipeline Task

[![Build Status](https://nextech-systems.visualstudio.com/icp-intellechartpro/_apis/build/status/NextechSystems.jellyfish-deployment-pipeline-task?branchName=main)](https://nextech-systems.visualstudio.com/icp-intellechartpro/_build/latest?definitionId=495&branchName=main)
[![Quality Gate Status](https://sonarqube.dev.nextech.com/api/project_badges/measure?project=jellyfish-deployment-pipeline-task&metric=alert_status&token=4b56c5f284377b6c2cb9a3029fc9d58c8028702f)](https://sonarqube.dev.nextech.com/dashboard?id=jellyfish-deployment-pipeline-task)
[![Coverage](https://sonarqube.dev.nextech.com/api/project_badges/measure?project=jellyfish-deployment-pipeline-task&metric=coverage&token=4b56c5f284377b6c2cb9a3029fc9d58c8028702f)](https://sonarqube.dev.nextech.com/dashboard?id=jellyfish-deployment-pipeline-task)
[![Market Place](https://img.shields.io/badge/Marketplace-ADO-green.svg)](https://marketplace.visualstudio.com/items?itemName=nextech-systems.jellyfish-deployment-pipeline-task)


## Overview 

• [Jellyfish DevOps Metrics](https://jellyfish.co/solutions/devops-metrics/) • [Jellyfish DevOps Overview (youtube)](https://youtu.be/kyqlpT9fz5g?t=44c)

This Azure DevOps task can be used in Azure Pipelines, Classic Builds, and Classic Releases and helps track the following [DevOps (DORA) Metrics](https://cloud.google.com/blog/products/devops-sre/using-the-four-keys-to-measure-your-devops-performance) in [Jellyfish](https://app.jellyfish.co/devops-metrics/):

- **Deployment Rate**
    > How frequently do we deploy changes?
- **Commit Change Lead Time**
    > How long does it take to go from commit to deploy?
    >
    > Median Commit Change Lead Time - Median of all commit lead times (time from commit until deployment) for all deployments that occur in a given range
    
<img src="https://user-images.githubusercontent.com/5246918/148982268-113798c8-994d-43a3-8471-8e8097edbb3c.png" width="500" />

### **!IMPORTANT NOTE!** on Commit Change Lead Time

This metric follows the definiton from the book "[Accelerate: The Science of Lean Software and DevOps: Building and Scaling High Performing Technology Organizations](https://www.amazon.com/Accelerate-Software-Performing-Technology-Organizations-ebook/dp/B07B9F83WM/ref=tmm_kin_swatch_0?_encoding=UTF8&qid=&sr=)".

> the time it takes to go from code committed to code successfully running in production

It is similar to the definition of "Process Time" provided in "[The DevOps Handbook](https://www.amazon.com/DevOps-Handbook-World-Class-Reliability-Organizations-ebook/dp/B01M9ASFQ3)"

> ... the lead time clock starts when the request is made and ends when it is fulfilled, the process time clock starts only when we begin work on the customer request - specifically it omits the time that the work is in queue, waiting to be processed.

However, it does not account for the actual start of work as this measurement starts when code is committed to git. This is important to clarify since "Lead Time For Change" is defined multiple ways in the industry. 

### How Does it Work?

For a Classic Release, this task looks at the release artifacts and finds the git commit hash and the coresponding repository name for each one. It posts these to the jellyfish deployment API along with the Release's start time as the deployment time.

## Azure DevOps Integration

### Common Integration Guidelines

1. Add the task to your Pipeline and set `backfillCommits|Backfill Commits = false`. This will allow you to baseline jellyfish with a single point of reference in your commit history without associating ALL commits in your repository to the first recorded jellyfish "Deployment". 
2. After the task runs once, edit your pipeline and set `backfillCommits|Backfill Commits = true`. Going forward, jellyfish will associate ALL commits between the current one (the one in this pipeline) and the last one published to jellyfish for a given repository with this "Deployment".

### Parameters

|Parameter|Name|Required|Description|
|---------|----|--------|-----------|
|jellyfishKey|Jellyfish Api Key|Yes| [Config -> Systems](https://app.jellyfish.co/config/systems/) -> API Token|
|adoPat|Azure DevOps PAT|No|Azure DevOps Personal Access Token (optional) [see "Azure Pipelines -With an ADO PAT" below](https://github.com/NextechSystems/jellyfish-deployment-pipeline-task#with-an-ado-pat)|
|backfillCommits|Backfill Commits|Yes| true = all commits since the last published jellyfish deployment are considered part of this deployment, false = only the current commit is part of this deployment|
|isTesting|Is Dry Run|Yes|true = do not persist deployment data in jellyfish; false = persist results deployment data in jellyfish|
|displayName|Display Name|Yes|How the task will be named in Azure DevOps|

### Classic Releases
Supports multiple release artifacts, searches for their source repositories and commit hashes. Uses the start time of the release as the deployment time for each found commit hash.

![image](https://user-images.githubusercontent.com/5246918/148984202-094f57c1-2abf-4be6-8218-fac3560e876f.png)

![image](https://user-images.githubusercontent.com/5246918/148456443-7a89ed20-1b7b-4d95-b1ad-57b79e2e0f03.png)

### Azure Pipelines

#### With an ADO PAT
Supports multiple build source repositories. Uses the start time of the build [stage](https://docs.microsoft.com/en-us/azure/devops/pipelines/process/stages?view=azure-devops&tabs=yaml) as the deployment time for each commit hash.

_NOTE: The [built in pipeline access token](https://docs.microsoft.com/en-us/azure/devops/pipelines/build/variables?view=azure-devops&tabs=yaml#systemaccesstoken) does not appear to have permissions to one of the dependent APIs making the PAT necessary. The exact set of scopes for this PAT are not currently known_

#### Without an ADO PAT
Supports a single repository source and uses the build start time as the deployment time for the commit hash.

### yaml

![yaml editor](https://user-images.githubusercontent.com/5246918/148456101-8a0b3347-08de-48a3-9b2e-447fe10e76b8.png)

```
- task: jellyfishDeploymentTask@1
  displayName: 'JellyFish Deployment'
  inputs:
    jellyfishKey: 'foo'
    adoPat: 'bar'
    backfillCommits: false
    isTesting: true
```

## Development

### Building and Running Tests

```
cd buildandreleasetask
npm install
tsc --sourceMap
npm run test
```

[VS Code](https://code.visualstudio.com/download) debugger is also integrated.

### Create Task for Marketplace

```
tfx extension create --manifest-globs vss-extension.json
```

### Docs

- [How to add a custom pipelines task extension](https://docs.microsoft.com/en-us/azure/devops/extend/develop/add-build-task?view=azure-devops)
- [AZURE-PIPELINES-TASK-LIB TYPESCRIPT API](https://github.com/microsoft/azure-pipelines-task-lib/blob/master/node/docs/azure-pipelines-task-lib.md)
- [Jellyfish API Documentation](https://app.jellyfish.co/docs/devops-metrics)
- [Example Applications](https://github.com/microsoft/azure-pipelines-tasks/tree/master/Tasks)
