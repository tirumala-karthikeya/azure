import ma = require('azure-pipelines-task-lib/mock-answer');
import tmrm = require('azure-pipelines-task-lib/mock-run');
import path = require('path');
import nock = require('nock');
require('./common');

let taskPath = path.join(__dirname, '..', 'index.js');
let tmr: tmrm.TaskMockRunner = new tmrm.TaskMockRunner(taskPath);

const organization = "nextech-systems";
const project = "icp-intellechartpro";
const buildId = "47308";

nock(`https://dev.azure.com`)
  .get(`/${organization}/${project}/_apis/build/builds/${buildId}?api-version=6.0`)
  .reply(200, {
    status: 'completed',
    result: 'succeeded',
    finishTime: '2022-01-05T22:29:49.7486693Z',
    "startTime": "2022-01-05T22:27:47.8887675Z",
    "sourceBranch": "refs/heads/main",
    "sourceVersion": "53168f6d52f9513596a491d169d3b15fd803b011",
    "repository": {
      "id": "NextechSystems/nextech-api-health-check",
      "type": "GitHub",
      "clean": null,
      "checkoutSubmodules": false
    },
  });

nock(`https://dev.azure.com`)
  .get(`/${organization}/${project}/_build/results?buildId=${buildId}&__rt=fps&__ver=2`)
  .reply(200, {
    fps: {
      dataProviders: { 
        data: { 
          ['ms.vss-build-web.run-details-data-provider']: {
            stages: [
              {
                "id": "c0715512-5399-57dc-a145-5e72944055f9",
                "name": "Build_Main_Version_Number",
                "refName": "BVMain",
                "startTime": "\/Date(1641475414073)\/",
                "finishTime": "\/Date(1641475422003)\/",
                "state": 2,
                "result": 0,
                "stateData": {
                  "pendingDependencies": false,
                  "pendingChecks": false
                }
              },
              {
                "dependsOn": [
                  "c0715512-5399-57dc-a145-5e72944055f9"
                ],
                "id": "09c3c44d-7a5c-59e7-e53b-14298a6b39a6",
                "name": "Deploy",
                "refName": "CD",
                "startTime":  "\/Date(1641475414073)\/",
                "finishTime": "\/Date(1641475422003)\/",
                "state": 2,
                "result": 4,
                "stateData": {
                  "pendingDependencies": false,
                  "pendingChecks": false
                }
              }
            ],
            repositoryResources: [
              {
                  name: 'nextechSystems/nextech-mfa-api', 
                  version: '65bd8a3a9e9a64b591f959f94ec8e639719a3a61'
              },
              {
                  name: 'nextechSystems/nextech-mfa-api', 
                  version: '65bd8a3a9e9a64b591f959f94ec8e639719a3a61'
              }
            ]
          }
        }
      }
    }
  });

// first call
nock(`https://webhooks.jellyfish.co`)
  .post(`/deployment`, () => true)
  .reply(200, "Success!"); // no joke, that's what they send back. 

// second call
nock(`https://webhooks.jellyfish.co`)
  .post(`/deployment`, (body) => true)
  .reply(200, "Success!"); 

tmr.setInput('isTesting', 'true');
tmr.setInput('jellyfishKey', 'foo');
tmr.setInput('backfillCommits', 'false');
tmr.setInput('adoPat', 'bar');
process.env["RELEASE_RELEASEID"] = "";
process.env["RELEASE_RELEASEWEBURL"] = "";
process.env["RELEASE_RELEASEURI"] = "";
process.env["SYSTEM_TEAMFOUNDATIONCOLLECTIONURI"] = "https://dev.azure.com/nextech-systems/";
process.env["SYSTEM_TEAMFOUNDATIONSERVERURI"] = "https://nextech-systems.vsrm.visualstudio.com/";
process.env["SYSTEM_TEAMPROJECTID"] = "d73144da-a092-4b3d-9155-9744b35b85cd";
process.env["SYSTEM_TEAMPROJECT"] = "icp-intellechartpro";
process.env["SYSTEM_ACCESSTOKEN"] = "";
process.env["BUILD_BUILDURI"] = "vstfs://build-release/Build/47308";
process.env["BUILD_BUILDID"] = "47308";
process.env["SYSTEM_STAGENAME"] = "CD";
tmr.run();