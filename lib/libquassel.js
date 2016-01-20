/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2014 Joël Charles
 * Licensed under the MIT license.
 */
 
var net = require('net'),
    zlib = require('zlib'),
    tls = require('tls'),
    RequestType = require('./requesttype'),
    NetworkCollection = require('./network').NetworkCollection,
    Network = require('./network').Network,
    IRCBuffer = require('./buffer').IRCBuffer,
    IRCUser = require('./user'),
    MessageType = require('./message').Type,
    ignore = require('./ignore'),
    qtdatastream = require('qtdatastream'),
    util = require('util'),
    EventEmitter2 = require('eventemitter2').EventEmitter2,
    logger = require('debug')('libquassel:main'),
    Writer = qtdatastream.Writer;

/**
 * This callback is used by Quassel at login phase.
 * Its only parameter is a callback with 2 parameters: user and password; that
 * must be called at the end of this callback.
 * 
 * @example
 * function(next) {
 *     var user = source.getUser();
 *     var password = sourcer.getPassword();
 *     next(user, password);
 * }
 * @callback loginCallback
 * @param {function}
 */

/**
 * Main class to interact with Quassel instance.
 * @param {string} server The server hostname or IP address
 * @param {number} port The port on which runs Quassel on the server
 * @param {Object} [options] Allows optionnal parameters :
 * * {nobacklogs:true} default: false; Do not request backlogs (mostly for debug purpose)
 * * {initialbackloglimit:<int>} default: backloglimit value; 
 * * {backloglimit:<int>} default: 100; number of backlogs to request per buffer at connection
 * * {unsecurecore:true} default: false; Do not use SSL to connect to the core
 * @param {loginCallback} 
 */
var Quassel = function(server, port, options, loginCallback) {
    EventEmitter2.call(this, {wildcard: true});
    var self = this;
    this.client = null;
    this.qtsocket = null;
    this.server = server;
    this.port = port;
    this.options = options || {};
    this.options.backloglimit = parseInt(options.backloglimit || 100, 10);
    this.options.initialbackloglimit = parseInt(options.initialbackloglimit || this.options.backloglimit, 10);
    this.networks = new NetworkCollection();
    this.ignoreList = new ignore.IgnoreList();
    this.bufferViewId = 0;
    this.heartbeatInterval = null;
    this.useSSL = false;
    this.useCompression = false;
    this.connected = null;
    this.coreData = {};
    
    if (typeof options === 'function' && typeof loginCallback === 'undefined') {
        this.loginCallback = options;
    } else if (typeof loginCallback === 'function') {
        this.loginCallback = loginCallback;
    } else {
        throw new Error("loginCallback parameter is mandatory");
    }
    
    self.init();
};

util.inherits(Quassel, EventEmitter2);

Quassel.prototype.handleMsgType = function(obj) {
    var self = this;
    switch (obj.MsgType) {
        case 'ClientInitAck':
            // Try login
            self.emit('coreinfoinit', obj);
            self.login();
            break;
        case 'ClientLoginAck':
            // We are logged in
            self.log('Logged in');
            self.emit('login');
            break;
        case 'ClientLoginReject':
            // We are not logged in
            self.log(obj);
            self.emit('loginfailed');
            break;
        case 'SessionInit':
            // Initialize session
            var i;
            // Init networks
            for (i=0; i<obj.SessionState.NetworkIds.length; i++) {
                // Save network list
                self.networks.add(parseInt(obj.SessionState.NetworkIds[i], 10));
                // Ask server to give more information on each network
                self.sendInitRequest("Network", ""+obj.SessionState.NetworkIds[i]);
            }
            // Attach buffers to network
            for (i=0; i<obj.SessionState.BufferInfos.length; i++) {
                var ircbuffer = new IRCBuffer(obj.SessionState.BufferInfos[i].id, obj.SessionState.BufferInfos[i]);
                if (obj.SessionState.BufferInfos[i].type === IRCBuffer.Types.StatusBuffer) {
                    // Status Buffer special case
                    ircbuffer.isStatusBuffer(true);
                    self.networks.get(ircbuffer.network).setStatusBuffer(ircbuffer);
                }
                self.networks.get(ircbuffer.network).getBufferCollection().addBuffer(ircbuffer);
                if (ircbuffer.isChannel()) {
                    self.sendInitRequest("IrcChannel", ircbuffer.network + "/" + ircbuffer.name);
                }
                self.emit("network.addbuffer", ircbuffer.network, obj.SessionState.BufferInfos[i].id);
            }
            
            self.emit('init');
            self.sendInitRequest("BufferSyncer", "");
            self.sendInitRequest("BufferViewManager", "");
            self.sendInitRequest("IgnoreListManager", "");
            if (!self.options.nobacklogs && this.options.initialbackloglimit > 0) {
                setTimeout(function(){
                    self.requestBacklogs(self.options.initialbackloglimit);
                }, 1000);
            }
            self.heartbeatInterval = setInterval(function() {
                self.heartBeat();
            }, 30000);
            break;
        default:
            self.log('Unhandled MsgType ' + obj.MsgType);
    }
};
    
