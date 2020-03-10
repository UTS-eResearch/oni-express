var express = require('express');
var session = require('express-session');
var path = require('path');
var proxy = require('express-http-proxy');
var logger = require('morgan');
var bodyParser = require('body-parser');

const jwt = require('jwt-simple');

var ocfl = require('./controllers/ocfl');
var check_jwt = require('./controllers/check_jwt');

var app = express();

var env = app.get('env');
var config = require('./config/config.json')[env];

app.use(logger('dev'));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.set('trust proxy', 1);


app.use(session({
	secret: config.session.secret,
	resave: false,
	saveUninitialized: true
}));



// authentication endpoint


app.post('/jwt', (req, res) => {

	const authjwt = jwt.decode(req.body['assertion'], config.auth.jwtSecret);
	console.log(JSON.stringify(authjwt, null, 8))
	if( check_jwt(config.auth, authjwt) ) {
		console.log("AAF authentication was successful");
		const atts = authjwt[config.auth.attributes];
		req.session.uid = atts['mail'];
		req.session.displayName = atts['displayname'];
		req.session.affiliation = atts['edupersonscopedaffiliation'];
		console.log(JSON.stringify(req.session));
		res.redirect('/');
	} else {
		console.log("AAF authentication failed");
		res.sendStatus(403);
	}

})









// data portal front page

app.use('/', ( req, res, next ) => {
	console.log("/ endpoint, session = " + JSON.stringify(req.session));
	if( req.session.uid ) {
		console.log("/ endpoint found authenticated user " + req.session.uid);
		next(); // express.static(path.join(__dirname, 'public'));
	} else {
		console.log("redirecting to " + config.auth.authURL);
		res.redirect(303, config.auth.authURL);
	}
});


app.use('/', express.static(path.join(__dirname, 'public')));







// anything past this point just gives a 403 if there's no uid in the session

// ocfl-express endpoints

app.get('/ocfl/:repo/', async (req, res) => {
	if( !req.session.uid ) {
		res.status(403).send("Forbidden");
		return;
	}
	if( req.params.repo in config.ocfl && config.ocfl[req.params.repo].autoindex ) {
		const index = await ocfl.index(config, req.params.repo, req.query);
		res.send(index);
	} else {
		console.log("No autoindex");
		res.status(404).send("Not found");
	}
});

// fixme: make cache-control no-store

app.get('/ocfl/:repo/:oidv/:content?', async (req, res) => {

	if( !req.session.uid ) {
		res.status(403).send("Forbidden");
		return;
	}

	var repo = req.params.repo;
	var content = req.params.content;
  	var oidparts = req.params.oidv.split('.v');
  	var oid = oidparts[0];
  	var v = ( oidparts.length === 2 ) ? 'v' + oidparts[1] : '';

	if( ! (repo in config.ocfl) ) {
		res.status(404).send("Not found");
	} else {
		if( !req.params.content || req.params.content.slice(-1) === '/' ) {
			if( config.ocfl[repo].autoindex ) {
				const index = await ocfl.index(config, repo, req.query, oid, v, content);
				if( index ) {
					res.send(index);
				} else {
					res.status(404).send("Not found");
				}
			} else {
				res.status(403).send("Forbidden");
			}
		} else {
			if( config.ocfl[repo].referrer && req.headers['referer'] !== config.ocfl[repo].referrer ) {
				res.status(403).send("Forbidden");
			} else {
				const file = await ocfl.file(config, repo, oid, v, content);
				if( file ) {
					res.sendFile(file);
				} else {
					res.status(404).send("Not found");
				}
			}
		}
	}
});

// solr proxy - only allows select queries 

app.use('/solr/:core/select*', proxy(config['solr'], {
  filter: (req, res) => {
  	if( ! req.session.uid ) {
  		return false;
  	}
  	if( req.method !== 'GET') {
  		return false;
  	}
  	return req.params.core in config['ocfl'];
  },
  proxyReqPathResolver: (req) => {
  	return req.originalUrl;
  } 
}));












module.exports = app;
