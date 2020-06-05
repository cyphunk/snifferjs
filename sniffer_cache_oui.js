// This is a copy, perhaps slightly modified, of node-ieee-oui-lookup which
// is no longer maintained. Mainly I needed to control the sqlite3 dependency
// more directly when using sniffer.js within node-webkit.

// Currently just reading in file. For Sqlite revert version of this file in:
// https://github.com/cyphunk/snifferjs/commit/cae731e0ea2a578f7437dd475b68fe1e5533bc63
// memory profiling shows that initially file->array method creates large
// overhead until garbage collect:
//   { rss:  81932288, heapTotal: 56496224, heapUsed: 28114096 }
//   then later:
//   { rss:  53932032, heapTotal: 27606624, heapUsed: 23904760 }
// old sqlite version:
//   { rss:  44187648, heapTotal: 20811872, heapUsed: 14601848 }
//   after db created first time:
//   { rss: 196759552, heapTotal: 86843744, heapUsed: 61633488 }
//   then later, 10 minutes or so:
//   { rss: 146825216, heapTotal: 37327456, heapUsed: 17600248 }
//   on second load it is smaller:
//   { rss:  58720256, heapTotal: 33183072, heapUsed: 14307504 }


var fs          = require('fs');
var http        = require('http');
var readline    = require('readline');

var OUI_URL = 'http://standards-oui.ieee.org/oui/oui.txt';
//var OUI_URL = 'http://localhost:8000/testoui10k.txt';
//var OUI_URL = 'http://localhost:8000/testoui.txt';
var OUI_TXT = __dirname + '/oui.txt';
var FETCH_EVERY_N_DAYS = 30; // fetch oui.txt

exports.debug = false;
// exports.verbose = false; // print out a lot about ouiitems

var ouiitems = {};

exports.start = function(cb) {

    fs.stat(OUI_TXT, function(err, st1) {
      // on error or txt file older than 30 days: fetch (will call parse on finish)
      if ((!!err) || (st1.mtime.getTime() <= (new Date().getTime() - (FETCH_EVERY_N_DAYS * 86400 * 1000))))
        return fetch(cb);

      return parse(cb);
    });
};

exports.lookup = function(oui, cb) {
    // remove : and - in name
  var h6 = oui.split('-').join('').split(':').join('').toUpperCase();
  if (h6.length != 6) return cb(new Error('not an OUI'), null);
  // change to int which is ouiitems are indexed
  h6 = parseInt(h6.trimLeft('0'), 16)
  
    cb(null, ouiitems[h6]);
};

exports.show = function() {
    console.log(ouiitems)
};

var fetch = function(cb) {
    // handle cases where ieee site offline or network unavailble by loading to tmp
    exports.debug && cb(null, "begin downloading "+OUI_URL+". To avoid, stop process and touch "+OUI_TXT);

    var f = fs.createWriteStream(OUI_TXT+'.tmp');
    f.on('finish', function(){
        exports.debug && cb(null, "finished downloading "+OUI_URL);
        fs.rename(OUI_TXT+'.tmp', OUI_TXT, function() {
            parse(cb) }); });
    f.on('error', function(){
        cb(err, null);
        fs.unlink(OUI_TXT+'.tmp') });

    var request = http.get(OUI_URL, function(response) {
              response.setEncoding('utf8');
              response.pipe(f)
    });
    request.on('error', function(err) {
        cb(err, null);
        fs.unlink(OUI_TXT+'.tmp')
    });
    request.end();

};

/*
  00-00-00   (hex)\t\t\t\t\tXEROX CORPORATION
  000000     (base 16)      XEROX CORPORATION
                            M/S 105-50C
                            800 PHILLIPS ROAD
                            WEBSTER NY 14580
                            UNITED STATES
*/

var parse = function(cb) {
  exports.debug && cb(null, "begin parsing "+OUI_TXT);
  var rl = readline .createInterface({ input: fs.createReadStream(OUI_TXT)});

  rl.on('line', function(line) {
      var h6, id, name;

      line = line.trim();
      if (line.length > 15) {
        h6 = line.substr(0,6);
        line = line.substr(7).trimLeft();
        if (line.substr(0,9) === '(base 16)') {
            name = line.substr(10).trimLeft();
            exports.debug && console.log('line h6,name', h6,h6)
        }
      }

      if ((!!h6) && (h6.length === 6) && (!!name) && (name.length > 0)) {
        id = parseInt(h6.trimLeft('0'), 16);
        ouiitems[id] = name;
      }
  });

  rl.on('close', function(){
      exports.debug && cb(null, "finished parsing. Entries: "+Object.keys(ouiitems).length);
  });
};

exports.start(function(err, info) {
  if (!!err) return console.log('sniffer_cache_oui: ' + err.message);
  if (!!info) 
    console.log('sniffer_cache_oui: ' + JSON.stringify(info));
});

