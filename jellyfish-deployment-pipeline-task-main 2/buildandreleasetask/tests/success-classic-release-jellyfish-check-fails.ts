import ma = require('azure-pipelines-task-lib/mock-answer');
import tmrm = require('azure-pipelines-task-lib/mock-run');
import path = require('path');
import nock = require('nock');
require('./common');

let taskPath = path.join(__dirname, '..', 'index.js');
let tmr: tmrm.TaskMockRunner = new tmrm.TaskMockRunner(taskPath);

// Fail-open safety test:
// - Jellyfish GET endpoint returns 405 Method Not Allowed (simulating the case where the GET
//   API we assumed doesn't actually exist).
// - Expected: task does NOT crash and does NOT block publishing. The check defaults to "not found"
//   and the existing publish flow runs as normal -> POST succeeds -> task succeeds.
// This guarantees that if our assumptions about the Jellyfish GET API turn out wrong in production,
// the worst case is "no skipping happens" - never "nothing publishes".

const organization = "nextech-systems";
const project = "icp-intellechartpro";
const projectId = "d73144da-a092-4b3d-9155-9744b35b85cd";
const releaseId = "13807";
const releaseDefinitionId = "42";

nock(`https://nextech-systems.vsrm.visualstudio.com`)
  .get(`/${projectId}/_apis/release/definitions/${releaseDefinitionId}?api-version=6.0`)
  .reply(200, {
    id: parseInt(releaseDefinitionId, 10),
    variables: {}
  });

nock(`https://nextech-systems.vsrm.visualstudio.com`)
  .put(`/${projectId}/_apis/release/definitions/${releaseDefinitionId}?api-version=6.0`, () => true)
  .reply(200, {
    id: parseInt(releaseDefinitionId, 10),
    variables: { jellyfishBaselined: { value: 'true', allowOverride: true } }
  });

// Jellyfish GET fails - simulating GET not supported / API changed / network issue.
// Code should fail-open and treat as "not found" -> proceed to publish.
nock(`https://webhooks.jellyfish.co`)
  .persist()
  .get(`/deployment`)
  .query(true)
  .reply(405, "Method Not Allowed");

nock(`https://nextech-systems.vsrm.visualstudio.com`)
  .get(`/${projectId}/_apis/release/releases/${releaseId}?api-version=6.1-preview.8`)
  .reply(200, {
    createdOn: "2021-12-01T11:43:49.8887675Z",
    artifacts: [
      {
        definitionReference: {
          repository: { name: "nextechSystems/nextech-mfa-api" },
          sourceVersion: { id: "65bd8a3a9e9a64b591f959f94ec8e639719a3a61" }
        }
      }
    ]
  });

// POST should be attempted (fail-open published anyway) and succeed.
nock(`https://webhooks.jellyfish.co`)
  .post(`/deployment`, () => true)
  .reply(200, "Success!");

tmr.setInput('isTesting', 'true');
tmr.setInput('jellyfishKey', 'foo');
tmr.setInput('backfillCommits', 'false');
tmr.setInput('adoPat', 'fake-pat-for-tests');

process.env["RELEASE_RELEASEID"] = releaseId;
process.env["RELEASE_RELEASEWEBURL"] = "https://dev.azure.com/nextech-systems/f3325c6c/_release?releaseId=13807&_a=release-summary";
process.env["RELEASE_RELEASEURI"] = `vstfs://ReleaseManagement/Release/${releaseId}`;
process.env["RELEASE_DEFINITIONID"] = releaseDefinitionId;
process.env["SYSTEM_TEAMFOUNDATIONCOLLECTIONURI"] = "https://dev.azure.com/nextech-systems/";
process.env["SYSTEM_TEAMFOUNDATIONSERVERURI"] = "https://nextech-systems.vsrm.visualstudio.com/";
process.env["SYSTEM_TEAMPROJECTID"] = projectId;
process.env["SYSTEM_TEAMPROJECT"] = "icp-intellechartpro";
process.env["SYSTEM_ACCESSTOKEN"] = "";
process.env["BUILD_BUILDURI"] = "";
process.env["BUILD_BUILDID"] = "";

tmr.run();
