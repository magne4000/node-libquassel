const { Client } = require('../src/libquassel.js');
const inquirer = require('inquirer');
const net = require('net');

const ACTIONS = [
  "Disconnect Network",
  "Connect Network",
  "Mark buffer as read",
  "Mark last line of a buffer",
  "Hide buffer permanently",
  "Hide buffer temporarily",
  "Unhide buffer",
  "Remove buffer",
  "Request 20 more backlogs for a buffer",
  "Send a message",
  "Merge buffers request",
  "Update ignoreList",
  "Create identity",
  "Remove identity",
  "Create network",
  "Remove network",
  "Update identity",
  "Update network",
  "Setup core",
  "Rename buffer"
];

function ask() {
  return inquirer.prompt([{
    type: 'list',
    name: 'action',
    message: 'Choose your action',
    choices: ACTIONS
  }]);
}

function ask_creds() {
  return inquirer.prompt([{
    type: 'input',
    name: 'username',
    message: 'username'
  },{
    type: 'password',
    name: 'password',
    message: 'password'
  }]);
}

const socket = net.createConnection({
  host: "localhost",
  port: 4242
});

var quassel = new Client((next) => {
  ask_creds().then((creds) => {
    next(creds.username, creds.password);
  });
});

// function echoBackends() {
//     for (let storageBackend of quassel.coreInfo.StorageBackends) {
//         console.log(`${storageBackend.DisplayName}`);
//     }
// }

// function echoIdentities() {
//     quassel.identities.forEach(function(value, key) {
//         console.log(value.identityName + ": " + key);
//     });
// }

// function echoBufferList() {
//     quassel.getNetworksMap().forEach(function(val, key){
//         console.log(val.networkName + " :");
//         var buffs = [];
//         val.getBufferMap().forEach(function(val2, key2){
//             buffs.push(val2.name + ": " + val2.id);
//         });
//         console.log(buffs.join(", "));
//     });
// }

