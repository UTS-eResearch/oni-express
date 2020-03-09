// Adapted from ocfl-nginx for the express version 

var fs = require('fs-extra');
var path = require('path');
var requests = require('requests');

var DEFAULT_PAGE_SIZE = 10;

// file(config, repo, oid, version, content)
//
// Resolve a versioned oid and content path into a filename

async function file(config, repo, oid, version, content) {

  const opath = await resolve_oid(config.ocfl[repo].resolver, oid);
  const ocfl_root = config.ocfl[repo].repository;

  try {
    const inv = await load_inventory(ocfl_root, opath);
    if( !version ) {
      version = inv.head;
    } else {
      version = version.slice(1)
    }
    var vpath = find_version(inv, version, content);
    if( vpath ) {
      return path.join(ocfl_root, opath, vpath[0]);
    } else {
      console.log(`content ${content} not found in inventory`);
      return '';
    } 
  } catch(e) {
    console.log(e);
    return '';
  }

}

// index(config, repo, oid, version, content)
//
// returns either the top-level repo index or the auto_index for the path within
// an object

async function index(config, repo, oid, version, content) {
  if( oid ) {
  const opath = await resolve_oid(config.ocfl[repo].resolver, oid);
  const ocfl_root = config.ocfl[repo].repository;

  try {
    const inv = await load_inventory(ocfl_root, opath);
    if( !version ) {
      version = inv.head;
    } else {
      version = version.slice(1)
    }
    return path_autoindex(inv, version, content || '', config.ocfl[repo].allow);
  } catch(e) {
    console.log(e);
    return '';
  }

  }
}



// resolve_oid(req, oid, success)
//
// Pick an oid strategy and use it to resolve the oid to a path, then
// call the success callback with the path if it works.
// If resolution fails, the resolver function is expected to call not_found
// with an error message

async function resolve_oid(resolver, oid) {
  return resolve_pairtree(oid);
  // if( req.variables.ocfl_resolver === 'solr' ) {
  //   resolve_solr(req, oid, success);
  // } else {
  //   success(resolve_pairtree(oid));
  // }
}



// async function resolve_solr(solr, oid) {

//   var esc_oid = oid.replace(' ', '\\ ');

//   var query = solr_query({ q: "uri_id:" + esc_oid, fl: [ 'path' ] });
  
//   var resp = awat req.subrequest(solr + '/select', { args: query }, ( res ) => {
//     var solrJson = JSON.parse(res.responseBody);
//     if( solrJson['response']['docs'].length === 1 ) {
//       var opath = String(solrJson['response']['docs'][0]['path']);
//       success(opath);
//     } else {
//       not_found(req, "Solr lookup failed for for " + oid);
//     }
  
//   });
// }



// load_inventory(ocfl_root, opath)
//
// Attempts to load and parse the inventory.json file for an object.

async function load_inventory(ocfl_root, opath) {
  return await fs.readJson(path.join(ocfl_root, opath, 'inventory.json'));
}


// find_version(inv, v, content)
//
// search an OCFL object's inventory for a content path in the specified
// version. Returns the actual path to the resource on disk if it's found,
// otherwise returns null.

function find_version(inv, v, content) {

  var state = inv.versions[v]['state'];

  var hash = Object.keys(state).filter(function(h) {
    return state[h].includes(content);
  });

  if( hash.length > 0 ) {
    return inv.manifest[hash[0]];
  } else {
    return null;
  }
}


// solr_index(req)
//
// Generates a top-level autoindex with pagination based on the solr
// index and calls send_html to return it to the user


function solr_index(req) {
  var start = req.args['start'] || '0';
  var format = req.args['format'] || 'html';
  var fields = [ 'id', 'name', 'path', 'uri_id' ];
  if( format === 'json' && req.args['fields'] ) {
    fields = req.args['fields'].split(',');
  }
  var page_size = DEFAULT_PAGE_SIZE;
  if( req.variables.ocfl_page_size ) {
    page_size = Number(req.variables.ocfl_page_size);
    if( isNaN(page_size) ) {
      page_size = DEFAULT_PAGE_SIZE;
    }
  } 
  var repo = req.variables.ocfl_path;
  var query = solr_query({ start: start, rows: page_size, q: "*:*", fl: fields });

  req.subrequest(req.variables.ocfl_solr + '/select', { args: query }, ( res ) => {
    try {
      var solrJson = JSON.parse(res.responseBody);
      if( format === 'json' ) {
        send_json(req, solrJson);
      } else {
        var docs = solrJson['response']['docs'];
        var start = solrJson['response']['start'];
        var numFound = solrJson['response']['numFound'];
        var nav = solr_pagination(repo, numFound, start, page_size);
        var index = docs.map((d) => {
          return {
            href: '/' + repo + '/' + d['uri_id'] + '/',
            text: d['name'][0]
          }
        });
        send_html(req, page_html('Solr index', index, nav));
      }
    } catch(e) {
      not_found(req, "Error fetching or parsing solr index: " + e);
    }
  });
}

// solr_query(options)
//
// Builds the solr query from an options object with the following
// paramenters:
//
//   q - the query string
//   fl - array of fields
//   start - start record
//   rows - page size

function solr_query(options) {
  var query = "fq=" + encodeURIComponent("record_type_s:Dataset") + '&' +
    "q=" + encodeURIComponent(options['q']) + '&' +
    "fl=" + encodeURIComponent(options['fl'].join(','));
  if( options['start'] ) {
    query += "&start=" + options['start'];
  }
  if( options['rows'] ) {
    query += "&rows=" + options['rows'];
  } 
  return query;
}



