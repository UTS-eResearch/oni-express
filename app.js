var express = require('express');
var path = require('path');
var proxy = require('express-http-proxy');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var ocfl = require('./controllers/ocfl');

var app = express();

var env = app.get('env');
var config = require('./config/config.json')[env];

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// static for the portal

app.use(express.static(path.join(__dirname, 'public')));


// ocfl-express endpoints

app.get('/ocfl/:repo/', async (req, res) => {

	if( req.params.repo in config.ocfl && config.ocfl[req.params.repo].autoindex ) {
		const index = await ocfl.index(config, req.params.repo, req.query);
		res.send(index);
	} else {
		console.log("No autoindex");
		res.status(404).send("Not found");
	}
});

// fixme: check referer and make cache-control no-store

app.get('/ocfl/:repo/:oidv/:content?', async (req, res) => {

	var repo = req.params.repo;
	var content = req.params.content;
  	var oidparts = req.params.oidv.split('.v');
  	var oid = oidparts[0];
  	var v = ( oidparts.length === 2 ) ? 'v' + oidparts[1] : '';

	if( repo in config.ocfl ) {
		if( !req.params.content || req.params.content.slice(-1) === '/' ) {
			if( config.ocfl[repo].autoindex ) {
				const index = await ocfl.index(config, repo, req.query, oid, v, content);
				if( index ) {
					res.send(index);
				}
			}
			res.status(404).send("Not found");
		}
	} else {
		const file = await ocfl.file(config, repo, oid, v, content);
		if( file ) {
			res.sendFile(file);
		} else {
			res.status(404).send("Not found");
		}
	}
});

// solr proxy

app.use('/solr/*', proxy(config['solr'], {
  filter: (req, res) => {
     return req.method == 'GET';
  },
  proxyReqPathResolver: (req) => {
  	return req.originalUrl;
  } 
}));










module.exports = app;
