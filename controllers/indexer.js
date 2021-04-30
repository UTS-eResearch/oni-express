const _ = require('lodash');
const ROCrateIndexer = require('../services/ROCrateIndexer');
const SolrService = require('../services/SolrService');
const ROCrate = require('ro-crate').ROCrate;
const fs = require('fs-extra');
const path = require('path');
const OCFLRepository = require('ocfl').Repository;
const uuidv1 = require('uuid/v1');
const hasha = require('hasha');
const prompts = require('prompts');
const winston = require('winston');

const consoleLog = new winston.transports.Console();
const logger = winston.createLogger({
  format: winston.format.simple(),
  transports: [consoleLog]
});

const DEFAULT_CONFIG = './config.json';

const DEFAULTS = {
  'schemaBase': './config/schema_base.json',
  'retries': 10,
  'retryInterval': 10,
  'catalogFilename': 'ro-crate-metadata.jsonld',
  'uriIds': 'hashpaths',
  'updateSchema': true,
  'hashAlgorithm': 'md5',
  'logLevel': 'warn',
  'timeout': 180
};


const sleep = ms => new Promise((r, j) => {
  setTimeout(r, ms * 1000);
});

async function buildSchema(argv) {

  let cf = await readConf(argv.indexer);
  if (!cf) {
    logger.error('Could not read indexer config');
    return {error: `Couldn't read indexer config ${argv.indexer}`}
  }
  if (cf['updateSchema']) {
    const solrUp = await SolrService.checkSolr(logger, cf['solrBase'] + '/admin/ping', cf['retries'], cf['retryInterval']);
    if (solrUp) {
      logger.info("Updating solr schema");
      const schema = await SolrService.buildSchema(logger, cf['schemaBase'], cf['fields']);
      if (schema) {
        await SolrService.updateSchema(logger, cf['solrBase'] + '/schema', schema);
      } else {
        return;
      }
    }
  } else {
    logger.info('Skipping updating solr schema');
  }
}

