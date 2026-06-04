import * as path from 'path';
import * as assert from 'assert';
import * as ttm from 'azure-pipelines-task-lib/mock-test';

describe('Pipeline Flow', function () {

    before( function() {

    });

    after(() => {

    });

    it('should succeed with multiple repositories', function(done: Mocha.Done) {
        this.timeout(3000);
    
        let tp = path.join(__dirname, 'success-pipeline-multi-repo.js');
        let tr: ttm.MockTestRunner = new ttm.MockTestRunner(tp);
    
        tr.run();
        assert.equal(tr.succeeded, true, 'should have succeeded');
        assert.equal(tr.warningIssues.length, 0, "should have no warnings");
        assert.equal(tr.errorIssues.length, 0, "should have no errors");
        done();
    });

    it('should succeed with multiple repositories [backfillCommits=true, isTesting=false]', function(done: Mocha.Done) {
        this.timeout(3000);
    
        let tp = path.join(__dirname, 'success-pipeline-backfill.js');
        let tr: ttm.MockTestRunner = new ttm.MockTestRunner(tp);
    
        tr.run();
        assert.equal(tr.succeeded, true, 'should have succeeded');
        assert.equal(tr.warningIssues.length, 0, "should have no warnings");
        assert.equal(tr.errorIssues.length, 0, "should have no errors");
        done();
    });
    
    it('should succeed with single repository and Built in Access Token', function(done: Mocha.Done) {
        this.timeout(3000);
    
        let tp = path.join(__dirname, 'success-pipeline.js');
        let tr: ttm.MockTestRunner = new ttm.MockTestRunner(tp);
    
        tr.run();
        assert.equal(tr.succeeded, true, 'should have succeeded');
        assert.equal(tr.warningIssues.length, 0, "should have no warnings");
        assert.equal(tr.errorIssues.length, 0, "should have no errors");
        done();
    });

    it('should fall back to single repository when multi rep 404s', function(done: Mocha.Done) {
        this.timeout(3000);
    
        let tp = path.join(__dirname, 'failure-pipeline-404-noPat.js');
        let tr: ttm.MockTestRunner = new ttm.MockTestRunner(tp);
    
        tr.run();
        assert.equal(tr.succeeded, true, 'should have succeeded');
        assert.equal(tr.warningIssues.length, 0, "should have no warnings");
        assert.equal(tr.errorIssues.length, 0, "should have no errors");
        done();
    });
    
    

    it('should fail when azure not authorized', function(done: Mocha.Done) {
        this.timeout(3000);
    
        let tp = path.join(__dirname, 'failure-pipeline-401-azure.js');
        let tr: ttm.MockTestRunner = new ttm.MockTestRunner(tp);
    
        tr.run();
        assert.equal(tr.succeeded, false, 'should have failed');
        assert.equal(tr.warningIssues.length, 0, "should have no warnings");
        assert.equal(tr.errorIssues.length, 1, "should have 1 error issue");
        assert.equal(tr.errorIssues[0], 'Status Code (https://dev.azure.com/nextech-systems/icp-intellechartpro/_apis/build/definitions/100?api-version=6.0): 401', 'error issue output');
        done();
    });

    it('should fail when jellyfish not authorized', function(done: Mocha.Done) {
        this.timeout(3000);
    
        let tp = path.join(__dirname, 'failure-pipeline-401-jellyfish.js');
        let tr: ttm.MockTestRunner = new ttm.MockTestRunner(tp);
    
        tr.run();
        assert.equal(tr.succeeded, false, 'should have failed');
        assert.equal(tr.warningIssues.length, 0, "should have no warnings");
        assert.equal(tr.errorIssues.length, 1, "should have 1 error issue");
        assert.equal(tr.errorIssues[0], 'Status Code (https://webhooks.jellyfish.co/deployment): 401', 'error issue output');
        done();
    });
});


describe('Classic Release', function () {

    before( function() {

    });

    after(() => {

    });

    it('should succeed when release successful', function(done: Mocha.Done) {
        this.timeout(3000);
    
        let tp = path.join(__dirname, 'success-classic-release.js');
        let tr: ttm.MockTestRunner = new ttm.MockTestRunner(tp);
    
        tr.run();
        assert.equal(tr.succeeded, true, 'should have succeeded');
        assert.equal(tr.warningIssues.length, 0, "should have no warnings");
        assert.equal(tr.errorIssues.length, 0, "should have no errors");
        done();
    });

    it('should succeed with multiple artifacts', function(done: Mocha.Done) {
        this.timeout(3000);
    
        let tp = path.join(__dirname, 'success-classic-release-multi-artifact.js');
        let tr: ttm.MockTestRunner = new ttm.MockTestRunner(tp);
    
        tr.run();
        assert.equal(tr.succeeded, true, 'should have succeeded');
        assert.equal(tr.warningIssues.length, 0, "should have no warnings");
        assert.equal(tr.errorIssues.length, 0, "should have no errors");
        done();
    });

    it('should fail when azure not authorized', function(done: Mocha.Done) {
        this.timeout(3000);
    
        let tp = path.join(__dirname, 'failure-classic-release-401-azure.js');
        let tr: ttm.MockTestRunner = new ttm.MockTestRunner(tp);
    
        tr.run();
        assert.equal(tr.succeeded, false, 'should have failed');
        assert.equal(tr.warningIssues.length, 0, "should have no warnings");
        assert.equal(tr.errorIssues.length, 1, "should have 1 error issue");
        assert.equal(tr.errorIssues[0], 'Status Code (https://nextech-systems.vsrm.visualstudio.com/d73144da-a092-4b3d-9155-9744b35b85cd/_apis/release/definitions/42?api-version=6.0): 401', 'error issue output');
        done();
    });

    it('should fail when jellyfish not authorized', function(done: Mocha.Done) {
        this.timeout(3000);

        let tp = path.join(__dirname, 'failure-classic-release-401-jellyfish.js');
        let tr: ttm.MockTestRunner = new ttm.MockTestRunner(tp);

        tr.run();
        assert.equal(tr.succeeded, false, 'should have failed');
        assert.equal(tr.warningIssues.length, 0, "should have no warnings");
        assert.equal(tr.errorIssues.length, 1, "should have 1 error issue");
        assert.equal(tr.errorIssues[0], 'Status Code (https://webhooks.jellyfish.co/deployment): 401', 'error issue output');
        done();
    });

    it('should skip publishing when commit matches previous release', function(done: Mocha.Done) {
        this.timeout(3000);

        let tp = path.join(__dirname, 'success-classic-release-skip-duplicate.js');
        let tr: ttm.MockTestRunner = new ttm.MockTestRunner(tp);

        tr.run();
        assert.equal(tr.succeeded, true, 'should have succeeded');
        assert.equal(tr.warningIssues.length, 0, "should have no warnings");
        assert.equal(tr.errorIssues.length, 0, "should have no errors");
        done();
    });
});