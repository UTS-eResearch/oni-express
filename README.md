Oni Express
===========

Quick start:

1. Put your OCFL repository in ./ocfl in this directory
2. Edit ./config/express.json to configure the express server
3. Edit ./config/indexer.json to configure how your RO-crates will be indexed and faceted
4. Edit ./config/portal.json to configure your portal
4. Run > docker-compose build
5. Run > docker-compose up
7. Go to http://localhost:8080/
8. To index Run > curl localhost:8080/config/index/run --header "Authorization: Bearer my_token_password"

### Documentation:

Documentation located here: [doc](./doc)
