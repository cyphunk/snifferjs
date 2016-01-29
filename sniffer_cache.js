/*
Written by cyphunk@deadhacker.com for use in the Anonymous-P theater production.
*/


// could definitely reduce this down to one or two types of generic cache


var ieeeoui = require('ieee-oui-lookup');
var maxmind = require('maxmind');
var dnser   = require('dns');
var fs      = require('fs');

var LOAD_FROM_FILE = true; // Set to true to load caches from disk


//http://geolite.maxmind.com/download/geoip/database/GeoLiteCountry/GeoIP.dat.gz
// var MAXMIND_FILE = '/usr/local/var/GeoIP/GeoIPCountry.dat';
var MAXMIND_FILE = 'GeoIP.dat';

var oui = (function () {
    var cache = {},
        requests = {};

    var file = './data/save_oui.json';
    if (LOAD_FROM_FILE) {
        fs.exists(file, function(exists) {
            if (exists) {
                console.log('loaded '+file);
                cache = require(file);
            }
        });
    }

    function lookup_ptr(macoui, callback) {
        if (cache[macoui]) {
            return cache[macoui];
        }
        else {
            if (! requests[macoui]) {
                requests[macoui] = true;

                ieeeoui.lookup(macoui, function(err, name) {
                  if (err) {
                    cache[macoui] = '';
                  }
                  else {
                    cache[macoui] = name;
                    if (typeof callback === 'function') {
                        callback(name);
                    }
                  }
                  delete requests[macoui];
                });
            }
            return '';
          }
    }
    function save() {
        var string = JSON.stringify(cache, null, 4);
        if (string.length <= 3) // empty files cause issues on load via require()
            return
        fs.writeFile(file, string, function(err) {
            if (err)
                console.log(file+' '+err);
            else
                console.log('saved '+file);
        });
    }
    return {
        ptr: function (macoui, callback) {
            return lookup_ptr(macoui, callback);
        },
        save: function () { save(); },
        show: function () { console.log('oui'); console.log(cache) }
    };
}());
module.exports.oui = oui;


// The IP to Geo Location library is blocking. Actually might not
// be but I am currently too lazy to test so created a cache
// interface
maxmind.init(MAXMIND_FILE,  {indexCache: true, checkForUpdates: true}); // maxmind.getCountry(
//maxmind.init('/usr/local/var/GeoIP/GeoIPCity.dat'); // maxmind.getLocation()
var geo = (function () {
    var cache = {},
        requests = {};

    var file = './data/save_geo.json';
    if (LOAD_FROM_FILE) {
        fs.exists(file, function(exists) {
            if (exists) {
                console.log('loaded '+file);
                cache = require(file);
            }
        });
    }

    function lookup_ptr(ip, callback) {
        if (cache[ip]) {
            // fuck you google
            return cache[ip];
        }
        else {
            if (! requests[ip]) {
                requests[ip] = true;

                var geoval = maxmind.getCountry(ip);
                if (geoval) {
                  delete requests[ip];
                  cache[ip] = geoval;
                  if (typeof callback === 'function') {
                      callback(geoval);
                  }
                }
                else {
                  cache[ip] = '';
                }
            }
            return '';
        }
    }
    function save() {
        var string = JSON.stringify(cache, null, 4);
        if (string.length <= 3) // empty files cause issues on load via require()
            return
        fs.writeFile(file, string, function(err) {
            if (err)
                console.log(file+' '+err);
            else
                console.log('saved '+file);
        });
    }

    return {
        ptr: function (ip, callback) {
          return lookup_ptr(ip, callback);
        },
        save: function () { save(); },
        show: function () { console.log('geo'); console.log(cache) }
    };
}());
module.exports.geo = geo;

//
var mdns = (function () {
    var cache = {},
        requests = {};
    var noserverre = new RegExp('no servers could be reached');


    var file = './data/save_mdns.json';
    if (LOAD_FROM_FILE) {
        fs.exists(file, function(exists) {
            if (exists) {
                console.log('loaded '+file);
                cache = require(file);
            }
        });
    }

    function lookup_ptr(ip, callback) {
        if (cache[ip]) {
            return cache[ip];
        }
        else {
            if (! requests[ip]) {
                requests[ip] = true;
                var exec = require('child_process').execFile;
		// try to netcast
                exec('dig', ['+noall', '+answer', '+time=1', '-x', ip, '-p','5353', '@224.0.0.251'], function(err, out, code) {
                    //if (err instanceof Error)
                    //   throw err;
                    // if you want to run this request continuesly uncomment:
                    //delete requests[ip];
                    // if (out == ";; connection timed out; no servers could be reached\n")
                    if (noserverre.test(out))
                        return null;

                    var name = out.replace(/[\r\n]/g, '').split(/[\t\s]/).slice(-1)[0]
                    if (name) {
                        // console.log(name);
                        cache[ip] = name;
                    }
                    //process.stderr.write(err);
                    //process.exit(code);
            	});
		// try to host
                exec('dig',['+noall', '+answer', '+time=1', '-x', ip, '-p','5353', '@'+ip], function(err, out, code) {
                    if (noserverre.test(out))
                        return null;
                    var name = out.replace(/[\r\n]/g, '').split(/[\t\s]/).slice(-1)[0]
                    if (name) {
                        cache[ip] = name;
                    }
            	});

            }
            return null;
        }
    }

    function save() {
        var string = JSON.stringify(cache, null, 4);
        if (string.length <= 3) // empty files cause issues on load via require()
            return
        fs.writeFile(file, string, function(err) {
            if (err)
                console.log(file+' '+err);
            else
                console.log('saved '+file);
        });
    }

    return {
        ptr: function (ip, callback) {
            return lookup_ptr(ip, callback);
        },
        insert: function (ip, name) {
            cache[ip] = name;
        },
        save: function () { save(); },
        show: function () { console.log('mdns'); console.log(cache) }
    };
}());
module.exports.mdns = mdns;


