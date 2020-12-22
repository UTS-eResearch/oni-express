# Indexing config

Indexing can be thought of as a mapping from items in RO-Crates to Solr documents. Note that in Solr's terminology, a 'document' is a JSON records which corresponds to a single search result.  A single RO-Crate may generate several (thousands) of Solr documents to be indexed.

Not every item in the RO-Crates will be indexed, and not every field in the indexed items will be copied to the Solr documents. The rules governing which items are indexed, and how, are in config/indexing.json

Terminology use in this document:

FIXME - come back and complete this after a first pass through the document

* graph - RO-Crate is stored as a JSON-LD document. The graph is the 'body' of the document: it's a list of items, which may have links to each other.
* item - one of the items in the graph, typically representing a file, person, place, dataset, etc
* type - each item has a type, which is written with a capital letter: for example, Dataset, Person, etc.
* id - each item has an @id field which is unique within the RO-Crate
* field - keys of an item 
* value - values of an item
* facet - a solr document can have one or more facets, which group it in aggregated searches
* filter - criteria by which items are included in the solr document
* solr field - field in the resulting solr index

## Top level settings

### main_search

A list of the fields which will be searched by the main text search. The fields here are Solr document fields, not RO-Crate item properties, and copying fields into the main search is done with a Solr schema rule, so the order of events when indexing is:

* read RO-Crate
* index RO-Crate to a JSON document for Solr
* push the JSON document into Solr
* the main_search fields (if present) are copied into the index

Note that if a given Solr document doesn't have one or more of the main_search fields, it won't raise an error, and that if a Solr document has *none* of the main_search fields, it can't be found by using the main text search. It may still be visible via facet searches.

### map_all

An object which lists fields which are to be mapped for every indexed item, and the fields in the Solr document to which to map them. The values of this object are arrays, allowing RO-Crate fields to be mapped to more than one Solr field.

    "map_all": {
    	"@id": [ "id", "id_orig" ],
    	"@type": [ "record_type_s", "type_label" ]
    }

The default settings for "@id" and "@type" are almost always what you want here.

FIXME what happens if there's a collision between ids in a multi-RO-CRATE dataset?

## Type indexing rules

### Introduction

The "types" section is an object in which the keys are RO-Crate item types and the values are objects which control how each type of item is to be indexed.

Every RO-Crate item with a @type which has an entry in this section will be used to create a distinct Solr document in the index.

Any RO-Crate item with a @type which doesn't have an entry in this section will not be directly indexed.

FIXME - illustration here 

For example: the following types config will result in a Solr document being created for every Dataset and Person in each RO-Crate.

    "types": {
        "Dataset": {
            "author": {
                "multi": true,
                "facet": true
            }
        },
        "Person": {
            "affiliation": {
                "facet": true
            }
        }
    }

FIXME - this section might be better as the intro to the whole doc]

This is not necessarily the best way to index a collection of datasets and authors - it depends on whether you want authors (as well as datasets) to be returned as search results in their own right.

It's often more useful to create Solr documents which contain information from both a primary item and its descendants in the RO-Crate structure - for example, a Dataset index which includes data such as affiliation from the Dataset's authors. This can be done using the "resolve" field configuration item - see below for details.

It's also often useful to capture all of the contextual information about an item and stash that in the index. This is called "subgraph resolution" and is also described below.

It's possible to combine these approaches in the one index. For example, a Solr document representing a Dataset may contain contextual information about all of the Dataset's creators, and the creators may also be indexed separately as Person records so that they show up as first-class objects in search results.

TODO - some examples to link to would be good here


## Item config

By default, all of the properties of an item being indexed are copied into the Solr document. The config against an item type is used to either prevent certain values from being indexed, prevent the item itself from being indexed based on one or more filters, specify which properties are used as facets, and resolve links in the RO-Crate graph.

Here is an example of the config for items of type "Dataset"

    "Dataset": {
        "@id": { 
            "name": "public_ocfl",
            "filter": { "is_root": true }
        },
    
        "@reverse": { "skip": true },
     
        "license": {
          "multi": true,
          "facet": true
        },
    
        "author": {
          "multi": true,
          "resolve": {
            "search": "@id",
            "display": "name"
          },
          "facet": true
        }
    }

### skip

If "skip" is present and true, don't index this property. Note that this works at the level of the property, not the item. To stop whole items from being indexed based on their contents, use "filter".

### filter