Quassel.prototype.heartBeat = function(reply) {
    var d = new Date();
    var secs = d.getSeconds() + (60 * d.getMinutes()) + (60 * 60 * d.getHours());
    var slist = [
        (!!reply)?RequestType.HeartBeat:RequestType.HeartBeatReply,
        new qtdatastream.QTime(secs)
    ];
    this.log('Sending heartbeat');
    this.qtsocket.write(slist);
};
    
Quassel.prototype.getMaxBufferId = function() {
    var maxId = 0;
    this.getNetworksHashMap().forEach(function(network, key){
        network.getBufferHashMap().forEach(function(buffer, key2){
            if (key2 > maxId) maxId = key2;
        });
    });
    return maxId;
};
    
Quassel.prototype.createBuffer = function(networkId, name, bufferId) {
    var buffer;
    bufferId = bufferId || this.getMaxBufferId()+1;
    networkId = parseInt(networkId, 10);
    if (name === null) {
        // Assuming that only StatusBuffer have null name
        buffer = new IRCBuffer(bufferId, {type : IRCBuffer.Types.StatusBuffer, network: networkId});
    } else {
        buffer = new IRCBuffer(bufferId, {name: name, network: networkId, type: IRCBuffer.Types.ChannelBuffer});
    }
    this.networks.get(networkId).getBufferCollection().addBuffer(buffer);
    this.emit("network.addbuffer", networkId, bufferId);
};
    
