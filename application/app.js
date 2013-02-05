var request = require('request');
var fs = require('fs');
var express = require('express');
var restler = require('restler');
var util = require('util');
var path = require('path');

var redis = require("redis");
var mysql = require('mysql');

var underscore = require("underscore");
var cf = require("cloudfoundry");

var twitter = require('ntwitter');


var _ = underscore._;

if(!cf.app) {
   var LOCAL_CF_CONFIG = {
       cloud: false,
       host: 'localhost',
       port: 9000,
       app: {
           instance_id: '7bcc459686eda42a8d696b3b398ed6d1',
           instance_index: 0,
           name: 'broadcast-mobile-backend',
           uris: ['broadcast-mobile-backend.cloudfoundry.com'],
           users: ['alexis.kinsella@gmail.com'],
           version: '11ad1709af24f01286b2799bc90553454cdb96c6-1',
           start: '2012-08-29 00:09:39 +0000',
           runtime: 'node',
           state_timestamp: 1324796219,
           port: 9000,
           limits: {
               fds: 256,
               mem: 134217728,
               disk: 2147483648
           },
           host:'localhost'
       },
       services: {
           'redis-2.2': [{
               name: 'broadcast-mobile-backend-redis',
               label: 'redis-2.2',
               plan: 'free',
               credentials: {
                   node_id: 'redis_node_2',
                   host: 'localhost',
                   hostname: 'localhost',
                   port: 6379,
                   password: 'Password123',
                   name: 'broadcast-mobile-backend',
                   username: 'broadcast-mobile-backend'
               },
               version: '2.2'
           }]
       }
   };

   cf = _.extend(cf, LOCAL_CF_CONFIG);
}

var redisConfig = cf.services["redis-2.2"][0];
//var mysqlConfig = cf.services["mysql-5.1"][0];

console.log('Application Name: ' + cf.app.name);
console.log('Env: ' + JSON.stringify(cf));


var twit = new twitter({
  consumer_key: process.env.OAUTH_TWITTER_CONSUMER_KEY,
  consumer_secret:  process.env.OAUTH_TWITTER_CONSUMER_SECRET,
  access_token_key:  process.env.OAUTH_TWITTER_ACCESS_TOKEN_KEY,
  access_token_secret: process.env.OAUTH_TWITTER_ACCESS_TOKEN_SECRET
});


var app = express.createServer();

var allowCrossDomain = function(req, res, next) {
    res.header('Access-Control-Allow-Origin', "*");
    res.header('Access-Control-Allow-Methods', 'GET,POST');
    res.header('Access-Control-Allow-Headers', 'Content-Type');

    next();
};

app.configure(function() {
    app.use(express.static(__dirname + '/public'));
    app.use(express.logger());
    app.use(express.bodyParser());
    app.use(express.cookieParser());
    app.use(express.session({secret: cf.app.instance_id}));
    app.use(express.logger());
    app.use(express.methodOverride());
    app.use(allowCrossDomain);
    app.set('running in cloud', cf.cloud);

    app.use(app.router);
});


app.configure('development', function () {
    app.use(express.errorHandler({ dumpExceptions:true, showStack:true }));
});

app.configure('production', function () {
    app.use(express.errorHandler());
});

redis.debug_mode = false;

var redisClient = redis.createClient( redisConfig.credentials.port, redisConfig.credentials.hostname );

if (redisConfig.credentials.password) {
    redisClient.auth(redisConfig.credentials.password, function(err, res) {
        console.log("Authenticating to redis!");
    });
}

process.on('SIGTERM', function () {
    console.log('Got SIGTERM exiting...');
    // do some cleanup here
    process.exit(0);
});

// var appPort = cf.getAppPort() || 9000;
var appPort = cf.port || 9000;
console.log("Express listening on port: " + appPort);
app.listen(appPort);


redisClient.on("error", function (err) {
    console.log("Error " + err);
});

console.log("Initializing xebia-mobile-proxy application");

function removeParameters(url, parameters) {

  for (var id = 0 ; id < parameters.length ; id++) {
      var urlparts= url.split('?');

      if (urlparts.length>=2)
      {
          var urlBase=urlparts.shift(); //get first part, and remove from array
          var queryString=urlparts.join("?"); //join it back up

          var prefix = encodeURIComponent(parameters[id])+'=';
          var pars = queryString.split(/[&;]/g);
          for (var i= pars.length; i-->0;)               //reverse iteration as may be destructive
              if (pars[i].lastIndexOf(prefix, 0)!==-1)   //idiom for string.startsWith
                  pars.splice(i, 1);
          var result = pars.join('&');
          url = urlBase + (result ? '?' + result : '');
      }
  }

  return url;
}

