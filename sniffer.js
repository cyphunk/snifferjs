'use strict';

/*
License: Non-White-Heterosexual-Male

If you are not a white heterosexual male you are permitted to copy, sell and use
this work in any manner you choose without need to include any attribution you
do not see fit. You are asked as a courtesy to retain this license in any
derivatives but you are not required. If you are a white heterosexual male you
are provided the same permissions (reuse, modification, resale) but are
required to include this license in any documentation and any public facing
derivative. You are also required to include attribution to the original author
or to an author responsible for redistribution of a derivative.
*/

// cyphunk@deadhacker.com
// originally for use in the Anonymous-P theater production
// https://github.com/cyphunk/snifferjs
// pull requests appreciated

//
// SETTINGS
//
var LOCAL_DOMAIN = '.anon.p'; // is replaced with '' on output

// ENTROPY GRAPH
var ENTROPY_ENABLED      = false;   // if dropping packets, try disabling
var ENTROPY_BUFFER_LEN   = 2048*10; // entropy buffer size
var ENTROPY_BUFFER_DEBUG = false;   // debugging to check buffer utilization
var ENTROPY_LOG          = false;   // show entropy results on console

var VERBOSE_DEBUG   = false; // show tuns of shit
var HTTP_LENGTH_MAX = 128;    // how many chars of HTTP requests to show

// THROTTLING
// enable some trottling if pcap drops too many packets for your taste
var FIRST_PER_IP         = false;
var HTTP_ONLY_FIRST      = false; // set false for shows with less people
var BROADCAST_ONLY_FIRST = true;
var DNS_ONLY_FIRST       = true;
var MAIL_ONLY_LOGIN      = false; //false to show all unencrypted mail packets

var PROCESS_EXIT_WAIT = 1500; // need to wait on exit so file saves complete

// not used atm:
// var MAKE_STATE_CHANGE_ON_HIDDEN_OTHER = false; // will toggle state cache on any non-matched packet
// var SHOW_ANY_TCP_UDP = false; // turnning this on will set dat.app.type='tcp' or 'udp' for any tcp udp packet



var util     = require('util');
var pcap     = require("pcap"), pcap_session;
var DNS = require("pcap/decode/dns"); // pcap@2.0.1 dns decoding requires
var express  = require('express')
var app      = express();
var server   = require('http').createServer(app);
var io       = require('socket.io').listen(server);
var cache    = null; // loaded later when lowered process from root priv

//
// libdisorder for entropy graphing
//
if (ENTROPY_ENABLED) {
    var ref = require('ref');
    var ffi = require('ffi');
    var stringPtr = ref.refType(ref.types.CString);
    var libdisorder = ffi.Library(__dirname+'/libdisorder', {
      'shannon_H': [ 'float', [ stringPtr, 'longlong' ] ],
      'get_num_tokens': [ 'int', [] ],
      'get_max_entropy': [ 'float', [] ],
      'get_entropy_ratio': [ 'float', [] ]
    });
}











// if (process.getuid() != 0) {
//     console.error('PCAP probably needs root');
//     console.error('Will setuid/gid to owner of .js after pcap session initialized.');
// }

//console.log('clear your DNS cache after start. sudo killall -HUP mDNSResponder');
if (process.argv.length < 3) {
    console.error("\nExample use: ");
    console.error('  sudo node sniffer.js "" "tcp port 80"');
    console.error('  sudo node sniffer.js eth1 ""');
    console.error('  sudo node sniffer.js lo0 "ip proto \\tcp and tcp port 80"');
    console.error('  sudo node sniffer.js en0 "not net 192.168.1.0/27 and not host 192.168.1.32 and not host 192.168.1.33"');
    process.exit(1);
}


var netinterface = process.argv[2]
var filter = process.argv[3];

var gatewayip;
if (/^darwin/.test(process.platform)) {
    gatewayip = require('netroute').getGateway(netinterface);
}
else {
    if (process.argv.length <= 4) {
        console.error("On linux please supply gateway address as argument");
        process.exit(1);
    }
    else {
        gatewayip = process.argv[4];
    }
}