Quassel.prototype.handleStruct = function(obj) {
    var className = obj[1].toString();
    var self = this;
    switch (obj[0]) {
        case RequestType.Sync:
            var functionName = obj[3].toString();
            self.log(className + " received : " + functionName);
            switch(className) {
                case "Network":
                    var networkId = obj[2].toString();
                    switch(functionName) {
                        case "setLatency":
                            self.networks.get(networkId).setLatency(obj[4]);
                            self.emit('network.latency', networkId, obj[4]);
                            break;
                        case "addIrcUser":
                            var user = new IRCUser(obj[4]);
                            self.networks.get(networkId).addUser(user);
                            self.sendInitRequest("IrcUser", networkId + "/" + obj[4].split("!")[0]);
                            break;
                        case "setConnectionState":
                            var connectionState = obj[4];
                            var network = self.networks.get(networkId);
                            network.connectionState = connectionState;
                            //If network has no status buffer it is the first time we are connecting to it
                            if (connectionState == Network.ConnectionState.Connecting && network.getStatusBuffer() === null) {
                                // So we create the corresponding object
                                self.createBuffer(networkId, null);
                            }
                            self.emit('network.connectionstate', networkId, connectionState);
                            break;
                        case "addIrcChannel":
                            var bufferName = obj[4];
                            var hasBuffer = self.networks.get(networkId).getBufferCollection().hasBuffer(bufferName);
                            if (hasBuffer) {
                                self.emit('network.addbuffer', networkId, self.networks.get(networkId).getBufferCollection().getBuffer(bufferName).id);
                            }
                            self.sendInitRequest("IrcChannel", networkId + "/" + bufferName);
                            break;
                        case "setConnected":
                            var isConnected = obj[4];
                            self.networks.get(networkId).setConnected(isConnected);
                            if (isConnected) {
                                self.emit('network.connected', networkId);
                            } else {
                                self.emit('network.disconnected', networkId);
                            }
                            break;
                        case "setMyNick":
                            var nick = obj[4];
                            var oldNick = self.networks.get(networkId).nick;
                            self.networks.get(networkId).setMyNick(nick);
                            self.networks.get(networkId).renameUser(oldNick, nick);
                            self.emit("network.userrenamed", networkId, oldNick, nick);
                            self.emit('network.mynick', networkId, nick);
                            break;
                        case "setNetworkName":
                            var networkName = obj[4];
                            self.networks.get(networkId).networkName = networkName;
                            self.emit('network.networkname', networkId, networkName);
                            break;
                        case "setCurrentServer":
                            var server = obj[4];
                            self.networks.get(networkId).server = server;
                            self.emit('network.server', networkId, server);
                            break;
                        default:
                            self.log('Unhandled Sync.Network ' + functionName);
                    }
                    break;
                case "BufferSyncer":
                    switch(functionName) {
                        case "markBufferAsRead":
                            var bufferId = obj[4];
                            self.emit('buffer.read', bufferId);
                            break;
                        case "setLastSeenMsg":
                            var bufferId = obj[4];
                            var messageId = obj[5];
                            self.emit('buffer.lastseen', bufferId, messageId);
                            break;
                        case "setMarkerLine":
                            var bufferId = obj[4];
                            var messageId = obj[5];
                            self.emit('buffer.markerline', bufferId, messageId);
                            break;
                        case "removeBuffer":
                            var bufferId = obj[4];
                            self.networks.removeBuffer(bufferId);
                            self.emit('buffer.remove', bufferId);
                            break;
                        case "renameBuffer":
                            var bufferId = obj[4];
                            var newName = obj[5];
                            self.networks.findBuffer(bufferId).setName(newName);
                            self.emit('buffer.rename', bufferId, newName);
                            break;
                        case 'mergeBuffersPermanently':
                            var bufferId1 = obj[4];
                            var bufferId2 = obj[5];
                            var buffer1 = self.networks.findBuffer(bufferId1);
                            var buffer2 = self.networks.findBuffer(bufferId2);
                            if (buffer1 !== null && buffer2 !== null) {
                                buffer1.messages.copy(buffer2.messages);
                            }
                            self.networks.removeBuffer(bufferId2);
                            self.emit('buffer.merge', bufferId1, bufferId2);
                            break;
                        default:
                            self.log('Unhandled Sync.BufferSyncer ' + functionName);
                    }
                    break;
                case "BufferViewConfig":
                    switch(functionName) {
                        case "addBuffer":
                            var bufferId = obj[4];
                            var buffer = self.networks.findBuffer(bufferId);
                            if (buffer === null){
                                break;
                            }
                            buffer.setTemporarilyRemoved(false);
                            buffer.setPermanentlyRemoved(false);
                            self.networks.get(buffer.network).getBufferCollection()._computeFilteredBuffers();
                            self.emit('buffer.unhide', bufferId);
                            break;
                        case "removeBuffer":
                            var bufferId = obj[4];
                            var buffer = self.networks.findBuffer(bufferId);
                            if (buffer === null){
                                self.log("Buffer #" + bufferId + " does not exists");
                                break;
                            }
                            buffer.setTemporarilyRemoved(true);
                            self.networks.get(buffer.network).getBufferCollection()._computeFilteredBuffers();
                            self.emit('buffer.hidden', bufferId, "temp");
                            break;
                        case "removeBufferPermanently":
                            var bufferId = obj[4];
                            var buffer = self.networks.findBuffer(bufferId);
                            if (buffer === null){
                                self.log("Buffer #" + bufferId + " does not exists");
                                break;
                            }
                            buffer.setPermanentlyRemoved(true);
                            self.networks.get(buffer.network).getBufferCollection()._computeFilteredBuffers();
                            self.emit('buffer.hidden', bufferId, "perm");
                            break;
                        default:
                            self.log('Unhandled Sync.BufferViewConfig ' + functionName);
                    }
                    break;
                case "IrcUser":
                    switch(functionName) {
                        case "partChannel":
                            var tmp = splitOnce(obj[2], "/");
                            var userNetworkId = parseInt(tmp[0], 10);
                            var userName = tmp[1];
                            var bufferName = obj[4];
                            var networkNick = self.networks.get(userNetworkId).nick;
                            var buffer = self.networks.get(userNetworkId).getBufferCollection().getBuffer(bufferName);
                            self.networks.get(userNetworkId).getBufferCollection().getBuffer(bufferName).removeUser(userName);
                            self.emit('user.part', userNetworkId, userName, bufferName);
                            if (buffer.isChannel()) {
                                if (networkNick !== null && networkNick.toLowerCase() === userName.toLowerCase()) {
                                    // We part
                                    buffer.setActive(false);
                                    self.emit('buffer.deactivate', buffer.id);
                                }
                            } else if (buffer.name === userName){
                                buffer.setActive(false);
                                self.emit('buffer.deactivate', buffer.id);
                            }
                            break;
                        case "quit":
                            var tmp = splitOnce(obj[2], "/");
                            var userNetworkId = parseInt(tmp[0], 10);
                            var userName = tmp[1];
                            var networkNick = self.networks.get(userNetworkId).nick;
                            self.networks.get(userNetworkId).removeUser(userName, function(buffer){
                                if (buffer.isChannel()) {
                                    if (networkNick !== null && networkNick.toLowerCase() === userName.toLowerCase()) {
                                        // We part
                                        buffer.setActive(false);
                                        self.emit('buffer.deactivate', buffer.id);
                                    }
                                } else if (buffer.name === userName) {
                                    buffer.setActive(false);
                                    self.emit('buffer.deactivate', buffer.id);
                                }
                            });
                            self.emit('user.quit', userNetworkId, userName);
                            break;
                        case "setNick":
                            // Already handled by RPC call
                            break;
                        case "setServer":
                            // TODO
                            break;
                        case "setAway":
                            var tmp = splitOnce(obj[2], "/");
                            var userNetworkId = parseInt(tmp[0], 10);
                            var userName = tmp[1];
                            var isAway = obj[4];
                            var user = self.networks.get(userNetworkId).getUserByNick(userName);
                            if (user !== null) {
                                user.away = isAway;
                                self.emit('user.away', userNetworkId, userName, isAway);
                            }
                            break;
                        case "setRealName":
                            var tmp = splitOnce(obj[2], "/");
                            var userNetworkId = parseInt(tmp[0], 10);
                            var userName = tmp[1];
                            var realname = obj[4];
                            var user = self.networks.get(userNetworkId).getUserByNick(userName);
                            if (user !== null) {
                                user.realname = realname;
                                self.emit('user.realname', userNetworkId, userName, realname);
                            }
                            break;
                        default:
                            self.log('Unhandled Sync.IrcUser ' + functionName);
                    }
                    break;
                case "IrcChannel":
                    var tmp2 = splitOnce(obj[2], "/");
                    var bufferNetworkId = parseInt(tmp2[0], 10);
                    var bufferName = tmp2[1];
                    var buffer = self.networks.get(bufferNetworkId).getBufferCollection().getBuffer(bufferName);
                    switch(functionName) {
                        case "joinIrcUsers":
                            for (var i=0; i<obj[4].length; i++) {
                                var user2 = self.networks.get(bufferNetworkId).getUserByNick(obj[4][i]);
                                buffer.addUser(user2, obj[5][i]);
                                self.emit('channel.join', buffer.id, obj[4][i]);
                            }
                            break;
                        case "addUserMode":
                            var nick = obj[4];
                            var mode = obj[5];
                            var user = self.networks.get(bufferNetworkId).getUserByNick(nick);
                            buffer.addUserMode(user, mode);
                            self.emit('channel.addusermode', buffer.id, nick, mode);
                            break;
                        case "removeUserMode":
                            var nick = obj[4];
                            var mode = obj[5];
                            var user = self.networks.get(bufferNetworkId).getUserByNick(nick);
                            buffer.removeUserMode(user, mode);
                            self.emit('channel.removeusermode', buffer.id, nick, mode);
                            break;
                        case "setTopic":
                            var topic = obj[4];
                            buffer.topic = topic;
                            self.emit('channel.topic', buffer.id, topic);
                            break;
                        default:
                            self.log('Unhandled Sync.IrcChannel ' + functionName);
                    }
                    break;
                case "BacklogManager":
                    switch(functionName) {
                        case "receiveBacklog":
                            var bufferId = obj[4];
                            var data = obj[9];
                            var buffer = self.networks.findBuffer(bufferId);
                            if (buffer !== null) {
                                var messageIds = [];
                                for (var i=0; i<data.length; i++) {
                                    var message = buffer.addMessage(data[i]);
                                    if (!message) {
                                        self.log("Getting message buffer already have " + data[i].bufferInfo.name);
                                    } else {
                                        messageIds.push(message.id);
                                        message._updateFlags(self.networks.get(buffer.network).nick);
                                    }
                                }
                                self.emit("buffer.backlog", bufferId, messageIds);
                            } else {
                                self.log("Buffer " + bufferId + " does not exists.");
                            }
                            break;
                        default:
                            self.log('Unhandled BufferSyncer.BacklogManager ' + functionName);
                    }
                    break;
                case "IgnoreListManager":
                    switch(functionName) {
                        case "update":
                            var data = obj[4];
                            self.ignoreList.import(data);
                            self.emit('ignorelist', self.ignoreList);
                            break;
                        default:
                            self.log('Unhandled BufferSyncer.IgnoreListManager ' + functionName);
                    }
                    break;
                default:
                    self.log('Unhandled Sync ' + className);
            }
            break;
        case RequestType.RpcCall:
            switch(className) {
                case "2displayMsg(Message)":
                    var message = obj[2];
                    var networkId = message.bufferInfo.network;
                    var bufferId = message.bufferInfo.id;
                    var buffer;
                    if (!self.networks.get(networkId).getBufferCollection().hasBuffer(bufferId)) {
                        if (self.networks.get(networkId).getBufferCollection().hasBuffer(message.bufferInfo.name)) {
                            buffer = self.networks.get(networkId).getBufferCollection().getBuffer(message.bufferInfo.name);
                            self.networks.get(networkId).getBufferCollection().moveBuffer(buffer, bufferId);
                        } else {
                            buffer = new IRCBuffer(bufferId, message.bufferInfo);
                            self.networks.get(networkId).getBufferCollection().addBuffer(buffer);
                        }
                        self.emit("network.addbuffer", networkId, bufferId);
                    }
                    
                    if (message.type === MessageType.NetsplitJoin) {
                        // TODO
                    } else if (message.type === MessageType.NetsplitQuit) {
                        // TODO
                    }

                    buffer = self.networks.get(networkId).getBufferCollection().getBuffer(bufferId);
                    if (buffer !== null) {
                        var simpleMessage = buffer.addMessage(message);
                        if (simpleMessage) {
                            simpleMessage._updateFlags(self.networks.get(networkId).nick);
                            self.emit("buffer.message", bufferId, simpleMessage.id);
                        }
                    }
                    break;
                case "__objectRenamed__":
                    var renamedSubject = obj[2].toString();
                    switch(renamedSubject) {
                        case "IrcUser":
                            var newNick = splitOnce(obj[3], "/"); // 1/Nick
                            var oldNick = splitOnce(obj[4], "/"); // 1/Nick_
                            self.networks.get(newNick[0]).renameUser(oldNick[1], newNick[1]);
                            self.emit("network.userrenamed", newNick[0], oldNick[1], newNick[1]);
                            break;
                        default:
                            self.log('Unhandled RpcCall.__objectRenamed__ ' + renamedSubject);
                    }
                    break;
                case "2networkCreated(NetworkId)":
                    var networkId = obj[2];
                    self.networks.add(networkId);
                    self.sendInitRequest("Network", ""+networkId);
                    self.emit("network.new", networkId);
                    break;
                case "2networkRemoved(NetworkId)":
                    var networkId = obj[2];
                    self.networks.remove(networkId);
                    self.emit("network.remove", networkId);
                    break;
                default:
                    self.log('Unhandled RpcCall ' + className);
            }
            break;
        case RequestType.InitData:
            switch(className) {
                case "Network":
                    var network = self.handleInitDataNetwork(obj);
                    var syncRequest = [
                        new qtdatastream.QUInt(RequestType.Sync),
                        new qtdatastream.QString("BufferSyncer"),
                        new qtdatastream.QString(""),
                        new qtdatastream.QString("requestPurgeBufferIds")
                    ];
                    self.qtsocket.write(syncRequest);
                    self.emit("network.init", network.networkId);
                    break;
                case "BufferSyncer":
                    var markerLinesData = obj[3]["MarkerLines"], i;
                    var lastSeenData = obj[3]["LastSeenMsg"];
                    if (lastSeenData !== null) {
                        for (i=0; i<lastSeenData.length; i+=2) {
                            var bufferId = lastSeenData[i];
                            var messageId = lastSeenData[i+1];
                            var buffer = self.networks.findBuffer(bufferId);
                            if (buffer !== null) {
                                self.emit('buffer.lastseen', bufferId, messageId);
                            } else {
                                self.log("Buffer #" + bufferId + " does not exists");
                            }
                        }
                    } else {
                        self.log("Received null LastSeenMsg");
                    }
                    if (markerLinesData !== null) {
                        for (i=0; i<markerLinesData.length; i+=2) {
                            var bufferId = markerLinesData[i];
                            var messageId = markerLinesData[i+1];
                            var buffer = self.networks.findBuffer(bufferId);
                            if (buffer !== null) {
                                self.emit('buffer.markerline', bufferId, messageId);
                            } else {
                                self.log("Buffer #" + bufferId + " does not exists");
                            }
                        }
                    } else {
                        self.log("Received null markerLines");
                    }
                    break;
                case "IrcUser":
                    var tmp = splitOnce(obj[2], "/");
                    var data = obj[3];
                    var networkId = parseInt(tmp[0], 10);
                    var user = self.networks.get(networkId).getUserByNick(tmp[1]);
                    if (user !== null) {
                        user.devour(data);
                        self.emit('network.adduser', networkId, tmp[1]);
                    }
                    break;
                case "IrcChannel":
                    var tmp = splitOnce(obj[2], "/");
                    var data = obj[3];
                    var bufferNetworkId = parseInt(tmp[0], 10);
                    var bufferName = tmp[1];
                    var buffer = self.networks.get(bufferNetworkId).getBufferCollection().getBuffer(bufferName);
                    buffer.topic = data.topic;
                    buffer.active = true;
                    self.emit('channel.topic', bufferNetworkId, bufferName, data.topic);
                    self.emit('buffer.activate', buffer.id);
                    break;
                case "BufferViewManager":
                    var data = obj[3]["BufferViewIds"];
                    if (data.length > 0) {
                        self.sendInitRequest("BufferViewConfig", ""+data[0]);
                    }
                    self.bufferViewId = data[0];
                    break;
                case "BufferViewConfig":
                    var data = obj[3], ind, buffer;
                    for (ind in data.TemporarilyRemovedBuffers) {
                        buffer = self.networks.findBuffer(data.TemporarilyRemovedBuffers[ind]);
                        if (buffer !== null) {
                            buffer.setTemporarilyRemoved(true);
                            self.emit('buffer.hidden', buffer.id, "temp");
                        }
                    }
                    for (ind in data.RemovedBuffers) {
                        buffer = self.networks.findBuffer(data.RemovedBuffers[ind]);
                        if (buffer !== null) {
                            buffer.setPermanentlyRemoved(true);
                            self.emit('buffer.hidden', buffer.id, "perm");
                        }
                    }
                    for (ind in data.BufferList) {
                        buffer = self.networks.findBuffer(data.BufferList[ind]);
                        if (buffer !== null) {
                            buffer.setOrder(ind);
                            self.emit('buffer.order', buffer.id, ind);
                        }
                    }
                    break;
                case "IgnoreListManager":
                    var data = obj[3];
                    self.ignoreList.import(data);
                    self.emit('ignorelist', self.ignoreList);
                    break;
                case "CoreInfo":
                    var data = obj[3];
                    self.coreData = data;
                    self.emit('coreinfo', data);
                    break;
                default:
                    self.log('Unhandled InitData ' + className);
            }
            break;
        case RequestType.HeartBeat:
            self.log('HeartBeat');
            self.heartBeat(true);
            break;
        case RequestType.HeartBeatReply:
            self.log('HeartBeatReply');
            break;
        default:
            self.log('Unhandled RequestType ' + obj[0]);
    }
    self.log(obj[0] + " - Special structure : " + className);
};

