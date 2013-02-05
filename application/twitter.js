var utils = require('./utils.js');
var twitter = require('ntwitter');

var twit = new twitter({
  consumer_key: process.env.OAUTH_TWITTER_CONSUMER_KEY,
  consumer_secret:  process.env.OAUTH_TWITTER_CONSUMER_SECRET,
  access_token_key:  process.env.OAUTH_TWITTER_ACCESS_TOKEN_KEY,
  access_token_secret: process.env.OAUTH_TWITTER_ACCESS_TOKEN_SECRET
});


module.exports = function(app) {

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

};