// var netinterface = "eth0";
// var netinterface = "wlan0";
// var filter = "ip";
// var gatewayip = "192.168.44.1"


// Setup PCAP netinterface now with root permissions and then downgrade to low priv
//console.log(pcap.lib_version);
try {
    pcap_session = pcap.createSession(netinterface, filter);
} catch (e) {
    console.error(e);
    console.log("\nConsider running snifferjs as root or give yourself permission to monitor network interface:");
    if (process.platform == 'linux')
        console.log("\nsudo setcap cap_net_raw,cap_net_admin=eip "+process.argv[0]+"\n");
    else if (process.platform == 'darwin')
        console.log("\nuse ChmodBPF to give permissions to "+process.argv[0]+"\n");
    setTimeout(function(){process.exit()}, PROCESS_EXIT_WAIT);
}

if (process.getuid() == 0) {
    require('fs').stat(__filename, function(err,s) {
        console.log('change process uid/gid to \"'+__filename+'\" owner: '+s.uid+'/'+s.gid);
        process.setgid(s.gid);
        process.setuid(s.uid);
    });
}

cache = require('./sniffer_cache.js'); //oui,geo,dns,etc caches

function save_state() {
    console.log('saving state');
    cache.save();
}

process.on( 'SIGINT', function() {
    console.log( "\nGracefully shutting down from SIGINT (Ctrl-C)" );
    save_state();
    setTimeout(function(){process.exit()}, PROCESS_EXIT_WAIT);
})

var stdin = process.openStdin();
stdin.setRawMode(true);
stdin.resume();
stdin.setEncoding('utf8');
stdin.on( 'data', function( key ){
  if ( key === '\u0003' ) { // ctrl+c aka quit
    save_state();
    setTimeout(function(){process.exit()}, PROCESS_EXIT_WAIT);
  }
  else if ( key === '\u0013') { // ctrl+s aka save
    save_state();
  }
  else if ( key === '\u0014') { // ctrl+t aka test
    cache.oui.show();
    cache.geo.show();
    cache.mdns.show();
    cache.dns.show();
  }

  //console.log(util.inspect(key,{depth: null})); // use to see key
  // write the key to stdout all normal like
  process.stdout.write( key );
});


server.listen(8080);
console.log("Sniffer.js client listening on http 8080");

app.get('/', function (req, res) {
    res.sendFile(__dirname + '/client/index.html');
});
app.use('/client', express.static(__dirname + '/client'));



function dumpError(err) {
    if (typeof err === 'object') {
        if (err.message) {
            console.log('\nMessage: ' + err.message)
        }
        if (err.stack) {
            console.log('\nStacktrace:')
            console.log('====================')
            console.log(err.stack);
        }
    } else {
      console.log('dumpError :: argument is not an object');
    }
}




var detect_http_request = function (buf) {
    // from pcap.js TCP_tracker.prototype.detect_http_request
    var str = buf.toString('utf8', 0, buf.length);

    return (/^(OPTIONS|GET|HEAD|POST|PUT|DELETE|TRACE|CONNECT|COPY|LOCK|MKCOL|MOVE|PROPFIND|PROPPATCH|UNLOCK) [^\s\r\n]+ HTTP\/\d\.\d\r\n/.test(str));
};

var http_request_content = function (buf) {
    // from pcap.js TCP_tracker.prototype.detect_http_request
    var str = buf.toString('utf8', 0, buf.length);
    var content = "";
    var match_req = str.match(/(GET|POST)\s+[^\s\r\n]+/i)
    if (match_req) {
        content+=match_req[0].substring(4,HTTP_LENGTH_MAX+4).trimLeft();
        var match_host = str.match(/(Host:)\s+[^\s\r\n]+/i);
        if (match_host)
            content=match_host[0].substring(6,HTTP_LENGTH_MAX+4)+content;
    }
    else {
        content = null;
    }
    // return (/^(OPTIONS|GET|HEAD|POST|PUT|DELETE|TRACE|CONNECT|COPY|LOCK|MKCOL|MOVE|PROPFIND|PROPPATCH|UNLOCK) [^\s\r\n]+ HTTP\/\d\.\d\r\n/.test(str));
    return content;
};

