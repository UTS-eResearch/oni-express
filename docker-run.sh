#!/bin/bash

## Run commands to make deploy similar to cloud in
## stand-alone containers

DCK_PRE=en #DCK_PRE or docker prefix to identify docker group
VOL_OCFL="/Users/moises/source/github/uts-eresearch/heurist2ro-crate/en_ocfl/"
VOL_CONFIG="$(pwd)/config/"
VOL_SOLR=$(pwd)/solr
sudo chown -R 8983:8983 ${VOL_SOLR}
# The command below is to allow sharing because of MacOS
# You could remove the volume and not have to do this.
# However since this is dev enviroment it will help if you need to remove the solr
# index by removing the ocfl directory
# more here https://docs.docker.com/docker-for-mac/osxfs/
sudo chmod 777 ${VOL_SOLR}
PORT=8080
NETWORK=${DCK_PRE}-main

docker network create --driver bridge ${NETWORK}

docker run --rm -p 127.0.0.1:11211:11211 \
--name ${DCK_PRE}-memcached \
-d \
--network ${NETWORK} \
memcached

docker run --rm -p 127.0.0.1:${PORT}:${PORT} \
-e NODE_ENV=development \
-v ${VOL_CONFIG}:/etc/share/config  \
-v ${VOL_OCFL}:/etc/share/ocfl \
--name ${DCK_PRE}-oni-express \
--network ${NETWORK} \
-d \
oni-express

sudo docker run --rm -p 127.0.0.1:8983:8983 \
-v ${VOL_SOLR}:/var/solr/data:Z \
--name ${DCK_PRE}-solr \
--network ${NETWORK} \
-d \
solr:8 \
solr-precreate ocfl