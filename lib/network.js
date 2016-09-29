/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2016 Joël Charles
 * Licensed under the MIT license.
 */

/** @module network */

var Glouton = require('./glouton'),
    IRCUser = require('./user'),
    IRCBufferCollection = require('./buffer').IRCBufferCollection,
    logger = require('debug')('libquassel:network'),
    qtdatastream = require('qtdatastream');

/**
 * @class
 * @alias module:network.Network
 * @augments module:glouton.Glouton
 * @param {number} networkId
 */
var Network = function Network(networkId) {
    /** @member {number} networkId */
    this.networkId = networkId;
    /** @member {module:buffer.IRCBufferCollection} buffers */
    this.buffers = new IRCBufferCollection();
    /** @member {Map.<String, module:user>} users */
    this.users = new Map;
    /** @member {boolean} open */
    this.open = false;
    /** @member {module:network.Network.ConnectionState} connectionState */
    this.connectionState = Network.ConnectionState.Disconnected;
    /** @member {boolean} isConnected */
    this.isConnected = false;
    /** @member {number} latency */
    this.latency = 0;
    /** @member {?module:buffer.IRCBuffer} statusBuffer */
    this.statusBuffer = null;
    /** @member {?string} networkName */
    this.networkName = null;
    /** @member {?string} networkName */
    this.nick = null;
    /** @member {Object[]} ServerList */
    // TODO create type for ServerList element
    /** @member {?string} autoIdentifyPassword */
    /** @member {?string} autoIdentifyService */
    /** @member {number} autoReconnectInterval */
    /** @member {number} autoReconnectRetries */
    /** @member {?string} codecForDecoding */
    /** @member {?string} codecForEncoding */
    /** @member {?string} codecForServer */
    /** @member {?string} currentServer */
    /** @member {number} identityId */
    /** @member {string[]} perform */
    /** @member {boolean} rejoinChannels */
    /** @member {?string} saslAccount */
    /** @member {?string} saslPassword */
    /** @member {boolean} unlimitedReconnectRetries */
    /** @member {boolean} useAutoIdentify */
    /** @member {boolean} useAutoReconnect */
    /** @member {boolean} useRandomServer */
    /** @member {boolean} useSasl */
};

Glouton.extend(Network);

/**
 * @class
 * @alias module:network.NetworkCollection
 */
var NetworkCollection = function NetworkCollection() {
    this.hm = new Map;
};

/**
 * Add and empty {@link module:network.Network} identified by `networkid` to the collection
 * @param {number} networkid
 * @returns {module:network.Network}
 */
NetworkCollection.prototype.add = function(networkid) {
    networkid = parseInt(networkid, 10);
    var network = new Network(networkid);
    this.hm.set(networkid, network);
    return network;
};

/**
 * Add a {@link module:network.Network} Object to the collection
 * @param {number} networkid
 * @param {module:network.Network} network
 * @returns {module:network.Network} the same network object as the one in params
 */
NetworkCollection.prototype.set = function(networkid, network) {
    networkid = parseInt(networkid, 10);
    this.hm.set(networkid, network);
    return network;
};

/**
 * Get the {@link module:network.Network} Object identified by `networkid`
 * @param {number} networkid
 * @returns {?module:network.Network}
 */
NetworkCollection.prototype.get = function(networkid) {
    networkid = parseInt(networkid, 10);
    return this.hm.get(networkid);
};

/**
 * Delete the {@link module:network.Network} Object identified by `networkid` from the collection
 * @param {number} networkid
 */
NetworkCollection.prototype.delete = NetworkCollection.prototype.remove = function(networkid) {
    networkid = parseInt(networkid, 10);
    this.hm.delete(networkid);
};

/**
 * Returns {@link module:buffer.IRCBuffer} corresponding to given `bufferId`, or `null` otherwise
 * @param {number} bufferId
 * @returns {?module:buffer.IRCBuffer}
 */
NetworkCollection.prototype.findBuffer = function(bufferId) {
    if (typeof bufferId !== "number") return null;
    var networks = this.hm.values(), network, buffer;
    network = networks.next();
    while(!network.done) {
        buffer = network.value.getBufferCollection().getBuffer(bufferId);
        if (buffer) return buffer;
        network = networks.next();
    }
    return null;
};

/**
 * Delete the {@link module:buffer.IRCBuffer} Object identified by `bufferId` from the networks
 * @param {number} bufferId
 */
NetworkCollection.prototype.removeBuffer = function(bufferId) {
    var buffer = this.findBuffer(bufferId);
    if (buffer !== null) {
        this.get(buffer.network).getBufferCollection().removeBuffer(bufferId);
    }
};

/**
 * Returns `Iterator` over {@link module:network.Network} of this collection
 * @returns {Iterator.<module:network.Network>}
 */
NetworkCollection.prototype.values = function() {
    return this.hm.values();
};

/**
 * @alias module:network.Network.ConnectionState
 * @readonly
 * @enum {number}
 * @default
 */
