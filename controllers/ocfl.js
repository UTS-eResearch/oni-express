// ocfl utilities

var fs = require('fs');

var DEFAULT_PAGE_SIZE = 10;

// ocfl(req)
//
// entry point for ocfl requests. Tries to parse the incoming URI and 
// returns either a resource or an index page (if the config permits)

function ocfl(req) {

  var repo_path = req.variables.ocfl_path;
  var ocfl_repo = req.variables.ocfl_repo;
  var ocfl_solr = req.variables.ocfl_solr;
  var ocfl_resolver = req.variables.ocfl_resolver;
  var index_file = req.variables.ocfl_index_file || '';
  var allow_autoindex = req.variables.ocfl_autoindex || '';
  var ocfl_versions = req.variables.ocfl_versions;
  var ocfl_allow = req.variables.ocfl_allow || '';
  var ocfl_referrer =  req.variables.ocfl_referrer || '';

  if( ocfl_referrer ) {
    req.error("Checking referrer against " + ocfl_referrer);
    var referrer = req.headersIn['Referer'];
    if( ! referrer || ! referrer.match(ocfl_referrer) ) {
      not_found(req, "Wrong or missing referrer: " + referrer);
      return;
    } else {
      req.error("ocfl_referrer matches " + referrer);
    }
  }

  var parts = parse_uri(repo_path, req.uri);

  // uri doesn't match repo_path

  if( !parts ) {
    not_found(req, "URI doesn't match " + repo_path + " - check config");
    return;
  }

  // if there's no oid, return the repo index if config allows it

  if( !parts['oid'] ) {
    if( ocfl_solr && allow_autoindex ) {
      solr_index(req);
      return;
    } else {
      not_found(req, "OID missing");
      return;
    }
  }

  var oid = parts['oid'];
  var v = parts['version'];
  var content = parts['content'] || index_file;

  if( !allow_path(ocfl_allow, content) ) {
    not_found(req, "Content path doesn't match ocfl_allow");
    return;
  }

  resolve_oid(req, oid, (opath) => {
    if( opath ) {
      if( opath.substr(-1) !== '/') {
        opath += '/';
      }
      serve_path(req, oid, ocfl_repo + '/' + opath, v, content);
    }
  });

}


// serve_path(req, oid, opath, v, content)
//
// This is called after the oid has been resolved via a callback
// (because oid resolution might be async if it's a solr lookup])


function serve_path(req, oid, opath, v, content) {

  var ocfl_files = req.variables.ocfl_files;
  var index_file = req.variables.ocfl_index_file || '';
  var allow_autoindex = req.variables.ocfl_autoindex || '';
  var ocfl_versions = req.variables.ocfl_versions;
  var ocfl_allow = req.variables.ocfl_allow || '';

  var show_hist = req.args['history'];

  if( ocfl_versions !== "on" ) {
    v = undefined
  }

  if( index_file !== '' ) {
    allow_autoindex = '';
  }

  var inv = load_inventory(req, ocfl_files + '/' + opath);

  if( ! inv ) {
    pending(req, "Couldn't load inventory for "+ oid);
    return;
  }

  if( !v ) {
    v = inv.head;
  } else {
    v = v.slice(1)
  }

  if( show_hist && ocfl_versions === "on" ) {
    history(url_path, req, oid, inv, content);
  }

  if( ! inv.versions[v] ) {
    not_found(req, "Couldn't find version " + v);
    return;
  }
  if( allow_autoindex === 'on' && ( content === '' || content.slice(-1) === '/' ) ) {
    var index = path_autoindex(inv, v, content, ocfl_allow);
    if( index ) {
      send_html(req, page_html(oid + '.' + v + '/' + content, index, null));
    } else {
      not_found(req, "No match found for path " + opath);
    }
  } else {
    var vpath = find_version(inv, v, content);
    if( vpath ) {
      var newroute = '/' + opath + '/' + vpath;
      if( req.variables.ocfl_referrer ) {
        // If we're limiting using ocfl_referrer, prevent the browser
        // from keeping a copy
        req.headersOut['Cache-Control'] = 'no-store';
      }
      req.internalRedirect(newroute);
    } else {
      not_found(req, "Couldn't find content " + content + " in " + oid + "." + v);
    }
  }
}


