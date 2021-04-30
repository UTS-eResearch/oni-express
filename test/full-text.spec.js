const assert = require('assert');
const expect = require('chai').expect;
const _ = require('lodash');
const path = require('path');
const fs = require('fs-extra');
const ROCrateIndexer = require('../services/ROCrateIndexer');
const rocrate = require('ro-crate');

const winston = require('winston');

const logger = winston.createLogger({
  format: winston.format.simple(),
  transports: [
    new winston.transports.Console()
  ]
});


async function initIndexer(configFile) {
  const cf = await fs.readJson(configFile);
  const indexer = new ROCrateIndexer(logger);
  indexer.setConfig(cf);
  return indexer;
}


// TODO: have this actually test a dataset and some people

describe('full text search', function () {
  const test_data = path.join(process.cwd(), 'test-data');
  const cf_file = path.join(test_data, 'fields-full-text.json');

  it.skip('indexes the full text of a file in an ro-crate', async function () {
    const ca = await fs.readJson(path.join(test_data, 'successful-grant-example.jsonld'));
    const indexer = await initIndexer(cf_file);

    const solrObject = await indexer.createSolrDocument(ca, '@graph');

    logger.info(JSON.stringify(solrObject));

    expect(solrObject).to.have.property('File');

  });



});
