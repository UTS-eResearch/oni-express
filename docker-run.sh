#!/bin/bash

## Run commands to make deploy similar to cloud in
## stand-alone containers

DCK_PRE=sf #DCK_PRE or docker prefix to identify docker group
VOL_BASE="/Volumes/simon_seafood_testing/arkisto"
VOL_OCFL="$VOL_BASE/oni-express/ocfl/"
VOL_CONFIG="$VOL_BASE/oni-express/config/"

PORT=8080
NETWORK=${DCK_PRE}-main

docker network create --driver bridge ${NETWORK}

docker run --rm -p 127.0.0.1:11211:11211 \
--name ${DCK_PRE}-memcached \
-d \
--network ${NETWORK} \
memcached

# For MacOS creating a docker volume that we can identify
# For Linux this is not required and can use a bind mount
# replace '-v solr_ocfl' with ${VOL_SOLR}
# and chmod 8983:8983 ${VOL_SOLR} directory
# more here https://docs.docker.com/docker-for-mac/osxfs/

docker volume create ${DCK_PRE}-solr_ocfl

docker run --rm -p 127.0.0.1:8983:8983 \
-v ${DCK_PRE}-solr_ocfl:/var/solr:delegated \
--name ${DCK_PRE}-solr \
--network ${NETWORK} \
-d \
solr:8 \
solr-precreate ocfl

docker run --rm -p 127.0.0.1:${PORT}:${PORT} \
-e NODE_ENV=development \
-v ${VOL_CONFIG}:/etc/share/config  \
-v ${VOL_OCFL}:/etc/share/ocfl \
--name ${DCK_PRE}-oni-express \
--network ${NETWORK} \
-d \
oni-express

echo "open http://localhost:${PORT}"