// parse_uri(repo_path, uri)
//
// parses an incoming uri.
//
// if the first part of the uri doesn't match repo_path, returns null
//
// if it does, tries to split the rest of the uri into
//
// /REPO_PATH/OID.VERSION/CONTENT
//
// and returns an object with members oid, version content, any of which
// may be empty. 

function parse_uri(repo_path, uri) {

  if ( uri.substr(1, repo_path.length) !== repo_path ) {
    return null;
  }

  var parts = uri.substr(repo_path.length + 2).split('/');

  var components = {};

  if( parts.length < 1 ) {
    return components;
  }

  var oidparts = parts[0].split('.v');
  components['oid'] = oidparts[0];
  if( oidparts.length === 2 ) {
    components['version'] = 'v' + oidparts[1]
  }
  if( parts.length > 1 ) {
    components['content'] = parts.slice(1).join('/');
  }
  return components;
}

// resolve_oid(req, oid, success)
//
// Pick an oid strategy and use it to resolve the oid to a path, then
// call the success callback with the path if it works.
// If resolution fails, the resolver function is expected to call not_found
// with an error message

function resolve_oid(req, oid, success) {
  if( req.variables.ocfl_resolver === 'solr' ) {
    resolve_solr(req, oid, success);
  } else {
    success(resolve_pairtree(oid));
  }
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




function resolve_solr(req, oid, success) {
  req.error("resolve_solr");
  var ocfl_solr = req.variables.ocfl_solr;
  var ocfl_repo = req.variables.ocfl_repo;

  var esc_oid = oid.replace(' ', '\\ ');

  var query = solr_query({ q: "uri_id:" + esc_oid, fl: [ 'path' ] });
  req.error("oid: '" + oid + "'");
  req.error("esc_oid: '" + esc_oid + "'");
  req.error("Solr lookup query: '" + query + "'");
  req.subrequest(ocfl_solr + '/select', { args: query }, ( res ) => {
    var solrJson = JSON.parse(res.responseBody);
    if( solrJson['response']['docs'].length === 1 ) {
      var opath = String(solrJson['response']['docs'][0]['path']);
      success(opath);
    } else {
      not_found(req, "Solr lookup failed for for " + oid);
    }
  
  });
}






// load_inventory(req, object)
//
// Attempts to load and parse the inventory.json file for an object.

function load_inventory(req, object) {
  var ifile = object + 'inventory.json';
  try {
    var contents = fs.readFileSync(ifile);
    return JSON.parse(contents);
  } catch(e) {
    req.error("Error reading " + ifile);
    req.error(e);
    return null;
  }
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


// not_found(req, message)
//
// utility function to send message to the error log and redirect to
// the 404-not-found page

function not_found(req, message) {
  req.error(message);
  req.internalRedirect(req.variables.ocfl_err_not_found);
}

// pending(req, message)
//
// utility function to send message to the error log and redirect to
// the object-pending page

function pending(req, message) {
  req.error(message);
  req.internalRedirect(req.variables.ocfl_err_pending);  
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


// page_html(title, links, nav)
//
// Generates an HTML index page given a title, list of links and
// nav (which is just arbitrary HTML)
//
// Links is an array of objects with values 'href' and 'text'

function page_html(title, links, nav) {

  var html = '<html><head><link rel="stylesheet" type="text/css" href="/assets/ocfl.css"></head>\n' +
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
  '<div id="footer"><a href="https://github.com/UTS-eResearch/ocfl-nginx">ocfl-nginx bridge v1.0.3</a></div>\n' +
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


// send_html(req, html)
//
// Sends an HTML response, doing all of the headers properly.

function send_html(req, html) {
  req.status = 200;
  req.headersOut['Content-Type'] = "text/html; charset=utf-8";
  req.headersOut['Content-Length'] = html.length;
  req.sendHeader();
  req.send(html);
  req.finish();
}


// send_json(req, html)
//
// Sends a JSON response, doing all of the headers properly.

function send_json(req, json) {
  req.status = 200;
  var jsonS = JSON.stringify(json);
  req.headersOut['Content-Type'] = "application/json; charset=utf-8";
  req.headersOut['Content-Length'] = jsonS.length;
  req.sendHeader();
  req.send(jsonS);
  req.finish();
}




