
const _ = require('lodash');
const path = require('path');
const fs = require('fs-extra');
const randomize = require('../services/randomize');
const ROCrateIndexer = require('../services/ROCrateIndexer');
const winston = require('winston');

const chai = require("chai");

const expect = chai.expect;


// needed for ROCrateIndexer

const logger = winston.createLogger({
  format: winston.format.simple(),
  transports: [
    new winston.transports.Console()
  ]
});


let sourcedata;
let datapubs;

const NPUBS = 20;

const CWD = process.cwd();

const VOCABPATH = path.join(CWD, 'vocabularies');
const GEOPATH = path.join(CWD, 'test-data/geo');

const CONVICTIONS = path.join(CWD, 'test-data', 'criminals');

before(async () => {
  await fs.ensureDir(GEOPATH);	
  sourcedata = await randomize.loadsourcedata(VOCABPATH);
});

let catalogjson = null;

describe('Solr indexing of random geolocations', function () {
	this.timeout(0); // can be slow
 	 it(`can create ${NPUBS} randomised publications`, async function () {
    datapubs = await randomize.randdatapubs(NPUBS, sourcedata);
    for ( let datapub of datapubs ) {
    	const pubdir = await randomize.makedir(GEOPATH);
    	await randomize.makerocrate(GEOPATH, datapub, pubdir);
    	rocjson = await fs.readJson(path.join(GEOPATH, pubdir, 'ro-crate-metadata.jsonld'));
    	expect(rocjson).to.have.property('@graph');
    }
  });
});


describe('Indexing geodata from the convictions ro-crate', function () {
	this.timeout(0);

	it(`can index geolocations`, async function () {
		const crims = await fs.readJson(path.join(CONVICTIONS, 'ro-crate-metadata.json'));
		const indexer = new ROCrateIndexer(logger);
		const config = await fs.readJson(path.join(CONVICTIONS, 'indexer.json'));
		const configured = indexer.setConfig(config['fields']);
		expect(configured).to.be.true;

		const solrDocs = await indexer.createSolrDocument(crims, null, "some-id");


		expect(solrDocs).to.not.be.empty;

		await fs.writeJson(path.join(CONVICTIONS, 'solr.json'), solrDocs, { 'spaces': 2});

	});
});

