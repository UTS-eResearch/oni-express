/*
  This file is for you to run the indexer locally in the case the rest API is disabled.
  Run it as node app_index.js <<where is your config/express.json>>
 */

const configFile = process.argv[2] || './config/express.json';
const config = require(configFile)[process.env.NODE_ENV || 'development'];
const indexer = require('./controllers/indexer');

console.log('Using indexer config defined in express.json file: ' + config['indexer']);

(async () => {
  await indexer.buildSchema({indexer: config['indexer']});
  await indexer.index({indexer: config['indexer']});
})();

