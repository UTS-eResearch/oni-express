const _ = require('lodash');
const assert = require('assert');
const ROCrate = require('ro-crate').ROCrate;
const fs = require('fs-extra');
const Utils = require('ro-crate').Utils;
const path = require('path');

// note: the members of the solr doc objects returned by createSolrDocument
// are weird JS objects which look like single-element arrays when
// stringified, which is what the [0] in the filter is for. This is bad
// and needs fixing.



class ROCrateIndexer {

  // debug is an optional array of fields to pass - the indexer will emit
  // extra debug logging for these fields

  constructor(logger, debug) {
    this.logger = logger;
    if( debug ) {
      this.debug = debug;
    }
  }

  setConfig(config) {
    this.config = config;
    this.typeFilters = {};
    this.itemFilters = {};
    this.root = undefined;
    this.facets = {};
    this.errors = [];
    const obj = this;

    _.each(this.config['types'], ( typecf, type ) => {
      const typef = {};
      _.each(typecf, ( fieldcf, field ) => {
        if( 'filter' in fieldcf ) {
          typef[field] = fieldcf['filter'];
        }
        this.saveFacetNames(type, field, fieldcf);
        if( field === 'licence' ) {
          this.errors.push(type);
        }
        if( Array.isArray(fieldcf) ) {
          for( let altcf of fieldcf ) {
            if( altcf['match'] ) {
              const filterId = `${type}_${altcf['index_as']}`;
              const filterfn = this.compileFilter(altcf['match']);
              this.logger.debug(`Compiled match filter for ${filterId}: ${filterfn}`);
              this.itemFilters[filterId] = filterfn;
            }
          }
        }
      });
      this.typeFilters[type] = this.compileFilter(typef);
    });

    if( this.errors.length > 0 ) {
      this.logger.error(`
For consistency with schema.org, this codebase uses the US spelling
of "license". Your fields config has at least one type which uses
the Commonwealth spelling "licence". Rather than silently not apply
a license, this indexer won't run until you change the spelling to.
"license".

Types with errors: ${this.errors.join(', ')}`);
      return false;
    }

    this.logger.debug(`itemFilters = ${JSON.stringify(this.itemFilters, null, 2)}`);

    this.licenses = this.compileLicense();
    return true;
  }

  // store the facet names - allowing for things like index_as which
  // can facet as something other than the JSON-LD property

  saveFacetNames(type, field, fieldcf) {
    const cfs = Array.isArray(fieldcf) ? fieldcf : [ fieldcf ];

    for( let cf of cfs ) {
      if( cf['facet'] ) {
        if( !this.facets[type] ) {
          this.facets[type] = {};
        }
        const facet_as = cf['index_as'] ? cf['index_as'] : field;
        this.facets[type][facet_as] = {
          facetField: this.facetFieldName(type, facet_as, cf),
          JSON: cf['resolve'] ? true : false
        };
        // rather than have downstream code need to decide
        // that it's an index_as, just have the config available
        // under both the original and index_as name
        // if( facet_as !== field ) {
        //   this.facets[type][field] = this.facets[type][facet_as];
        // }
      }
    }
  }


  // NOTE: if facetFieldName defines something as multi, do we need to ensure
  // that the facet values are arrays? Previous versions of this code based the
  // facet name on whether the value was an array, but this was sloppy, and
  // config-fusion means I want a more rigorous way to define the facet field
  // names based on the config, not on what they see during indexing.

  facetFieldName(type, field, cf) {
    const multi = ( cf['multi'] || ( cf['resolve'] === 'multi' ) );
    return [ type, field, multi ? 'facetmulti' : 'facet' ].join('_');
  }



  // build a filter function from the config for an item type

  compileFilter(cf) {
    const fs = [];
    if( typeof cf === 'string') {
      // if the cf is just a string
      fs.push(this.makeEq('', cf))
    } else {
      if( 're' in cf ) {
        // if the cf looks like a re, not a set of field matches
        fs.push(this.makeEq('', new RegExp(cf['re'])))
      } else {
        _.each(cf, ( condition, field ) => {
          if( typeof condition === 'object' ) {
            if( condition['re'] ) {
              fs.push(this.makeEq(field, new RegExp(condition['re'])));
            } else if ( condition['is_root'] ) {
              fs.push((item) => {
                if( this.root ) {
                  return this.root['@id'] === item['@id'];
                } else {
                  return false;
                }
              })
            } else {
              this.logger.error("Unknown filter type in " + JSON.stringify(condition) );
            }
          } else {
            const f = this.makeEq(field, condition);
            fs.push(f);
          }
        });
      }
    }
    // match only if every predicate is true
    return (item) => _.every(fs, (f) => f(item));
  }

