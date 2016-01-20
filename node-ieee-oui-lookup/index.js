var fs          = require('fs')
  , http        = require('http')
  , lineReader  = require('line-reader')
  , sqlite3     = require('sqlite3').verbose()
  , url         = require('url')
  ;


var net = 'http://standards.ieee.org/develop/regauth/oui/oui.txt';
var txt = __dirname + '/oui.txt';
var sql = __dirname + '/oui.db';


exports.start = function(cb) {
  fs.exists(sql, function(exists) {
    if (!exists) return create(cb);

    fs.stat(txt, function(err, st1) {
      if ((!!err) || (st1.mtime.getTime() <= (new Date().getTime() - (1 * 86400 * 1000)))) return fetch(null, cb);

      fs.stat(sql, function(err, st2) {
        if ((!!err) || (st1.mtime.getTime() >= st2.mtime.getTime())) return parse(null, cb);

        exports.db = new sqlite3.Database(sql);
        cb(null, null);
      });
    });
  });
};

exports.lookup = function(oui, cb) {
  var h6 = oui.split('-').join('').split(':').join('').toUpperCase();

  if (h6.length != 6) return cb(new Error('not an OUI'), null);
  if (!exports.db) return cb(new Error('database not ready'), null);

  exports.db.get('SELECT * FROM oui WHERE h6=$h6 LIMIT 1', { $h6: h6 }, function(err, row) {
    cb(err ? err : null, (!!row) ? row.name : null);
  });
};


var create = function(cb) {
  var db = new sqlite3.Database(sql);

  db.run('CREATE TABLE IF NOT EXISTS oui(id INTEGER PRIMARY KEY ASC, h6 TEXT, name TEXT)', function(err) {
    if (!!err) return cb(err, null);

    fs.stat(txt, function(err, st1) {
      if ((!!err) || (st1.mtime.getTime() < (new Date().getTime() - (7 * 86400 * 1000)))) return fetch(null, cb);

      parse(db, cb);
    });
  });
};

var fetch = function(db, cb) {
  var options = url.parse(net);

  options.agent = false;
  http.request(options, function(response) {
    var out = fs.createWriteStream(txt);
    response.setEncoding('utf8');

    response.on('data', function(chunk) {
      out.write(chunk);
    }).on('end', function() {
      out.end();
      parse(db, cb);
    }).on('close', function() {
      out.end();
      fs.unlink(txt, function(err) {/* jshint unused: false */
        cb(new Error('premature eof on ' + net), null);
      });
    });
  }).on('error', function(err) {
    cb(err, null);
  }).end();
};

/*
  00-00-00   (hex)\t\t\t\t\tXEROX CORPORATION
  000000     (base 16)      XEROX CORPORATION
                            M/S 105-50C
                            800 PHILLIPS ROAD
                            WEBSTER NY 14580
                            UNITED STATES
*/

var parse = function(db, cb) {
  var info = { count: 0, errors: 0 };

  db = db || new sqlite3.Database(sql);

  lineReader.eachLine(txt, function(line, last) {
    var h6, id, name;

    line = line.trimLeft().trimRight();
    if (line.length > 15) {
      h6 = line.substr(0,8).split('-').join('');
      line = line.substr(9).trimLeft();
      if (line.substr(0,5) === '(hex)') name = line.substr(6).trimLeft();
    }

    if ((!!h6) && (h6.length === 6) && (!!name) && (name.length > 0)) {
      id = parseInt(h6.trimLeft('0'), 16);

      db.run('INSERT INTO oui(id, h6, name) VALUES($id, $h6, $name)', { $id: id, $h6: h6, $name: name }, function(err) {
        if (!!err) { info.errors++; cb(err, null); } else info.count++;
      });
    }

    if (!last) return true;

    exports.db = db;
    cb(null, info);
    return false;
  });
};

exports.start(function(err, info) {
  if (!!err) return console.log('ieee-oui-lookup: ' + err.message);

  if (!!info) console.log('ieee-oui-lookup: ' + JSON.stringify(info));
});
