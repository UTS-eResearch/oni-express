
// FIXME - needs to use ro-crate- style root dataset identification

const expect = require('chai').expect;
const _ = require('lodash');
const randomWord = require('random-word');
const ROCrateIndexer = require('../services/ROCrateIndexer');

const winston = require('winston');

const logger = winston.createLogger({
  format: winston.format.simple(),
  transports: [
    new winston.transports.Console()
  ]
});


const GRAPH = 20;
const REPEATS = 1000;
const TIMEOUT = 5000;

// tests for the item filtering code - which we should probably roll back
// into ro-crate itself

// this now puts values in arrays by default

function randomGraph(n, type, fields, value_callback) {
  const default_cb = () => [ randomWord() ];
  const cb = value_callback || default_cb;
  return Array(n).fill(null).map(() => {
    const item = { '@type': type };
    _.each(fields, (field) => item[field] = cb());
    return item;
  });
}

function makeIndexer(fieldcf) {
  const indexer = new ROCrateIndexer(logger);
  
  indexer.setConfig({
    types: {
      Dataset: fieldcf
    }
  });

  return indexer;
}


function randomSubstring(word) {
  const start = _.random(0, word.length - 2);
  const len = _.random(1, word.length - start);
  return word.substr(start, len);
}




// Given a list of fields, and an item with a value for each of those
// fields, returns a random filter over two or more of those fields, 
// with a mix of regexps and exact matches, which is guaranteed to
// match the item

function randomFilter(fields, item) {
  const n = _.random(2, fields.length);
  const ffields =_.sampleSize(fields, n);
  const filters = {};
  _.each(ffields, (ff) => {
    if( _.random(1) === 0 ) {
      filters[ff] = { filter: item[ff][0] }
    } else {
      filters[ff] = { filter: { re: randomSubstring(item[ff][0]) } }
    }
  });
  return filters;
}




describe('type selection filters - simple', function () {
  this.timeout(TIMEOUT);

  it('matches everything when filter is empty', function () {
    const graph = randomGraph(GRAPH, 'Dataset', ['path']);
    const indexer = makeIndexer({path: {} });
    const matches = graph.filter(indexer.typeFilters['Dataset']);
    expect(matches).to.be.an('array').and.to.have.lengthOf(GRAPH);
  });




  it('can pick items by exact matching a single field', function () {
    _.times(REPEATS, () => {
      const graph = randomGraph(GRAPH, 'Dataset', ['path']);
      const item = _.sample(graph);
      const lookfor = item['path'][0];
      const indexer = makeIndexer({path: {filter: lookfor} });
      const matches = graph.filter(indexer.typeFilters['Dataset']);
      expect(matches).to.be.an('array').and.to.not.be.empty;
      _.each(matches, (match) => {
        expect(match).to.have.property('path');
        expect(match['path'][0]).to.equal(lookfor);
      });
    });
  });

  it('can pick items by regexps on a single field', function () {
    _.times(REPEATS, () => {
      const graph = randomGraph(GRAPH, 'Dataset', ['path']);
      const item = _.sample(graph);
      const lookfor = randomSubstring(item['path'][0]);
      const indexer = makeIndexer({ path: { filter: { re: lookfor } } });
      const matches = graph.filter(indexer.typeFilters['Dataset']);
      expect(matches).to.be.an('array').and.to.not.be.empty;
      const lookfor_re = new RegExp(lookfor);
      _.each(matches, (match) => {
        expect(match).to.have.property('path');
        expect(match['path'][0]).to.match(lookfor_re);
      });
    });
  });

  it('can pick items by the standard DataCrate path regexp', function () {
    _.times(REPEATS, () => {
      const graph = randomGraph(GRAPH, 'Dataset', ['path'], () => [ _.sample(['./', 'data/'])] );
      const lookfor = "^\\./|data/$";
      const indexer = makeIndexer({path: { filter: { re: lookfor } } } );
      const matches = graph.filter(indexer.typeFilters['Dataset']);
      expect(matches).to.be.an('array').and.to.have.lengthOf(GRAPH);
      const lookfor_re = new RegExp(lookfor);
      _.each(matches, (match) => {
        expect(match).to.have.property('path');
        expect(match['path'][0]).to.match(lookfor_re);
      });
    });
  });

  it('can cope when filtering on a field which is not present in all items', function () {
    _.times(REPEATS, () => {
      const graph = randomGraph(GRAPH, 'Dataset', ['path']);
      const item = _.sample(graph);
      const lookfor = item['path'][0];
      // add more items without a path
      const graph2 = graph.concat(randomGraph(GRAPH, 'Dataset', ['name']));
      const indexer = makeIndexer({path: {filter: { re: lookfor } }});
      const matches = graph2.filter(indexer.typeFilters['Dataset']);
      const lookfor_re = new RegExp(lookfor);
      _.each(matches, (match) => {
        expect(match).to.have.property('path');
        expect(match['path'][0]).to.match(lookfor_re);
      });
    });
  });


  it('can filter values whether or not they are in arrays', function () {
    const values = [ [ 'one' ], [ 'two' ], 'one', 'two' ];
    const graph = values.map((v) => { return { '@type': 'Dataset', 'path': v }});
    const indexer = makeIndexer({path: {filter: 'one' }});
    const matches = graph.filter(indexer.typeFilters['Dataset']);
    expect(matches).to.have.lengthOf(2);
    _.each(matches, (match) => {
      expect(match).to.have.property('path');
      if( Array.isArray(match['path']) ) {
        expect(match['path'][0]).to.equal('one');
      } else {
        expect(match['path']).to.equal('one');
      }
    })
  });

});