Quassel.prototype.dispatch = function(obj) {
    if (obj === null) {
        this.log("Received null object ... ?");
    } else if (typeof obj.MsgType !== 'undefined') {
        this.handleMsgType(obj);
    } else if(Buffer.isBuffer(obj[1])) {
        this.handleStruct(obj);
    }
};
    
Quassel.prototype.handleInitDataNetwork = function(obj) {
    var networkId = parseInt(obj[2], 10);
    var network = this.networks.get(networkId);
    network.devour(obj[3]);
    return network;
};
    
Quassel.prototype.requestBacklogs = function(limit){
    var ind, networks = this.networks.all(), self = this;
    for (ind in networks) {
        var buffers = networks[ind].getBufferHashMap();
        buffers.forEach(function(value, key) {
            self.requestBacklog(value.id, -1, -1, limit);
        });
    }
};
    
Quassel.prototype.sendInitRequest = function(classname, objectname) {
    var initRequest = [
        new qtdatastream.QUInt(RequestType.InitRequest),
        new qtdatastream.QString(classname),
        new qtdatastream.QString(objectname)
    ];
    this.qtsocket.write(initRequest);
};

Quassel.prototype.sendClientInfo = function(useSSL, useCompression){
    var smap = {
        "ClientDate": "Apr 14 2014 17:18:30",
        "UseSsl": useSSL,
        "ClientVersion": "QuasselClientNodeJSAPI v0.2",
        "UseCompression": useCompression,
        "MsgType": "ClientInit",
        "ProtocolVersion": 10
    };
    this.log('Sending client informations');
    this.qtsocket.write(smap);
};

