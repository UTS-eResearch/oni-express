var express = require('express');
var session = require('express-session');
var path = require('path');
var proxy = require('express-http-proxy');
var logger = require('morgan');
var bodyParser = require('body-parser');
var cors = require('cors');
var nocache = require('nocache');
var useragent = require('express-useragent');

const jwt = require('jwt-simple');

var ocfl = require('./controllers/ocfl');
var check_jwt = require('./controllers/check_jwt');

var MemcachedStore = require("connect-memcached")(session);

var app = express();

var env = app.get('env');

var configFile = process.argv[2] || './config/express.json';
console.log('Using config file: ' + configFile);
var config = require(configFile)[env];

const {getPortalConfig} = require('./controllers/config');

const ocfl_path = config.ocfl.url_path || 'ocfl';

app.use(logger('dev'));

app.use(nocache());
app.use(useragent.express());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.set('trust proxy', 1);


app.use(session({
	secret: config.session.secret,
	resave: false,
	saveUninitialized: false,
	proxy: true,
	store: new MemcachedStore({
		hosts: [ config.session.server ]
	}),
	cookie: {
		maxAge: config.session.expiry * 60 * 60 * 1000
	}

}));

if( config['cors'] ) {
	app.use(cors());
}


// checkSession: middleware which checks that the user is logged in and has
// values in their session which match what's expected in config.auth.allow.
//
// if the route is /jwt, let it through without checking (because this is the
// return URL from AAF)
// if the route is /, redirect to AAF if there's no session or uid

function checkSession(req, res, next) {
	console.log(`checkSession: ${req.url}`);
	if( config['clientBlock'] ) {
		const ua = req.useragent;
		for( cond of config['clientBlock'] ) {
			if( ua[cond] ) {
				console.log(`client blocked ${cond}`);
				res.status(403).send("Browser or client not supported");
				return;
			}
		}
	}
	if( req.url === '/jwt/' || req.url === '/jwt' || config['auth']['UNSAFE_MODE'] ) {
		next();
	} else {
		const allow = config['auth']['allow'];
		if( ! req.session ||  ! req.session.uid ) {
			if( req.url === '/' ) {
				res.redirect(303, config.auth.authURL);
			} else {
				res.status(403).send("Forbidden");
			}
		} else {
			var ok = true;
			for( field in allow ) {
				if( !(field in req.session) || ! req.session[field].match(allow[field]) ) {
					ok = false;
					console.log(`session check failed for ${field} ${req.session[field]}`);
				}
			}
			if( ok ) {
				next();
			} else {
				req.status(403).send("Forbidden (this is from checkSession)");
			}
		}
	}
}


app.use(checkSession);



// authentication endpoint


app.post('/jwt', (req, res) => {

	const authjwt = jwt.decode(req.body['assertion'], config.auth.jwtSecret);
	if( check_jwt(config.auth, authjwt) ) {
		console.log("AAF authentication was successful");
		const atts = authjwt[config.auth.attributes];
		req.session.uid = atts['mail'];
		req.session.displayName = atts['displayname'];
		req.session.affiliation = atts['edupersonscopedaffiliation'];
		res.redirect('/');
	} else {
		console.log("AAF authentication failed");
		res.sendStatus(403);
	}

});






app.post("/auth", (req, res) => {
});




app.get('/config/portal', async (req,res) =>{
	const portalConfig = await getPortalConfig({indexer: config['indexer'], express: config, base: config['portal']});
	res.json(portalConfig);
});

app.get('/config/portal', async (req,res) =>{
	const portalConfig = await getPortalConfig({indexer: config['indexer'], express: config, base: config['portal']});
	res.json(portalConfig);
});

// ocfl-express endpoints


app.get(`/${ocfl_path}/`, async (req, res) => {
	console.log(`/ocfl/ Session id: ${req.session.id}`);
	// if( !req.session.uid ) {
	// 	console.log("/ocfl/repo endpoint: no uid in session");
	//   	res.status(403).send("Forbidden");
	//   	return;
	// }
	if( config.ocfl.autoindex ) {
		const index = await ocfl.index(config, req.params.repo, req.query);
		res.send(index);
	} else {
		console.log("Repository indexing is not configured");
		res.status(404).send("Repository index is not configured");
	}
});

// fixme: make cache-control no-store

app.get(`/${ocfl_path}/:oidv/:content*?`, async (req, res) => {
	// console.log(`/ocfl/ Session id: ${req.session.id}`);
	// console.log(`ocfl: session = ${req.session.uid}`);
	// if( !req.session.uid ) {
	// 	console.log("/ocfl/repo/oid: no uid found in session");
	//  	res.status(403).send("Forbidden");
	//   	return;
	// }

	if( config.ocfl.referrer && req.headers['referer'] !== config.ocfl.referrer ) {
		console.log(`Request referrer ${req.headers['referer']} does not match ${config.ocfl.referrer}`);
		res.status(403).send("Forbidden");
	} else {
		console.log(`ocfl get: ${JSON.stringify(req.params)}`);
		var content = req.params.content;
		if( req.params[0] ) {
			content += req.params[0];
		}
  		var oidparts = req.params.oidv.split('.v');
  		var oid = oidparts[0];
  		var v = ( oidparts.length === 2 ) ? 'v' + oidparts[1] : '';

		console.log(`ocfl get: oid ${oid} v ${v} content ${content}`);

		if( !content || content.slice(-1) === '/' ) {
			if( config.ocfl.index_file ) {
				const index_file = content ? content + config.ocfl.index_file : config.ocfl.index_file;
				const file = await ocfl.file(config, oid, v, index_file);
				if( file ) {
					res.sendFile(file);
					return;
				}
				// if the index_file is not found, fall through to autoindex if
				// it's configured
			}
			if( config.ocfl.autoindex ) {
				const index = await ocfl.index(config, req.query, oid, v, content);
				if( index ) {
					res.send(index);
				} else {
					res.status(404).send("Not found");
				}
			} else {
				console.log("Autoindex not available");
				res.status(404).send("Autoindex is not available");
			}
		} else {
			const file = await ocfl.file(config, oid, v, content);
			if( file ) {
				res.sendFile(file);
			} else {
				res.status(404).send("Not found");
			}
		}
	}
});

// solr proxy - only allows select queries


app.use('/solr/ocfl/select*', proxy(config['solr'], {
  filter: (req, res) => {

  	// if( ! req.session.uid ) {
 		// console.log("/solr/ocfl/ No iud found in session");
  	// 	return false;
  	// }
  	if( req.method !== 'GET') {
  		return false;
  	}
  	return true;
  },
  proxyReqPathResolver: (req) => {
  	if( config['solr_fl'] ) {
  		return req.originalUrl + '&fl=' + config['solr_fl'].join(',')
  	} else {
  		return req.originalUrl;
	}
  }
}));



// data portal front page

app.use('/', express.static(path.join(__dirname, 'portal')));


module.exports = app;
