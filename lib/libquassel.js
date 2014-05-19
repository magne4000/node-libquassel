/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2014 Joël Charles
 * Licensed under the MIT license.
 */
 
var net = require('net'),
    RequestType = require('./requesttype'),
    Network = require('./network'),
    IRCBuffer = require('./buffer').IRCBuffer,
    IRCUser = require('./user'),
    qtdatastream = require('qtdatastream'),
    util = require('util'),
    EventEmitter = require('events').EventEmitter,
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
    var self = this;
    this.client = net.Socket();
    this.qtsocket = null;
    this.server = server;
    this.port = port;
    this.options = options || {};
    if (typeof options === 'function' && typeof loginCallback === 'undefined') {
        this.loginCallback = options;
    } else if (typeof loginCallback === 'function') {
        this.loginCallback = loginCallback;
    } else {
        throw "loginCallback parameter is mandatory";
    }
    
    // Handle magic number
    this.client.once('data', function(data) {
        console.log('DATA');
        var ret = data.readUInt32BE(0), useSSL = false, useCompression = false;
        console.log('Received: ' + ret);
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
                break;
            case 'ClientLoginReject':
                // We are not logged in
                console.log(obj);
                break;
            case 'SessionInit':
                // Initialize session
                var i;
                // Init networks
                for (i=0; i<obj.SessionState.NetworkIds.length; i++) {
                    // Save network list
                    Network.add(parseInt(obj.SessionState.NetworkIds[i], 10));
                    // Ask server to give more information on each network
                    sendInitRequest("Network", ""+obj.SessionState.NetworkIds[i]);
                }
                // Attach buffers to network
                for (i=0; i<obj.SessionState.BufferInfos.length; i++) {
                    var ircbuffer = new IRCBuffer(obj.SessionState.BufferInfos[i].id, obj.SessionState.BufferInfos[i]);
                    Network.get(ircbuffer.network).buffers.addBuffer(ircbuffer);
                    // TODO special case StatusBuffer
                }
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
                                Network.get(networkId).setLatency(obj[4]);
                                self.emit('Network.setLatency', Network.get(networkId), obj[4]);
                                break;
                            case "addIrcUser":
                                var user = new IRCUser(obj[4]);
                                Network.get(networkId).addUser(user);
                                self.emit('Network.addIrcUser', Network.get(networkId), user);
                                break;
                            case "setConnectionState":
                                break;
                            case "addIrcChannel":
                                
                                break;
                            case "setConnected":
                                break;
                            case "setMyNick":
                                break;
                            case "setNetworkName":
                                break;
                            case "setCurrentServer":
                                break;
                            default:
                                console.log('Unhandled Sync.Network ' + functionName);
                        }
                        break;
                    case "BufferSyncer":
                        switch(functionName) {
                            case "markBufferAsRead":
                                break;
                            case "setLastSeenMsg":
                                break;
                            case "setMarkerLine":
                                break;
                            case "removeBuffer":
                                break;
                            case "renameBuffer":
                                break;
                            default:
                                console.log('Unhandled Sync.BufferSyncer ' + functionName);
                        }
                        break;
                    case "BufferViewConfig":
                        switch(functionName) {
                            case "addBuffer":
                                break;
                            case "removeBuffer":
                                break;
                            case "removeBufferPermanently":
                                break;
                            default:
                                console.log('Unhandled Sync.BufferViewConfig ' + functionName);
                        }
                        break;
                    case "IrcUser":
                        switch(functionName) {
                            case "partChannel":
                                break;
                            case "quit":
                                var tmp = obj[2].split("/", 2);
                                var userNetworkId = parseInt(tmp[0], 10);
                                var userName = tmp[1];
                                Network.get(userNetworkId).removeUser(userName);
                                self.emit('IrcUser.quit', Network.get(userNetworkId), userName);
                                break;
                            case "setNick":
                                break;
                            case "setServer":
                                break;
                            case "setAway":
                                break;
                            case "setRealName":
                                break;
                            default:
                                console.log('Unhandled Sync.IrcUser ' + functionName);
                        }
                        break;
                    case "IrcChannel":
                        switch(functionName) {
                            case "joinIrcUsers":
                                var tmp2 = obj[2].split("/", 2);
                                var bufferNetworkId = parseInt(tmp2[0], 10);
                                var bufferName = tmp2[1];
                                for (var i=0; i<obj[4].length; i++) {
                                    var buffer = Network.get(bufferNetworkId).getBufferCollection().getBuffer(bufferName);
                                    var user2 = Network.get(bufferNetworkId).getUserByNick(obj[4][i]);
                                    buffer.addUser(user2, obj[5][i]);
                                    self.emit('IrcChannel.joinIrcUsers', Network.get(networkId), buffer, user2);
                                }
                                break;
                            case "addUserMode":
                                break;
                            case "removeUserMode":
                                break;
                            case "setTopic":
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
                                    var buffers = Network.get(data[i].bufferInfo.network).buffers;
                                    if (buffers.hasBuffer(data[i].bufferInfo.id)) {
                                        //TODO hightlight
                                        buffer2 = buffers.getBuffer(data[i].bufferInfo.id);
                                        if (!buffer2.addMessage(data[i])) {
                                            console.log("Getting message buffer already have " + data[i].bufferInfo.name);
                                        }
                                    } else {
                                        console.log("Buffer " + data[i].bufferInfo.id + " " + data[i].bufferInfo.name + " don't exists.");
                                    }
                                }
                                self.emit("BacklogManager.receiveBacklog", buffer2);
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
                        break;
                    case "__objectRenamed__":
                        switch(functionName) {
                            case "IrcUser":
                                break;
                            default:
                                console.log('Unhandled RpcCall.__objectRenamed__ ' + functionName);
                        }
                        break;
                    case "2networkCreated(NetworkId)":
                        break;
                    case "2networkRemoved(NetworkId)":
                        break;
                    default:
                        console.log('Unhandled RpcCall ' + className);
                }
                break;
            case RequestType.InitData:
                switch(className) {
                    case "Network":
                        var network = handleInitDataNetwork(obj);
                        self.emit("InitData.Network", network);
                        break;
                    case "BufferSyncer":
                        console.log("BufferSyncer received");
                        break;
                    case "IrcUser":
                        break;
                    case "IrcChannel":
                        break;
                    case "BufferViewManager":
                        break;
                    case "BufferViewConfig":
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
        var network = Network.get(networkId);
        network.devour(obj[3]);
        return network;
    }
    
    function requestBacklogs(){
        var k, l;
        for (k in Network.list) {
            var buffers = Network.list[k].getBuffers();
            for (l in buffers) {
                requestBacklog(buffers[l]);
            }
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

util.inherits(Quassel, EventEmitter);

Quassel.prototype.getNetworks = function() {
    return Network.list;
};

Quassel.prototype.connect = function() {
    var self = this;
    this.client.connect(this.port, this.server, function(){
        var writer = new Writer();
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

module.exports = Quassel;
