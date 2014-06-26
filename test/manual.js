var Quassel = require('../lib/libquassel.js'),
    pprompt = require('prompt');
var opts = require("nomnom")
   .option('backlog', {
      abbr: 'b',
      flag: true,
      help: 'Fetch backlogs (off by default to limit console flood)'
   })
   .option('action', {
      abbr: 'a',
      flag: true,
      help: 'Play with buffers hidden state / Send messages / Mark buffer as read / (Dis)Connect network'
   })
   .option('noDebug', {
      abbr: 'd',
      full: 'no-debug',
      flag: true,
      help: 'Disable all libquassel logs'
   })
   .parse();

function echoBufferList() {
    quassel.getNetworksHashMap().forEach(function(val, key){
        console.log(val.networkName + " :");
        var buffs = [];
        val.getBufferHashMap().forEach(function(val2, key2){
            buffs.push(val2.name + ": " + val2.id);
        });
        console.log(buffs.join(", "));
    });
}

function echoNetworkList() {
    quassel.getNetworksHashMap().forEach(function(val, key){
        console.log(val.networkName + " : " + val.networkId);
    });
}

function echoActionChoices() {
    console.log(" 1. Disconnect Network");
    console.log(" 2. Connect Network");
    console.log(" 3. Mark buffer as read");
    console.log(" 4. Mark last line of a buffer");
    console.log(" 5. Hide buffer permanently");
    console.log(" 6. Hide buffer temporarily");
    console.log(" 7. Unhide buffer");
    console.log(" 8. Remove buffer");
    console.log(" 9. Request 20 more backlogs for a buffer");
    console.log("10. Send a message");
    console.log("(CTRL^C CTRL^C to quit)");
}

if (opts.action) {
    opts.noDebug = true;
    opts.backlog = true;
}
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

