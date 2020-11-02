
const expect = require('chai').expect;
const _ = require('lodash');
const path = require('path');
const fs = require('fs-extra');
const dc = require('docker-compose');

const RETRIES = 20;
const SLEEP = 5000;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function indexer_stopped() {
  let ps;
  let i = 0;
  do {
    // Note: docker-compose only applies --filter if you include the
    // --services flag: see https://github.com/docker/compose/issues/5996
    await sleep(SLEEP);
    try {
      ps = await dc.ps({
        cwd: path.join(__dirname),
        commandOptions: [
          [ "--filter", "status=running" ],
          [ "--services" ]
        ]
      });
    } catch (e) {
      console.log(`Error getting ps output:`);
      console.log(e);
    }
    i += 1;
    if( i > RETRIES ) {
      console.log(`Exceeded max retries waiting for oni-indexer`);
      return false;
    }
  } while ( ps.out.match(/oni-indexer/) );
  return true;
}



describe('basic indexing', function () {
  this.timeout(0);

  it('can start up an Oni using docker-compose', async function () {
    await dc.upAll({ cwd: path.join(__dirname), log: true});
    const indexed = await indexer_stopped();
    expect(indexed).to.be.true;
    await dc.stop({ cwd: path.join(__dirname), log: true});
  });



});
