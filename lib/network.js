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
    Concert = require('concert');

var Network = function(networkId) {
    extend(this, new Glouton(), new Concert());
    
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

Network.list = [];
Network.add = function(networkid) {
    Network.list[networkid] = new Network(networkid);
};
Network.get = function(networkid) {
    return Network.list[networkid];
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
 * @param {IrcUser} user
 */
Network.prototype.onUserJoined = function(user) {
    this.userList.add(user);
    this.nickUserMap.put(user.nick, user);

    this.updateTopic();
};

/**
 * @param {string} nick
 */
Network.prototype.onUserQuit = function(nick) {
    var i;
    this.nickUserMap.remove(nick);
    if (this.userList !== null && this.userList.length> 0) {
        for (i=0; i<this.userList.length; i++) {
            if (this.userList[i].nick === nick) {
                
                /* TODO
                for (Buffer buffer : this.buffers.getRawBufferList()) {
                    if (user.channels.contains(buffer.getInfo().name)) {
                        buffer.getUsers().removeUserByNick(nick);
                    }
                }
                userList.remove(user);
                user.deleteObserver(this);
                return;
                */
            }
        }
    }

    this.updateTopic();
};

/* TODO
    public void onUserParted(String nick, String bufferName) {
        for (IrcUser user : userList) {
            if (user.nick.equals(nick) && user.channels.contains(bufferName)) {
                user.channels.remove(bufferName);
                break;
            }
        }
        for (Buffer buffer : buffers.getRawBufferList()) {
            if (buffer.getInfo().name.equalsIgnoreCase(bufferName)) {
                buffer.getUsers().removeUserByNick(nick);
                if (nick.equalsIgnoreCase(getNick())) {
                    buffer.setActive(false);
                }
                break;
            }
        }

        updateTopic();
    }
*/

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
        this.setOpen(true);
        if (this.statusBuffer !== null) {
            this.statusBuffer.setActive(true);
        }
    } else {
        this.setOpen(false);
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
    
    var key, user, channel;
    // Create IRCUsers and attach them to network
    for (key in uac.users) {
        if (uac.users.hasOwnProperty(key)) {
            user = new IRCUser(uac.users[key]);
            this.nickUserMap[key] = user;
        }
    }
    
    // Create Channels and attach them to network
    for (key in uac.channels) {
        if (uac.channels.hasOwnProperty(key)) {
            channel = new IRCBuffer(key, uac.channels[key]);
            this.buffers.addBuffer(channel);
        }
    }
};

/**
 * @param {number} latency
 */
Network.prototype.setLatency = function(latency) {
    this.latency = latency;

    this.updateTopic();
};

/**
 * @param {string} server
 */
Network.prototype.setServer = function(server) {
    this.server = server;

    this.updateTopic();
};

/**
 */
Network.prototype.updateTopic = function() {
    if (this.statusBuffer !== null) {
        this.statusBuffer.setTopic("");
    }
};

module.exports = Network;
