var Quassel = require('../lib/libquassel.js'),
    pprompt = require('prompt');
var opts = require("nomnom")
   .option('backlog', {
      abbr: 'b',
      flag: true,
      help: 'Fetch backlogs (off by default to limit console flood)'
   })
   .parse();

var quassel = new Quassel("getonmyhor.se", 4242, {nobacklogs: !opts.backlog}, function(next) {
    pprompt.start();
    var schema = {
        properties: {
            user: {
                pattern: /^[a-zA-Z\s\-]+$/,
                message: 'Name must be only letters, spaces, or dashes',
                required: true
            },
            password: {
                hidden: true,
                required: true
            }
        }
    };
    pprompt.get(schema, function (err, result) {
        next(result.user, result.password);
    });
});

quassel.on('BacklogManager.receiveBacklog', function(buffer) {
    var n = quassel.getNetworks(), k, l, m;
    for (k in n) {
        console.log("Network : " + n[k].networkName);
        var buffers = n[k].getBuffers();
        for (l in buffers) {
            console.log("   "+(buffers[l].name||buffers[l].id));
            for (m in buffers[l].messages) {
                console.log("      " + buffers[l].messages[m].datetime + " - "
                    + buffers[l].messages[m].content);
            }
        }
    }
});

quassel.on('InitData.Network', function(network) {
    network.on('user.removeFromChannel', function(ircbuffer, ircuser) {
        console.log('Removed user ' + ircuser.nick + ' from channel ' + ircbuffer.name);
    });
    
    network.on('user.new', function(ircuser) {
        console.log('New user ' + ircuser.nick + ' arrived.');
    });
});

quassel.connect();