function getParameterByName( url, name ) {
    name = name.replace(/[\[]/,"\\\[").replace(/[\]]/,"\\\]");
    var regex = new RegExp( "[\\?&]" + name + "=([^&#]*)" );
    var results = regex.exec( url );
    if( results == null ) {
        return "";
    }
    else {
        return decodeURIComponent(results[1].replace(/\+/g, " "));
    }
}

function sendJsonResponse(options, data) {

    var callback = getParameterByName(options.req.url, 'callback');

    var response = data;
    if (callback) {
        options.res.header('Content-Type', 'application/javascript');
        response = callback + '(' + response + ');';
    }
    else {
        options.res.header('Content-Type', 'application/json');
    }

    console.log("[" + options.url + "] Response sent: " + response);
    options.res.send(response);
}

function getContentType(response) {
    return response.header("Content-Type");
}

function isContentTypeJsonOrScript(contentType) {
    return contentType.indexOf('json') >= 0 || contentType.indexOf('script') >= 0;
}

function getCacheKey(req) {
    return removeParameters(req.url, ['callback', '_']);
}

function getUrlToFetch(req) {
    return removeParameters(req.url, ['callback']);
}

function getIfUseCache(req) {
    return getParameterByName(req.url, 'cache') === 'false';
}

function useCache(options) {
    return !options.forceNoCache;
}

function responseData(statusCode, statusMessage, data, options) {
    if (statusCode === 200) {
        if (options.contentType) {
            options.res.header('Content-Type', options.contentType);
        }
        sendJsonResponse(options, data);
    }
    else {
        console.log("Status code: " + statusCode + ", message: " + statusMessage);
        options.res.send(statusMessage, statusCode);
    }
}

function getData(options) {
    try {
        if (!useCache(options)) {
            fetchDataFromUrl(options);
        }
        else {
            console.log("[" + options.cacheKey + "] Cache Key is: " + options.cacheKey);
            console.log("Checking if data for cache key [" + options.cacheKey + "] is in cache");
            redisClient.get(options.cacheKey, function (err, data) {
                if (!err && data) {
                    console.log("[" + options.url + "] A reply is in cache key: '" + options.cacheKey + "', returning immediatly the reply");
                    options.callback(200, "", data, options);
                }
                else {
                    console.log("[" + options.url + "] No cached reply found for key: '" + options.cacheKey + "'");
                    fetchDataFromUrl(options);
                }
            });
        }
    } catch(err) {
        var errorMessage = err.name + ": " + err.message;
        options.callback(500, errorMessage, undefined, options);
    }
}

function fetchDataFromUrl(options) {
    console.log("[" + options.url + "] Fetching data from url");
    restler.get(options.url).on('complete', function (data, response) {
        console.log("Response Headers: ", response.headers);
        var contentType = getContentType(response);
        console.log("[" + options.url + "] Http Response - Content-Type: " + contentType);
        if ( !isContentTypeJsonOrScript(contentType) ) {
            console.log("[" + options.url + "] Content-Type is not json or javascript: Not caching data and returning response directly");
            options.contentType = contentType;
            options.callback(200, "", data, options);
        }
        else {
            var jsonData =  JSON.stringify(data);
            console.log("[" + options.url + "] Fetched Response from url: " + jsonData);
            options.callback(200, "", jsonData, options);
            if (useCache(options)) {
                redisClient.set(options.cacheKey, jsonData);
                redisClient.expire(options.cacheKey, options.cacheTimeout ? options.cacheTimeout : 60 * 60);
            }
        }
    });
}

app.get('/', function(req, res) {
    console.log('File path: ' + __dirname + '/www/index.html');
    res.sendfile(__dirname + '/www/index.html');
});

app.get('/index.html', function(req, res) {
    res.sendfile(__dirname + '/www/index.html');
});


twit.stream('user', {track:'XebiaFr'}, function(stream) {
//twit.stream('statuses/filter', { track: ['XebiaFR'] }, function(stream) {

  var xebiaFrTweets = [];

  stream.on('data', function (data) {
    console.log(data);

  var tweet = data;


  if (xebiaFrTweets.length > 100) {
      xebiaFrTweets.splice(100);
  }

  xebiaFrTweets.unshift(shortenTweet(tweet));

  });

  stream.on('end', function (response) {
    // Handle a disconnection
      console.log("Twitter Stream Connection End: " + response);
  });

  stream.on('destroy', function (response) {
    // Handle a 'silent' disconnection from Twitter, no end/error event fired
    console.log("Twitter Stream Connection destroyed: " + response);
  });

});

//app.get('/twitter/:user', function(req, res) {
app.get('/twitter/auth/stream/XebiaFr', function(req, res) {
    var callback = getParameterByName(req.url, 'callback');
    res.send(callback ? callback + "(" + JSON.stringify(xebiaFrTweets) + ");" : JSON.stringify(xebiaFrTweets));
});