// solr_pagination(repo, numFound, start, rows)
//
// Renders the pagination nav links for the solr index.

function solr_pagination(repo, numFound, start, rows) {
  var html = '';
  var url = '/' + repo + '/'
  var last = start + rows - 1;
  var next = undefined;
  if( last > numFound - 1 ) {
    last = numFound - 1;
  } else {
    next = start + rows;
  }
  if( start > 0 ) {
    var prev = start - rows;
    if( prev < 0 ) {
      prev = 0;
    }
    if( prev > 0 ) {
      html += '<a href="' + url + '?start=' + String(prev) + '">&lt;--</a> ';
    } else {
      html += '<a href="' + url + '">&lt;--</a> '; 
    }
  }
  html += String(start + 1) + '-' + String(last + 1) + ' of ' + String(numFound);
  if( next ) {
    html += ' <a href="' + url + '?start=' + String(next) + '">--&gt;</a>'
  }
  return html;
}







// path_autoindex(inv, v, path, ocfl_allow)
//
// for a given version of the OCFL object's inventory, finds all the paths
// which begin with 'path', and returns a list of the contents, truncating
// subdirectories to the next level down and removing duplicates. For example:
//
// path = 'subdir1'
//
// subdir1/subdir2/file1.txt   --> subdir2/
// subdir1/subdir2/file2.txt
// subdir1/file3.txt           --> file3.txt
// subdir3/file4.txt           --> file4.txt
// file5.txt
// file6.txt
//
// Since OCFL only indexes files, an empty result is returned as null, not
// an empty array.
//
// Filters the results by ocfl_allow, if this variable is set

function path_autoindex(inv, v, path, ocfl_allow) {

  var state = inv.versions[v]['state'];
  var index = {};
  var l = path.length;

  Object.keys(state).forEach((hash) => {
    state[hash].forEach((p) => {
      if( p.startsWith(path) ) {
        var rest = p.substring(l).split('/');
        if( rest.length === 1 ) {   // it's a file
          index[rest[0]] = 1;
        } else {                    // it's a subdirectory
          index[rest[0] + '/'] = 1;
        }
      }
    });
  });

  var paths = Object.keys(index);
  paths.sort();

  if( paths.length > 0 ) {
    var links = paths.filter((p) => allow_path(ocfl_allow, p)).map((p) => {
      return { href: p, text: p }
    });
    if( path ) {
      links.unshift({href: '../', text: "[parent]"});
    }
    return links;
  }
  return null;
}

// allow_path(ocfl_allow, path)
//
// applies the ocfl_allow pattern match. Returns true if either ocfl_allow
// or path are empty / falsy, otherwise returns the value of the match


function allow_path(ocfl_allow, path) {
  if( path ) {
    return ( !ocfl_allow || path.match(ocfl_allow + '$'))
  } else {
    return true;
  }
}


// history(repo_url, req, oid, inv, path) 
//
// returns an index page for every version of this path in the inventory.
// TODO: clean this up so that it doesn't call send_html but returns a list

function history(repo_url, req, oid, inv, path) {
  var versions = {};
  Object.keys(inv.versions).forEach((v) => {
    var state = inv.versions[v]['state'];
    var hash = Object.keys(state).filter(function(h) {
      return state[h].includes(path);
    });
    if( hash.length > 0 ) {
      req.warn("Adding " + hash  + " to versions");
      versions[v] = hash[0];
    }
  });
  var links = Object.keys(versions).sort().map((v) => {
    return { 
      text: v + ' ' + versions[v],
      href: version_url(repo_url, oid, v, path)
    }
  });
  send_html(req, page_html(oid + '/' + path + ' history', links, null));
}


// version_url(repo, oid, v, path)
//
// utility to build a URL for a versioned path for the history index


function version_url(repo, oid, v, path) {
  return '/' + repo + '/' + oid + '.' + v + '/' + path;
}




// resolve_pairtree(id, separator)
//
// Converts an OID from the incoming URL to a path using the
// pairtree algorithm.
//
// adapted from npm pairtree

function resolve_pairtree(id, separator) {
  separator = separator || '/';
  id = id.replace(/[\"*+,<=>?\\^|]|[^\x21-\x7e]/g, function(c) {
    c = stringToUtf8ByteArray(c);
    var ret = '';
    for (var i=0, l=c.length; i<l; i++) {
      ret += '^' + c[i].toString(16);
    }
    //c = c.charCodeAt(0);
    //if (c > 255) return ''; // drop characters greater than ff
    //return '^' + c.toString(16);
    return ret;
  });
  id = id.replace(/\//g, '=').replace(/:/g, '+').replace(/\./g, ',');
  var path = separator;
  while (id) {
    path += id.substr(0, 2) + separator;
    id = id.substr(2);
  }
  return path;
}


// stringToUtf8ByteArray(str)
//
// Converts a string to a bytearray - adapted from npm pairtree

function stringToUtf8ByteArray (str) {
  str = str.replace(/\r\n/g, '\n');
  var out = [], p = 0;
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    if (c < 128) {
      out[p++] = c;
    } else if (c < 2048) {
      out[p++] = (c >> 6) | 192;
      out[p++] = (c & 63) | 128;
    } else {
      out[p++] = (c >> 12) | 224;
      out[p++] = ((c >> 6) & 63) | 128;
      out[p++] = (c & 63) | 128;
    }
  }
  return out;
}




module.exports = {
  file: file,
  index: index
};

