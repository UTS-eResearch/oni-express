Expert Nation
=============

Feature branch of oni-express to support the Expert Nation dataset.

This includes the config to index Expert Nation correctly at ./config/indexer.json

NOTE: this won't work with the current Docker image of the oni-indexer.

The docker-compose.yml is set up to build oni-indexer locally, in a directory
at the same level as this one ie

    ./oni-express <- the directory containing this file
    ./oni-indexer <- the right branch of oni-indexer

Clone a copy of oni-indexer and switch to the branch bugfix-expert-nation-facets

Then put the OCFL repo with the expert nation data in ./ocfl and do docker-compose build