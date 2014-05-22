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

quassel.on('Network.setLatency', function(network, latency) {
    console.log('Network ' + network.networkName + ' - latency : ' + latency);
});

quassel.on('Network.addIrcUser', function(network, user) {
    console.log('Network ' + network.networkName + ' - user : ' + user.nick);
});

quassel.on('Network.setConnectionState', function(network, state) {
    console.log('Network ' + network.networkName + ' - state : ' + state);
});

quassel.on('Network.addIrcChannel', function(network, channel) {
    console.log('Network ' + network.networkName + ' - channel : ' + channel);
});

quassel.on('Network.setConnected', function(network, connected) {
    console.log('Network ' + network.networkName + ' - connected : ' + connected);
});

quassel.on('Network.setMyNick', function(network, nick) {
    console.log('Network ' + network.networkName + ' - nick : ' + nick);
});

quassel.on('Network.setNetworkName', function(network, name) {
    console.log('Network ' + network.networkName + ' - name : ' + name);
});

quassel.on('Network.setCurrentServer', function(network, server) {
    console.log('Network ' + network.networkName + ' - server : ' + server);
});

quassel.on('2displayMsg(Message)', function(bufferId, message) {
    console.log('New message on buffer #' + bufferId + ' :');
    console.log(message);
});

quassel.connect();