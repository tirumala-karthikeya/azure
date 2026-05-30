import ma = require('azure-pipelines-task-lib/mock-answer');
import tmrm = require('azure-pipelines-task-lib/mock-run');
import path = require('path');
import nock = require('nock');
require('./common');

let taskPath = path.join(__dirname, '..', 'index.js');
let tmr: tmrm.TaskMockRunner = new tmrm.TaskMockRunner(taskPath);

const organization = "nextech-systems";
const project = "icp-intellechartpro";
const projectId = "d73144da-a092-4b3d-9155-9744b35b85cd";
const releaseId = "13807";

nock(`https://nextech-systems.vsrm.visualstudio.com`)
  .get(`/${projectId}/_apis/release/releases/${releaseId}?api-version=6.1-preview.8`)
  .reply(200, {
    createdOn: "2021-12-01T11:43:49.8887675Z",
    artifacts: [
      {
        definitionReference: {
          repository: {
            name: "nextechSystems/nextech-mfa-api"
          },
          sourceVersion: {
            id: "65bd8a3a9e9a64b591f959f94ec8e639719a3a61"
          }
        }
      }
    ]
  });

nock(`https://webhooks.jellyfish.co`)
  .post(`/deployment`, (body) => true)
  .reply(200, "Success!"); // no joke, that's what they send back. 
  
tmr.setInput('isTesting', 'true');
tmr.setInput('jellyfishKey', 'foo');
tmr.setInput('backfillCommits', 'false');

process.env["RELEASE_RELEASEID"] = releaseId;
process.env["RELEASE_RELEASEWEBURL"] = "https://dev.azure.com/nextech-systems/f3325c6c/_release?releaseId=13807&_a=release-summary";
process.env["RELEASE_RELEASEURI"] = `vstfs://ReleaseManagement/Release/${releaseId}`;
process.env["SYSTEM_TEAMFOUNDATIONCOLLECTIONURI"] = "https://dev.azure.com/nextech-systems/";
process.env["SYSTEM_TEAMFOUNDATIONSERVERURI"] = "https://nextech-systems.vsrm.visualstudio.com/";
process.env["SYSTEM_TEAMPROJECTID"] = projectId;
process.env["SYSTEM_TEAMPROJECT"] = "icp-intellechartpro";
process.env["SYSTEM_ACCESSTOKEN"] = "";
process.env["BUILD_BUILDURI"] = "";
process.env["BUILD_BUILDID"] = "";

tmr.run();