Quassel.prototype.init = function() {
    var self = this;
    this.client = net.Socket();
    
    // Handle magic number response
    this.client.once('data', function(data) {
        var ret = data.readUInt32BE(0);
        if (((ret >> 24) & 0x01) > 0) {
            self.useSSL = true;
            self.log('Using SSL');
        }
        
        if (((ret >> 24) & 0x02) > 0) {
            self.useCompression = true;
            self.log('Using compression');
        }
        
        
        if (self.useCompression) {
            // Not working, don't know why yet
            self.qtsocket = new qtdatastream.Socket(self.client, function(buffer, next) {
                zlib.inflate(buffer, next);
            }, function(buffer, next) {
                var deflate = zlib.createDeflate({flush: zlib.Z_SYNC_FLUSH}), buffers = [];
                deflate.on('data', function(chunk) {
                    buffers.push(chunk);
                });
                
                deflate.on('end', function() {
                    self.log(buffers);
                    next(null, Buffer.concat(buffers));
                });
                
                deflate.end(buffer);
            });
        } else {
            self.qtsocket = new qtdatastream.Socket(self.client);
        }
        
        // bind events on qtsocket
        self.qtsocket.on('data', function(data) {
            self.dispatch(data);
        })
        .on('close', function() {
            self.log('Connection closed');
        })
        .on('end', function() {
            self.log('END');
        })
        .on('error', function(e) {
            console.log('ERROR');
            console.log(e);
        });
        
        self.sendClientInfo(self.useSSL, self.useCompression);
    });
    
    this.client.on('error', function(e) {
        self.emit('_error', e);
    });  
};

