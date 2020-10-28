Oni Express
===========

Quick start:

1. Put your OCFL repository in ./ocfl in this directory
2. Edit ./config/indexing.json to configure how your RO-crates will be indexed and faceted
3. Run > docker-compose build
4. Run > docker-compose up
5. Wait for the indexing to finish - you should see something like "oni-express_oni-indexer_1 exited with code 0" in the logs
6. Go to http://localhost:8080/

There is documentation on the solr indexing at [the oni-indexer repo](https://github.com/UTS-eResearch/oni-indexer/blob/master/doc/Solr_config.md), but it's somewhat out of date.