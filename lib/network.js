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
    IRCBuffer = require('./buffer').IRCBuffer,
    util = require('util'),
    HashMap = require('./hashmap'),
    EventEmitter2 = require('eventemitter2').EventEmitter2;

var Network = function Network(networkId) {
    serialize(this);
    Network.super_.call(this, {wildcard: true});
    
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

util.inherits(Network, EventEmitter2);
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

NetworkCollection.prototype.get = function(networkid) {
    networkid = parseInt(networkid, 10);
    return this.hm.get(networkid);
};

NetworkCollection.prototype.remove = function(networkid) {
    networkid = parseInt(networkid, 10);
    this.hm.remove(networkid);
};

NetworkCollection.prototype.findBuffer = function(bufferId) {
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
 * @param {IRCBuffer} statusBuffer
 */
Network.prototype.setStatusBuffer = function(statusBuffer) {
    this.statusBuffer = statusBuffer;
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
    this.emit('user.rename', user);
};

/**
 * @param {IrcUser} user
 */
Network.prototype.addUser = function(user) {
    this.nickUserMap[user.nick] = user;
    this.emit('user.new', user);
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
                self.emit('user.removeFromChannel', value, ircuser);
            }
        } else if (value.name === nick) {
            value.setActive(false);
            self.emit('user.deactivateBuffer', value, ircuser);
        }
    });
    delete this.nickUserMap[nick];
    this.emit('user.remove', ircuser);
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

/* TODO
    public boolean containsBuffer(int id) {
        return buffers.hasBuffer(id);
    }


    public int getBufferCount() {
        return buffers.getBufferCount();
    }
    
    public void removeBuffer(int bufferId) {
        buffers.removeBuffer(bufferId);

    }
*/

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
        channel = new IRCBuffer(key, uac.channels[key]);
        this.buffers.addBuffer(channel);
        
        //Then attach users to channels
        for (nick in channel.UserModes) {
            user = this.getUserByNick(nick);
            if (typeof user !== 'undefined') {
                channel.addUser(this.getUserByNick(nick), channel.UserModes[nick]);
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
