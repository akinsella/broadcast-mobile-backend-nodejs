var config = require("./config.js");
var redis = require("redis");

redis.debug_mode = false;

var redisClient = redis.createClient( config.redisConfig.credentials.port, config.redisConfig.credentials.hostname );

if (config.redisConfig.credentials.password) {
    redisClient.auth(config.redisConfig.credentials.password, function(err, res) {
        console.log("Authenticating to redis!");
    });
}

redisClient.on("error", function (err) {
    console.log("Error " + err);
});

module.exports = {
    client: redisClient
};
