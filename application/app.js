var express = require('express');

var requestLogger = require('./requestLogger.js');
var allowCrossDomain = require('./allowCrossDomain.js');
var utils = require('./utils.js');
var config = require('./config.js');

var staticRoutes = require('./static.js');
var echonestRoutes = require('./echonest.js');
var githubRoutes = require('./github.js');
var twitterRoutes = require('./twitter.js');

console.log('Application Name: ' + config.cf.app.name);
console.log('Env: ' + JSON.stringify(config.cf));

var app = express.createServer();

app.configure(function() {
    app.use(express.static(__dirname + '/public'));
    app.use(express.logger());
    app.use(express.bodyParser());
    app.use(express.cookieParser());
    app.use(express.session({secret: config.cf.app.instance_id}));
    app.use(express.logger());
    app.use(express.methodOverride());
    app.use(allowCrossDomain());
    app.set('running in cloud', config.cf.cloud);
    app.use(requestLogger());

    app.use(app.router);
});

app.configure('development', function () {
    app.use(express.errorHandler({ dumpExceptions:true, showStack:true }));
});

app.configure('production', function () {
    app.use(express.errorHandler());
});

staticRoutes(app);
echonestRoutes(app);
githubRoutes(app);
twitterRoutes(app);


process.on('SIGTERM', function () {
    console.log('Got SIGTERM exiting...');
    // do some cleanup here
    process.exit(0);
});

// var appPort = cf.getAppPort() || 9000;
var appPort = config.cf.port || 9000;
console.log("Express listening on port: " + appPort);
app.listen(appPort);

console.log("Initializing broadcast-mobile-backend application");