  // Builds a closure which matches against an item's value for field if
  // - the value is a string which matches
  // - the value is an array containing at least one string which matches
  // the target param can be a RegExp or a string

  makeEq(field, target) {
    var match;
    if ( typeof target === 'string' ) {
      match = (v) => {
        return ( v === target);
      };
    } else {
      match = (v) => {
        return v.match(target);
      };
    }
    return ( item ) => {
      if( typeof item === 'string') {
        return match(item);
      }
      if( field in item ) {
        const value = item[field];
        if( Array.isArray(value) ) {
          return _.some(value, match);
        } else {
          return match(value);
        }
      }
      return false;
    }
  }



  // precompile the licence regexps as a method, mapLicenses, which takes
  // a raw license list and returns a list of mapped licenses, or the
  // default license, or an empty list if there's no config



  compileLicense(dataset) {
    const lCf = this.config['licenses'];
    if( ! lCf ) {
      this.mapLicenses = (raw) => { return [] };
      return;
    }
    this.licenseRes = [];
    _.each(lCf, (value, re) => {
      if( re !== '__default__' ) {
        this.licenseRes.push({re: new RegExp(re), value: value});
      }
    });

    this.mapLicenses = (ls) => {
      const mapped = [];
      _.each(ls, (l) => {
        _.each(this.licenseRes, (lre) => {
          if(l['@id']){
            l = l['@id'];
          }
          if( l.match(lre['re']) ) {
            mapped.push(lre['value']);
          }
        })
      });
      const umapped = _.uniq(mapped)
      if( umapped.length === 0 ) {
        if( lCf['__default__'] ) {
          return [ lCf['__default__'] ];
        } else {
          return [];
        }
      } else {
        return umapped;
      }
    };
  }



  // pathResolver is an async function which resolves a file path in the ro-crate
  // to a real filename - it handles ocfl resolution for the full-text search


  async createSolrDocument(jsonld, pathResolver, default_id) {

    this.crate = new ROCrate(jsonld);

    this.pathResolver = pathResolver;

    // Keep track of things that are resolved and have index config (ignoring filter)
    this.resolvedItemsToIndex = [];
    this.alreadyIndexed = {};

    this.crate.index();

    // maybe should be optional - only if there is something in "@reverse"?

    this.crate.addBackLinks();

    const cfBase = this.config['map_all'] || {};
    const cfTypes = this.config['types'];

    // do the root Dataset item first

    const datasetCf = cfTypes['Dataset'];

    this.root = this.crate.getRootDataset();
    if( !this.root ) {
      throw Error("Couldn't find ro-crate's root dataset");
    }
    // clone the item and rewrite its @id to a named identifier if
    // that's been configured
    const rootItem = _.clone(this.root);
    this.rootOrigId = rootItem['@id']; // so we can skip it later

    if( datasetCf && datasetCf['@id'] ) {
      const namespace = datasetCf['@id']['name'];
      const identifier = this.crate.getNamedIdentifier(namespace);
      if( identifier ) {
        rootItem['@id'] = identifier;
      } else {
        rootItem['@id'] = default_id;
        this.logger.info(`No named identifier in ro-crate - using default id ${default_id}`);
      }
      this.logger.debug(`Named identifier ${namespace} => ${identifier}`);
    }

    rootItem['licenseOriginal'] = rootItem['license'];
    rootItem['license'] = this.mapLicenses(rootItem['license']);

    const solrDocument = {};

    if( datasetCf ) {
      const rootSolr = await this.mapItem(cfBase, datasetCf, 'Dataset', rootItem);
      solrDocument['Dataset'] = [ rootSolr ];
    }

    // First cut of inheritance for licenses: if an item doesn't have a field
    // X, and X has 'inherit' set to True, copy it from the rootItem's X, if
    // that exists. (NOTE: inheritance goes straight to the rootItem, not up
    // the tree of resolutions)

    this.rootItem = rootItem; // set this so that inheritance can access it



    // loop through each item in the JSON-LD @graph
    await this.indexItems(this.crate.json_ld["@graph"], cfTypes, cfBase, solrDocument, false);
    var additionalItems = _.clone(this.resolvedItemsToIndex)
    this.resolvedItemsToIndex = []
    while (additionalItems.length > 0) {
      // Don't filter things that were resolved
      await this.indexItems(additionalItems, cfTypes, cfBase, solrDocument, true);
      additionalItems = _.clone(this.resolvedItemsToIndex)
      this.resolvedItemsToIndex = []
    }
    return solrDocument;
  }


