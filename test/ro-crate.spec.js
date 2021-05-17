const assert = require('assert');
const expect = require('chai').expect;
const _ = require('lodash');
const path = require('path');
const fs = require('fs-extra');
const ROCrateIndexer = require('../services/ROCrateIndexer');
const rocrate = require('ro-crate');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
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

describe('converting ro-crates to solr documents', function () {
  const test_data = path.join(process.cwd(), 'test-data');

  it('converts an RO-crate to a solr document with facets', async function () {
    const cf_file = path.join(test_data, 'fields.json');
    const ca = await fs.readJson(path.join(test_data, 'vic-arch-ro-crate-metadata.jsonld'));
    const indexer = await initIndexer(cf_file);

    const solrObject = await indexer.createSolrDocument(ca, '@graph');

    expect(solrObject['Dataset'][0]['record_type_s'][0]).to.equal('Dataset');
    const dsSolr = solrObject['Dataset'][0];

    expect(dsSolr).to.have.property("Dataset_publisher_facet");
    expect(dsSolr).to.have.property("Dataset_datePublished_facet");
  });


  it('can index a field under an alias using index_as', async function () {
    const cf_file = path.join(test_data, 'fields_alias.json');
    const ca = await fs.readJson(path.join(test_data, 'vic-arch-ro-crate-metadata.jsonld'));
    const indexer = await initIndexer(cf_file);

    const solrObject = await indexer.createSolrDocument(ca, '@graph');

    expect(solrObject['Dataset'][0]['record_type_s'][0]).to.equal('Dataset');
    const dsSolr = solrObject['Dataset'][0];

    await fs.writeJson(path.join(test_data, 'dump_alias_solr.json'), dsSolr, { spaces: 2 });

    expect(dsSolr).to.have.property("lead");
    expect(dsSolr).to.have.property("Dataset_lead_facetmulti");
  });



  it('indexes an "about" relation split by FOR and SEO codes', async function () {
    const cf_file = path.join(test_data, 'fields-index-matching.json');
    const jsonld = await fs.readJson(path.join(test_data, 'FOR-codes-ro-crate-metadata.jsonld'));
    const indexer = await initIndexer(cf_file);

    const crate = new rocrate.ROCrate(jsonld);
    crate.index();

    const root = crate.getRootDataset();

    // get lists of the FOR and SEO ids from the original ro-crate
    const orig_fors = root['about'].map((i) => i['@id']).filter((i) => i ? i.match(/anzsrc-for/) : false);
    const orig_seos = root['about'].map((i) => i['@id']).filter((i) => i ? i.match(/anzsrc-seo/) : false);

    const solrObject = await indexer.createSolrDocument(jsonld, '@graph');

    expect(solrObject['Dataset'][0]['record_type_s'][0]).to.equal('Dataset');
    const dsSolr = solrObject['Dataset'][0];

    await fs.writeJson(path.join(test_data, 'dump_about_solr.json'), dsSolr, { spaces: 2 });

    expect(dsSolr).to.have.property('FOR');
    expect(dsSolr['FOR']).to.be.an('array');
    expect(dsSolr['FOR']).to.have.lengthOf(orig_fors.length);

    expect(dsSolr).to.have.property('SEO');
    expect(dsSolr['SEO']).to.be.an('array');
    expect(dsSolr['SEO']).to.have.lengthOf(orig_seos.length);


  });

  it('facets on FOR and SEO codes', async function () {
    const cf_file = path.join(test_data, 'fields-index-matching.json');
    const jsonld = await fs.readJson(path.join(test_data, 'FOR-codes-ro-crate-metadata.jsonld'));
    const indexer = await initIndexer(cf_file);

    const crate = new rocrate.ROCrate(jsonld);
    crate.index();

    const root = crate.getRootDataset();

    const solrObject = await indexer.createSolrDocument(jsonld, '@graph');

    expect(solrObject['Dataset'][0]['record_type_s'][0]).to.equal('Dataset');
    const dsSolr = solrObject['Dataset'][0];


    expect(dsSolr).to.have.property("Dataset_FOR_facetmulti");
    expect(dsSolr).to.have.property("Dataset_SEO_facetmulti");
  });


  // TODO: test this more thoroughly

  it('sets the JSON flag against resolved facets based on config', async function () {
    const cf_file = path.join(test_data, 'fields.json');

    const indexer = await initIndexer(cf_file);

    const facetcf = indexer.facets;

    expect(facetcf['Dataset']['author']).to.have.property('JSON').that.is.true;
    expect(facetcf['Dataset']['keywords']).to.have.property('JSON').that.is.false;

  });


  it('normalises JSON facets to an id and a display value', async function () {
    const cf_file = path.join(test_data, 'fields.json');
    const jsonld = await fs.readJson(path.join(test_data, 'vic-arch-ro-crate-metadata.jsonld'));
    const indexer = await initIndexer(cf_file);

    const crate = new rocrate.ROCrate(jsonld);
    crate.index();

    const root = crate.getRootDataset();

    const solrObject = await indexer.createSolrDocument(jsonld, '@graph');

    expect(solrObject['Dataset'][0]['record_type_s'][0]).to.equal('Dataset');
    const dsSolr = solrObject['Dataset'][0];

    expect(dsSolr).to.have.property("Dataset_author_facetmulti");

    const authorFacets = dsSolr['Dataset_author_facetmulti'];

    expect(authorFacets).to.have.lengthOf(root['author'].length);


    for( let author of root['author'] ) {
      const id = author['@id'];
      const authorItem = crate.getItem(id);
      const facets = authorFacets.filter((f) => {
        const jfacet = JSON.parse(f);
        return jfacet['@id'] === id
      });
      expect(facets).to.not.be.empty;
      const resolved = {
        "@id": authorItem['@id'],
        "search": authorItem['@id'],
        "display": authorItem['name']
      }
      expect(JSON.parse(facets[0])).to.deep.equal(resolved);
    }

  });



});