var detect_mail_login_request = function (buf) {
    // from pcap.js TCP_tracker.prototype.detect_http_request
    var str = buf.toString('utf8', 0, buf.length);

    return (/(LOGIN|login) /.test(str));
};

var mail_request_content = function (buf) {
    // from pcap.js TCP_tracker.prototype.detect_http_request
    var str = buf.toString('utf8', 0, buf.length);
    var isAscii = true;
    for (var i=0, len=str.length; i<len; i++) {
        if (buf[i] > 127) {
            isAscii=false;
            break;
        }
    }
    if (isAscii)
        return str;
    return null;
    // var content = "";
    // match = str.match(/(GET|POST)\s+[^\s\r\n]+/i)
    // match ? content+=match[0].substring(4,HTTP_LENGTH_MAX+4) : null;
    // return (/^(OPTIONS|GET|HEAD|POST|PUT|DELETE|TRACE|CONNECT|COPY|LOCK|MKCOL|MOVE|PROPFIND|PROPPATCH|UNLOCK) [^\s\r\n]+ HTTP\/\d\.\d\r\n/.test(str));
    // return content;
};

// var request_parser = new HTTPParser(HTTPParser.REQUEST),



console.log("\nNetwork interfaces (*=chosen):");
pcap.findalldevs().forEach(function (dev) {
    if (pcap_session.device_name === dev.name) {
        process.stdout.write("* ");
    }
    process.stdout.write(dev.name + " ");
    if (dev.addresses.length > 0) {
        dev.addresses.forEach(function (address) {
            process.stdout.write(address.addr + "/" + address.netmask);
        });
        process.stdout.write("\n");
    } else {
        process.stdout.write("no address\n");
    }
});



// Routinely check for dropped packets
setInterval(function () {
    var stats = pcap_session.stats();
    if (stats.ps_drop > 0) {
        console.log("\n\nPCAP dropped packets: " + util.inspect(stats));
    }
}, 5000);




var is_local_ip = function (ip) {
    // 172.19 check is improper quick check that works anyway
    if (ip.substring(0,3) === '10.' || ip.substring(0,8) === '192.168.' || ip.substring(0,7) === '172.19.')
        return true;
    return false;
};
var is_broadcast_ip = function (ip) {
    // stupid way
    if (ip.substr(-3) == '255')
        return true;
    return false;
};


/*

    Parse packet
    aka, tha meat

*/