  async indexItems(items, cfTypes, cfBase, solrDocument, auto) {
    for (const item of items) {
      if (item['@id'] !== this.rootOrigId) {
        var types = this.crate.utils.asArray(item['@type']);
        // Look through types in order
        for (let type of Object.keys(cfTypes)) {
          if (types.includes(type)) {

            // get config for this type of item
            const cf = cfTypes[type];
            // If auto flag set always index regardless of filter
            if (auto || this.typeFilters[type](item)) {
              // Only do ONCE per type
              types = [type];
              item["@type"] = types;
              const solr = await this.mapItem(cfBase, cf, type, item);
              if (!(solrDocument[type])) {
                solrDocument[type] = [];
              }
              solrDocument[type].push(solr);
            }
          }
        }
      }
    }
  }

  // consistent parameter order for these functions:
  // from general to specific:
  //
  // cfBase, cf, type, item, field, value

  // map the fields in an an ro-crate item to a solr document
  // this.solr gets inited by this method so that mapValue can
  // add things to it

  async mapItem(cfBase, cf, type, item) {

    this.solr = this.baseSolr(cfBase, item);

    // reverse lookups

    if( item['@reverse'] && cf['@reverse'] ) {
      for( let field in item['@reverse'] ) {
        if( cf['@reverse'][field] ) {
          // note - pass in cf['@reverse'] rather than cf to mapValues because
          // the @reverse config has an extra layer of nesting
          await this.mapValues(cfBase, cf['@reverse'], type, item['@reverse'], field);
        }
      }
    }

    for( let field in item ) {
      await this.mapValues(cfBase, cf, type, item, field);
    }

    // look for fields with 'inherit' which didn't have a value
    _.each( cf, ( fieldcf, field ) => {
      if( fieldcf['inherit'] ) {
        if( ! this.solr[field] ) {
          this.logger.info(`Inheriting ${field} from root`)
          this.solr[field] = this.rootItem[field];
          if( ! this.rootItem[field] ) {
            this.logger.warn(`WARNING: no ${field} on root item`);
            this.logger.warn(`Root item: ${JSON.stringify(this.rootItem)}`);
          }
        }
      }
    });
    return this.solr;
  }

  // Resolve index matching and pass through to mapValue, which does
  // the resolution if required

  // NOTE the new way this works means that if an item matches
  // more than one of the members of a config array, it will
  // be indexed more than once. This could be a feature but
  // it might also be a gotcha and changes behaviour (the old
  // design only matched the first one)

  async mapValues(cfBase, cf, type, item, field) {
    const value = item[field];
    if( Array.isArray(cf[field]) ) {
      // do each match clause separately
      // FIXME this isn't checking that the config is complete
      this.logger.debug(`Matching multiple config ${field}: ${JSON.stringify(cf[field])}`);
      for( let match of cf[field] ) {
        if( !(match['index_as'] in cfBase) ) {
          this.logger.debug(` --match ${match["index_as"]}`);
          await this.mapValue(match, type, item, field, match['index_as'], value)
        }
      }
    } else {
      const index_as = ( cf[field] && cf[field]['index_as'] ) ? cf[field]['index_as'] : field;
      await this.mapValue(cf[field], type, item, field, index_as, value)
    }
  }



  // mapValue(fieldcf, type, item, field, index_as, value)
  //
  // make the solr index (and facets where configured) for a single
  // type, field, cf and value
  //
  // NOTE: this writes the results into the current this.solr, which
  // I don't like much, but I like it better than passing a solr object
  // into the method, or passing out all the values and updating them
  //
  // note - this now has the original field and the index_as because
  // rocrate.resolve needs to know the original.


