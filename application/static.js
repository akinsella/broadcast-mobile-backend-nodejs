module.exports = function(app) {

    app.get('/', function(req, res) {
       console.log('File path: ' + __dirname + '/www/index.html');
       res.sendfile(__dirname + '/www/index.html');
   });

   app.get('/index.html', function(req, res) {
       res.sendfile(__dirname + '/www/index.html');
   });

};