var Quassel = require('../lib/libquassel.js'),
    pprompt = require('prompt');
var opts = require("nomnom")
   .option('backlog', {
      abbr: 'b',
      flag: true,
      help: 'Fetch backlogs (off by default to limit console flood)'
   })
   .option('message', {
      abbr: 'm',
      flag: true,
      help: 'Show prompt to send messages (inhibits the majority of logs)'
   })
   .option('noDebug', {
      abbr: 'd',
      full: 'no-debug',
      flag: true,
      help: 'Disable all libquassel logs'
   })
   .parse();

if (opts.message) opts.noDebug = true;
var quassel = new Quassel("getonmyhor.se", 4242, {nobacklogs: !opts.backlog, nodebug: opts.noDebug}, function(next) {
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

if (!opts.message) {
    quassel.on('buffer.backlog', function(bufferId) {
        var buf = quassel.getNetworks().findBuffer(bufferId);
        console.log(buf.name + " : " + buf.messages.count());
    });
    
    quassel.on('network.init', function(network) {
        network = quassel.getNetworks().get(network);
        // TODO
    });
    
    quassel.on('network.addbuffer', function(network, bufferId) {
        network = quassel.getNetworks().get(network);
        console.log('Network ' + network.networkId + ' - new buffer : ' + network.getBufferCollection().getBuffer(bufferId).name);
    });
    
    quassel.on('network.latency', function(network, latency) {
        network = quassel.getNetworks().get(network);
        console.log('Network ' + network.networkName + ' - latency : ' + latency);
    });
    
    quassel.on('network.adduser', function(network, nick) {
        network = quassel.getNetworks().get(network);
        console.log('Network ' + network.networkName + ' - user : ' + nick);
    });
    
    quassel.on('network.connectionstate', function(network, state) {
        network = quassel.getNetworks().get(network);
        console.log('Network ' + network.networkName + ' - state : ' + state);
    });
    
    quassel.on('network.addchannel', function(network, channel) {
        network = quassel.getNetworks().get(network);
        console.log('Network ' + network.networkName + ' - channel : ' + channel);
    });
    
    quassel.on('network.connected', function(network) {
        network = quassel.getNetworks().get(network);
        console.log('Network ' + network.networkName + ' - connected');
    });
    
    quassel.on('network.disconnected', function(network) {
        network = quassel.getNetworks().get(network);
        console.log('Network ' + network.networkName + ' - disconnected');
    });
    
    quassel.on('network.mynick', function(network, nick) {
        network = quassel.getNetworks().get(network);
        console.log('Network ' + network.networkName + ' - nick : ' + nick);
    });
    
    quassel.on('network.networkname', function(network, name) {
        network = quassel.getNetworks().get(network);
        console.log('Network ' + network.networkName + ' - name : ' + name);
    });
    
    quassel.on('network.server', function(network, server) {
        network = quassel.getNetworks().get(network);
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
        network = quassel.getNetworks().get(network);
        console.log('Network ' + network.networkName + ' : user ' + username + ' quit');
    });
    
    quassel.on('user.part', function(network, username, bufferId) {
        network = quassel.getNetworks().get(network);
        console.log('Network ' + network.networkName + ' - Buffer #' + bufferId + ' : user ' + username + ' part');
    });
    
    quassel.on('user.away', function(network, username, isAway) {
        network = quassel.getNetworks().get(network);
        if (isAway) {
            console.log('Network ' + network.networkName + ' : user ' + username + ' is away');
        } else {
            console.log('Network ' + network.networkName + ' : user ' + username + ' is back');
        }
    });
    
    quassel.on('user.realname', function(network, username, isAway) {
        network = quassel.getNetworks().get(network);
        console.log('Network ' + network.networkName + ' : user ' + username + ' real name is');
    });
    
    quassel.on('channel.join', function(network, buffername, nick) {
        console.log('Channel ' + buffername + ' : user ' + nick + ' joined');
    });
    
    quassel.on('channel.addusermode', function(network, buffername, nick, mode) {
        console.log('Channel ' + buffername + ' - user ' + nick + ' -> mode : +' + mode);
    });
    
    quassel.on('channel.removeusermode', function(network, buffername, nick, mode) {
        console.log('Channel ' + buffername + ' : user ' + nick + ' -> mode -' + mode);
    });
    
    quassel.on('channel.topic', function(network, buffername, topic) {
        console.log('Channel ' + buffername + ' - new topic : ' + topic);
    });
    
    quassel.on('buffer.activate', function(buffername) {
        console.log('Buffer ' + buffername + ' activated');
    });
} else {
    
    var echoBufferList = function echoBufferList() {
        quassel.getNetworksHashMap().forEach(function(val, key){
            console.log(val.networkName + " :");
            var buffs = [];
            val.getBufferHashMap().forEach(function(val2, key2){
                buffs.push(val2.name + ": " + val2.id);
            });
            console.log(buffs.join(", "));
        });
    };
    
    var bufTimeout, schema = [{
        name: 'id',
        description: 'Buffer ID',
        required: true
    }, {
        name: 'message',
        description: 'Message',
        type: 'string',
        required: true
    }], once = false;
    quassel.on('network.addbuffer', function(network, bufferId) {
        if (!once) {
            clearTimeout(bufTimeout);
            bufTimeout = setTimeout(function(){
                once = true;
                var p = function() {
                    echoBufferList();
                    console.log("CTRL^C CTRL^C to quit.");
                    pprompt.get(schema, function (err, result) {
                        if (err) console.log(err);
                        else {
                            quassel.sendMessage(result.id, result.message);
                            p();
                        }
                    });
                };
                p();
            }, 1000);
        }
    });
}

quassel.connect();