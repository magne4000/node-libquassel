/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2014 Joël Charles
 * Licensed under the MIT license.
 */

var extend = require("extend"),
    Glouton = require('./glouton'),
    IRCUser = require('./user'),
    IRCBufferCollection = require('./buffer').IRCBufferCollection,
    IRCBuffer = require('./buffer').IRCBuffer,
    util = require('util'),
    EventEmitter = require('events').EventEmitter;

var Network = function(networkId) {
    extend(this, new Glouton());
    
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

util.inherits(Network, EventEmitter);

var NetworkCollection = function() {
    this.list = [];
};

NetworkCollection.prototype.add = function(networkid) {
    this.list[networkid] = new Network(networkid);
    return this.list[networkid];
};

NetworkCollection.prototype.get = function(networkid) {
    return this.list[networkid];
};

NetworkCollection.prototype.remove = function(networkid) {
    delete this.list[networkid];
};

NetworkCollection.prototype.findBuffer = function(bufferId) {
    var networkid;
    for (networkid in this.list) {
        if (this.list[networkid].getBufferCollection().hasBuffer(bufferId)) {
            return this.list[networkid].getBufferCollection().getBuffer(bufferId);
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
    return this.list;
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
    for (var ind in this.buffers.buffers) {
        if (this.buffers.buffers[ind].isChannel()) {
            if (this.buffers.buffers[ind].hasUser(ircuser)) {
                this.buffers.buffers[ind].removeUser(ircuser);
                this.emit('user.removeFromChannel', this.buffers.buffers[ind], ircuser);
            }
        } else if (this.buffers.buffers[ind].name === nick) {
            this.buffers.buffers[ind].setActive(false);
            this.emit('user.deactivateBuffer', this.buffers.buffers[ind], ircuser);
        }
    }
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
        if (uac.users.hasOwnProperty(key)) {
            user = new IRCUser(key, uac.users[key]);
            this.nickUserMap[user.nick] = user;
        }
    }
    
    // Create Channels and attach them to network
    for (key in uac.channels) {
        if (uac.channels.hasOwnProperty(key)) {
            channel = new IRCBuffer(key, uac.channels[key]);
            this.buffers.addBuffer(channel);
            
            //Then attach users to channels
            for (nick in channel.UserModes) {
                channel.addUser(this.getUserByNick(nick), channel.UserModes[nick]);
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
 */
Network.prototype.getBufferCollection = function() {
    return this.buffers;
};

/**
 */
Network.prototype.getBuffers = function() {
    return this.buffers.buffers;
};

exports.Network = Network;
exports.NetworkCollection = NetworkCollection;