if (!opts.action) {
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
        var buffer = network.getBufferCollection().getBuffer(bufferId);
        if (buffer.isStatusBuffer()) {
            console.log('Network ' + network.networkId + ' - status buffer');
        } else {
            console.log('Network ' + network.networkId + ' - new buffer : ' + buffer.name);
        }
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
    
    quassel.on('buffer.activate', function(bufferId) {
        console.log('Buffer ' + bufferId + ' activated');
    });
    
    quassel.on('buffer.hidden', function(bufferId, type) {
        // type can be either "temp" or "perm"
        switch (type) {
            case "temp":
                console.log('Buffer ' + bufferId + ' temporarily hidden');
                break;
            case "perm":
                console.log('Buffer ' + bufferId + ' permanently hidden');
                break;
            default:
                console.log("Unknown type " + type);
        }
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
    
    quassel.on('channel.join', function(network, bufferId, nick) {
        console.log('Channel ' + bufferId + ' : user ' + nick + ' joined');
    });
    
    quassel.on('channel.addusermode', function(network, bufferId, nick, mode) {
        console.log('Channel ' + bufferId + ' - user ' + nick + ' -> mode : +' + mode);
    });
    
    quassel.on('channel.removeusermode', function(network, bufferId, nick, mode) {
        console.log('Channel ' + bufferId + ' : user ' + nick + ' -> mode -' + mode);
    });
    
    quassel.on('channel.topic', function(network, bufferId, topic) {
        console.log('Channel ' + bufferId + ' - new topic : ' + topic);
    });
    
} else {
    
    var schemaActionChoices = [{
        name: 'id',
        description: 'Choose action',
        enum: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
        required: true
    }], schemaBuffer = [{
        name: 'id',
        type: 'string',
        description: 'Buffer ID',
        required: true
    }], schemaMessage = [{
        name: 'id',
        type: 'string',
        description: 'Buffer ID',
        required: true
    }, {
        name: 'message',
        description: 'Message',
        type: 'string',
        required: true
    }], schemaConnect = [{
        name: 'id',
        type: 'string',
        description: 'Choose a networkId',
        required: true
    }];
    
    var p = function() {
        echoActionChoices();
        
        pprompt.get(schemaActionChoices, function (err, result) {
            if (err) console.log(err);
            else {
                switch(result.id) {
                    case '1':
                        // Disconnect Network
                        echoNetworkList();
                        pprompt.get(schemaConnect, function (err2, result2) {
                            if (err2) console.log(err2);
                            else {
                                quassel.requestDisconnectNetwork(result2.id);
                                setTimeout(p, 1);
                            }
                        });
                        break;
                    case '2':
                        // Connect Network
                        echoNetworkList();
                        pprompt.get(schemaConnect, function (err2, result2) {
                            if (err2) console.log(err2);
                            else {
                                quassel.requestConnectNetwork(result2.id);
                                setTimeout(p, 1);
                            }
                        });
                        break;
                    case '3':
                        // Mark buffer as read
                        echoBufferList();
                        pprompt.get(schemaBuffer, function (err2, result2) {
                            if (err2) console.log(err2);
                            else {
                                var ids = quassel.getNetworks().findBuffer(parseInt(result2.id, 10)).messages.keys();
                                var max = Math.max.apply(null, ids);
                                quassel.requestSetLastMsgRead(result2.id, max);
                                quassel.requestMarkBufferAsRead(result2.id);
                                setTimeout(p, 1);
                            }
                        });
                        break;
                    case '4':
                        // Mark last line of a buffer
                        echoBufferList();
                        pprompt.get(schemaBuffer, function (err2, result2) {
                            if (err2) console.log(err2);
                            else {
                                var ids = quassel.getNetworks().findBuffer(parseInt(result2.id, 10)).messages.keys();
                                var max = Math.max.apply(null, ids);
                                quassel.requestSetMarkerLine(result2.id, max);
                                setTimeout(p, 1);
                            }
                        });
                        break;
                    case '5':
                        // Hide buffer permanently
                        echoBufferList();
                        pprompt.get(schemaBuffer, function (err2, result2) {
                            if (err2) console.log(err2);
                            else {
                                quassel.requestHideBufferPermanently(result2.id);
                                setTimeout(p, 1);
                            }
                        });
                        break;
                    case '6':
                        // Hide buffer temporarily
                        echoBufferList();
                        pprompt.get(schemaBuffer, function (err2, result2) {
                            if (err2) console.log(err2);
                            else {
                                quassel.requestHideBufferTemporarily(result2.id);
                                setTimeout(p, 1);
                            }
                        });
                        break;
                    case '7':
                        // Unhide buffer
                        echoBufferList();
                        pprompt.get(schemaBuffer, function (err2, result2) {
                            if (err2) console.log(err2);
                            else {
                                quassel.requestUnhideBuffer(result2.id);
                                setTimeout(p, 1);
                            }
                        });
                        break;
                    case '8':
                        //Remove buffer
                        echoBufferList();
                        pprompt.get(schemaBuffer, function (err2, result2) {
                            if (err2) console.log(err2);
                            else {
                                quassel.requestRemoveBuffer(result2.id);
                                setTimeout(p, 1);
                            }
                        });
                        break;
                    case '9':
                        // Request 20 more backlogs for a buffer
                        echoBufferList();
                        pprompt.get(schemaBuffer, function (err2, result2) {
                            if (err2) console.log(err2);
                            else {
                                var ids = quassel.getNetworks().findBuffer(parseInt(result2.id, 10)).messages.keys();
                                var min = Math.min.apply(null, ids);
                                quassel.once('buffer.backlog', function(bufferId) {
                                    var buf = quassel.getNetworks().findBuffer(bufferId);
                                    console.log(buf.name + " : " + buf.messages.count() + " total messages fetched");
                                });
                                quassel.requestBacklog(result2.id, -1, min, 20);
                                setTimeout(p, 1);
                            }
                        });
                        break;
                    case '10':
                        // Send a message
                        echoBufferList();
                        pprompt.get(schemaMessage, function (err2, result2) {
                            if (err2) console.log(err2);
                            else {
                                quassel.sendMessage(result2.id, result2.message);
                                setTimeout(p, 1);
                            }
                        });
                        break;
                    default:
                        console.log('Wrong choice');
                        setTimeout(p, 1);
                }
            }
        });
    };
    
    var bufTimeout, once = false;
    
    quassel.on('network.addbuffer', function(network, bufferId) {
        if (!once) {
            clearTimeout(bufTimeout);
            bufTimeout = setTimeout(function(){
                once = true;
                p();
            }, 1000);
        }
    });
}

quassel.connect();