"filter" is used to exclude the entire item from the index unless the property in question matches a criterion. A filter can be an exact string match or a regular expression:

    "field1": { "filter":  "./" }
    
    "field2": { "filter": { "re": "^\\./|data/$" } }

If a filter exists on multiple properties for an item, it has to pass them all to be indexed.

There's also a special filter, "is_root", which is only used on the "@id" property, and which filters out all Datasets which aren't the RO-Crate's root Dataset:

    "Dataset": {
        "@id": { "filter": { "is_root": true }}7
    }

This is useful because in RO-Crate, folders and subfolders are usually modelled as a hierarchy of Dataset items. In most cases, you do not want to index every one of these as a separate document in the Solr index.

### facet, multi

If "facet" is set to a truthy value, a facet will be created in the index based on this property.

If "multi" is truthy, the facet will be a multi-facet (one which can take multiple values in a single Solr document).

To tokenize a single property into multiple facets, set the value of "facet" to an object with a "tokenize" key. The "delim" value of this object is used as a regexp to tokeniz the strings.

    "Dataset": {
        "keywords": {
            "multi": true,
            "facet": {
                "tokenize": {
                    "delim": "[,;]\s*"
                },
            }
        }
    }

The name of the facet field in the Solr document is either

    ${TYPE}_${PROPERTY}_facet

or 

    ${TYPE}_${PROPERTY}_facetmulti

For example, the config above would generate a facet field called Dataset_keywords_facetmulti.

### resolve

RO-Crates model relationships as links - for example, a Dataset with its authors modelled as People:

    ...
    {
        "@id": "./",
        "@type": "Dataset",
        "name": "Some data",
        "description": "A longer description of the dataset",
        "author": [
            { "@id": "https://staffdir.org/Jane.Smith" },
            { "@id": "https://staffdir.org/John.Smith" }
        ]
    },
    {
        "@id": "https://staffdir.org/Jane.Smith",
        "@type": "Person",
        "name": "Jane Smith",
        "honorific": "Dr",
        "affiliation": { 
            "@id": "https://institution.edu"
        }
    },
    {
        "@id": "https://staffdir.org/John.Smith",
        "@type": "Person",
        "name": "John Smith",
        "honorific": "Dr",
        "affiliation": { 
            "@id": "https://institution.edu"
        }
    },
    ...

To create a useful index for the dataset here, the indexer needs to resolve the links by looking up the author @id fields in the graph. If a property has a "resolve" config, the indexer will look for objects of the form { "@id": "XXXX" } in that property and search for them in the RO-Crate.

For example:

    "Dataset": {
        "author": {
            "resolve": {
                "search": "@id",
                "display": "name"
            }
        }
    }

A "resolve" item needs to have values for "search" and "display", which each need to point to a property of the resolved object:

* search - the property to be used as a unique key in URLs and searches - usually "@id"
* display - the property to be show to the user in search results and facets

Resolved items can be used as facets: the value stored in the facet will be a JSON object containing the @id, search and display values. This means that if (for example) two people have the same name but different @ids, they will be kept separate when facetting.

When resolving items to be used as a multiple facet, each resolved value is faceted separately.

### resolve with multiple steps

Resolution can span multiple links in the graph. For example, the following is an excerpt from an RO-Crate which models historical data about criminal convictions. A Person has one or more Sentences, each of which links to a Place (representing the court at which the sentence was recieved), which in turn links to a Geocoordinates containing the location of the court.

    {
      "@id": "#person__VICFP_18551934_13_93",
      "@type": "Person",
      "name": "BOURKE, MARY",
      "conviction": [
        {
          "@id": "#conviction_330"
        },
      ],
    },
    {
      "@id": "#conviction_330",
      "@type": [
        "Sentence"
      ],
      "object": {
        "@id": "#person__VICFP_18551934_13_93"
      },
      "name": "20-NOV-1908 BOURKE, MARY:  3 MONTHS IMPRISONMENT NO VISIBLE MEANS YARRAWONGA PETTY SESSIONS",
      "sentence": " 3 MONTHS IMPRISONMENT",
      "offence": {
        "@id": "#offence_NO_VISIBLE_MEANS"
      },
      "startTime": "20-NOV-1908",
      "location": {
        "@id": "#place_YARRAWONGA PETTY SESSIONS"
      }
    },
    {
      "@id": "#place_YARRAWONGA PETTY SESSIONS",
      "@type": [
        "Place"
      ],
      "name": "YARRAWONGA PETTY SESSIONS",
      "geo": {
        "@id": "#-36.0271,145.9991"
      }
    },
    {
      "@type": "Geocoordinates",
      "name": "Latitude: -36.0271 Longitude: 145.9991",
      "@id": "#-36.0271,145.9991",
      "latitude": -36.0271,
      "longitude": 145.9991
    },

