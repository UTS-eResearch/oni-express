const assert = require('assert');
const _ = require('lodash');
const path = require('path');
const fs = require('fs-extra');
const randomize = require('../services/randomize');
const ROCrateIndexer = require('../services/ROCrateIndexer');
const winston = require('winston');

const logger = winston.createLogger({
  format: winston.format.simple(),
  transports: [
    new winston.transports.Console()
  ]
});


let sourcedata = {};
let datapubs = [];

const rocrateDirPath = path.join(process.cwd(), './test-data/rocrates');
const fieldsPath = path.join(process.cwd(), '/test-data/', 'fields.json');


before(async () => {
  await fs.ensureDir(rocrateDirPath);
  sourcedata = await randomize.loadsourcedata('./vocabularies');
});

let jsonld = null;

describe('create random ro-crates', function () {
  it('randomize 1 rocrate', async function () {
    datapubs = randomize.randdatapubs(1, sourcedata);
    const id = await randomize.makedir(rocrateDirPath);
    await randomize.makerocrate(rocrateDirPath, datapubs[0], id);
    jsonld = await fs.readJson(path.join(rocrateDirPath, id, 'ro-crate-metadata.jsonld'));
    assert.notStrictEqual(jsonld['@graph'], undefined, 'ro-crate not created');
  });
});

// I don't want to rewrite these now (ML 2-10-2020)

describe.skip('catalog', function () {
  let catalog = {};

  before(function () {
    indexer = new ROCrateIndexer(logger);
  });

  describe('load config fields', function () {
    it('should get config fields', function () {
      const fields = require(fieldsPath);
      const isConfig = indexer.setConfig(fields);
      assert.strictEqual(isConfig, true, 'Config not complete');
    });
  });

  describe('graph - dataset', function () {
    it('should load the graph into a dataset', function () {

      const caPath = path.join(process.cwd() + '/test-data', 'CATALOG.json');
      const ca = require(caPath);

      const fieldConfig = indexer.config;

      let graphElement = _.find(graph, (g) => {
        return _.find(g['@type'], (gg) => gg === 'Dataset') ? g : undefined;
      });

      const dataset = indexer.getGraphElement(fieldConfig['Dataset'], graph, graphElement);

      assert.strictEqual(dataset.record_type_s, 'Dataset', 'Dataset not loaded');
    });
  });

  describe('graph - person', function () {
    it('should load the graph into a Person', function () {

      const caPath = path.join(process.cwd() + '/test-data', 'CATALOG.json');
      const ca = require(caPath);

      const fieldConfig = indexer.config;

      let graphElement = _.find(graph, (g) => {
        return _.find(g['@type'], (gg) => gg === 'Person') ? g : undefined;
      });

      const person = indexer.getGraphElement(fieldConfig['Person'], graph, graphElement);

      assert.strictEqual(person.record_type_s, 'Person', 'Person not loaded');
    });
  });

  describe('graph - indexer solr', function () {
    it('should load the graph into a indexer solr array', function () {

      const caPath = path.join(process.cwd() + '/test-data', 'CATALOG.json');
      const ca = require(caPath);

      const fieldConfig = indexer.config;

      //Peter's idea is to convert everything into an array then it is safer to work to convert
      const graph = _.each(ca['@graph'], (g) => {
        return indexer.ensureObjArray(g);
      });

      const solrJSON = {};
      _.each(fieldConfig, (field, name) => {
        let graphElement = _.filter(graph, (g) => {
          return _.find(g['@type'], (gg) => gg === name) ? g : undefined;
        });
        if (graphElement) {
          _.each(graphElement, (ge) => {
            if (Array.isArray(solrJSON[name])) {
              solrJSON[name].push(indexer.getGraphElement(fieldConfig[name], graph, ge));
            } else {
              solrJSON[name] = [indexer.getGraphElement(fieldConfig[name], graph, ge)];
            }
          });
        }
      });

      assert.strictEqual(solrJSON.Dataset[0].record_type_s, 'Dataset', 'dataset not loaded');
      assert.strictEqual(solrJSON.Person[0].record_type_s, 'Person', 'person 1 not loaded');
      assert.strictEqual(solrJSON.Person[3].record_type_s, 'Person', 'person 1 not loaded');

    });
  });

  describe('farm to freeways graph - indexer solr', function () {
    it('should load the graph into a indexer solr array', function () {

      const caPath = path.join(process.cwd() + '/test-data', 'FARMTOFREEWAYS_CATALOG.json');
      const ca = require(caPath);

      const fieldConfig = indexer.config;

      //Peter's idea is to convert everything into an array then it is safer to work to convert
      const graph = _.each(ca['@graph'], (g) => {
        return indexer.ensureObjArray(g);
      });

      const solrJSON = {};
      _.each(fieldConfig, (field, name) => {
        let graphElement = _.filter(graph, (g) => {
          return _.find(g['@type'], (gg) => gg === name) ? g : undefined;
        });
        if (graphElement) {
          _.each(graphElement, (ge) => {
            if (Array.isArray(solrJSON[name])) {
              solrJSON[name].push(indexer.getGraphElement(fieldConfig[name], graph, ge));
            } else {
              solrJSON[name] = [indexer.getGraphElement(fieldConfig[name], graph, ge)];
            }
          });
        }
      });

      assert.strictEqual(solrJSON.Dataset[0].record_type_s, 'Dataset', 'dataset not loaded');
      assert.strictEqual(solrJSON.Person[0].record_type_s, 'Person', 'person 1 not loaded');
      assert.strictEqual(solrJSON.Person[3].record_type_s, 'Person', 'person 1 not loaded');

    });
  });

});

after(() => {
  //fs.remove(rocrateDirPath);
});


