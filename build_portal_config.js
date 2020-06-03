#!/bin/env node

// Script which takes the facet configuration for oni-indexer and uses it to build the facets
// section of the config for oni-portal.

// This is here because it's the Docker build process for oni-express which runs the webpack
// process that builds the portal and injects its config.

const _ = require('lodash');
const fs = require('fs-extra');
const oi = require('oni-indexer');
const winston = require('winston');

const consoleLog = new winston.transports.Console();
const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.simple(),
  transports: [ consoleLog ]
});


var argv = require('yargs')
    .usage('Usage: $0 [options]')
    .describe('i', 'Indexer config file')
    .alias('i', 'indexer')
    .string('i')
    .describe('b', 'Base portal config file')
    .alias('b', 'base')
    .string('b')
    .describe('p', 'Portal config file')
    .alias('p', 'portal')
    .string('p')
    .help('h')
    .alias('h', 'help')
    .argv;

main(argv);

async function main (argv) {
  logger.debug(`Loading indexing config from ${argv.indexer}`);
  const indexcf = await readConf(argv.indexer);
  if( !indexcf ) {
    logger.error("Exiting");
    process.exit(-1);
  }
  if( argv.base ) {
    indexcf['portal']['base'] = argv.base;
  }
  if( argv.portal ) {
    indexcf['portal']['config'] = argv.portal;
  }

  logger.debug(`Loading base portal config from ${indexcf['portal']['base']}`);
	const basecf = await readConf(indexcf['portal']['base']);
  if( !basecf ) {
    logger.error("Exiting");
    process.exit(-1);
  }

	const indexer = new oi.CatalogSolr(logger);
  indexer.setConfig(indexcf['fields']);

	await makePortalFacets(argv.indexer, indexcf, indexer.facets);
}


async function makePortalFacets(indexfile, cf, facets) {
  const portal = cf['portal'];

  const newFacets = {};

  for( let type in facets ) {
    for( let field in facets[type] ) {
      const facetField = facets[type][field]['facetField'];
      if( portal['facetDefaults'] ) {
        newFacets[facetField] = _.cloneDeep(portal['facetDefaults']);
      } else {
        newFacets[facetField] = {}; 
      };
      newFacets[facetField]['field'] = field;
      newFacets[facetField]['label'] = field[0].toUpperCase() + field.substr(1);
    }
  }

  let portalcf = await readConf(portal['config']);
  let portalbase = "portal config " + portal['config'];

  if( portalcf ) {
    logger.info(`Updating facets in existing portal config ${portal['config']}`);
  } else {
    logger.info(`Creating new portal config based on ${portal['base']}`);
    portalcf = await readConf(portal['base']);
    if( ! portalcf ) {
      logger.error("Can't read either existing portal config or portal base: exit");
      process.exit(-1)
    }
    portalbase = "portal base config "+ portal['base'];
  }

  const ts = new Date();

  portalcf['meta'] = {
    'timestamp': ts
  };

  if( portalcf['pages'] && portalcf['pages']['about'] ) {
    portalcf['pages']['about']['text'] += `<hr/> <p>Built from ${indexfile} and ${portalbase} at ${ts.toLocaleString()}</p>`;
  }

  for( let oldFacet in portalcf['facets'] ) {
    if( ! newFacets[oldFacet] ) {
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

  for( let newFacet in newFacets ) {
    logger.info(`Adding facet ${newFacet}`);
    portalcf['facets'][newFacet] = newFacets[newFacet];
    portalcf['results']['searchFacets'].push(newFacet);
    portalcf['results']['resultFacets'].push(newFacet);
  }


  await fs.writeJson(portal['config'], portalcf, { spaces:2 });

  logger.info(`Wrote new portal config to ${portal['config']}`);

}



async function readConf(portalcf) {
  try {
    const conf = await fs.readJson(portalcf);
    return conf;
  } catch(e) {
    logger.info(`Couldn't read JSON from ${portalcf}`);
    return null;
  }
}