  async mapValue(fieldcf, type, item, field, index_as, value) {
    this.logger.debug(`mapValue: ${type}: ${field}`);
    const debug = this.debug && this.debug.includes(field);
    // store the type and field so that they can be included in the logs
    // for conversion errors
    this.currentType = type;
    this.currentField = field;
    if( ! fieldcf ) {
      // no config for this field so copy
      this.solr[index_as] = this.unwrap(value);
      if( debug ) {
        this.logger.debug(`field ${index_as} copy ${value}`);
      }
    } else {
      if( ! fieldcf['skip'] ) {
        // load files
        if( fieldcf['load_file'] ) {
          this.solr[field] = await this.loadFile(value);
          if( debug ) {
            this.logger.debug(`field ${field} load file ${value}`);
          }
        } else {
          // resolve lookups - note that this disregards
          // whatever was passed to mapValue as 'value'
          if( fieldcf['resolve'] ) {
            this.logger.debug(`resolving lookups for ${item['@id']} ${field}`);
            this.solr[index_as] = this.resolveValues(item, field, index_as, fieldcf);
            const vals = this.crate.utils.asArray(this.solr[field]);
            // FIXME does this need to change for geovalues?
            this.solr[`${index_as}_id`] =  [];
            for (let val of vals) {
              try {
                const value = JSON.parse(val);
                this.solr[`${index_as}_id`].push(value["@id"]);
              } catch (e) {
                this.logger.warn(`Resolution error for '${val}' ${e.message}`);
              }
            }
            if( debug ) {
              this.logger.debug(`field ${field} resolved ${JSON.stringify(value)}`);
            }
          } else {
            this.solr[index_as] = this.unwrap(value, fieldcf.escapedJSON);
          }
          if( fieldcf['validate'] ) {
            this.solr[index_as] = this.validate(fieldcf['validate'], this.solr[index_as]);
          }
        }
        // make facets - these can be based on raw or resolved values depending
        // on the faceting rule, so pass both in
        this.logger.debug(`Facet config for ${index_as} = ${JSON.stringify(fieldcf['facet'])}`);
        if( fieldcf['facet'] ) {
          const facet = this.makeFacet(fieldcf['facet'], value, this.solr[index_as]);
          if( ! this.facets[type][index_as] ) {
            this.logger.error(`No facet config found for ${type}/${index_as}`);
            this.logger.debug(JSON.stringify(this.facets[type]));
            throw Error(`No facet config for ${index_as}`);
          }
          const facetField = this.facets[type][index_as]['facetField'];
          if( debug ) {
            this.logger.debug(`field ${field} (${index_as}) facet ${facetField} ${value} = ${facet}`);
          }
          if( !facet ) {
            this.logger.warn(`Empty value for facet ${facetField} - check config`);
          }
          // NOTE - at this point might have to check that the arity of facet
          // macthes that of facetField

          this.solr[facetField] = facet;
        }
      }
    }
  }

  // used to select values based on matching one of their keys - for eg, FORs and SEOs
  // are subsets of 'about'
  //
  // TODO - put this into ROCrate.resolve( ) so it uses the filter function
  // from this.compileFilter()

  // FIXME -this is redundant now

  filterCf(type, cf, field, value) {
    if( !Array.isArray(cf[field]) ) {
      // if there's only one config, don't split the values
      return [ { field: field, cf: cf[field], value: value } ];
    } else {
      const indexable = [];
      const values = Array.isArray(value) ? value : [ value ];
      _.each(cf[field], (indexCf) => {
        const matcher = this.compileFilter(indexCf['match']);
        const ivalues = values.filter(matcher);
        if( ivalues.length > 0 ) {
          indexable.push({
            field: indexCf['index_as'],
            cf: indexCf,
            value: ivalues
          });
        } else {
          this.logger.warn(`No match for ${indexCf['match']}`);
        }
      });

      return indexable;
    }
  }

// this function assumes that
//
// single value -> resolveAndFlatten -> single resolved value
//
// or
//
// [ values ] -> resolveAndFlatten -> [ resolved ]
//
//
// but ro-crate-js works like
//
// item and field / via -> resolve ->> multiple resolved values
//
// so resolveAndFlatten now returns an array


