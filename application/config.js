var cf = require("cloudfoundry");

var _ = require("underscore")._;

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
           'redis-2.6': [{
               name: 'broadcast-mobile-backend-redis',
               label: 'redis-2.6',
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

var redisConfig = cf.services["redis-2.6"][0];

module.exports = {
    cf:cf,
    redisConfig: redisConfig
};