Network.ConnectionState = {
    Disconnected: 0,
    Connecting: 1,
    Initializing: 2,
    Initialized: 3,
    Reconnecting: 4,
    Disconnecting: 5
};

/**
 * Set network name
 * @param {string} networkName
 */
Network.prototype.setName = function(networkName) {
    this.networkName = networkName;
    this.updateTopic();
};

/**
 * Affects `userList` parameter to internal `users` Map
 * @param {module:user[]} userList
 */
Network.prototype.setUserList = function(userList) {
    var i;
    this.users.clear();
    if (userList !== null && userList.length> 0) {
        for (i=0; i<userList.length; i++) {
            this.users.set(userList[i].nick, userList[i]);
        }
    }
};

/**
 * Set my network nick
 * @param {string} nick
 */
Network.prototype.setMyNick = function(nick) {
    this.nick = nick;
};

/**
 * Replace `oldNick` by `newNick` in current network and buffers
 * @param {string} oldNick
 * @param {string} newNick
 */
Network.prototype.renameUser = function(oldNick, newNick) {
    var user = this.getUserByNick(oldNick);
    if (user !== null) {
        user.nick = newNick;
        this.users.set(newNick, user);
        this.users.delete(oldNick);
        this.getBufferMap().forEach(function(buffer){
            if (buffer.isChannel() && buffer.hasUser(oldNick)) {
                buffer.updateUserMaps(oldNick);
            }
        });
    }
};

/**
 * Add given user to the network
 * @param {module:user} user
 */
Network.prototype.addUser = function(user) {
    this.users.set(user.nick, user);
};

/**
 * @callback removeUserCallback
 * @param {module:buffer.IRCBuffer} buffer
 */

/**
 * Remove the user identified by `nick` from the network and buffers
 * @param {string} nick
 * @param {?removeUserCallback} cb
 */
Network.prototype.removeUser = function(nick, cb) {
    // remove user from channels
    // and disable user buffer
    var ircuser = this.getUserByNick(nick);
    this.getBufferMap().forEach(function(buffer){
        if (buffer.isChannel() && buffer.hasUser(ircuser)) {
            buffer.removeUser(ircuser);
        }
        if (typeof activeCallback === 'function') {
            cb(buffer);
        }
    });
    this.users.delete(nick);
};

/**
 * Returns true if the specified nick exists in the network, false otherwise
 * @param {string} nick
 * @returns {boolean}
 */
Network.prototype.hasNick = function(nick) {
    return this.users.has(nick);
};

/**
 * Returns the {@link module:user} identified by the specified nick
 * @param {string} nick
 * @returns {?module:user}
 */
Network.prototype.getUserByNick = function(nick) {
    return this.users.get(nick) || null;
};

/**
 * Update `isConnected` value, and change the state of the `statusBuffer` of this network
 * @param {boolean} connected
 */
Network.prototype.setConnected = function(connected) {
    if (connected) {
        //this.setOpen(true);
        if (this.statusBuffer !== null) {
            this.statusBuffer.setActive(true);
        }
    } else {
        //this.setOpen(false);
        if (this.statusBuffer !== null) {
            this.statusBuffer.setActive(false);
        }
        /* TODO
        for (Buffer buffer : buffers.getRawBufferList()) {
            buffer.setActive(false);
        }
        */
    }
    this.isConnected = connected;
};

/**
 * Called by `devour` method. This method updates internal user and buffer Maps
 * @param {Object} uac
 */
Network.prototype.setIrcUsersAndChannels = function(uac) {
    var key, user, channel, nick, self=this;
    
    // Create IRCUsers and attach them to network
    for (key in uac.users) {
        user = new IRCUser(key, uac.users[key]);
        this.users.set(user.nick, user);
    }
    // If there is a buffer corresponding to a nick, activate the buffer
    this.getBufferMap().forEach(function(value){
        if (self.users.has(value.name)) {
            value.setActive(true);
        }
    });
    // Create Channels and attach them to network
    for (key in uac.channels) {
        channel = this.getBuffer(key);
        //Then attach users to channels
        for (nick in uac.channels[key].UserModes) {
            user = this.getUserByNick(nick);
            if (user !== null) {
                channel.addUser(user, uac.channels[key].UserModes[nick]);
            } else {
                logger("User " + nick + " have not been found on server.");
            }
        }
    }
};

/**
 * Update latency
 * @param {number} latency
 */
Network.prototype.setLatency = function(latency) {
    this.latency = latency;
};

/**
 * Actually set empty topic for statusBuffer, otherwise it does nothing
 */
Network.prototype.updateTopic = function() {
    if (this.statusBuffer !== null) {
        this.statusBuffer.setTopic("");
    }
};

/**
 * Set current statusBuffer for this network
 * @param {module:buffer.IRCBuffer} statusBuffer
 */
Network.prototype.setStatusBuffer = function(statusBuffer) {
    this.statusBuffer = statusBuffer;
};

