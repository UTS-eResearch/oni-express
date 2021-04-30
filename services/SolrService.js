const axios = require('axios');

const sleep = ms => new Promise((r, j) => {
  setTimeout(r, ms * 1000);
});

async function buildSchema(logger, schema, fields) {
  try {
    logger.debug(`Building Solr schema on ${schema}`);
    schema['copyfield'] = [];
    for (let ms_field of fields['main_search']) {
      schema['copyfield'].push({
        "source": ms_field,
        "dest": ["main_search"]
      });
    }
    return schema;
  } catch (e) {
    logger.error(`Error building Solr schema: ${e}`);
    return null;
  }
}

async function updateSchema(logger, solrURL, schemaConf) {

  for (const type of Object.keys(schemaConf)) {
    for (const field of schemaConf[type]) {
      logger.debug(`Setting schema field ${type} ${JSON.stringify(field)}`);
      await setSchemaField(solrURL, type, field);
    }
  }
}

async function checkSolr(logger, solrPing, retries, retryInterval) {
  for (let i = 0; i < retries; i++) {
    logger.debug(`Pinging Solr ${solrPing} - attempt ${i + 1} of ${retries}`)
    try {
      const response = await axios({
        url: solrPing,
        method: 'get',
        responseType: 'json'
      });
      if (response.status == 200) {
        if (response.data['status'] === 'OK') {
          logger.info("Solr is up!");
          return true;
        }
      }
    } catch (e) {
      logger.debug("Waiting for Solr to start");
    }
    await sleep(retryInterval);
  }
  logger.error(`Couldn't connect to Solr after ${retries} connection attempts`);
  return false;
}


function commitDocs(solrURL, args, cf) {
  return axios({
    url: solrURL + args,
    method: 'get',
    responseType: 'json',
    timeout: cf['timeout'] * 1000,
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}

function updateDocs(solrURL, coreObjects, cf) {
  return axios({
    url: solrURL + '/docs',
    method: 'post',
    data: coreObjects,
    responseType: 'json',
    timeout: cf['timeout'] * 1000,
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  });
}

async function purgeSolr(logger, solrUpdate) {

  try {
    const response = await axios({
      url: solrUpdate + '?commit=true',
      method: 'post',
      data: '{ "delete": { "query": "*:*"} }',
      responseType: 'json',
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      }
    });
    logger.info("All solr documents deleted.");
    return true
  } catch (e) {
    if (e.response) {
      logger.error("Solr error");

      logger.error(e.response.status);
      return false;
    } else {
      log.error("General error");
      log.error(e);
      process.exit(-1);
    }
  }
}

module.exports = {buildSchema, updateSchema, checkSolr, commitDocs, updateDocs, purgeSolr};

async function setSchemaField(solrURL, fieldtype, schemaJson) {
  const url = solrURL + '/' + fieldtype + 's';
  const schemaAPIJson = {};
  const name = schemaJson['name'];

  // solr copyfields are annoying because they don't have a name and
  // can't be replaced, so I'm trying to delete them and ignoring errors.

  if (fieldtype === 'copyfield') {
    logger.debug(`Schema: deleting copyfield ${JSON.stringify(schemaJson)}`);
    await tryDeleteCopyField(solrURL, schemaJson);
    schemaAPIJson['add-copy-field'] = schemaJson;
  } else {
    const apifield = (fieldtype === 'field') ? 'field' : 'dynamic-field';
    if (await schemaFieldExists(url, name)) {
      logger.debug(`Schema: replacing ${fieldtype} ${name}`);
      schemaAPIJson['replace-' + apifield] = schemaJson;
    } else {
      logger.debug(`Schema: adding ${fieldtype} ${name}`);
      schemaAPIJson['add-' + apifield] = schemaJson;
    }
  }

  try {
    logger.debug(`Posting to schema API ${url} ${JSON.stringify(schemaAPIJson)}`);
    const response = await axios({
      url: solrURL,
      method: 'post',
      data: schemaAPIJson,
      responseType: 'json',
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      }
    });
  } catch (e) {
    logger.error("Error updating schema");
    logger.error(`URL: ${url}`);
    logger.info(`schemaAPIJson: ${JSON.stringify(schemaAPIJson)}`);
    if (e.response) {
      logger.error(`${e.response.status} ${e.response.statusText}`);
    } else {
      logger.error(e);
    }
  }
}


async function schemaFieldExists(solrURL, field) {
  const url = solrURL + '/' + field;
  try {
    const resp = await axios({
      url: url,
      method: 'get',
      responseType: 'json',
    });
    logger.debug("Schema field " + field + " already exists");
    return true;
  } catch (e) {
    if (e.response.status === 404) {
      logger.debug("Schema field " + field + " not found");
      return false;
    } else {
      logger.error("unknown error " + e);
      throw(e);
      return false;
    }
  }
}

async function tryDeleteCopyField(solrURL, copyFieldJson) {
  try {
    const resp = await axios({
      url: solrURL,
      method: 'post',
      data: {"delete-copy-field": {source: copyFieldJson['source'], dest: copyFieldJson['dest']}},
      responseType: 'json',
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      }
    });
    logger.debug("copyfield removed");
    return true;
  } catch (e) {
    if (e.response) {
      if (e.response.status === 404) {
        logger.error("Schema field " + field + " not found");
        return false;
      }
      if (e.response.status === 400) {
        // we assume that a bad request indicates that we were trying to
        // delete a copyfield which hadn't been defined yet, which isn't
        // an error
        logger.info("copy field returned 400 - this usually isn't an error");
        return true;
      }
    } else {
      logger.error("unknown error " + e);
      return false;
    }
  }
}