async function index(argv) {

  let cf = await readConf(argv.indexer);
  if (!cf) {
    return {error: `Couldn't read indexer config ${argv.indexer}`}
  }

  for (let key in DEFAULTS) {
    if (!cf[key]) {
      cf[key] = DEFAULTS[key];
      logger.info(`Using default config ${key}: ${cf[key]}`);
    }
  }

  if (cf['debug'] && cf['logLevel'] !== 'debug') {
    logger.info(`Log level changed from ${cf['logLevel']} to debug because the config has a debug section`);
    cf['logLevel'] = 'debug';
  }

  consoleLog.level = cf['logLevel'];

  if (cf['log']) {
    logger.add(new winston.transports.File(cf['log']));
    logger.debug(`Logging to file: ${JSON.stringify(cf['log'])}`);
  }

  const indexer = new ROCrateIndexer(logger, cf['debug']);

  if (!indexer.setConfig(cf['fields'])) {
    return;
  }

  const solrUpdate = cf['solrBase'] + '/update/json';

  const solrUp = await SolrService.checkSolr(logger, cf['solrBase'] + '/admin/ping', cf['retries'], cf['retryInterval']);

  if (solrUp) {
    if (!_.isUndefined(argv.p)) {
      cf['purge'] = argv.p;
    }
    if (cf['purge']) {
      logger.info("Purging all records from solr");
      await SolrService.purgeSolr(logger, solrUpdate);
    }

    logger.info(`Loading repo ${cf['ocfl']}`);

    const records = await loadFromOcfl(cf['ocfl'], cf['catalogFilename'], cf['hashAlgorithm']);

    if (cf['limit']) {
      logger.warn(`only indexing first ${cf['limit']} items`);
    }

    let count = 0;

    logger.info(`loaded ${records.length} records from ocfl`);

    for (const record of records) {
      logger.warn(`Indexing ${record['path']}`);
      const solrDocs = await indexRecords(
        indexer, cf['dump'], cf['uriIds'], cf['ocfl'], [record]
      );

      logger.info(`Got ${solrDocs.length} solr docs`);
      if (solrDocs.length < 1) {
        logger.error(`Warning: ${record['id']} returned no solr docs`);
      }
      for (let doc of solrDocs) {
        try {
          if (!doc['id']) {
            logger.error('Document without an id - skipping');
          } else {
            let skipped = false;
            if (cf['skip']) {
              if (cf['skip'].includes(doc['id'][0])) {
                logger.warn(`Skipping ${doc['id']} from cf.skip`);
                skipped = true;
              }
            }
            if (!skipped) {
              logger.info(`Updating ${doc['record_type_s']} ${doc['id']}`);
              await SolrService.updateDocs(solrUpdate, [doc], cf);
              logger.info(`Committing ${doc['record_type_s']} ${doc['id']}`);
              await SolrService.commitDocs(solrUpdate, '?commit=true&overwrite=true', cf);
              logger.debug(`Indexed ${doc['record_type_s']} ${doc['id']}`);
              if (cf['waitInterval']) {
                logger.debug(`waiting ${cf['waitInterval']}`);
                await sleep(cf['waitInterval']);
              }
            }
            count++;
            logger.info(`Sent ${count} documents of ${records.length} to Solr`);
            if (cf['limit'] && count > cf['limit']) {
              break;
            }
          }
        } catch (e) {
          logger.error(`Update failed for ${doc['id']}: ` + e);
          if (cf['dump']) {
            const cleanid = doc['id'][0].replace(/[^a-zA-Z0-9_]/g, '_');
            const dumpfn = path.join(cf['dump'], cleanid + '_error.json');

            await fs.writeJson(dumpfn, doc, {spaces: 2});
            logger.error(`Wrote solr doc to ${dumpfn}`);
          }
          if (e.response) {
            logger.error("Solr request failed with status " + e.response.status);
            const error = e.response.data.error;
            if (error) {
              logger.error(error['msg']);
              logger.error(error['metadata']);
              if (error['trace']) {
                logger.error(error['trace'].substr(0, 40));
              }
            } else {
              logger.error("No error object in response");
              logger.error(JSON.stringify(e.response.data));
            }
          } else {
            logger.error("Request failed");
            logger.error(e.message);
          }
        }
      }
    }

  } else {
    logger.error("Couldn't connect to Solr");
  }
}

async function loadFromOcfl(repoPath, catalogFilename, hashAlgorithm) {
  const repo = new OCFLRepository();
  await repo.load(repoPath);

  const objects = await repo.objects();
  const records = [];
  const catalogs = Array.isArray(catalogFilename) ? catalogFilename : [catalogFilename];

  for (let object of objects) {
    logger.info(`Loading ocfl object at ${object.path}`);
    const json = await readCrate(object, catalogFilename);
    if (json) {
      records.push({
        path: path.relative(repoPath, object.path),
        hash_path: hasha(object.path, {algorithm: hashAlgorithm}),
        jsonld: json,
        ocflObject: object
      });
    } else {
      logger.warn(`Couldn't find ${catalogFilename} in OCFL inventory for ${object.path}`);
    }
  }

  logger.info(`got ${records.length} records`);

  return records;
}

// look for the ro-crate metadata file in the ocfl object's
// inventory, and if found, try to load and parse it.
// if it's not found, returns undefined

async function readCrate(object, catalogFilename) {

  const inv = await object.getInventory();
  var headState = inv.versions[inv.head].state;

  for (let hash of Object.keys(headState)) {
    if (headState[hash].includes(catalogFilename)) {
      const jsonfile = path.join(object.path, inv.manifest[hash][0]);
      try {
        const json = await fs.readJson(jsonfile);
        return json;
      } catch (e) {
        logger.error(`Error reading ${jsonfile}`);
        logger.error(e);
        return undefined;
      }
    }
  }
  return undefined;
}