// for the use of exec you may need to ulimit -n 1000 or something
// cache reverse DNS lookups for the life of the program
var dns = (function () {
    var cache = {},
        requests = {};
    var retry = [];
    var RETRY_INTERVAL = 10000;

    var file = './data/save_dns.json';
    if (LOAD_FROM_FILE) {
        fs.exists(file, function(exists) {
            if (exists) {
                console.log('loaded '+file);
                cache = require(file);
            }
        });
    }


    // I SUSPECT that we have issues of a timeout on dns and mdns request. So we
    // build a cache to recheck IP's in the db via a poll

    function is_ip(string) {
        return !isNaN(string.split('.').join(''))
    }
    function retry_add(ip){
        if (is_ip(ip) && retry.indexOf(ip) < 0)
            retry.push(ip);
    }
    function retry_poll() {
        for (var i =0; i<retry.length; i++) {
            //var ip = retry.pop();
            delete cache[retry.pop()];
            //lookip_ptr(ip);
        }
        // setTimeout(retry, RETRY_INTERVAL);
    }
    var timer = setInterval(retry_poll,RETRY_INTERVAL);

    function lookup_ptr(ip, callback) {
        // (skip if broadcast
        if (cache[ip]) { // if its an IP try again
            if (!ip.substr(-3) == '255' && is_ip(cache[ip]))
                retry_add(cache[ip]);
            return cache[ip];
        }
        else {
            if (ip.substr(-3) == '255')
                cache[ip] = ip;
            else if (! requests[ip]) {
                requests[ip] = true;
                dnser.reverse(ip, function (err, domains) {
                    if (err) {
                        cache[ip] = ip;
                        // console.log('dns err'+err+' '+ip)
                        // TODO - check for network and broadcast addrs, since we have iface info
                    } else {
                        cache[ip] = domains[0];
                        if (typeof callback === 'function') {
                            callback(domains[0]);
                        }
                    }

                    delete requests[ip];
                });

            }
            return ip;
        }
    }

    function save() {
        var string = JSON.stringify(cache, null, 4);
        if (string.length <= 3) // empty files cause issues on load via require()
            return
        fs.writeFile(file, string, function(err) {
            if (err)
                console.log(file+' '+err);
            else
                console.log('saved '+file);
        });
    }

    return {
        ptr: function (ip, callback) {
            return lookup_ptr(ip, callback);
        },
        insert: function (ip, name) {
            cache[ip] = name;
        },
        save: function () { save(); },
        show: function () { console.log('dns'); console.log(cache);console.log('dns retry'); console.log(retry) }
    };
}());
module.exports.dns = dns;

var save = (function () {
    console.log('save all caches in ./data');
    if (!fs.existsSync("./data")){
       fs.mkdirSync("./data");
    }
    oui.save();
    geo.save();
    mdns.save();
    dns.save();
});
module.exports.save = save;

// IP STATE CACHE
// quick hack to avoid printing too many packets. We monitor
// the port of the last packet and if the next packet is the same, we ignore
// The differenced between ``_port`` and ``_data`` is that _port
// will be updated whenever the port changes and _data will be updated
// only when that service had its app layer parsed
var new_port = (function () {
    var cache = {};
    function lookup_ptr(ip, port) {
        // console.log(ip, cache[ip]);
        if (cache[ip] && cache[ip] === port) {
            // state has not changed
            return false;
        }
        else {
            // state has changed
            cache[ip] = port;
            return true;
        }
    }
    return {
        ptr: function (ip, port) {
          return lookup_ptr(ip, port);
        }
    };
}());
module.exports.new_port = new_port;

var new_data = (function () {
    var cache = {};
    function lookup_ptr(ip, port) {
        // console.log(ip, cache[ip]);
        if (cache[ip] && cache[ip] === port) {
            // state has not changed
            return false;
        }
        else {
            // state has changed
            cache[ip] = port;
            return true;
        }
    }
    return {
        ptr: function (ip, port) {
          return lookup_ptr(ip, port);
        }
    };
}());
module.exports.new_data = new_data;