//app.get('/twitter/:user', function(req, res) {
function shortenTweet(tweet) {
    var tweetShortened = {
        id:tweet.id,
        id_str:tweet.id_str,
        created_at:tweet.created_at,
        text:tweet.text,
        favorited:tweet.favorited,
        retweeted:tweet.retweeted,
        retweet_count:tweet.retweet_count,
        entities:tweet.entities
    };

    if (tweet.user) {
        tweetShortened.user = {
            id:tweet.user.id,
            id_str:tweet.user.id_str,
            screen_name:tweet.user.screen_name,
            name:tweet.user.name,
            profile_image_url:tweet.user.profile_image_url
        };
    }

    if (tweet.retweeted_status) {
        tweetShortened.retweeted_status = {
            id:tweet.retweeted_status.id,
            id_str:tweet.retweeted_status.id_str,
            created_at:tweet.retweeted_status.created_at
        };

        if (tweet.retweeted_status.user) {
            tweetShortened.retweeted_status.user = {
                id:String(tweet.retweeted_status.user.id),
                screen_name:tweet.retweeted_status.user.screen_name,
                name:tweet.retweeted_status.user.name,
                profile_image_url:tweet.retweeted_status.user.profile_image_url
            };
        }

    }
    return tweetShortened;
}

app.get('/twitter/auth/user/:user', function(req, res) {

    var user = req.params.user;
    console.log("User: " + user);
    var callback = getParameterByName(req.url, 'callback');

    redisClient.get(req.url, function (err, data) {
        if (!err && data) {
            console.log("[" + req.url + "] A reply is in cache key: '" + getCacheKey(req) + "', returning immediatly the reply");
            responseData(200, "", data,  {  callback: callback, req: req, res : res });
        }
        else {
            console.log("[" + req.url + "] No cached reply found for key: '" + getCacheKey(req) + "'");
            twit.getUserTimeline("screen_name=" + user + "&contributor_details=false&include_entities=true&include_rts=true&exclude_replies=false&count=50&exclude_replies=false",
                function(error, data) {
                    if (error) {
                        var errorMessage = err.name + ": " + err.message;
                        responseData(500, errorMessage, undefined,  {  callback: callback, req: req, res : res });
                    }
                    else {
                        var tweets = data;

                        var tweetsShortened = [];

                        _(tweets).each(function(tweet) {
                            tweetsShortened.push(shortenTweet(tweet));
                        });

                        var jsonData = JSON.stringify(tweetsShortened);

                        redisClient.set(getCacheKey(req), jsonData);
                        redisClient.expire(getCacheKey(req), 60 * 60);
                        console.log("[" + req.url + "] Fetched Response from url: " + jsonData);
                        callback(200, "", jsonData, {  callback: callback, req: req, res : res });
                    }
                });
        }
    });
});

app.get('/twitter/user/:user', function(req, res) {

    var user = req.params.user;
    console.log("User: " + user);
    var twitterUrl = "http://api.twitter.com/1/statuses/user_timeline.json?screen_name=" + user + "&contributor_details=false&include_entities=true&include_rts=true&exclude_replies=false&count=50&exclude_replies=false";
    console.log("Twitter Url: " + twitterUrl);

    var options = {
        req: req,
        res: res,
        url: twitterUrl,
        cacheKey: getCacheKey(req),
        forceNoCache: getIfUseCache(req),
        callback: onTwitterDataLoaded,
        user: user,
        cacheTimeout: 60 * 60,
        standaloneUrl: true
    };

    try {
        getData(options);
    } catch(err) {
        var errorMessage = err.name + ": " + err.message;
        responseData(500, errorMessage, undefined, options);
    }

    function onTwitterDataLoaded(statusCode, statusMessage, tweets, options) {
        if (statusCode !== 200) {
            responseData(statusCode, statusMessage, tweets, options);
        }
        else {
            var callback = getParameterByName(req.url, 'callback');
            res.header('Content-Type', 'application/json');

            var tweetsShortened = [];

            _(JSON.parse(tweets)).each(function(tweet) {

                tweetsShortened.push(shortenTweet(tweet));
            });

            res.send(callback ? callback + "(" + JSON.stringify(tweetsShortened) + ");" : JSON.stringify(tweetsShortened));
        }
    }

});

// To be refactored
app.get('/github/*', function(req, res) {

    var options = {
        req: req,
        res: res,
        url: "https://api.github.com/" + getUrlToFetch(req).substring("/github/".length) + "?count=100",
        cacheKey: getCacheKey(req),
        forceNoCache: getIfUseCache(req),
        cacheTimeout: 900,
        callback: responseData
    };

    try {
        getData(options);
    } catch(err) {
        var errorMessage = err.name + ": " + err.message;
        responseData(500, errorMessage, undefined, options);
    }
});
