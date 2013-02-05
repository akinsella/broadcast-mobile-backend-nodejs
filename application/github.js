var utils = require('./utils.js');

module.exports = function(app) {

    app.get('/github/*', function(req, res) {

        var options = {
            req: req,
            res: res,
            url: "https://api.github.com/" + utils.getUrlToFetch(req).substring("/github/".length) + "?count=100",
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