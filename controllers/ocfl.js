// Adapted from ocfl-nginx for the express version 

var fs = require('fs-extra');
var path = require('path');
var axios = require('axios');

var DEFAULT_PAGE_SIZE = 10;

// file(config, repo, oid, version, content)
//
// Resolve a versioned oid and content path into a filename

async function file(config, repo, oid, version, content) {

  const opath = await resolve_oid(config.ocfl[repo], oid);
  if( !opath  ) {
    return '';
  }
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

async function index(config, repo, args, oid, version, content) {
  if( oid ) {
    const opath = await resolve_oid(config.ocfl[repo], oid);
    if( !opath  ) {
      return '';
    }
    const ocfl_root = config.ocfl[repo].repository;

    try {
      const inv = await load_inventory(ocfl_root, opath);
      if( !version ) {
        version = inv.head;
      } else {
        version = version.slice(1)
      }
      const cpath = content || '';
      const index = path_autoindex(inv, version, cpath, config.ocfl[repo].allow);
      return page_html(oid + '.' + version + '/' + cpath, index, null);
    } catch(e) {
      console.log(e);
      return '';
    }
  } else {
    if( config.ocfl[repo].resolver === 'solr' ) {
      return await solr_index(config.ocfl[repo], repo, args);
    } else {
      return '';
    } 
  }
}



// resolve_oid(config, oid)
//
// use the resolver strategy defined in the config to resolve an oid
// into an ocfl object path

async function resolve_oid(config, oid) {
  if( config.resolver === 'solr' ) {
    return await resolve_solr(config.solr, oid);
  } else {
    return resolve_pairtree(oid);
  }
}



async function resolve_solr(solr, oid) {

  var esc_oid = oid.replace(' ', '\\ ');

  var query = { q: "uri_id:" + esc_oid, fl: 'path' };
  
  try {
    var resp = await axios.get(solr + '/select', { params: query });
    if( resp.status === 200 ) {
      if( resp.data['response']['docs'].length === 1 ) {
        var opath = String(resp.data['response']['docs'][0]['path']);
        return opath;
      } else {
        console.log(`OID ${oid} not found`);
        return null;
      }
    } else {
      console.log(`Solr request failed with status ${resp.status}`);
      return null;
    }
  } catch(e) {
    console.log(`OID lookup error ${e}`);
    return null;
  }
}
  



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


async function solr_index(config, repo, args) {
  var start = args['start'] || '0';
  var format = args['format'] || 'html';
  var fields = [ 'id', 'name', 'path', 'uri_id' ];
  if( format === 'json' && args['fields'] ) {
    fields = args['fields'].split(',');
  }
  var page_size = DEFAULT_PAGE_SIZE;
  if( config.page_size ) {
    page_size = Number(config.ocfl_page_size);
    if( isNaN(page_size) ) {
      page_size = DEFAULT_PAGE_SIZE;
    }
  } 
  
  var query = { start: start, rows: page_size, q: "*:*", fl: fields.join(',') };

  if( config.type ) {
    query['fq'] = 'record_type_s:' + config.type;
  }

  try {
    const resp = await axios.get(config.solr + '/select', { params: query });

    if( resp.status === 200 ) {
      if( format === 'json' ) {
        return resp.data['response']['docs'];
      } else {
        var docs = resp.data['response']['docs'];
        var start = resp.data['response']['start'];
        var numFound = resp.data['response']['numFound'];
        var nav = solr_pagination(repo, numFound, start, page_size);
        var index = docs.map((d) => {
          return {
            href: '/ocfl/' + repo + '/' + d['uri_id'] + '/',
            text: d['name'][0]
          }
        });
        return page_html('OCFL index ' + repo, index, nav);
      }
    } else {
      return '';
    }
  } catch(e) {
    console.log(`Solr error index ${e}`);
    return '';
  }
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
  var url = '/ocfl/' + repo + '/'
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



// page_html(title, links, nav)
//
// Generates an HTML index page given a title, list of links and
// nav (which is just arbitrary HTML)
//
// Links is an array of objects with values 'href' and 'text'

function page_html(title, links, nav) {

  var html = '<html><head><link rel="stylesheet" type="text/css" href="/public/stylesheets/ocfl.css"></head>\n' +
    '<body>\n' +
    '<div id="header">\n' +
    '<div id="title">' + title + '</div>\n';

  if( nav ) {
    html += '<div id="nav">' + nav + '</div>\n';
  }

  html += '</div>\n<div id="body">\n';

  links.forEach((l) => {
    html += '<div class="item"><a href="' + l['href'] + '">' + l['text'] + '</a></div>\n'
  });

  html += '</div>\n' +
  '<div id="footer"><a href="https://github.com/UTS-eResearch/oni-express">ocfl-express bridge v1.0.3</a></div>\n' +
  '</body>\n</html>\n';

  return html;


}


// nav_links(repo, numFound, start, rows)
//
// Renders pagination links for the solr index


function nav_links(repo, numFound, start, rows) {
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
        console.log(`Matched ${path} -> ${p}`);
        var rest = p.substring(l).split('/');
        console.log(`rest (${l}) ${JSON.stringify(rest)}`);
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
  console.log(`Paths: ${paths}`);

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


