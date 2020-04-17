Oni Express
===========

👹ni: a modular, scalable, searchable data repository.

Datasets are stored on disk according to the [Oxford Common File Layout - OCFL](https://ocfl.io/) - a standard for maintaining immutable, platform-independent file-based repositories.

Datasets are described using [RO-Crate](https://researchobject.github.io/ro-crate/) - a lightweight standard for research metadata based on [JSON-LD](https://json-ld.org/) and [Schema.org](https://schema.org/).

Datasets are indexed into a [Solr](https://lucene.apache.org/solr/) database, providing high-performace faceted search and discovery.

## Components

This repository contains the core component, **oni-express** - a Node web app  with three endpoints:

* a single-page app with search and browse interface
* a proxy for the Solr index
* an OCFL bridge which serves versioned datastreams from the repository

[**oni-portal**](https://github.com/UTS-eResearch/oni-portal) is the repository for the single-page app's JavaScript. There isn't any need to install it separately unless you're developing custom components: the oni-express deployment (see below) will deploy and configure the appropriate release for you.

[**oni-indexer**](https://github.com/UTS-eResearch/oni-indexer) is a stand-alone node script which traverses the OCFL repository and builds the Solr index. At present, it still needs to be installed and configured separately to oni-express. A future release will bundle oni-indexer into the Docker stack for oni-express so this won't be necessary.

A future release will make it more convenient to deploy the OCFL bridge without the web front-end, to meet use cases where the search/discovery portal is not required.

## Deploying Oni


## Configuring and indexing



## Roadmap

## History

## Oni?

The original oni 👹 is a Japanese ogre - kind of shaggy and fierce, though they have their softer side in some legends - and the name is a loose acronym:

O - OCFL Objects
n - nginx or node (or whatever else moves datastreams over the network)
i - index

It's not ONI, though, it's Oni.

