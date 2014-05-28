/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2014 Joël Charles
 * Licensed under the MIT license.
 */
 
var net = require('net'),
    RequestType = require('./requesttype'),
    NetworkCollection = require('./network').NetworkCollection,
    IRCBuffer = require('./buffer').IRCBuffer,
    IRCUser = require('./user'),
    qtdatastream = require('qtdatastream'),
    util = require('util'),
    EventEmitter2 = require('eventemitter2').EventEmitter2,
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
 * @param {Object} [options] Allows optionnal parameter {nobacklogs: true}
 * in order not to request backlogs (mostly for debug purpose)
 * @param {loginCallback} 
 */
var Quassel = function(server, port, options, loginCallback) {
    EventEmitter2.call(this, {wildcard: true});
    var self = this;
    this.client = net.Socket();
    this.qtsocket = null;
    this.server = server;
    this.port = port;
    this.options = options || {};
    this.networks = new NetworkCollection();
    
    if (typeof options === 'function' && typeof loginCallback === 'undefined') {
        this.loginCallback = options;
    } else if (typeof loginCallback === 'function') {
        this.loginCallback = loginCallback;
    } else {
        throw "loginCallback parameter is mandatory";
    }
    
    // Handle magic number
    this.client.once('data', function(data) {
        var ret = data.readUInt32BE(0), useSSL = false, useCompression = false;
        if ((ret >> 24) & 0x01 > 0) {
            useSSL = true;
            console.log('Using SSL');
        }
        if ((ret >> 24) & 0x02 > 0) {
            useCompression = true;
            console.log('Using compression');
        }
        
        // bind events on qtsocket
        self.qtsocket = new qtdatastream.Socket(self.client);
        self.qtsocket.on('data', function(data) {
            dispatch(data);
        })
        .on('close', function() {
            console.log('Connection closed');
        })
        .on('end', function() {
            console.log('EEEEEND');
        })
        .on('error', function(e) {
            console.log('ERROR');
            console.log(e);
        });
        
        sendClientInfo(useSSL, useCompression);
    });
    
    function dispatch(obj) {
        if (obj === null) {
            console.log("Received null object ... ?");
        } else if (typeof obj.MsgType !== 'undefined') {
            handleMsgType(obj);
        } else if(Buffer.isBuffer(obj[1])) {
            handleStruct(obj);
        }
    }
    
    function handleMsgType(obj) {
        switch (obj.MsgType) {
            case 'ClientInitAck':
                // Try login
                login();
                break;
            case 'ClientLoginAck':
                // We are logged in
                console.log('Logged in');
                self.emit('login');
                break;
            case 'ClientLoginReject':
                // We are not logged in
                console.log(obj);
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
                    sendInitRequest("Network", ""+obj.SessionState.NetworkIds[i]);
                }
                // Attach buffers to network
                for (i=0; i<obj.SessionState.BufferInfos.length; i++) {
                    var ircbuffer = new IRCBuffer(obj.SessionState.BufferInfos[i].id, obj.SessionState.BufferInfos[i]);
                    self.networks.get(ircbuffer.network).getBufferCollection().addBuffer(ircbuffer);
                    self.emit("network.addbuffer", self.networks.get(ircbuffer.network), obj.SessionState.BufferInfos[i].id);
                    // TODO special case StatusBuffer
                }
                self.emit('init');
                sendInitRequest("BufferSyncer", "");
                sendInitRequest("BufferViewManager", "");
                if (!self.options.nobacklogs) {
                    setTimeout(requestBacklogs, 1000);
                }
                setInterval(heartBeat, 30000);
                break;
            default:
                console.log('Unhandled MsgType ' + obj.MsgType);
        }
    }
    
    function heartBeat(reply) {
        var d = new Date();
        var secs = d.getSeconds() + (60 * d.getMinutes()) + (60 * 60 * d.getHours());
        var slist = [
            (!!reply)?RequestType.HeartBeat:RequestType.HeartBeatReply,
            new qtdatastream.QTime(secs)
        ];
        console.log('Sending heartbeat');
        self.qtsocket.write(slist);
    }
    
    function getMaxBufferId() {
        var maxId = 0, network, ind, bufferIds;
        for (network in self.networks.all()) {
            bufferIds = self.networks.get(network).getBuffers().keys();
            for (ind in bufferIds) {
                if (bufferIds[ind] > maxId) maxId = bufferIds[ind];
            }
        }
        return maxId;
    }
    
    function createBuffer(networkId, name) {
        var bufferId = getMaxBufferId()+1;
        var buffer = new IRCBuffer(bufferId, {name: name});
        self.networks.get(networkId).getBufferCollection().addBuffer(buffer);
        self.emit("network.addbuffer", self.networks.get(networkId), bufferId);
    }
    
    function handleStruct(obj) {
        var className = obj[1].toString();
        switch (obj[0]) {
            case RequestType.Sync:
                var functionName = obj[3].toString();
                console.log(className + " received : " + functionName);
                switch(className) {
                    case "Network":
                        var networkId = obj[2].toString();
                        switch(functionName) {
                            case "setLatency":
                                console.log("Network " + networkId + " : latency " + obj[4]);
                                self.networks.get(networkId).setLatency(obj[4]);
                                self.emit('network.latency', self.networks.get(networkId), obj[4]);
                                break;
                            case "addIrcUser":
                                var user = new IRCUser(obj[4]);
                                self.networks.get(networkId).addUser(user);
                                sendInitRequest("IrcUser", networkId + "/" + obj[4].split("!")[0]);
                                break;
                            case "setConnectionState":
                                var connectionState = obj[4];
                                self.networks.get(networkId).connectionState = connectionState;
                                //TODO create status buffer for first connection
                                self.emit('network.connectionstate', self.networks.get(networkId), connectionState);
                                break;
                            case "addIrcChannel":
                                var bufferName = obj[4];
                                var hasBuffer = self.networks.get(networkId).getBufferCollection().hasBuffer(bufferName);
                                if (!hasBuffer) {
                                    createBuffer(networkId, bufferName);
                                }
                                sendInitRequest("IrcChannel", networkId + "/" + bufferName);
                                self.emit('network.addchannel', self.networks.get(networkId), bufferName);
                                break;
                            case "setConnected":
                                var isConnected = obj[4];
                                self.networks.get(networkId).setConnected(isConnected);
                                if (isConnected) {
                                    self.emit('network.connected', self.networks.get(networkId));
                                } else {
                                    self.emit('network.disconnected', self.networks.get(networkId));
                                }
                                break;
                            case "setMyNick":
                                var nick = obj[4];
                                self.networks.get(networkId).nick = nick;
                                self.emit('network.mynick', self.networks.get(networkId), nick);
                                break;
                            case "setNetworkName":
                                var networkName = obj[4];
                                self.networks.get(networkId).networkName = networkName;
                                self.emit('network.networkname', self.networks.get(networkId), networkName);
                                break;
                            case "setCurrentServer":
                                var server = obj[4];
                                self.networks.get(networkId).server = server;
                                self.emit('network.server', self.networks.get(networkId), server);
                                break;
                            default:
                                console.log('Unhandled Sync.Network ' + functionName);
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
                                self.emit('buffer.highlight', bufferId, messageId);
                                break;
                            case "removeBuffer":
                                var bufferId = obj[4];
                                self.networks.removeBuffer(bufferId);
                                self.emit('buffer.remove', bufferId);
                                break;
                            case "renameBuffer":
                                var bufferId = obj[4];
                                var newName = obj[5];
                                self.networks.getBuffer(bufferId).setName(newName);
                                self.emit('buffer.rename', bufferId, newName);
                                break;
                            default:
                                console.log('Unhandled Sync.BufferSyncer ' + functionName);
                        }
                        break;
                    case "BufferViewConfig":
                        switch(functionName) {
                            case "addBuffer":
                                var bufferId = obj[4];
                                var buffer = self.networks.findBuffer(bufferName);
                                if (buffer !== null){
                                    break;
                                }
                                //TODO hidden buffers
                                //TODO order
                                break;
                            case "removeBuffer":
                                var bufferId = obj[4];
                                var buffer = self.networks.findBuffer(bufferName);
                                if (buffer === null){
                                    console.log("Buffer #" + bufferId + " does not exists")
                                    break;
                                }
                                // TODO set temp hidden
                                break;
                            case "removeBufferPermanently":
                                var bufferId = obj[4];
                                var buffer = self.networks.findBuffer(bufferName);
                                if (buffer === null){
                                    console.log("Buffer #" + bufferId + " does not exists")
                                    break;
                                }
                                // TODO set perm hidden
                                break;
                            default:
                                console.log('Unhandled Sync.BufferViewConfig ' + functionName);
                        }
                        break;
                    case "IrcUser":
                        switch(functionName) {
                            case "partChannel":
                                var tmp = obj[2].split("/", 2);
                                var userNetworkId = parseInt(tmp[0], 10);
                                var userName = tmp[1];
                                var bufferName = obj[4];
                                self.networks.get(userNetworkId).getBufferCollection().getBuffer(bufferName).removeUser(userName);
                                self.emit('user.part', self.networks.get(userNetworkId), bufferName, userName);
                                break;
                            case "quit":
                                var tmp = obj[2].split("/", 2);
                                var userNetworkId = parseInt(tmp[0], 10);
                                var userName = tmp[1];
                                self.networks.get(userNetworkId).removeUser(userName);
                                self.emit('user.quit', self.networks.get(userNetworkId), userName);
                                break;
                            case "setNick":
                                // Already handled by RPC call
                                break;
                            case "setServer":
                                // TODO
                                break;
                            case "setAway":
                                var tmp = obj[2].split("/", 2);
                                var userNetworkId = parseInt(tmp[0], 10);
                                var userName = tmp[1];
                                var isAway = obj[4];
                                self.networks.get(userNetworkId).getUserByNick(userName).away = isAway;
                                self.emit('user.away', self.networks.get(userNetworkId), userName, isAway);
                                break;
                            case "setRealName":
                                var tmp = obj[2].split("/", 2);
                                var userNetworkId = parseInt(tmp[0], 10);
                                var userName = tmp[1];
                                var realname = obj[4];
                                self.networks.get(userNetworkId).getUserByNick(userName).realname = realname;
                                self.emit('user.realname', self.networks.get(userNetworkId), userName, realname);
                                break;
                            default:
                                console.log('Unhandled Sync.IrcUser ' + functionName);
                        }
                        break;
                    case "IrcChannel":
                        var tmp2 = obj[2].split("/", 2);
                        var bufferNetworkId = parseInt(tmp2[0], 10);
                        var bufferName = tmp2[1];
                        var buffer = self.networks.get(bufferNetworkId).getBufferCollection().getBuffer(bufferName);
                        switch(functionName) {
                            case "joinIrcUsers":
                                for (var i=0; i<obj[4].length; i++) {
                                    var user2 = self.networks.get(bufferNetworkId).getUserByNick(obj[4][i]);
                                    buffer.addUser(user2, obj[5][i]);
                                    self.emit('channel.join', buffer, user2);
                                }
                                break;
                            case "addUserMode":
                                var nick = obj[4];
                                var mode = obj[5];
                                var user = self.networks.get(bufferNetworkId).getUserByNick(nick);
                                buffer.addUserMode(user, mode);
                                self.emit('channel.addusermode', buffer, user, mode);
                                break;
                            case "removeUserMode":
                                var nick = obj[4];
                                var mode = obj[5];
                                var user = self.networks.get(bufferNetworkId).getUserByNick(nick);
                                buffer.removeUserMode(user, mode);
                                self.emit('channel.removeusermode', buffer, user, mode);
                                break;
                            case "setTopic":
                                var topic = obj[4];
                                buffer.topic = topic;
                                self.emit('channel.topic', buffer, topic);
                                break;
                            default:
                                console.log('Unhandled Sync.IrcChannel ' + functionName);
                        }
                        break;
                    case "BacklogManager":
                        switch(functionName) {
                            case "receiveBacklog":
                                var data = obj[9];
                                var buffer2 = null;
                                for (var i=0; i<data.length; i++) {
                                    var buffers = self.networks.get(data[i].bufferInfo.network).getBufferCollection();
                                    if (buffers.hasBuffer(data[i].bufferInfo.id)) {
                                        //TODO hightlight
                                        buffer2 = buffers.getBuffer(data[i].bufferInfo.id);
                                        if (!buffer2.addMessage(data[i])) {
                                            console.log("Getting message buffer already have " + data[i].bufferInfo.name);
                                        }
                                    } else {
                                        console.log("Buffer " + data[i].bufferInfo.id + " " + data[i].bufferInfo.name + " does not exists.");
                                    }
                                }
                                self.emit("backlog", buffer2);
                                break;
                            default:
                                console.log('Unhandled BufferSyncer.BacklogManager ' + functionName);
                        }
                        break;
                    default:
                        console.log('Unhandled Sync ' + className);
                }
                break;
            case RequestType.RpcCall:
                switch(className) {
                    case "2displayMsg(Message)":
                        var message = obj[2];
                        var networkId = message.bufferInfo.network;
                        var bufferId = message.bufferInfo.id;
                        if (!self.networks.get(networkId).getBufferCollection().hasBuffer(bufferId)) {
                            var buffer = new IRCBuffer(bufferId, message.bufferInfo);
                            self.networks.get(networkId).getBufferCollection().addBuffer(buffer);
                            self.emit("network.addbuffer", self.networks.get(networkId), bufferId);
                        }
                        
                        if (message.type === MessageType.NetsplitJoin) {
                            // TODO
                        } else if (message.type === MessageType.NetsplitQuit) {
                            // TODO
                        }
                        
                        var simpleMessage = self.networks.get(networkId).getBufferCollection().getBuffer(bufferId).addMessage(message);
                        self.emit("buffer.message", bufferId, simpleMessage);
                        break;
                    case "__objectRenamed__":
                        switch(functionName) {
                            case "IrcUser":
                                var newNick = obj[3].split("/", 2); // 1/Nick
                                var oldNick = obj[4].split("/", 2); // 1/Nick_
                                self.networks.get(newNick[0]).renameUser(oldNick[1], newNick[1]);
                                self.emit("network.userrenamed", self.networks.get(newNick[0]), oldNick[1], newNick[1]);
                                break;
                            default:
                                console.log('Unhandled RpcCall.__objectRenamed__ ' + functionName);
                        }
                        break;
                    case "2networkCreated(NetworkId)":
                        var networkId = obj[2];
                        self.networks.add(networkId);
                        sendInitRequest("Network", ""+networkId);
                        self.emit("network.new", networkId);
                        break;
                    case "2networkRemoved(NetworkId)":
                        var networkId = obj[2];
                        self.networks.remove(networkId);
                        self.emit("network.remove", networkId);
                        break;
                    default:
                        console.log('Unhandled RpcCall ' + className);
                }
                break;
            case RequestType.InitData:
                switch(className) {
                    case "Network":
                        var network = handleInitDataNetwork(obj);
                        self.emit("network.init", network);
                        break;
                    case "BufferSyncer":
                        var data = obj[3]["MarkerLines"], i;
                        if (data !== null) {
                            for (i=0; i<data.length; i+=2) {
                                var bufferId = data[i];
                                var messageId = data[i+1];
                                var buffer = self.networks.findBuffer(bufferId);
                                if (buffer !== null) {
                                    self.emit('buffer.highlight', bufferId, messageId);
                                } else {
                                    console.log("Buffer #" + bufferId + " does not exists");
                                }
                            }
                        } else {
                            console.log("Received null markerLines");
                        }
                        break;
                    case "IrcUser":
                        var tmp = obj[2].split("/", 2);
                        var data = obj[3];
                        var networkId = parseInt(tmp[0], 10);
                        var user = self.networks.get(networkId).getUserByNick(tmp[1]);
                        user.devour(data);
                        self.emit('network.adduser', self.networks.get(networkId), user);
                        break;
                    case "IrcChannel":
                        var tmp = obj[2].split("/", 2);
                        var data = obj[3];
                        var bufferNetworkId = parseInt(tmp[0], 10);
                        var bufferName = tmp[1];
                        var buffer = self.networks.get(bufferNetworkId).getBufferCollection().getBuffer(bufferName);
                        buffer.topic = data.topic;
                        buffer.active = true;
                        self.emit('channel.topic', buffer, data.topic);
                        self.emit('buffer.activate', buffer);
                        break;
                    case "BufferViewManager":
                        var data = obj[3]["BufferViewIds"];
                        if (data.length > 0) {
                            sendInitRequest("BufferViewConfig", ""+data[0]);
                        }
                        break;
                    case "BufferViewConfig":
                        var data = obj[3], ind, buffer;
                        for (ind in data.TemporarilyRemovedBuffers) {
                            buffer = self.networks.get(data.networkId).getBufferCollection().getBuffer(data.TemporarilyRemovedBuffers[ind]);
                            buffer.setTemporarilyRemoved(true);
                            // TODO emit ?
                        }
                        for (ind in data.RemovedBuffers) {
                            buffer = self.networks.get(data.networkId).getBufferCollection().getBuffer(data.RemovedBuffers[ind]);
                            buffer.setPermanentlyRemoved(true);
                            // TODO emit ?
                        }
                        // TODO data.BufferList -> ordered list of BufferIds
                        break;
                    default:
                        console.log('Unhandled InitData ' + className);
                }
                break;
            case RequestType.HeartBeat:
                console.log('HeartBeat');
                heartBeat(true);
                break;
            case RequestType.HeartBeatReply:
                console.log('HeartBeatReply');
                break;
            default:
                console.log('Unhandled RequestType ' + obj[0]);
        }
        console.log(obj[0] + " - Special structure : " + className);
    }
    
    function handleInitDataNetwork(obj) {
        var networkId = parseInt(obj[2], 10);
        var network = self.networks.get(networkId);
        network.devour(obj[3]);
        return network;
    }
    
    function requestBacklogs(){
        var ind, networks = self.networks.all();
        for (ind in networks) {
            var buffers = networks[ind].getBufferHashMap();
            buffers.forEach(function(value, key) {
                requestBacklog(value);
            });
        }
    }
    
    function requestBacklog(buffer) {
        var slist = [
            new qtdatastream.QInt(RequestType.Sync),
            "BacklogManager",
            "",
            "requestBacklog",
            new qtdatastream.QUserType("BufferId", buffer.id),
            new qtdatastream.QUserType("MsgId", -1),
            new qtdatastream.QUserType("MsgId", -1),
            new qtdatastream.QInt(10),
            new qtdatastream.QInt(0)
        ];
        console.log('Sending backlog request');
        self.qtsocket.write(slist);
    }
    
    function sendClientInfo(useSSL, useCompression){
        var smap = {
            "ClientDate": "Apr 14 2014 17:18:30",
            "UseSsl": 0,
            "ClientVersion": "QuasselClientNodeJSAPI v0.1.0",
            "UseCompression": 0,
            "MsgType": "ClientInit",
            "ProtocolVersion": 10
        };
        console.log('Sending client informations');
        self.qtsocket.write(smap);
    }
    
    function sendInitRequest(classname, objectname) {
        var initRequest = [
            new qtdatastream.QUInt(RequestType.InitRequest),
            new qtdatastream.QString(classname),
            new qtdatastream.QString(objectname)
        ];
        self.qtsocket.write(initRequest);
    }
    
    function login() {
        self.loginCallback(function(user, password) {
            var obj = {
                "MsgType": "ClientLogin",
                "User": user,
                "Password": password
            };
            self.qtsocket.write(obj);
        });
    }
};

util.inherits(Quassel, EventEmitter2);

Quassel.prototype.getNetworks = function() {
    return this.networks;
};

Quassel.prototype.connect = function() {
    var self = this;
    this.client.connect(this.port, this.server, function(){
        var writer = new Writer();
        //TODO encryption
        //TODO compression
        //writer.writeUInt(0x42b33f00 | 0x01 | 0x02); // 0x01 encryption && 0x02 compression
        writer.writeUInt(0x42b33f00);
        writer.writeUInt(0x01);
        writer.writeUInt(0x01 << 31);
        self.client.write(writer.getRawBuffer());
    });
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

var MessageType = Quassel.MessageType = {
    Plain: 0x00001,
    Notice: 0x00002,
    Action: 0x00004,
    Nick: 0x00008,
    Mode: 0x00010,
    Join: 0x00020,
    Part: 0x00040,
    Quit: 0x00080,
    Kick: 0x00100,
    Kill: 0x00200,
    Server: 0x00400,
    Info: 0x00800,
    Error: 0x01000,
    DayChange: 0x02000,
    Topic: 0x04000,
    NetsplitJoin: 0x08000,
    NetsplitQuit: 0x10000,
    Invite: 0x20000
};

module.exports = Quassel;