Quassel.prototype.getNetworks = function() {
    return this.networks;
};

Quassel.prototype.getNetworksHashMap = function() {
    return this.networks.hm;
};

Quassel.prototype.login = function() {
    var self = this;
    if (self.useSSL) {
        var secureStream = tls.connect(null, {
            socket: self.qtsocket.socket,
            rejectUnauthorized: false,
            secureProtocol: 'TLSv1_client_method'
        });
        self.qtsocket.updateSocket(secureStream);
    }

    self.loginCallback(function(user, password) {
        var obj = {
            "MsgType": "ClientLogin",
            "User": user,
            "Password": password
        };
        self.qtsocket.write(obj);
    });
};

Quassel.prototype.connect = function() {
    var self = this;
    var magic = 0x42b33f00;
    // magic | 0x01 Encryption
    // magic | 0x02 Compression
    if (!self.options.unsecurecore) {
        magic = magic | 0x01;
    }
    
    if (this.connected !== null) {
        this.init();
    }
    
    this.client.connect(this.port, this.server, function(){
        var writer = new Writer();
        //writer.writeUInt(0x42b33f00 | 0x01 | 0x02); // 0x01 encryption && 0x02 compression
        writer.writeUInt(magic);
        writer.writeUInt(0x01);
        writer.writeUInt(0x01 << 31);
        self.client.write(writer.getRawBuffer());
        self.connected = true;
    });
};

