import ma = require('azure-pipelines-task-lib/mock-answer');
import tmrm = require('azure-pipelines-task-lib/mock-run');
import path = require('path');
import nock = require('nock');
require('./common');

let taskPath = path.join(__dirname, '..', 'index.js');
let tmr: tmrm.TaskMockRunner = new tmrm.TaskMockRunner(taskPath);

// This test verifies the skip-if-same-commit feature for Classic Releases:
// - Previous release (13806) deployed commit SHA "65bd8a3a..." for the same repo.
// - Current release (13807) has the same commit SHA.
// - Expected: task succeeds WITHOUT publishing to Jellyfish (no POST to webhooks.jellyfish.co)
//   AND WITHOUT flipping the baseline variable (no PUT to release/definitions/{id}).
// nock will throw if either is unexpectedly attempted - that's the safety guarantee we lock in.

const organization = "nextech-systems";
const project = "icp-intellechartpro";
const projectId = "d73144da-a092-4b3d-9155-9744b35b85cd";
const releaseId = "13807";
const previousReleaseId = "13806";
const releaseDefinitionId = "42";
const sameCommit = "65bd8a3a9e9a64b591f959f94ec8e639719a3a61";
const sameRepo = "nextechSystems/nextech-mfa-api";

// First-run scenario (baseline unset). Even though the commit matches the previous release,
// we should NOT flip the baseline because no publish actually happens.
nock(`https://nextech-systems.vsrm.visualstudio.com`)
  .get(`/${projectId}/_apis/release/definitions/${releaseDefinitionId}?api-version=6.0`)
  .reply(200, {
    id: parseInt(releaseDefinitionId, 10),
    variables: {}
  });

// Previous release list - returns the previous release with same commit
nock(`https://nextech-systems.vsrm.visualstudio.com`)
  .get(`/${projectId}/_apis/release/releases`)
  .query(true)
  .reply(200, {
    count: 2,
    value: [
      { id: parseInt(releaseId, 10) },
      { id: parseInt(previousReleaseId, 10) }
    ]
  });

// Detailed fetch for previous release - same commit as current
nock(`https://nextech-systems.vsrm.visualstudio.com`)
  .get(`/${projectId}/_apis/release/releases/${previousReleaseId}?api-version=6.1-preview.8`)
  .reply(200, {
    id: parseInt(previousReleaseId, 10),
    createdOn: "2021-11-30T11:43:49.8887675Z",
    artifacts: [
      {
        definitionReference: {
          repository: { name: sameRepo },
          sourceVersion: { id: sameCommit }
        }
      }
    ]
  });

// Current release - same commit
nock(`https://nextech-systems.vsrm.visualstudio.com`)
  .get(`/${projectId}/_apis/release/releases/${releaseId}?api-version=6.1-preview.8`)
  .reply(200, {
    createdOn: "2021-12-01T11:43:49.8887675Z",
    artifacts: [
      {
        definitionReference: {
          repository: { name: sameRepo },
          sourceVersion: { id: sameCommit }
        }
      }
    ]
  });

// NO Jellyfish POST mock - if our code unexpectedly tries to publish, nock will throw.
// NO PUT mock for definitions - if our code unexpectedly tries to flip baseline, nock will throw.

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
