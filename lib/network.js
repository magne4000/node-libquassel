/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2014 Joël Charles
 * Licensed under the MIT license.
 */

var Glouton = require('./glouton'),
    serialize = require('./serializer').serialize,
    IRCUser = require('./user'),
    IRCBufferCollection = require('./buffer').IRCBufferCollection,
    HashMap = require('./hashmap');

var Network = function Network(networkId) {
    serialize(this);
    
    this.networkId = networkId;
    this.buffers = new IRCBufferCollection();
    this.nickUserMap = {}; // HashMap<String, IrcUser>
    this.open = false;
    this.connectionState = Network.ConnectionState.Disconnected;
    this.isConnected = false;
    this.latency = 0;
    this.statusBuffer = null;
    this.networkName = null;
    this.nick = null;
    this.server = null;
};

Glouton.extend(Network);

var NetworkCollection = function NetworkCollection() {
    serialize(this);
    this.hm = new HashMap();
};

NetworkCollection.prototype.add = function(networkid) {
    networkid = parseInt(networkid, 10);
    this.hm.set(networkid, new Network(networkid));
    return this.hm.get(networkid);
};

NetworkCollection.prototype.set = function(networkid, network) {
    networkid = parseInt(networkid, 10);
    this.hm.set(networkid, network);
    return network;
};

NetworkCollection.prototype.get = function(networkid) {
    networkid = parseInt(networkid, 10);
    return this.hm.get(networkid);
};

NetworkCollection.prototype.remove = function(networkid) {
    networkid = parseInt(networkid, 10);
    this.hm.remove(networkid);
};

NetworkCollection.prototype.findBuffer = function(bufferId) {
    if (typeof bufferId !== "number") return null;
    var networks = this.hm.values(), ind;
    for (ind in networks) {
        if (networks[ind].getBufferCollection().hasBuffer(bufferId)) {
            return networks[ind].getBufferCollection().getBuffer(bufferId);
        }
    }
    return null;
};

NetworkCollection.prototype.removeBuffer = function(bufferId) {
    var buffer = this.findBuffer(bufferId);
    if (buffer !== null) {
        this.get(buffer.network).getBufferCollection().removeBuffer(bufferId);
    }
};

NetworkCollection.prototype.all = function() {
    return this.hm.values();
};

Network.ConnectionState = {
    Disconnected: 0,
    Connecting: 1,
    Initializing: 2,
    Initialized: 3,
    Reconnecting: 4,
    Disconnecting: 5
};

/**
 * @param {string} networkName
 */
Network.prototype.setName = function(networkName) {
    this.networkName = networkName;
    this.updateTopic();
};

/**
 * @param {Array<IrcUser>} networkName
 */
Network.prototype.setUserList = function(userList) {
    var i;
    this.nickUserMap.clear();
    if (userList !== null && userList.length> 0) {
        for (i=0; i<userList.length; i++) {
            this.nickUserMap.put(userList[i].nick, userList[i]);
        }
    }
};

/**
 * @param {string} oldNick
 * @param {string} newNick
 */
Network.prototype.renameUser = function(oldNick, newNick) {
    var user = this.getUserByNick(oldNick);
    user.nick = newNick;
    this.nickUserMap[newNick] = user;
    delete this.nickUserMap[oldNick];
};

/**
 * @param {IrcUser} user
 */
Network.prototype.addUser = function(user) {
    this.nickUserMap[user.nick] = user;
};

/**
 * @param {string} nick
 */
Network.prototype.removeUser = function(nick) {
    // remove user from channels
    // and disable user buffer
    var ircuser = this.getUserByNick(nick);
    var self = this;
    this.getBufferHashMap().forEach(function(value, key){
        if (value.isChannel()) {
            if (value.hasUser(ircuser)) {
                value.removeUser(ircuser);
            }
        } else if (value.name === nick) {
            value.setActive(false);
        }
    });
    delete this.nickUserMap[nick];
};

/**
 * @param {string} nick
 */
Network.prototype.hasNick = function(nick) {
    return nick in this.nickUserMap;
};

/**
 * @param {string} nick
 */
Network.prototype.getUserByNick = function(nick) {
    return this.nickUserMap[nick];
};

/**
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
 * @param {Object} uac
 */
Network.prototype.setIrcUsersAndChannels = function(uac) {
    var key, user, channel, nick;
    
    // Create IRCUsers and attach them to network
    for (key in uac.users) {
        user = new IRCUser(key, uac.users[key]);
        this.nickUserMap[user.nick] = user;
    }
    // Create Channels and attach them to network
    for (key in uac.channels) {
        channel = this.getBuffer(key);
        //Then attach users to channels
        for (nick in uac.channels[key].UserModes) {
            user = this.getUserByNick(nick);
            if (typeof user !== 'undefined') {
                channel.addUser(user, uac.channels[key].UserModes[nick]);
            } else {
                console.log("User " + nick + " have not been found on server.");
            }
        }
    }
};

/**
 * @param {number} latency
 */
Network.prototype.setLatency = function(latency) {
    this.latency = latency;
};

/**
 * @param {string} server
 */
Network.prototype.setServer = function(server) {
    this.server = server;
};

/**
 */
Network.prototype.updateTopic = function() {
    if (this.statusBuffer !== null) {
        this.statusBuffer.setTopic("");
    }
};

/**
 * @param {IRCBuffer} statusBuffer
 */
Network.prototype.setStatusBuffer = function(statusBuffer) {
    this.statusBuffer = statusBuffer;
};

/**
 * @returns {IRCBuffer}
 */
Network.prototype.getStatusBuffer = function() {
    return this.statusBuffer;
};

/**
 * @returns {IRCBufferCollection}
 */
Network.prototype.getBufferCollection = function() {
    return this.buffers;
};

/**
 * @returns {HashMap}
 */
Network.prototype.getBufferHashMap = function() {
    return this.buffers.buffers;
};

/**
 */
Network.prototype.getBuffer = function(ind) {
    return this.buffers.getBuffer(ind);
};

exports.Network = Network;
exports.NetworkCollection = NetworkCollection;