To index the place names of all of a person's convictions against the person, the indexer needs to follow the chain of item resolutions:

    Person ->> Sentence -> Place

A "via" item in the "resolve" config tells the indexer how to do this. The "via" value is an array of objects, each of which has a "property" value which shows which property to follow to get to the next item in the chain:

    {
        "Person": {
            "convictions": {
                "facet": true,
                "multi": true,
                "index_as": "convictionLocations",
                "resolve": {
                    "via": [
                        { "property": "conviction" },
                        { "property": "location" }
                    ]
                    "search": "@id",
                    "display": "name"
                }
            }
        }
    }

### Capturing context with store_subgraph

_Note: this feature is new, experimental and will probably change_

To provide rich search results for an indexed item, it's possible to configure the indexer to store items which link to it as JSON. The Oni frontend can then render this JSON using parts of the standard ro-crate-html-js library.

At the time of writing (end of 2020) this feature has only been used in applications where the input is a single, large RO-Crate. It may be useful for applications with many RO-Crates but hasn't been developed with that in mind.

If the "store_subgraph" flag is set on a property with a resolve/via config, the indexer will collect all of the items which it passes through when traversing the graph to follow the "via" links:

    {
        "Person": {
            "convictions": {
                "facet": true,
                "multi": true,
                "store_subgraph": true,
                "index_as": "convictionLocations",
                "resolve": {
                    "via": [
                        { "property": "conviction" },
                        { "property": "location" }
                    ]
                    "search": "@id",
                    "display": "name"
                }
            }
        }
    }

A "store_subgraph" value needs to also be set at the "fields" level for this to work.

Before a document is indexed, the subgraph is de-duplicated (as the same item may have been traversed for multiple properties).

A more mature version of this feature will allow global subgraph storage.


#### field ?

A field to extract from the resolved facet values: this overrides whatever "resolve" returns

## Field matching

For situations where we need to map values from one type/field combination in an ro-crate to multiple fields in the Solr index. For example, FOR and SEO codes are both captured in the 'about' field of a Dataset:

    "about": [
        {
            "@id": "http://purl.org/au-research/vocabulary/anzsrc-for/2008/080503"
        },
        {
            "@id": "http://purl.org/au-research/vocabulary/anzsrc-for/2008/080302"
        },
        {
            "@id": "http://purl.org/au-research/vocabulary/anzsrc-for/2008/090609"
        },
        {
            "@id": "http://purl.org/au-research/vocabulary/anzsrc-seo/2008/890102"
        },
        {
            "@id": "http://purl.org/au-research/vocabulary/anzsrc-seo/2008/890202"
        }
    ],

but we may want to only index FOR codes, or index SEO and FOR codes into two different destination fields.

In this situation, we can configure multiple config items against a single type/field, and give each config item a 'match' value which is tested against the item, for example:

    "about": [
        {
            "match": { "@id": { "re": "anzsrc-for" } },
            "index_as": "FOR",
            "multi": true,
            "resolve": "multi",
            "facet": true
        },
        {
            "match": { "@id": { "re": "anzsrc-seo" } },
            "index_as": "FOR",
            "multi": true,
            "resolve": "multi",
            "facet": true
        },
     ],

The 'match' field uses the same filter spec as type filtering: in the above example, each 'about' value's '@id' field is matched against the regexp `/anzsrc-for/` for FOR codes and `/anzsrc-seo/` for SEO codes.

If a value matches more than one clause in this type of configuration, it will be indexed into Solr for every clause that it matches.

A match field can also match against plaintext values:

      "about": [
        {
            "match": { "@id": { "re": "anzsrc-for" } },
            "index_as": "FOR",
            "multi": true,
            "resolve": "multi",
            "facet": true
        },
        {
            "match": { "re": ".*" },
            "index_as": "Affiliation",
            "facet": true
        }
      ],

In the example, every 'about' item which is just a string (rather than an object) will be compared against the regexp `/.*/` - in other words, every string will be indexed as "Affiliation".

Note that at present, there would be an issue if you wanted to match against an item field called "re", as the config parser will treat "re" as a regular expression.


## Omitted for now

"type" faceting - I want to handle this separately as I think it needs to be applied to everything. So it should be in a global config section, not done on each item.