  resolveValues(item, field, index_as, cf) {
    if( index_as !== field ) {
      this.logger.debug(`resolveValues for ${item["@id"]} ${field} ${index_as}`);
    }
    const resolved = this.resolveAndFlatten(item, field, index_as, cf);

    if( cf['multi'] ) {
      return resolved;
    } else {
      if( Array.isArray(resolved) ) {
        if( resolved.length > 1 ) {
          this.logger.warn(`${field} resolves to multiple values, but isn't configured as multi`);
          this.logger.warn(`config = ${JSON.stringify(cf)}`);
        }
        return resolved[0];
      }
    }
  }


  resolveAndFlatten(item, field, index_as, cf) {
    const via = [ { property: field } ];

    if( cf["resolve"]["via"] ) {
      const rvia = _.clone(cf["resolve"]["via"]);
      via.splice(2, 0, ...rvia);
    }

    this.logger.debug(`Resolving: item ${item['@id']} field ${field} index_as ${index_as}`);

    const matchId = `${this.currentType}_${index_as}`;
    this.logger.debug(`itemFilters = ${JSON.stringify(this.itemFilters, null, 2)}`);
    this.logger.debug(`matchId = ${matchId}`);
    if( matchId in this.itemFilters ) {
      this.logger.debug('matchId in itemFilters');
      const lasti = via.length - 1;
      this.logger.debug(`Setting item filter on ${lasti} for ${matchId}`);
      via[lasti]['matchFn'] = this.itemFilters[matchId];
    }


    const target = this.crate.resolve(item, via);


    if( !target ) {
      this.logger.warn(`item resolution failed for ${item['@id']} ${JSON.stringify(via)} ${field}`);
      return '';
    }

    // FIXME -this will be where we decide to index all the JSON

    if( ! cf['resolve']['search'] ) {
      this.convertError(`Resolve config doesn't have search value`);
      return '';
    }

    this.logger.debug(`${item['@id']}.${field} resolved ${target.length} items`);

    const resolved = target.map((t) => {
      return {
        "@id": t['@id'],
        display: t[cf['resolve']['display']],
        search: this.convertSearch(t, cf['resolve']['search'])
      }});

    // TODO - check for normalised duplicates

    const resolvedTypes = this.crate.utils.asArray(resolved["@type"]);
    for (let type of Object.keys(this.config['types'])) {
      const cf = this.config['type'];
      for( let r of resolved ) {
        if (resolvedTypes.includes(type) && !this.alreadyIndexed[r["@id"]]) {
          this.alreadyIndexed[r["@id"]] = true;
          this.resolvedItemsToIndex.push(r);
        }
      }
    }

    const flattened = resolved.map((r) => JSON.stringify(r).replace(/"/g, '\"'));

    return flattened;
  }




  resolveValues_old(cf, value) {
    if( typeof value !== 'object' ) {
      this.convertError(`Can't resolve '${value} - not an object'`);
      return value;
    }
    if( cf['multi'] ) {
      if( Array.isArray(value) ) {
        return value.map((v) => this.resolveAndFlatten(cf, v));
      } else {
        return [ this.resolveAndFlatten(cf, value) ];
      }
    } else {
      if( Array.isArray(value) ) {
        return this.resolveAndFlatten(cf, value[0]);
      } else {
        return this.resolveAndFlatten(cf, value);
      }
    }
  }

  // FIXME - I've decided to rewrite this completely and separate flattening from
  // resolution

  resolveAndFlatten_old(cf, value, solr) {
    if( !('@id' in value ) ) {
      this.convertError(`no @id found in value ${JSON.stringify(value)}`);
      return value;
    }

    if( !cf['resolve'] ) {
      this.convertError(`Attempt to resolve an item without a resolve config`);
      return '';
    }

    let item;

    if( cf["resolve"]["via"] ) {
      const via = _.clone(cf["resolve"]["via"]);
      item = this.crate.resolve(this.currentItem, via);
    } else {
      item = this.crate.getItem(value['@id']);
    }

    if( !item ) {
      this.logger.warn(`resolveAndFlatten failed for ${JSON.stringify(value)}`)
      return '';
    }


    if( ! cf['resolve']['search'] ) {
      this.convertError(`Resolve config doesn't have search value`);
      return '';
    }


    const resolved = {
      "@id": item['@id'],
      display: item[cf['resolve']['display']],
      search: this.convertSearch(item, cf['resolve']['search'])
    };

    // TODO - check for normalised duplicates

    const resolvedTypes = this.crate.utils.asArray(resolved["@type"]);
    for (let type of Object.keys(this.config['types'])) {
      const cf = this.config['type'];
      if (resolvedTypes.includes(type) && !this.alreadyIndexed[resolved["@id"]]) {
        this.alreadyIndexed[resolved["@id"]] = true;
        this.resolvedItemsToIndex.push(resolved);
      }
    }

    const flattened = JSON.stringify(resolved).replace(/"/g, '\"')

    return flattened;
  }

  // semi-smart field conversion which handles lat,lons if the field
  // is geo

  convertSearch(item, field) {
    if( field === 'lat,lon' ) {
      return `${item['latitude'],item['longitude']}`;
    } else {
      return item[field];
    }

  }




  makeFacet(cf, raw, resolved) {

    // tokenize the contents on the delim regexp and facet
    if( cf['tokenize'] ) {
      if( raw ) {
        const raws = Array.isArray(raw) ? raw[0]: raw;
        return raws.split(RegExp(cf['tokenize']['delim']));
      } else {
        return [];
      }
    }


    // I think this is obsolete - not sure though
    if (cf['fieldName']) {
      if( Array.array(raw) ) {
        return raw.map((v) => {
          const lookup = this.crate.getItem(v['@id']);
          if( lookup ) {
            return lookup[cf['field']]
          } else {
            return v['@id'];
          }
        });
      } else {
        return [];
      }
    }
    // by default, use the resolved and flattened value(s)
    return resolved;


  }

  // validate as a date or re

  validate(vcf, values) {
    if( vcf === 'date' ) {
      for (let value of values ){
        value = value.replace(/[^\d-]+/, "");
        const m = value.match(/(\d\d\d\d-\d\d-\d\d)/);
        if( m ) {
          return m[1];
        }
        this.convertError(`Invalid ${type}: ${value}`);
        return '';
      }
      this.convertError(`Unknown validation type ${type}`);
    } else if( typeof(vcf) === 'object' && vcf['re'] ) {
      return this.validate_re(vcf, values);
    }
  }


  validate_re(vcf, values) {
    // if the re doesn't include a () group, wrap it in one
    const res = vcf['re'].includes('(') ? vcf['re'] : '(' + vcf['re'] + ')';
    const vre = RegExp(res);
    for( let value of values ) {
      const m = value.match(vre);
      if( m ) {
        return m[1];
      }
    }
    this.convertError(`Mismatch on validation regexp ${vcf['re']}: ${value}`);
    return '';
  }


  async loadFile(value) {
    const file = value[0];
    if( !file['@id'] ) {
      this.logger.error("Can't find id on file");
      return '';
    }
    const filename = await this.pathResolver(file['@id']);

    try {
      const content = await fs.readFile(filename, 'utf8');
      return content;
    } catch(e) {
      this.logger.error(`Error loading file ${file['@id']}: ${e}`);
      return '';
    }
  }


  convertError(message) {
    this.logger.error(`convert: [${this.rootOrigId}/${this.currentType}/${this.currentField}] ${message}`);
  }


  // mappings which are done for all solr records

  baseSolr(map_all, item) {
    const base = {};
    _.each(map_all, ( targets, field ) => {
      _.each(targets, ( target ) => {
        base[target] = this.unwrap(item[field])
      });
    });
    return base;
  }


  // unwrap a value if it's in an array

  unwrap(value, returnJson) {
    const values = this.crate.utils.asArray(value);
    var newValues = []
    for (let val of values) {
      if (val["@id"]) {
        const target = this.crate.getItem(val["@id"]);
        if (target) {
          if(target.name && !returnJson) {
            newValues.push(target.name);
          }
          else {
            // TODO - should this use a better serialiser
            newValues.push(JSON.stringify(target).replace(/"/, '\"'));
          }
        }
      }
      else {
        newValues.push(val)
      }
      return newValues;
    }
  }
}



module.exports = ROCrateIndexer;