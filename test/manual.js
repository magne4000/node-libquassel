import { Client } from '../src/libquassel.js';
import inquirer from 'inquirer';
import net from 'net';
import ansiStyles from 'ansi-styles';


const ACTIONS = [
  { name: "Disconnect Network", value: "network-disconnect" },
  { name: "Connect Network", value: "network-connect" },
  { name: "Create network", value: "network-create" },
  { name: "Remove network", value: "network-remove" },
  { name: "Update network", value: "network-update" },
  { name: "Mark buffer as read", value: "buffer-mark-read" },
  { name: "Mark last line of a buffer", value: "buffer-mark-last-line" },
  { name: "Hide buffer permanently", value: "buffer-hide-perm" },
  { name: "Hide buffer temporarily", value: "buffer-hide-temp" },
  { name: "Unhide buffer", value: "buffer-unhide" },
  { name: "Remove buffer", value: "buffer-remove" },
  { name: "Merge buffers request", value: "buffer-merge" },
  { name: "Rename buffer", value: "buffer-rename" },
  { name: "Request 20 more backlogs for a buffer", value: "backlogs" },
  { name: "Send a message", value: "send-message" },
  { name: "Update ignoreList", value: "ignorelist" },
  { name: "Create identity", value: "identity-create" },
  { name: "Remove identity", value: "identity-remove" },
  { name: "Update identity", value: "identity-update" },
  { name: "Setup core", value: "setup" }
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

function red_if_undefined(s) {
  if (s === undefined) {
    return `${ansiStyles.red.open}${s}${ansiStyles.red.close}`;
  }
  return s;
}

function log(key, ...args) {
  const colors = [ 'grey', 'green', 'blue', 'magenta', 'cyan' ];
  const indice = [...key].map(x => x.charCodeAt(0)).reduce((x, y) => x + y) % 5;
  const stylekey = ansiStyles[colors[indice]];
  console.log(`${stylekey.open}${key}${stylekey.close} `);
  console.log(...args.map(x => red_if_undefined(x)));
}

const socket = net.createConnection({
  host: "localhost",
  port: 4242
});

const quassel = new Client((next) => {
  ask_creds().then((creds) => {
    next(creds.username, creds.password);
  });
});

quassel.on('buffer.backlog', function(bufferId, messageIds) {
  const buffer = quassel.networks.getBuffer(bufferId);
  log('buffer.backlog', '%s: %d messages', buffer, buffer.messages.size);
});

quassel.on('network.init', function(networkId) {
  const network = quassel.networks.get(networkId);
  log('network.init', '%s', network);
});

quassel.on('coreinfoinit', function(coreinfo) {
  log('coreinfoinit', coreinfo);
});

quassel.on('coreinfo', function(coreinfo) {
  log('coreinfo', coreinfo);
});

quassel.on('network.addbuffer', function(networkId, bufferId) {
  const network = quassel.networks.get(networkId);
  const buffer = network.buffers.get(bufferId);
  log('network.addbuffer', '%s %s', network, buffer);
});

quassel.on('network.latency', function(networkId, latency) {
  const network = quassel.networks.get(networkId);
  log('network.latency', '%s: %d', network, latency);
});

quassel.on('network.adduser', function(networkId, nick) {
  const network = quassel.networks.get(networkId);
  log('network.adduser', '%s %s', network, nick);
});

quassel.on('network.connectionstate', function(networkId, state) {
  const network = quassel.networks.get(networkId);
  log('network.connectionstate', '%s %s', network, state);
});

quassel.on('network.connected', function(networkId) {
  const network = quassel.networks.get(networkId);
  log('network.connected', '%s', network);
});

quassel.on('network.disconnected', function(networkId) {
  const network = quassel.networks.get(networkId);
  log('network.disconnected', '%s', network);
});

quassel.on('network.mynick', function(networkId, nick) {
  const network = quassel.networks.get(networkId);
  log('network.mynick', '%s: %s', network, nick);
});

quassel.on('network.networkname', function(networkId, name) {
  const network = quassel.networks.get(networkId);
  log('network.networkname', '%s: %s', network, name);
});

quassel.on('network.server', function(networkId, server) {
  const network = quassel.networks.get(networkId);
  log('network.server', '%s: %s', network, server);
});

quassel.on('buffer.message', function(bufferId, messageId) {
  const buffer = quassel.networks.getBuffer(bufferId);
  const message = buffer.messages.get(messageId);
  log('buffer.message', '[%s] %s %s', quassel.ignoreList.matches(message, quassel.networks) ? 'h' : 'v', buffer, message);
});

quassel.on('buffer.read', function(bufferId) {
  const buffer = quassel.networks.getBuffer(bufferId);
  log('buffer.read', '%s', buffer);
});

quassel.on('buffer.remove', function(bufferId) {
  const buffer = quassel.networks.getBuffer(bufferId);
  log('buffer.remove', '%s', buffer);
});

quassel.on('buffer.rename', function(bufferId, newName) {
  const buffer = quassel.networks.getBuffer(bufferId);
  log('buffer.remove', '%s: %s', buffer, newName);
});

quassel.on('buffer.merge', function(bufferId1, bufferId2) {
  const buffer = quassel.networks.getBuffer(bufferId1);
  log('buffer.merge', '%s -> %s', bufferId2, buffer);
});

quassel.on('buffer.lastseen', function(bufferId, messageId) {
  const buffer = quassel.networks.getBuffer(bufferId);
  log('buffer.lastseen', '%s: #%d', buffer, messageId);
});

quassel.on('buffer.markerline', function(bufferId, messageId) {
  const buffer = quassel.networks.getBuffer(bufferId);
  log('buffer.markerline', '%s above %d', buffer, messageId);
});

quassel.on('buffer.activate', function(bufferId) {
  const buffer = quassel.networks.getBuffer(bufferId);
  log('buffer.activate', '%s', buffer);
});

quassel.on('buffer.deactivate', function(bufferId) {
  const buffer = quassel.networks.getBuffer(bufferId);
  log('buffer.deactivate', '%s', buffer);
});

quassel.on('bufferview.bufferunhide', function(bufferViewId, bufferId) {
  const bufferView = quassel.bufferViews.get(bufferViewId);
  log('bufferview.bufferunhide', '%s #%d', bufferView, bufferId);
});

quassel.on('bufferview.bufferhidden', function(bufferViewId, bufferId, type) {
  const bufferView = quassel.bufferViews.get(bufferViewId);
  // type can be either "temp" or "perm"
  log('bufferview.bufferhidden', '(%s) %s #%d', type, bufferView, bufferId);
});

quassel.on('bufferview.orderchanged', function(bufferViewId) {
  const bufferView = quassel.bufferViews.get(bufferViewId);
  log('bufferview.orderchanged', '%s', bufferView);
});

quassel.on('user.quit', function(networkId, username) {
  const network = quassel.networks.get(networkId);
  log('user.quit', '%s: %s', network, username);
});

quassel.on('user.part', function(networkId, username, bufferId) {
  const network = quassel.networks.get(networkId);
  const buffer = quassel.networks.getBuffer(bufferId);
  log('user.quit', '%s %s: %s', network, buffer, username);
});

quassel.on('user.away', function(networkId, username, isAway) {
  const network = quassel.networks.get(networkId);
  log('user.away', '(%s) %s: %s', isAway, network, username);
});

quassel.on('user.realname', function(networkId, username, realname) {
  const network = quassel.networks.get(networkId);
  log('user.realname', '%s: %s is %s', network, username, realname);
});

quassel.on('channel.join', function(bufferId, nick) {
  const buffer = quassel.networks.getBuffer(bufferId);
  log('channel.join', '%s: %s', buffer, nick);
});

quassel.on('channel.addusermode', function(bufferId, nick, mode) {
  const buffer = quassel.networks.getBuffer(bufferId);
  log('channel.addusermode', '%s: %s modes +%s', buffer, nick, mode);
});

quassel.on('channel.removeusermode', function(bufferId, nick, mode) {
  const buffer = quassel.networks.getBuffer(bufferId);
  log('channel.removeusermode', '%s: %s modes -%s', buffer, nick, mode);
});

quassel.on('channel.topic', function(bufferId, topic) {
  const buffer = quassel.networks.getBuffer(bufferId);
  log('channel.topic', '%s: %s', buffer, topic);
});

quassel.on('ignorelist', function(ignorelist) {
  log('ignorelist', '%s', ignorelist);
});

quassel.on('network.new', function(networkId) {
  const network = quassel.networks.get(networkId);
  log('network.new', '%s', network);
});

quassel.on('network.remove', function(networkId) {
  const network = quassel.networks.get(networkId);
  log('network.remove', '%s', network);
});

quassel.on('identity.new', function(identityId) {
  const identity = quassel.identities.get(identityId);
  log('identity.new', '%s', identity);
});

quassel.on('identity.remove', function(identityId) {
  log('identity.remove', identityId);
});

quassel.on('identities.init', function(identities) {
  const ids = [];
  for (let identity of identities.values()) {
    ids.push(identity.toString());
  }
  log('identities.init', ids);
});

quassel.on('setup', function(data) {
  log('setup', data);
});

quassel.on('init', function(data) {
  log('init');
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