Quassel.prototype.disconnect = function() {
    clearInterval(this.heartbeatInterval);
    this.client.end();
    this.client.destroy();
    this.connected = false;
};

Quassel.prototype.sendMessage = function(bufferId, message) {
    var buffer = this.networks.findBuffer(parseInt(bufferId, 10));
    if (buffer !== null) {
        var slit = [
            new qtdatastream.QInt(RequestType.RpcCall),
            "2sendInput(BufferInfo,QString)",
            new qtdatastream.QUserType("BufferInfo", buffer.getBufferInfo()),
            new qtdatastream.QString(message)
        ];
        this.log('Sending message');
        this.qtsocket.write(slit);
    } else {
        this.log("Could not send message to buffer " + bufferId + ". Buffer not found.");
    }
};

Quassel.prototype.requestBacklog = function(bufferId, firstMsgId, lastMsgId, maxAmount) {
    firstMsgId = firstMsgId || -1;
    lastMsgId = lastMsgId || -1;
    maxAmount = maxAmount || this.options.backloglimit;
    var slist = [
        new qtdatastream.QInt(RequestType.Sync),
        "BacklogManager",
        "",
        "requestBacklog",
        new qtdatastream.QUserType("BufferId", bufferId),
        new qtdatastream.QUserType("MsgId", firstMsgId),
        new qtdatastream.QUserType("MsgId", lastMsgId),
        new qtdatastream.QInt(maxAmount),
        new qtdatastream.QInt(0)
    ];
    this.log('Sending backlog request');
    this.qtsocket.write(slist);
};

/**
 * Requests a disconnection of the specified network
 * @param {number} networkId
 */
Quassel.prototype.requestDisconnectNetwork = function(networkId) {
    var slist = [
        new qtdatastream.QInt(RequestType.Sync),
        "Network",
        ""+networkId,
        new qtdatastream.QByteArray("requestDisconnect")
    ];
    this.log('Sending disconnection request');
    this.qtsocket.write(slist);
};

/**
 * Requests a connection of the specified network
 * @param {number} networkId
 */
Quassel.prototype.requestConnectNetwork = function(networkId) {
    var slist = [
        new qtdatastream.QInt(RequestType.Sync),
        "Network",
        ""+networkId,
        new qtdatastream.QByteArray("requestConnect")
    ];
    this.log('Sending connection request');
    this.qtsocket.write(slist);
};

/**
 * Requests to set buffer as read
 * @param {number} bufferId
 */
Quassel.prototype.requestMarkBufferAsRead = function(bufferId) {
    var slist = [
        new qtdatastream.QInt(RequestType.Sync),
        "BufferSyncer",
        "",
        new qtdatastream.QByteArray("requestMarkBufferAsRead"),
        new qtdatastream.QUserType("BufferId", bufferId)
    ];
    this.log('Sending mark buffer as read request');
    this.qtsocket.write(slist);
};

/**
 * Requests to set all messages before messageId as read
 * @param {number} bufferId
 * @param {number} messageId
 */
Quassel.prototype.requestSetLastMsgRead = function(bufferId, messageId) {
    var slist = [
        new qtdatastream.QInt(RequestType.Sync),
        "BufferSyncer",
        "",
        new qtdatastream.QByteArray("requestSetLastSeenMsg"),
        new qtdatastream.QUserType("BufferId", bufferId),
        new qtdatastream.QUserType("MsgId", messageId)
    ];
    this.log('Sending last message read request');
    this.qtsocket.write(slist);
};

/**
 * Requests to mark a specified buffer line 
 * @param {number} bufferId
 * @param {number} messageId
 */
Quassel.prototype.requestSetMarkerLine = function(bufferId, messageId) {
    var slist = [
        new qtdatastream.QInt(RequestType.Sync),
        "BufferSyncer",
        "",
        new qtdatastream.QByteArray("requestSetMarkerLine"),
        new qtdatastream.QUserType("BufferId", bufferId),
        new qtdatastream.QUserType("MsgId", messageId)
    ];
    this.log('Sending mark line request');
    this.qtsocket.write(slist);
};