// function echoNetworkList() {
//     quassel.getNetworksMap().forEach(function(val, key){
//         console.log(val.networkName + " : " + val.networkId);
//     });
// }

    quassel.on('buffer.backlog', function(bufferId, messageIds) {
        var buf = quassel.networks.getBuffer(bufferId);
        console.log(buf.name + " : " + buf.messages.size);
    });

    quassel.on('network.init', function(network) {
        network = quassel.networks.get(network);
        // TODO
    });

    quassel.on('coreinfoinit', function(coreinfo) {
        console.log('Coreinfoinit', coreinfo);
    });

    quassel.on('coreinfo', function(coreinfo) {
        console.log('Coreinfo', coreinfo);
    });

    quassel.on('network.addbuffer', function(network, bufferId) {
        network = quassel.networks.get(network);
        var buffer = network.buffers.get(bufferId);
        if (buffer.isStatusBuffer) {
            console.log('Network ' + network.networkId + ' - status buffer');
        } else {
            console.log('Network ' + network.networkId + ' - new buffer : ' + buffer.name);
        }
    });

    quassel.on('network.latency', function(network, latency) {
        network = quassel.networks.get(network);
        console.log('Network ' + network.networkName + ' - latency : ' + latency);
    });

    quassel.on('network.adduser', function(network, nick) {
        network = quassel.networks.get(network);
        console.log('Network ' + network.networkName + ' - user : ' + nick);
    });

    quassel.on('network.connectionstate', function(network, state) {
        network = quassel.networks.get(network);
        console.log('Network ' + network.networkName + ' - state : ' + state);
    });

    quassel.on('network.connected', function(network) {
        network = quassel.networks.get(network);
        console.log('Network ' + network.networkName + ' - connected');
    });

    quassel.on('network.disconnected', function(network) {
        network = quassel.networks.get(network);
        console.log('Network ' + network.networkName + ' - disconnected');
    });

    quassel.on('network.mynick', function(network, nick) {
        network = quassel.networks.get(network);
        console.log('Network ' + network.networkName + ' - nick : ' + nick);
    });

    quassel.on('network.networkname', function(network, name) {
        network = quassel.networks.get(network);
        console.log('Network ' + network.networkName + ' - name : ' + name);
    });

    quassel.on('network.server', function(network, server) {
        network = quassel.networks.get(network);
        console.log('Network ' + network.networkName + ' - server : ' + server);
    });

    quassel.on('buffer.message', function(bufferId, messageId) {
        console.log('New message on buffer #' + bufferId + ' :', messageId);
        var buffer = quassel.networks.getBuffer(bufferId);
        var message = buffer.messages.get(messageId);
        console.log(messageId, message);
        if (quassel.ignoreList.matches(message, quassel.networks)) {
            console.log(messageId, 'is ignored');
        }
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

    quassel.on('buffer.merge', function(bufferId1, bufferId2) {
        console.log('Buffer #' + bufferId2 + ' merged into buffer #' + bufferId1);
    });

    quassel.on('buffer.lastseen', function(bufferId, messageId) {
        console.log('Buffer #' + bufferId + ' : Last seen message #' + messageId);
    });

    quassel.on('buffer.markerline', function(bufferId, messageId) {
        console.log('Buffer #' + bufferId + ' : Markerline above message #' + messageId);
    });

    quassel.on('buffer.activate', function(bufferId) {
        console.log('Buffer ' + bufferId + ' activated');
    });

    quassel.on('buffer.deactivate', function(bufferId) {
        console.log('Buffer ' + bufferId + ' deactivated');
    });

    quassel.on('bufferview.bufferunhide', function(bufferViewId, bufferId) {
        console.log('Buffer ' + bufferId + ' not hidden anymore - BF[' + bufferViewId + ']');
    });

    quassel.on('bufferview.bufferhidden', function(bufferViewId, bufferId, type) {
        // type can be either "temp" or "perm"
        switch (type) {
            case "temp":
                console.log('Buffer ' + bufferId + ' temporarily hidden - BF[' + bufferViewId + ']');
                break;
            case "perm":
                console.log('Buffer ' + bufferId + ' permanently hidden - BF[' + bufferViewId + ']');
                break;
            default:
                console.log("Unknown type " + type);
        }
    });

    quassel.on('bufferview.orderchanged', function(bufferViewId) {
        console.log('Buffers order changed in BF[' + bufferViewId + ']');
    });

    quassel.on('user.quit', function(network, username) {
        network = quassel.networks.get(network);
        console.log('Network ' + network.networkName + ' : user ' + username + ' quit');
    });

    quassel.on('user.part', function(network, username, bufferId) {
        network = quassel.networks.get(network);
        console.log('Network ' + network.networkName + ' - Buffer #' + bufferId + ' : user ' + username + ' part');
    });

    quassel.on('user.away', function(network, username, isAway) {
        network = quassel.networks.get(network);
        if (isAway) {
            console.log('Network ' + network.networkName + ' : user ' + username + ' is away');
        } else {
            console.log('Network ' + network.networkName + ' : user ' + username + ' is back');
        }
    });

    quassel.on('user.realname', function(network, username, isAway) {
        network = quassel.networks.get(network);
        console.log('Network ' + network.networkName + ' : user ' + username + ' real name is');
    });

    quassel.on('channel.join', function(bufferId, nick) {
        console.log('Channel ' + bufferId + ' : user ' + nick + ' joined');
    });

    quassel.on('channel.addusermode', function(bufferId, nick, mode) {
        console.log('Channel ' + bufferId + ' - user ' + nick + ' -> mode : +' + mode);
    });

    quassel.on('channel.removeusermode', function(bufferId, nick, mode) {
        console.log('Channel ' + bufferId + ' : user ' + nick + ' -> mode -' + mode);
    });

    quassel.on('channel.topic', function(bufferId, topic) {
        console.log('Channel ' + bufferId + ' - new topic : ' + topic);
    });

    quassel.on('ignorelist', function(ignorelist) {
        console.log('IgnoreList received', ignorelist);
    });

    quassel.on('network.new', function(networkId) {
        console.log('Network created', networkId);
    });

    quassel.on('network.remove', function(networkId) {
        console.log('Network removed', networkId);
    });

    quassel.on('identity.new', function(identityId) {
        console.log('Identity created', identityId);
    });

    quassel.on('identity.remove', function(identityId) {
        console.log('Identity removed', identityId);
    });

    quassel.on('identities.init', function(identities) {
        console.log('Identities initalized', identities);
    });

    quassel.on('setup', function(data) {
        console.log('Core needs setup', data);
    });

    quassel.on('coreinfoinit', function(data) {
        console.log('Core info init', data);
    });

    quassel.on('init', function(data) {
        console.log('Init', data);
    });
// } else {

//     var schemaActionChoices = [{
//         name: 'id',
//         description: 'Choose action',
//         enum: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'],
//         required: true
//     }], schemaBuffer = [{
//         name: 'id',
//         type: 'string',
//         description: 'Buffer ID',
//         required: true
//     }], schemaMessage = [{
//         name: 'id',
//         type: 'string',
//         description: 'Buffer ID',
//         required: true
//     }, {
//         name: 'message',
//         description: 'Message',
//         type: 'string',
//         required: true
//     }], schemaConnect = [{
//         name: 'id',
//         type: 'string',
//         description: 'Choose a networkId',
//         required: true
//     }], schemaMerge = [{
//         name: 'id1',
//         type: 'string',
//         description: 'Buffer ID 1',
//         required: true
//     },{
//         name: 'id2',
//         type: 'string',
//         description: 'Buffer ID 2',
//         required: true
//     }], schemaName = [{
//         name: 'id',
//         type: 'string',
//         description: 'Name',
//         required: true
//     }], schemaId = [{
//         name: 'id',
//         type: 'number',
//         description: 'ID',
//         required: true
//     }], schemaCoreSetup = [{
//         name: 'backend',
//         type: 'number',
//         description: 'Storage backend',
//         required: true
//     }, {
//         name: 'adminuser',
//         type: 'string',
//         description: 'Admin user',
//         required: true
//     }, {
//         name: 'adminpassword',
//         type: 'string',
//         hidden: true,
//         description: 'Admin user',
//         required: true
//     }], schemaNewName = [{
//         name: 'id',
//         type: 'string',
//         description: 'Buffer ID',
//         required: true
//     }, {
//         name: 'name',
//         description: 'New name',
//         type: 'string',
//         required: true
//     }];

//     var p = function() {
//         echoActionChoices();

//         pprompt.get(schemaActionChoices, function (err, result) {
//             if (err) console.log(err);
//             else {
//                 switch(result.id) {
//                     case '1':
//                         // Disconnect Network
//                         echoNetworkList();
//                         pprompt.get(schemaConnect, function (err2, result2) {
//                             if (err2) console.log(err2);
//                             else {
//                                 quassel.requestDisconnectNetwork(result2.id);
//                                 setTimeout(p, 1);
//                             }
//                         });
//                         break;
//                     case '2':
//                         // Connect Network
//                         echoNetworkList();
//                         pprompt.get(schemaConnect, function (err2, result2) {
//                             if (err2) console.log(err2);
//                             else {
//                                 quassel.requestConnectNetwork(result2.id);
//                                 setTimeout(p, 1);
//                             }
//                         });
//                         break;
//                     case '3':
//                         // Mark buffer as read
//                         echoBufferList();
//                         pprompt.get(schemaBuffer, function (err2, result2) {
//                             if (err2) console.log(err2);
//                             else {
//                                 var ids = quassel.getNetworks().findBuffer(parseInt(result2.id, 10)).messages.keys();
//                                 var max = Math.max.apply(null, ids);
//                                 quassel.requestSetLastMsgRead(result2.id, max);
//                                 quassel.requestMarkBufferAsRead(result2.id);
//                                 setTimeout(p, 1);
//                             }
//                         });
//                         break;
//                     case '4':
//                         // Mark last line of a buffer
//                         echoBufferList();
//                         pprompt.get(schemaBuffer, function (err2, result2) {
//                             if (err2) console.log(err2);
//                             else {
//                                 var ids = quassel.getNetworks().findBuffer(parseInt(result2.id, 10)).messages.keys();
//                                 var max = Math.max.apply(null, ids);
//                                 quassel.requestSetMarkerLine(result2.id, max);
//                                 setTimeout(p, 1);
//                             }
//                         });
//                         break;
//                     case '5':
//                         // Hide buffer permanently
//                         echoBufferList();
//                         pprompt.get(schemaBuffer, function (err2, result2) {
//                             if (err2) console.log(err2);
//                             else {
//                                 quassel.requestHideBufferPermanently(result2.id);
//                                 setTimeout(p, 1);
//                             }
//                         });
//                         break;
//                     case '6':
//                         // Hide buffer temporarily
//                         echoBufferList();
//                         pprompt.get(schemaBuffer, function (err2, result2) {
//                             if (err2) console.log(err2);
//                             else {
//                                 quassel.requestHideBufferTemporarily(result2.id);
//                                 setTimeout(p, 1);
//                             }
//                         });
//                         break;
//                     case '7':
//                         // Unhide buffer
//                         echoBufferList();
//                         pprompt.get(schemaBuffer, function (err2, result2) {
//                             if (err2) console.log(err2);
//                             else {
//                                 quassel.requestUnhideBuffer(result2.id);
//                                 setTimeout(p, 1);
//                             }
//                         });
//                         break;
//                     case '8':
//                         //Remove buffer
//                         echoBufferList();
//                         pprompt.get(schemaBuffer, function (err2, result2) {
//                             if (err2) console.log(err2);
//                             else {
//                                 quassel.requestRemoveBuffer(result2.id);
//                                 setTimeout(p, 1);
//                             }
//                         });
//                         break;
//                     case '9':
//                         // Request 20 more backlogs for a buffer
//                         echoBufferList();
//                         pprompt.get(schemaBuffer, function (err2, result2) {
//                             if (err2) console.log(err2);
//                             else {
//                                 var ids = quassel.getNetworks().findBuffer(parseInt(result2.id, 10)).messages.keys();
//                                 var min = Math.min.apply(null, ids);
//                                 quassel.once('buffer.backlog', function(bufferId, messageIds) {
//                                     var buf = quassel.getNetworks().findBuffer(bufferId);
//                                     console.log(buf.name + " : " + buf.messages.count() + " total messages fetched");
//                                 });
//                                 quassel.requestBacklog(result2.id, -1, min, 20);
//                                 setTimeout(p, 1);
//                             }
//                         });
//                         break;
//                     case '10':
//                         // Send a message
//                         echoBufferList();
//                         pprompt.get(schemaMessage, function (err2, result2) {
//                             if (err2) console.log(err2);
//                             else {
//                                 quassel.sendMessage(result2.id, result2.message);
//                                 setTimeout(p, 1);
//                             }
//                         });
//                         break;
//                     case '11':
//                         // Send merge buffers requests
//                         echoBufferList();
//                         pprompt.get(schemaMerge, function (err2, result2) {
//                             if (err2) console.log(err2);
//                             else {
//                                 quassel.requestMergeBuffersPermanently(result2.id1, result2.id2);
//                                 setTimeout(p, 1);
//                             }
//                         });
//                         break;
//                     case '12':
//                         // Send update (ignoreList) request
//                         quassel.requestUpdate(quassel.ignoreList.export());
//                         setTimeout(p, 1);
//                         break;
//                     case '13':
//                         // Send create identity request
//                         pprompt.get(schemaName, function (err2, result2) {
//                             if (err2) console.log(err2);
//                             else {
//                                 quassel.createIdentity(result2.id);
//                                 setTimeout(p, 1);
//                             }
//                         });
//                         break;
//                     case '14':
//                         // Send remove identity request
//                         echoIdentities();
//                         pprompt.get(schemaId, function (err2, result2) {
//                             if (err2) console.log(err2);
//                             else {
//                                 if (result2.id > 1 && quassel.identities.has(result2.id)) {
//                                     quassel.removeIdentity(result2.id);
//                                     setTimeout(p, 1);
//                                 }
//                             }
//                         });
//                         break;
//                     case '15':
//                         // Send create network request
//                         pprompt.get(schemaName, function (err2, result2) {
//                             if (err2) console.log(err2);
//                             else {
//                                 quassel.createNetwork(result2.id, 1, "test.test.test");
//                                 setTimeout(p, 1);
//                             }
//                         });
//                         break;
//                     case '16':
//                         // Send remove network request
//                         echoNetworkList();
//                         pprompt.get(schemaId, function (err2, result2) {
//                             if (err2) console.log(err2);
//                             else {
//                                 quassel.removeNetwork(result2.id);
//                                 setTimeout(p, 1);
//                             }
//                         });
//                         break;
//                     case '17':
//                         // Send update identity request
//                         echoIdentities();
//                         pprompt.get(schemaId, function (err2, result2) {
//                             if (err2) console.log(err2);
//                             else {
//                                 if (result2.id > 1 && quassel.identities.has(result2.id)) {
//                                     var identity = quassel.identities.get(result2.id);
//                                     identity.identityName += "_bis";
//                                     quassel.requestUpdateIdentity(result2.id, identity);
//                                     setTimeout(p, 1);
//                                 }
//                             }
//                         });
//                         break;
//                     case '18':
//                         // Send update network request
//                         echoNetworkList();
//                         pprompt.get(schemaId, function (err2, result2) {
//                             if (err2) console.log(err2);
//                             else {
//                                 var network = quassel.networks.get(result2.id);
//                                 network.networkName += "_bis";
//                                 quassel.requestSetNetworkInfo(result2.id, network);
//                                 setTimeout(p, 1);
//                             }
//                         });
//                         break;
//                     case '19':
//                         // Setup core
//                         echoBackends();
//                         pprompt.get(schemaCoreSetup, function (err2, result2) {
//                             if (err2) console.log(err2);
//                             else {
//                                 quassel.setupCore(quassel.coreInfo.StorageBackends[result2.backend].DisplayName, result2.adminuser, result2.adminpassword);
//                                 setTimeout(p, 1);
//                             }
//                         });
//                         break;
//                     case '20':
//                         // Rename buffer
//                         echoBufferList();
//                         pprompt.get(schemaNewName, function (err2, result2) {
//                             if (err2) console.log(err2);
//                             else {
//                                 quassel.requestRenameBuffer(result2.id, result2.name);
//                                 setTimeout(p, 1);
//                             }
//                         });
//                         break;
//                     default:
//                         console.log('Wrong choice');
//                         setTimeout(p, 1);
//                 }
//             }
//         });
//     };

//     var bufTimeout;

//     quassel.once('network.addbuffer', function(network, bufferId) {
//         clearTimeout(bufTimeout);
//         bufTimeout = setTimeout(function(){
//             p();
//         }, 1000);
//     });

//     quassel.once('setup', function(network, bufferId) {
//         p();
//     });
// }
quassel.connect(socket);
