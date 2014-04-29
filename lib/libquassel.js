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
    qtdatastream = require('qtdatastream'),
    pprompt = require('prompt'),
    Writer = qtdatastream.Writer,
    Reader = qtdatastream.Reader;

var Quassel = function(server, port, cb) {
    var self = this;
    this.client = net.Socket();
    
    this.client.connect(port, server, function(){
        var writer = new Writer();
        //writer.writeUInt(0x42b33f00 | 0x01 | 0x02); // 0x01 encryption && 0x02 compression
        writer.writeUInt(0x42b33f00);
        writer.writeUInt(0x01);
        writer.writeUInt(0x01 << 31);
        self.client.write(writer.getRawBuffer());
    });
    
    this.client.on('data', function(data) {
        console.log('DATA');
        if (!isClientInfo) {
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
            isClientInfo = true;
            sendClientInfo(useSSL, useCompression);
        } else {
            if (olbBuf !== null) {
                data = Buffer.concat([olbBuf, data]);
            }
            var reader = new Reader(data);
            if (reader.size > data.length - 4) {
                console.log("("+ (data.length - 4) +"/"+ reader.size + ") Waiting for end of buffer");
                olbBuf = data;
            } else {
                olbBuf = null;
                reader.parse();
                console.log('Received result');
                console.log(reader.parsed);
                dispatch(reader.parsed, cb);
            }
        }
    });

    this.client.on('close', function() {
        console.log('Connection closed');
    });
    
    var isClientInfo = false;
    var olbBuf = null;
    
    function dispatch(obj, callback) {
        if (typeof obj.MsgType !== 'undefined') {
            handleMsgType(obj, callback);
        } else if(Buffer.isBuffer(obj[1])) {
            handleStruct(obj, callback);
        }
    }
    
    function handleMsgType(obj, callback) {
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
                }
                sendInitRequest("BufferSyncer", "");
                sendInitRequest("BufferViewManager", "");
                break;
            default:
                console.log('Unhandled MsgType ' + obj.MsgType);
        }
    }
    
    function handleStruct(obj, callback) {
        switch (obj[0]) {
            case RequestType.Invalid:
                break;
            case RequestType.Sync:
                break;
            case RequestType.RpcCall:
                break;
            case RequestType.InitRequest:
                break;
            case RequestType.InitData:
                switch(obj[1].toString()) {
                    case "Network":
                        handleInitDataNetwork(obj);
                        if (typeof callback === 'function'){
                            callback(obj);
                        }
                        break;
                    default:
                        console.log('Unhandled InitData ' + obj[1].toString());
                }
                break;
            case RequestType.HeartBeat:
                break;
            case RequestType.HeartBeatReply:
                break;
            default:
                console.log('Unhandled RequestType ' + obj[0]);
        }
        console.log("Special structure : " + obj[1].toString());
    }
    
    function handleInitDataNetwork(obj) {
        var networkId = parseInt(obj[2], 10);
        var network = Network.get(networkId);
        network.devour(obj[3]);
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
        var writer = new Writer(smap);
        console.log('Sending client informations');
        self.client.write(writer.getBuffer());
    }
    
    function sendInitRequest(classname, objectname) {
        var initRequest = [
            new qtdatastream.QUInt(RequestType.InitRequest),
            new qtdatastream.QString(classname),
            new qtdatastream.QString(objectname)
        ];
        var writer = new Writer(initRequest);
        self.client.write(writer.getBuffer());
    }
    
    function login() {
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
            var obj = {
                "MsgType": "ClientLogin",
                "User": result.user,
                "Password": result.password
            };
            var writer = new Writer(obj);
            self.client.write(writer.getBuffer());
        });
    }
};

Quassel.prototype.getNetworks = function() {
    return Network.list;
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

module.exports = Quassel;