/**
 * Requests to remove a buffer
 * @param {number} bufferId
 */
Quassel.prototype.requestRemoveBuffer = function(bufferId) {
    var slist = [
        new qtdatastream.QInt(RequestType.Sync),
        "BufferSyncer",
        "",
        new qtdatastream.QByteArray("requestRemoveBuffer"),
        new qtdatastream.QUserType("BufferId", bufferId)
    ];
    this.log('Sending perm hide request');
    this.qtsocket.write(slist);
};

/**
 * Requests to merge bufferId2 into bufferId1
 * @param {number} bufferId1
 * @param {number} bufferId2
 */
Quassel.prototype.requestMergeBuffersPermanently = function(bufferId1, bufferId2) {
    var slist = [
        new qtdatastream.QInt(RequestType.Sync),
        "BufferSyncer",
        "",
        new qtdatastream.QByteArray("requestMergeBuffersPermanently"),
        new qtdatastream.QUserType("BufferId", bufferId1),
        new qtdatastream.QUserType("BufferId", bufferId2)
    ];
    this.log('Sending merge request');
    this.qtsocket.write(slist);
};

/**
 * Requests to hide a buffer temporarily
 * @param {number} bufferId
 */
Quassel.prototype.requestHideBufferTemporarily = function(bufferId) {
    var slist = [
        new qtdatastream.QInt(RequestType.Sync),
        "BufferViewConfig",
        ""+this.bufferViewId,
        "requestRemoveBuffer",
        new qtdatastream.QUserType("BufferId", bufferId)
    ];
    this.log('Sending perm hide request');
    this.qtsocket.write(slist);
};

/**
 * Requests to hide a buffer permanently
 * @param {number} bufferId
 */
Quassel.prototype.requestHideBufferPermanently = function(bufferId) {
    var slist = [
        new qtdatastream.QInt(RequestType.Sync),
        "BufferViewConfig",
        ""+this.bufferViewId,
        "requestRemoveBufferPermanently",
        new qtdatastream.QUserType("BufferId", bufferId)
    ];
    this.log('Sending perm hide request');
    this.qtsocket.write(slist);
};

/**
 * Requests to unhide a buffer
 * @param {number} bufferId
 */
Quassel.prototype.requestUnhideBuffer = function(bufferId) {
    bufferId = parseInt(bufferId, 10);
    var buffer = this.getNetworks().findBuffer(bufferId);
    var bufferCount = this.getNetworks().get(buffer.network).getBufferHashMap().count();
    var slist = [
        new qtdatastream.QInt(RequestType.Sync),
        "BufferViewConfig",
        ""+this.bufferViewId,
        "requestAddBuffer",
        new qtdatastream.QUserType("BufferId", bufferId),
        new qtdatastream.QInt(bufferCount)
    ];
    this.log('Sending unhide request');
    this.qtsocket.write(slist);
};

/**
 * Requests to update ignoreList
 * @param {object} ignoreList
 */
Quassel.prototype.requestUpdate = function(ignoreList) {
    var slist = [
        new qtdatastream.QInt(RequestType.Sync),
        "IgnoreListManager",
        "",
        "requestUpdate",
        ignoreList
    ];
    this.log('Sending update request');
    this.qtsocket.write(slist);
};

Quassel.prototype.log = function(m) {
    logger(m);
};

qtdatastream.registerUserType("NetworkId", qtdatastream.Types.INT);
qtdatastream.registerUserType("IdentityId", qtdatastream.Types.INT);
qtdatastream.registerUserType("BufferId", qtdatastream.Types.INT);
qtdatastream.registerUserType("MsgId", qtdatastream.Types.INT);
qtdatastream.registerUserType("Identity", qtdatastream.Types.MAP);
qtdatastream.registerUserType("Network::Server", qtdatastream.Types.MAP);
qtdatastream.registerUserType("NetworkId", qtdatastream.Types.INT);
qtdatastream.registerUserType("BufferInfo", [
    {id: qtdatastream.Types.INT},
    {network: qtdatastream.Types.INT},
    {type: qtdatastream.Types.SHORT},
    {group: qtdatastream.Types.INT},
    {name: qtdatastream.Types.BYTEARRAY}
]);
qtdatastream.registerUserType("Message", [
    {id: qtdatastream.Types.INT},
    {timestamp: qtdatastream.Types.UINT},
    {type: qtdatastream.Types.UINT},
    {flags: qtdatastream.Types.BOOL},
    {bufferInfo: "BufferInfo"},
    {sender: qtdatastream.Types.BYTEARRAY},
    {content: qtdatastream.Types.BYTEARRAY}
]);

function splitOnce(str, character) {
    var i = str.indexOf(character);
    return [str.slice(0,i), str.slice(i+1)];
}

module.exports = Quassel;