describe('type selection filters - complex', function () {
  this.timeout(TIMEOUT);

  it('can pick items by multiple filters', function () {
     _.times(REPEATS, () => {
      const fields = [ 'path', 'name', 'description', 'id', 'colour', 'weight' ];
      const graph = randomGraph(GRAPH, 'Dataset', fields);
      const item = _.sample(graph);
      const filterspec = randomFilter(fields, item);
      const indexer = makeIndexer(filterspec);
      const matches = graph.filter(indexer.typeFilters['Dataset']);
      expect(matches).to.be.an('array').and.to.not.be.empty;
      const res = {};
      // precompile the regexps for checking the results
      _.each(filterspec, (filter, field) => {
        if( typeof filter === 'object') {
          res[field] = new RegExp(filter['re']);
        }
      });

      _.each(matches, (match) => {
        _.each(filterspec, ( filter, field ) => {
          expect(match).to.have.property(field);
          if( typeof filter === 'object' ) {
            expect(match[field][0]).to.match(res[field]);
          } else {
            expect(match[field][0]).to.equal(filter);
          }
        })
      });
    });
  });
});



describe('field match filters', function () {
  this.timeout(TIMEOUT);


  it('can filter plaintext values by exact match', function () {
    const matchval = "Some plaintext value";
    const values = [ 
      matchval,
      { '@id': "some_link_1" },
      { '@id': "some_link_2" }
    ];
    const matchcf = {
      'match': matchval
    };

    const matcher = makeIndexer({}).compileFilter(matchcf['match']);
    expect(matcher).to.be.a('function');
    const matches = values.filter(matcher);
    expect(matches).to.be.an('array').and.to.have.lengthOf(1);
    expect(matches[0]).to.equal(matchval);

  });

  it('can filter plaintext values by regexp', function () {
    const matchval = "Something that matches a regexp";
    const values = [ 
      matchval,
      { '@id': "some_link_1" },
      { '@id': "some_link_2" }
    ];
    const matchcf = {
      'match': { re: '.*' }
    };

    const matcher = makeIndexer({}).compileFilter(matchcf['match']);
    expect(matcher).to.be.a('function');
    const matches = values.filter(matcher);
    expect(matches).to.be.an('array').and.to.have.lengthOf(1);
    expect(matches[0]).to.equal(matchval);

  });

  it('can partition values by id and plaintext matching', function () {
    const match_text = { re: '.*' };
    const match_for = { '@id': { "re": "anzsrc-for" } };
    const text_values = [
      "A text value",
      "Another text value"
    ];
    const for_values = [
      {
        "@id": "http://purl.org/au-research/vocabulary/anzsrc-for/2008/080302"
      },
      {
        "@id": "http://purl.org/au-research/vocabulary/anzsrc-for/2008/090609"
      }
    ];
    const seo_values = [
      {
        "@id": "http://purl.org/au-research/vocabulary/anzsrc-seo/2008/890102"
      }
    ];
    const values = text_values.concat(for_values, seo_values);

    const cat = makeIndexer({});
    const text_filter = cat.compileFilter(match_text);
    const for_filter = cat.compileFilter(match_for);

    const filtered_text = values.filter(text_filter);
    const filtered_fors = values.filter(for_filter);

    expect(filtered_text).to.be.an('array').and.to.eql(text_values);
    expect(filtered_fors).to.be.an('array').and.to.eql(for_values);

  });



});




