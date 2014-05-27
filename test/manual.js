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

quassel.on('backlog', function(buffer) {
    var n = quassel.getNetworks().all(), k, l, m;
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

quassel.on('network.init', function(network) {
    network.on('user.removeFromChannel', function(ircbuffer, ircuser) {
        console.log('Removed user ' + ircuser.nick + ' from channel ' + ircbuffer.name);
    });
    
    network.on('user.new', function(ircuser) {
        console.log('New user ' + ircuser.nick + ' arrived.');
    });
});

quassel.on('network.addbuffer', function(network, bufferId) {
    console.log('Network ' + network.networkId + ' - new buffer : ' + network.getBufferCollection().getBuffer(bufferId).name);
});

quassel.on('network.latency', function(network, latency) {
    console.log('Network ' + network.networkName + ' - latency : ' + latency);
});

quassel.on('network.adduser', function(network, user) {
    console.log('Network ' + network.networkName + ' - user : ' + user.nick);
});

quassel.on('network.connectionstate', function(network, state) {
    console.log('Network ' + network.networkName + ' - state : ' + state);
});

quassel.on('network.addchannel', function(network, channel) {
    console.log('Network ' + network.networkName + ' - channel : ' + channel);
});

quassel.on('network.connected', function(network) {
    console.log('Network ' + network.networkName + ' - connected');
});

quassel.on('network.disconnected', function(network) {
    console.log('Network ' + network.networkName + ' - disconnected');
});

quassel.on('network.mynick', function(network, nick) {
    console.log('Network ' + network.networkName + ' - nick : ' + nick);
});

quassel.on('network.networkname', function(network, name) {
    console.log('Network ' + network.networkName + ' - name : ' + name);
});

quassel.on('network.server', function(network, server) {
    console.log('Network ' + network.networkName + ' - server : ' + server);
});

quassel.on('buffer.message', function(bufferId, message) {
    console.log('New message on buffer #' + bufferId + ' :');
    console.log(message);
});

quassel.on('buffer.read', function(bufferId) {
    console.log('Buffer #' + bufferId + ' marked as read.');
});

quassel.on('buffer.remove', function(bufferId) {
    console.log('Removed buffer #' + bufferId);
});

quassel.on('buffer.rename', function(bufferId, newName) {
    console.log('New name for buffer #' + bufferId + ' : ' + newName);
});

quassel.on('buffer.highlight', function(bufferId, messageId) {
    console.log('Buffer #' + bufferId + ' : Highlight message #' + messageId);
});

quassel.on('user.quit', function(network, username) {
    console.log('Network ' + network.networkName + ' : user ' + username + ' quit');
});

quassel.on('user.part', function(network, bufferId, username) {
    console.log('Network ' + network.networkName + ' - Buffer #' + bufferId + ' : user ' + username + ' part');
});

quassel.on('user.away', function(network, username, isAway) {
    if (isAway) {
        console.log('Network ' + network.networkName + ' : user ' + username + ' is away');
    } else {
        console.log('Network ' + network.networkName + ' : user ' + username + ' is back');
    }
});

quassel.on('user.realname', function(network, username, isAway) {
    console.log('Network ' + network.networkName + ' : user ' + username + ' real name is');
});

quassel.on('channel.join', function(buffer, user) {
    console.log('Channel ' + buffer.name + ' : user ' + user.nick + ' joined');
});

quassel.on('channel.addusermode', function(buffer, user, mode) {
    console.log('Channel ' + buffer.name + ' - user ' + user.nick + ' -> mode : +' + mode);
});

quassel.on('channel.removeusermode', function(buffer, user, mode) {
    console.log('Channel ' + buffer.name + ' : user ' + user.nick + ' -> mode -' + mode);
});

quassel.on('channel.topic', function(buffer, topic) {
    console.log('Channel ' + buffer.name + ' - new topic : ' + topic);
});

quassel.on('buffer.activate', function(buffer) {
    console.log('Buffer ' + buffer.name + ' activated');
});

quassel.connect();