var parse_packet = function(packet, callback) {


    // if not an internet IP packet than skip

    // pcap@<=1.2.0
    // if (!packet.link || !packet.link.shost || !packet.link.ip || !packet.link.ip.saddr)
    // pcap@2.0.1
    if (!packet.payload || !packet.payload.payload || !packet.payload.payload.saddr || !packet.payload.payload.payload)
        //      ethernet           ether   ip                 ether   ip      addr
        return null

    var dat = {}; // what we send to the client



    // MAC ADDRESS DEVICE MANUFACTURER RESOLUTION
    var soui     = packet.payload.shost.toString().substring(0,8);
    dat.sdevice  = cache.oui.ptr(soui);
    var doui     = packet.payload.dhost.toString().substring(0,8);
    dat.ddevice  = cache.oui.ptr(doui);
    if (dat.sdevice) dat.sdevice = dat.sdevice.split(' ')[0] // cleanup
    if (dat.ddevice) dat.ddevice = dat.ddevice.split(' ')[0]


    // IP's
    dat.sip      = packet.payload.payload.saddr.toString();
    dat.siplocal = is_local_ip(dat.sip);
    dat.dip      = packet.payload.payload.daddr.toString();
    dat.diplocal = is_local_ip(dat.dip);
    // used for cache key:
    var iplocal;
    if (dat.siplocal && dat.sip !== gatewayip)
        iplocal = dat.sip;
    else
        iplocal = dat.dip;
    dat.gatewayip = gatewayip;

    // DNS CACHE REVERSE RESOLUTION
    dat.sname = cache.dns.ptr(dat.sip).replace(LOCAL_DOMAIN,'') //replace the shows domain for now
    dat.dname = cache.dns.ptr(dat.dip).replace(LOCAL_DOMAIN,'')
    // cleanup
         if (dat.sname.match(/^\d+\.\d+\.\d+\.\d+$/))  dat.sname = null;
    else if (dat.sname.substr(-10) === '.1e100.net')   dat.sname = 'google.com'; // deal with google
    else
        dat.sname = dat.sname.split('.').slice(-3).join('.'); //oo.aa.domain.com into aa.domain.com)

         if (dat.dname.match(/^\d+\.\d+\.\d+\.\d+$/))  dat.dname = null;
    else if (dat.dname.substr(-10) === '.1e100.net')   dat.dname = 'google.com';
    else
        dat.dname = dat.dname.split('.').slice(-3).join('.');

    // MDNS
         if (dat.siplocal) dat.smdnsname = cache.mdns.ptr(dat.sip)
    else if (dat.diplocal) dat.dmdnsname = cache.mdns.ptr(dat.dip)
    // cleanup
         if (dat.smdnsname && dat.siplocal) dat.smdnsname = dat.smdnsname.replace('.local.',''); //replace the shows domain for now
    else if (dat.dmdnsname && dat.diplocal) dat.dmdnsname = dat.dmdnsname.replace('.local.','');



    // GEOIP
    dat.sgeo = cache.geo.ptr(dat.sip);
    dat.dgeo = cache.geo.ptr(dat.dip);
    if (dat.sgeo.code == '--') dat.sgeo = null; //cleanup
    if (dat.dgeo.code == '--') dat.dgeo = null;


    //
    // Application layer
    //
    dat.app = {}
    dat.app.type = null

    // use DNS queries to populate reverse IP cache
    debugger;
    if (packet.payload.payload.payload.decoderName === 'udp' && (packet.payload.payload.payload.sport === 53 || packet.payload.payload.payload.dport === 53)) {
        // register this port being matched
        // actually the new_port cache is not used yet
        // but could be used in the future to change
        // print logic based on app parsing vs new
        // port/servics access
        cache.new_port.ptr(iplocal, 'dns');

        var dns = new DNS().decode(packet.payload.payload.payload.data, 0, packet.payload.payload.payload.data.length);
        if (dns.answer.rrs.length > 0) {
            for (var i=0; i < dns.answer.rrs.length; i++) {
                if (dns.answer.rrs[i].rdata && dns.answer.rrs[i].rdata.addr && dns.answer.rrs[i].name) {
                    // register this application was parsed
                    var new_data = cache.new_data.ptr(iplocal, 'dns');

                    // populate dns cache with the response
                    cache.dns.insert(dns.answer.rrs[i].rdata.addr.toString(), dns.answer.rrs[i].name);

                    // prepare data to be sent to client
                    if (!DNS_ONLY_FIRST || new_data) {
                        dat.app.type = 'dns response';
                        dat.app.name = dns.answer.rrs[i].name.split('.').slice(-3).join('.'); //only last 3 octets of a domain
                        dat.app.ip   = dns.answer.rrs[i].rdata.addr.toString();
                    }
                }
            }
        }
        else if (dns.question.rrs.length > 0) {
            for (var i=0; i < dns.question.rrs.length; i++) {
                if (dns.question.rrs[i].type && dns.question.rrs[i].type === 1/*'A'*/ && dns.question.rrs[i].name) {
                    var new_data = cache.new_data.ptr(iplocal, 'dns');

                    if (!DNS_ONLY_FIRST || new_data) {
                        dat.app.type = 'dns request';
                        dat.app.name = dns.question.rrs[i].name.split('.').slice(-3).join('.');
                    }
                }
            }
        }
    }

    // HTTP
    // only checking dport to reduce amount of packets
    else if (packet.payload.payload.payload.decoderName === 'tcp' && packet.payload.payload.payload.dport === 80) {// || packet.payload.payload.payload.sport === 80)) {
        cache.new_port.ptr(iplocal, 'http');

        var tcp = packet.payload.payload.payload

        if (tcp.data) {
            if (detect_http_request(tcp.data)){
                var url = http_request_content(tcp.data);

                if (url) {
                    var new_data = cache.new_data.ptr(iplocal, 'http');
                    if (!HTTP_ONLY_FIRST || new_data) {
                        // means we do not care if it is a the first http url
                        dat.app.type = 'http url';
                        dat.app.url  = url;
                    }
                }

                if (VERBOSE_DEBUG)
                    console.log("HTTP DATA:\n"+tcp.data.toString('utf8', 0, tcp.dataLength));
            }
        }
    }

    // HTTPS
    // only checking dport to reduce amount of packets
    else if (packet.payload.payload.payload.decoderName === 'tcp' && packet.payload.payload.payload.dport === 443) {// || packet.payload.payload.payload.sport === 443)) {
        cache.new_port.ptr(iplocal, 'https');
        var new_data = cache.new_data.ptr(iplocal, 'https');

        // we only ever show first HTTPS
        if (new_data) {
            dat.app.type = 'https';
        }
    }

    // MAIL
    // only checking dport to reduce amount of packets
    else if (packet.payload.payload.payload.decoderName === 'tcp' && (packet.payload.payload.payload.dport === 143 || packet.payload.payload.payload.dport === 110)) {// || packet.payload.payload.payload.sport === 443)) {
        cache.new_port.ptr(iplocal, 'mail');

        var tcp = packet.payload.payload.payload

        if (tcp.data_bytes) {
            if (!MAIL_ONLY_LOGIN || detect_mail_login_request(tcp.data)) {
                var data = mail_request_content(tcp.data);
                if (data) {
                    // for now showing all plaintext. otherwise we would wathc to check new_data first
                    cache.new_data.ptr(iplocal, 'mail');
                    dat.app.type = 'mail';
                    dat.app.data = data;

                    if (VERBOSE_DEBUG)
                        console.log("MAIL DATA: "+data);
                }
            }
        }
    }

    // MAILS
    else if (packet.payload.payload.payload.decoderName === 'tcp' && (packet.payload.payload.payload.dport === 993 || packet.payload.payload.payload.dport === 995)) {// || packet.payload.payload.payload.sport === 443)) {
        cache.new_port.ptr(iplocal, 'mails');
        var new_data = cache.new_data.ptr(iplocal, 'mails');
        // only show first mails
        if (new_data) {
            dat.app.type = 'mails';
        }
    }

    // BROADCAST PACKET
    else if (is_broadcast_ip(dat.sip) || is_broadcast_ip(dat.dip)) { // || packet.link.ip.tcp.sport === 443)) {
        cache.new_port.ptr(iplocal, 'broadcast');
        var new_data = cache.new_data.ptr(iplocal, 'broadcast');

        if (!BROADCAST_ONLY_FIRST)
            dat.app.type = 'broadcast';
        else if (BROADCAST_ONLY_FIRST && new_data)
            dat.app.type = 'broadcast';
    }



    else if (packet.payload.payload.payload.decoderName === 'tcp' || packet.payload.payload.payload.decoderName === 'tcp') {
        // if (MAKE_STATE_CHANGE_ON_HIDDEN_OTHER)
        //     cache.new_data.ptr(dat.siplocal ? dat.sip : dat.dip, 000);

        // if (SHOW_ANY_TCP_UDP)
        //     dat.app.type = packet.link.ip.tcp ? 'tcp' : 'udp';

        // if (packet.link.ip.tcp)
        //     proto = packet.link.ip.tcp;
        // else if (packet.link.ip.udp)
        //     proto = packet.link.ip.udp
        // ret += '-- port ';
        // if (!dat.diplocal)
        //     ret += proto.dport;
        // else
        //     ret += proto.sport;

    }

    // Only return if application layer parsed
    if (dat.app.type != null)
        callback(dat);

    // or return all packets with dat defined (such as tcp/udp port parsing commented out above)
    // callback(dat);

};

