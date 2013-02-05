var redis = require('./redis.js');
var restler = require('restler');

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
            redis.client.get(options.cacheKey, function (err, data) {
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
        var contentType = getContentType(response);
        console.log("[" + options.url + "] Http Response - Content-Type: " + contentType);
        console.log("[" + options.url + "] Http Response - Headers: ", response.headers);


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
                redis.client.set(options.cacheKey, jsonData);
                redis.client.expire(options.cacheKey, options.cacheTimeout ? options.cacheTimeout : 60 * 60);
            }
        }
    });
}


module.exports = {
    getData: getData,
    responseData: responseData,
    getIfUseCache:getIfUseCache,
    fetchDataFromUrl: fetchDataFromUrl,
    getCacheKey: getCacheKey,
    getUrlToFetch: getUrlToFetch,
    getData: getData
};