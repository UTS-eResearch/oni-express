var express = require('express');
var passport = require('passport');
var OIDCStrategy = require('passport-azure-ad').OIDCStrategy;
var session = require('express-session');
var path = require('path');
var proxy = require('express-http-proxy');
var logger = require('morgan');
var bodyParser = require('body-parser');
var cors = require('cors');

// Azure-AD stuff cribbed from

// https://github.com/AzureADQuickStarts/AppModelv2-WebApp-OpenIDConnect-nodejs/blob/master/app.js


var ocfl = require('./controllers/ocfl');

var MemcachedStore = require("connect-memcached")(session);

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

// TODO: a nice design for making authentication pluggable


passport.use(new OIDCStrategy({
	identityMetadata: config.auth.azuread.identityMetadata,
	clientID: config.auth.azuread.clientID,
	responseType: 'id_token',
	responseMode: 'form_post',
	redirectUrl: config.auth.azuread.redirectUrl,
	passReqToCallback: true,
	issuer: config.auth.azuread.issuer
}, function(req, iss, sub, profile, accessToken, refreshToken, done) {
	if( !profile.oid ) {
		return done(new Error("Authentication failed"));
	} else {
		return done(null, profile);
	}
}));



app.use(bodyParser.urlencoded({extended: true}));

app.use(passport.initialize());
app.use(passport.session());



// authentication endpoint

app.get('/auth/',
  function(req, res, next) {
    passport.authenticate('azuread-openidconnect', 
      { 
        response: res, 
        failureRedirect: '/'  
      }
    )(req, res, next);
  },
  function(req, res) {
    //log.info('We received a return from AzureAD.');
    res.redirect('/');
  });

// 'POST returnURL'
// `passport.authenticate` will try to authenticate the content returned in
// body (such as authorization code). If authentication fails, user will be
// redirected to '/' (home page); otherwise, it passes to the next middleware.
app.post('/auth',
  function(req, res, next) {
    passport.authenticate('azuread-openidconnect', 
      { 
        response: res,                      // required
        failureRedirect: '/'  
      }
    )(req, res, next);
  },
  function(req, res) {
    //log.info('We received a return from AzureAD.');
    res.redirect('/');
  });



// anything past this point just gives a 403 if there's no uid in the session

// ocfl-express endpoints


app.get('/ocfl/:repo/', async (req, res) => {
	console.log(`/ocfl/:repo/ Session id: ${req.session.id}`);
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
	console.log(`/ocfl/:repo/:oid Session id: ${req.session.id}`);
	console.log(`ocfl: session = ${req.session.uid}`);

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
				console.log("/ocfl/repo/oid: Autoindex is switched off");
				res.status(403).send("Forbidden");
			}
		} else {
			if( config.ocfl[repo].referrer && req.headers['referer'] !== config.ocfl[repo].referrer ) {
				console.log(`Request referrer ${req.headers['referer']} does not match ${config.ocfl[repo].referrer}`);
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
  	if( req.method !== 'GET') {
  		return false;
  	}
  	return req.params.core in config['ocfl'];
  },
  proxyReqPathResolver: (req) => {
  	return req.originalUrl;
  } 
}));


app.use('/', express.static(path.join(__dirname, 'portal')));

module.exports = app;