/**
 * Returns statusBuffer of this network
 * @returns {module:buffer.IRCBuffer}
 */
Network.prototype.getStatusBuffer = function() {
    return this.statusBuffer;
};

/**
 * Returns current network buffers as {@link module:buffer.IRCBufferCollection}
 * @returns {module:buffer.IRCBufferCollection}
 */
Network.prototype.getBufferCollection = function() {
    return this.buffers;
};

/**
 * Returns current network buffers as {@link Map.<number, module:buffer.IRCBuffer>}
 * @returns {Map.<number, module:buffer.IRCBuffer>}
 */
Network.prototype.getBufferMap = function() {
    return this.buffers.buffers;
};

/**
 * Get the {module:buffer.IRCBuffer} corresponding to specified ID or name
 * @param {(number|string)} ind
 */
Network.prototype.getBuffer = function(ind) {
    return this.buffers.getBuffer(ind);
};

/**
 * Set current codec for decoding messages
 * @param {(Buffer|string)} s
 */
Network.prototype.setCodecForDecoding = function(s) {
    if (Buffer.isBuffer(s)) {
        this.codecForDecoding = qtdatastream.util.str(s);
    } else {
        this.codecForDecoding = s;
    }
};

/**
 * Set current codec for encoding messages
 * @param {(Buffer|string)} s
 */
Network.prototype.setCodecForEncoding = function(s) {
    if (Buffer.isBuffer(s)) {
        this.codecForEncoding = qtdatastream.util.str(s);
    } else {
        this.codecForEncoding = s;
    }
};

/**
 * Set current codec used by the server
 * @param {(Buffer|string)} s
 */
Network.prototype.setCodecForServer = function(s) {
    if (Buffer.isBuffer(s)) {
        this.codecForServer = qtdatastream.util.str(s);
    } else {
        this.codecForServer = s;
    }
};

/**
 * Transform a given network object to an Object representation prepared for QDataStream injection
 * @param {Network} network
 * @returns {object}
 */
Network.toQ = function(network) {
    var jServerList = [];
    for (var i = 0; i < network.ServerList.length; i++) {
        jServerList.push(new qtdatastream.QUserType("Network::Server", {
            Host: new qtdatastream.QString(network.ServerList[i].Host),
            Port: new qtdatastream.QUInt(network.ServerList[i].Port),
            Password: new qtdatastream.QString(network.ServerList[i].Password),
            UseSSL: new qtdatastream.QBool(network.ServerList[i].UseSSL),
            sslVersion: new qtdatastream.QInt(network.ServerList[i].sslVersion),
            UseProxy: new qtdatastream.QBool(network.ServerList[i].UseProxy),
            ProxyType: new qtdatastream.QInt(network.ServerList[i].ProxyType),
            ProxyHost: new qtdatastream.QString(network.ServerList[i].ProxyHost),
            ProxyPort: new qtdatastream.QUInt(network.ServerList[i].ProxyPort),
            ProxyUser: new qtdatastream.QString(network.ServerList[i].ProxyUser),
            ProxyPass: new qtdatastream.QString(network.ServerList[i].ProxyPass),
            sslVerify: new qtdatastream.QBool(network.ServerList[i].sslVerify)
        }));
    }
    var jNetwork = {
        NetworkId: new qtdatastream.QUserType("NetworkId", network.networkId),
        NetworkName: new qtdatastream.QString(network.networkName),
        Identity: new qtdatastream.QUserType("IdentityId", network.identityId),
        CodecForServer: new qtdatastream.QByteArray(network.codecForServer),
        CodecForEncoding: new qtdatastream.QByteArray(network.codecForEncoding),
        CodecForDecoding: new qtdatastream.QByteArray(network.codecForDecoding),
        ServerList: new qtdatastream.QList(jServerList),
        UseRandomServer: new qtdatastream.QBool(network.useRandomServer),
        Perform: new qtdatastream.QStringList(network.perform),
        UseAutoIdentify: new qtdatastream.QBool(network.useAutoIdentify),
        AutoIdentifyService: new qtdatastream.QString(network.autoIdentifyService),
        AutoIdentifyPassword: new qtdatastream.QString(network.autoIdentifyPassword),
        UseSasl: new qtdatastream.QBool(network.useSasl),
        SaslAccount: new qtdatastream.QString(network.saslAccount),
        SaslPassword: new qtdatastream.QString(network.saslPassword),
        UseAutoReconnect: new qtdatastream.QBool(network.useAutoReconnect),
        AutoReconnectInterval: new qtdatastream.QUInt(network.autoReconnectInterval),
        AutoReconnectRetries: new qtdatastream.QUInt(network.autoReconnectRetries),
        UnlimitedReconnectRetries: new qtdatastream.QBool(network.unlimitedReconnectRetries),
        RejoinChannels: new qtdatastream.QBool(network.rejoinChannels)
    };
    return new qtdatastream.QUserType("NetworkInfo", jNetwork);
};

exports.Network = Network;
exports.NetworkCollection = NetworkCollection;
