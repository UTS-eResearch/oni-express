#!/usr/bin/env node

// Script which takes the facet configuration for oni-indexer and uses it to build the facets
// section of the config for oni-portal.

// This is here because it's the Docker build process for oni-express which runs the webpack
// process that builds the portal and injects its config.

const _ = require('lodash');
const fs = require('fs-extra');
const oi = require('oni-indexer');
const winston = require('winston');

const MANDATORY_SOLR_FIELDS = [
  "record_type_s",
  "uri_id",
  "id", 
  "description",
  "name"
];

const consoleLog = new winston.transports.Console();
const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.simple(),
  transports: [ consoleLog ]
});


var argv = require('yargs')
    .usage('Usage: $0 [options]')
    .describe('e', 'Express config file')
    .alias('e', 'express')
    .string('e')
    .default('e', 'config/express.json')
    .describe('i', 'Indexer config file')
    .alias('i', 'indexer')
    .string('i')
    .default('i', 'config/indexer.json')
    .describe('b', 'Base portal config file')
    .alias('b', 'base')
    .string('b')
    .default('b', 'config/portal.json')
    .describe('p', 'Portal config file')
    .alias('p', 'portal')
    .string('p')
    .default('p', 'config/portal_out.json')
    .help('h')
    .alias('h', 'help')
    .argv;

main(argv);

async function main (argv) {

  const expresscf = await readConf(argv.express);
  if( !expresscf ) {
    logger.error(`Couldn't read express config ${argv.express}`);
    process.exit(-1)
  }
  const indexcf = await readConf(argv.indexer);
  if( !expresscf ) {
    logger.error(`Couldn't read indexer config ${argv.indexer}`);
    process.exit(-1)
  }


  if( argv.base ) {
    indexcf['portal']['base'] = argv.base;
  }
  if( argv.portal ) {
    indexcf['portal']['config'] = argv.portal;
  }

	const basecf = await readConf(indexcf['portal']['base']);
  if( !basecf ) {
    logger.error(`Couldn't read base portal cf ${indexcf['portal']['base']}`);
    process.exit(-1)
  }

	const indexer = new oi.CatalogSolr(logger);
  indexer.setConfig(indexcf['fields']);

	const portalcf = await makePortalConfig(argv.indexer, indexcf, indexer.facets);

  // add ocfl api path

  const env = process.env.NODE_ENV || 'development';

  logger.debug(`Using node environment: ${env}`);

  const url_path = expresscf[env]['ocfl']['url_path'];
  if( url_path ) {
    logger.debug(`Setting ocfl endpoint to ${url_path}`);
    portalcf['apis']['ocfl'] = url_path;
  }

  await fs.writeJson(indexcf['portal']['config'], portalcf, { spaces:2 });

  logger.info(`Wrote new portal config to ${indexcf['portal']['config']}`);

  const solr_fl = getPortalFields(portalcf);

  if( expresscf[env]['solr_fl'] ) {
    expresscf[env]['solr_fl'] = solr_fl;
    await fs.writeJson(argv.express, expresscf, { spaces:2 });
    logger.info("Updated solr field list in express.json");

  }

}


async function makePortalConfig(indexfile, cf, facets) {
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
      if( facets[type][field]['JSON'] ) {
        newFacets[facetField]['JSON'] = true;
      }
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

  // Add facets which weren't in the original facet list.

  // default behaviour is to add everything to the two facet lists

  for( let newFacet in newFacets ) {
    logger.info(`Adding facet ${newFacet}`);
    portalcf['facets'][newFacet] = newFacets[newFacet];
    portalcf['results']['searchFacets'].push(newFacet);
    portalcf['results']['resultFacets'].push(newFacet);
  }

  // add facets to the single-item view summary and view fields

  for( let type in portalcf['results']['view'] ) {
    const typecf = portalcf['results']['view'][type];
    for( let summary of typecf['summaryFields'] ) {
      const field = summary['field'];
      const f = `${type}_${field}_facet`;
      const fm = `${type}_${field}_facetmulti`;
      logger.info(`Looking for view facet ${f} ${fm}`);
      if( portalcf['facets'][f] ) {
        summary['facet'] = f;
      } else if( portalcf['facets'][fm] ) {
        summary['facet'] = fm;
      } else {
        logger.info(".. not found");
      }
    }
  }

  return portalcf;
}

function getPortalFields(portalcf) {
  const fields = {};
  for( let facet in portalcf['facets'] ) {
    fields[facet] = 1;
  }
  for( let record_type in portalcf['results']['view'] ) {
    const v = portalcf['results']['view'][record_type];
    for( let sf of v['summaryFields'] ) {
      fields[sf['field']] = 1;
    }
    for( let vf of v['viewFields'] ) {
      fields[vf['field']] = 1;
    }
  }
  const fieldlist = MANDATORY_SOLR_FIELDS;
  for( let field in fields ) {
    if( ! fieldlist.includes(field) ) {
      fieldlist.push(field);
    }
  }
  return fieldlist;
}



async function readConf(cfFile) {
  logger.debug("Loading " + cfFile);
  try {
    const conf = await fs.readJson(cfFile);
    return conf;
  } catch(e) {
    return null;
  }
}