async function dumpDocs(dumpDir, jsonld, solrDocs) {
  const id = jsonld['hash_path'];
  const jsonDump = path.join(dumpDir, `${id}.json`);
  logger.debug(`Dumping solr ${jsonDump}`);
  await fs.writeJson(jsonDump, solrDocs, {spaces: 2});
}


async function indexRecords(indexer, dumpDir, uriIds, ocflPath, records) {

  const solrDocs = [];
  for (let record of records) {
    logger.info(`Indexing record ${record['path']}`);
    try {
      const jsonld = record['jsonld'];
      const docs = await indexer.createSolrDocument(record['jsonld'], async (fpath) => {
          const relpath = await record['ocflObject'].getFilePath(fpath);
          return path.join(ocflPath, record['path'], relpath);
        },
        record['hash_path']
      );
      if (docs) {
        if (dumpDir) {
          await dumpDocs(dumpDir, record, docs);
        }
        for (let t of Object.keys(docs)) {
          if (t === "Dataset") {
            docs.Dataset.forEach((dataset) => {
              dataset['path'] = record['path'];
              if (uriIds === 'hashpaths') {
                dataset['uri_id'] = record['hash_path'];
              } else {
                if (dataset['id'] && Array.isArray(dataset['id'])) {
                  dataset['uri_id'] = dataset['id'][0];
                } else {
                  logger.error("Couldn't find id for uri_id");
                }
              }
              solrDocs.push(dataset);
            });
          } else {
            docs[t].forEach((item) => {
              solrDocs.push(item);
            });
          }
        }

      }
    } catch (e) {
      logger.error(`Indexing error ${record['path']}: ${e}`);
      logger.debug(`Stack trace ${e.stack}`);
    }

  }
  indexer = null;
  return solrDocs;
}

// take the facets which have been configured for the index and
// write out a version which the frontend/portal can use

async function makePortalFacets(cf, facets) {
  const portal = cf['portal'];

  const newFacets = {};

  for (let type in facets) {
    for (let field in facets[type]) {
      const facetField = facets[type][field]['facetField'];
      if (portal['facetDefaults']) {
        newFacets[facetField] = _.cloneDeep(portal['facetDefaults']);
      } else {
        newFacets[facetField] = {};
      }
      newFacets[facetField]['field'] = field;
      newFacets[facetField]['label'] = field[0].toUpperCase() + field.substr(1);
    }
  }

  let portalcf = await readConf(portal['config']);

  if (portalcf) {
    logger.info(`Updating facets in existing portal config ${portal['config']}`);
  } else {
    logger.info(`Creating new portal config based on ${portal['base']}`);
    portalcf = await fs.readJson(portal['base']);
  }

  for (let oldFacet in portalcf['facets']) {
    if (!newFacets[oldFacet]) {
      logger.info(`Removing facet ${oldFacet}`);
      delete portalcf['facets'][oldFacet];
      _.remove(portalcf['results']['resultFacets'], (f) => f === oldFacet);
      _.remove(portalcf['results']['searchFacets'], (f) => f === oldFacet);
    } else {
      portalcf['facets'][oldFacet]['field'] = newFacets[oldFacet]['field'];
      // update the JSON selector fields
      // keep the rest of the config (sort order, limit, etc)
      delete newFacets[oldFacet];
    }
  }

  // Add facets which weren't in the original facet lst.
  // These always get added to the search and result facet list.

  for (let newFacet in newFacets) {
    logger.info(`Adding facet ${newFacet}`);
    portalcf['facets'][newFacet] = newFacets[newFacet];
    portalcf['results']['searchFacets'].push(newFacet);
    portalcf['results']['resultFacets'].push(newFacet);
  }

  await fs.writeJson(portal['config'], portalcf, {spaces: 2});

  logger.info(`Wrote new portal config to ${portal['config']}`);

}


async function readConf(portalcf) {
  try {
    const conf = await fs.readJson(portalcf);
    return conf;
  } catch (e) {
    logger.info(`Portal conf ${portalcf} not found`);
    return null;
  }
}

module.exports = {buildSchema, index};