if (ENTROPY_ENABLED) {
    var entropy = (function () {
        var cache_buf = new Buffer(ENTROPY_BUFFER_LEN)
        cache_buf.type = ref.types.char
        var offset = 0;
        var current_run = 0
        var scan = function(callback) {
                current_run+=1;
                var entropy = libdisorder.shannon_H(cache_buf, ENTROPY_BUFFER_LEN);
                var maxent = libdisorder.get_max_entropy();
                var ratio = libdisorder.get_entropy_ratio();
                offset = 0;
                data = {
                    entropy: entropy,
                    maxent: maxent,
                    ratio: ratio,
                    count: current_run
                    }
                callback(data);
                if (ENTROPY_LOG)
                    console.log('<'+("        "+current_run).slice(-8)+'> entropy: '+entropy.toFixed(6)+' maxent: '+maxent.toFixed(6)+' ratio: '+ratio.toFixed(6)+'  offset: '+offset);
        }

        function scan_ptr(buf, callback) {
            var buf_len = buf.length;

            while (buf_len > 0) {
                if (offset == ENTROPY_BUFFER_LEN)
                    continue; // wait until scan has finished to continue reading rest of buffer

                // Buffer appears to handle over shots without loosing data (len_written reflects what was actually written)
                var len_written = buf.copy(cache_buf, offset, 0, buf_len <= (ENTROPY_BUFFER_LEN-offset) ? buf_len : (ENTROPY_BUFFER_LEN-offset));
                offset += len_written;
                buf_len -= len_written;
                if (ENTROPY_BUFFER_DEBUG)
                    console.log('entropy_buf wrote: '+len_written+ ' offset: '+offset+' buf_left: '+buf_len+' cache_free: '+(ENTROPY_BUFFER_LEN-offset));

                if (offset >= ENTROPY_BUFFER_LEN)
                    scan(callback);

            }
        }
        return {
            ptr: function (buf, callback) {
              return scan_ptr(buf, callback);
            }
        };
    }());
}

