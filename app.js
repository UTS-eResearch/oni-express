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


// ocfl-express endpoint 

app.use('/ocfl', async (req, res) => {
	const file = await ocfl(req, res, config['ocfl']);
	res.sendFile(file);

});

// solr proxy

app.use('/solr', proxy(config['solr'], {
  filter: function(req, res) {
     return req.method == 'GET';
  }
}));










module.exports = app;
