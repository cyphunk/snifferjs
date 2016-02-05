// This is a copy, perhaps slightly modified, of node-ieee-oui-lookup which
// is no longer maintained. Mainly I needed to control the sqlite3 dependency
// more directly when using sniffer.js within node-webkit.

var fs          = require('fs');
var http        = require('http');
var readline    = require('readline');
var sqlite3     = require('sqlite3').verbose();

var OUI_URL = 'http://standards-oui.ieee.org/oui/oui.txt';
var OUI_URL = 'http://localhost:8000/testoui10k.txt';
var OUI_TXT = __dirname + '/sniffer_cache_oui.txt';
var OUI_DB  = __dirname + '/sniffer_cache_oui.db';
var FETCH_EVERY_N_DAYS = 30; // fetch oui.txt

var debug = true;

exports.start = function(cb) {
  fs.exists(OUI_DB, function(exists) {
    if (!exists)
        return create(cb);
    else
        exports.db = new sqlite3.Database(OUI_DB);

    fs.stat(OUI_TXT, function(err, st1) {
      // on error or txt file older than 30 days: fetch (will call parse on finish)
      if ((!!err) || (st1.mtime.getTime() <= (new Date().getTime() - (FETCH_EVERY_N_DAYS * 86400 * 1000))))
        return fetch(cb);


      fs.stat(OUI_DB, function(err, st2) {
        // on error or txt file is newer than db
        if ((!!err) || (st1.mtime.getTime() >= st2.mtime.getTime()))
            return parse(cb);

        // if here: txt file isnt old and db file isn't new. So just load:
        //if (exports.db) exports.db.close();
        //exports.db = new sqlite3.Database(OUI_DB);
        cb(null, null);
      });
    });
  });
};

exports.lookup = function(oui, cb) {
  var h6 = oui.split('-').join('').split(':').join('').toUpperCase();

  if (h6.length != 6) return cb(new Error('not an OUI'), null);
  if (!exports.db) return cb(new Error('database not ready'), null);

  exports.db.serialize(function() {
  exports.db.get('SELECT * FROM oui WHERE h6=$h6 LIMIT 1', { $h6: h6 }, function(err, row) {
    cb(err ? err : null, (!!row) ? row.name : null);
});
});
};


var create = function(cb) {
  debug && cb(null, "create new db");
  exports.db =  new sqlite3.Database(OUI_DB);

  db.run('CREATE TABLE IF NOT EXISTS oui(id INTEGER PRIMARY KEY ASC, h6 TEXT, name TEXT)', function(err) {
    if (!!err)
        console.log(err);

    fs.stat(OUI_TXT, function(err, st1) {
      // on error or txt file older than 30 days: fetch (will call parse on finish)
      if ((!!err) || (st1.mtime.getTime() < (new Date().getTime() - (FETCH_EVERY_N_DAYS * 86400 * 1000))))
        return fetch(cb);

      parse(cb);
    });
  });
};

var fetch = function(cb) {
    // handle cases where ieee site offline or network unavailble by loading to tmp
    debug && cb(null, "begin downloading "+OUI_URL+". To avoid, stop process and touch "+OUI_TXT);

    var f = fs.createWriteStream(OUI_TXT+'.tmp');
    f.on('finish', function(){
        debug && cb(null, "finished downloading "+OUI_URL);
        fs.rename(OUI_TXT+'.tmp', OUI_TXT, function() {
            parse(cb) }); });
    f.on('error', function(){
        cb(err, null);
        fs.unlink(OUI_TXT+'.tmp') });

    var request = http.get(OUI_URL, function(response) {
              response.setEncoding('utf8');
              response.pipe(f) });
    request.on('error', function(err) {
        cb(err, null);
        fs.unlink(OUI_TXT+'.tmp') });
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
  var info = { count: 0, errors: 0 };

  if (!exports.db) { debug && cb({message:"no db"}, null); }

  debug && cb(null, "begin parsing "+OUI_TXT);
  var rl = readline .createInterface({ input: fs.createReadStream(OUI_TXT)});

  items = [];
  rl.on('line', function(line) {
      var h6, id, name;

      line = line.trim();
      if (line.length > 15) {
        h6 = line.substr(0,6);
        line = line.substr(7).trimLeft();
        if (line.substr(0,9) === '(base 16)')
            name = line.substr(10).trimLeft();
      }

      if ((!!h6) && (h6.length === 6) && (!!name) && (name.length > 0)) {
        id = parseInt(h6.trimLeft('0'), 16);
        items.push( {'id': id, 'h6':h6,'name':name} );
        // this method:

      }
  });

  rl.on('close', function(){
      debug && cb(null, "finished parsing");
      debug && cb(null, "begin adding to db"+OUI_DB);
      items.forEach(function(e, i) {
          exports.db.serialize(function() {
              exports.db.run('INSERT OR REPLACE INTO oui(id, h6, name) VALUES($id, $h6, $name)', { $id: e.id, $h6: e.h6, $name: e.name }, function(err) {
                if (i == items.length-1) debug && cb(null, "finished adding to db: count "+info.count+", errors "+info.errors);
                if (!!err) { info.errors++; cb(err, null); }
                else { info.count++;  debug && info.count%1000==0 && cb(null, info.count+" loaded"); }
              });
          });
      });
  });
};

exports.start(function(err, info) {
  if (!!err) return console.log('sniffer_cache_oui: ' + err.message);

  if (!!info) console.log('sniffer_cache_oui: ' + JSON.stringify(info));
});