// using this for debug on console
var print_packet = function(dat) {
    console.log(dat.count+': '+dat.sip+' > '+dat.dip+'  '+dat.app.type);
}


var packet_count = 0;


io.sockets.on('connection', function (socket) {
    console.log('connected');
    socket.join('sniffer');
    packet_count = 0;
    // socket = sock;
});

/* If issues of reconnection persist perhaps switch back to single user mode
and change "room" use to normal emits with a global socket */
pcap_session.on('packet', function (raw_packet) {
    // if (!io.socket)
    //     return;

    // send a vanilla packet summary to the client
    //socket.emit('packet', { data: pcap.print.packet(packet) });
    // send the full packet object (for debugging)
    //socket.emit('packet_obj', { data: packet });
    // send parsed packet:

    try {
        var packet = pcap.decode.packet(raw_packet);
    } catch(err) {
        dumpError(err);
        return null;
    }

    parse_packet(packet, function(packet){
        packet_count += 1;
        packet.count = packet_count;

        // try/catch statement to not crash on bugs such as dns bug described at EOF
        try {
            print_packet(packet);
        }
        catch(err) {
            dumpError(err);
            return;
        }
        io.to('sniffer').emit('packet', { data: packet });
    });

    // entropy
    if (ENTROPY_ENABLED && packet.link && packet.link.ip) { // || packet.link.ip.tcp.sport === 443)) {
        if (packet.link.ip.tcp && packet.link.ip.tcp.data_bytes) {
            entropy.ptr(packet.link.ip.tcp.data, function(entropy) {
                io.to('sniffer').emit('entropy', entropy);
            });
        }
        else if (packet.link.ip.udp && packet.link.ip.udp.data_bytes) {
            entropy.ptr(packet.link.ip.udp.data, function(entropy) {
                io.to('sniffer').emit('entropy', entropy);
            });
        }
    }
});



/*
tests

// inspect packets in repl
var util = require('util');
var pcap = require("pcap"), pcap_session;
pcap_session = pcap.createSession('en1', 'ip and port 53');
global.ret = [];
pcap_session.on('packet', function (raw_packet) {
  var packet = pcap.decode.packet(raw_packet);
  global.ret.push(packet.link.ip.udp);
});
*/
