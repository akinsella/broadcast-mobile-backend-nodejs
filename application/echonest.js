var utils = require('./utils.js');

module.exports = function(app) {

    // https://developer.echonest.com/account/profile
    app.get('/xpua/*', function(req, res) {

        //http://developer.echonest.com/api/v4/artist/search?api_key=FILDTEOIK2HBORODV&name=radiohead

        var url = "http://developer.echonest.com/api/v4/" + utils.getUrlToFetch(req).substring("/xpua/".length) + "";
        url += (url.indexOf('?') >= 0 ? "&" : "?") + "api_key=" + process.env.OAUTH_ECHO_NEST_API_KEY;

        var options = {
            req: req,
            res: res,
            url: url,
            cacheKey: utils.getCacheKey(req),
            forceNoCache: utils.getIfUseCache(req),
            cacheTimeout: 900,
            callback: utils.responseData
        };

        try {
            utils.getData(options);
        } catch(err) {
            var errorMessage = err.name + ": " + err.message;
            utils.responseData(500, errorMessage, undefined, options);
        }

    });

};