/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2014 Joël Charles
 * Licensed under the MIT license.
 */
var extend = require("extend"),
    Glouton = require('./glouton');

var IRCBuffer = function(id, data) {
    extend(this, new Glouton());
    this.devour(data);
    this.id = id;
    this.nickUserMap = {}; // HashMap<String, IrcUser>
    this.nickUserModesMap = {}; // HashMap<String, IrcUser>
    this.messages = [];
    this.active = false;
};

/**
 * Switch buffer state
 * @param {boolean} bool
 */
IRCBuffer.prototype.setActive = function(bool) {
    this.active = bool;
};

/**
 * Is this buffer a channel
 */
IRCBuffer.prototype.isChannel = function() {
    return this.name && "#&+!".indexOf(this.name[0]) != -1;
};

/**
 * Add user to buffer
 * @param {IRCUser} user
 * @param {string} modes
 */
IRCBuffer.prototype.addUser = function(user, modes) {
    this.nickUserMap[user.nick] = user;
    this.nickUserModesMap[user.nick] = modes;
};

/**
 * add mode to user
 * @param {IRCUser} user
 * @param {string} mode
 */
IRCBuffer.prototype.addUserMode = function(user, mode) {
    this.nickUserModesMap[user.nick] += mode;
};

/**
 * remove mode from user
 * @param {IRCUser} user
 * @param {string} mode
 */
IRCBuffer.prototype.removeUserMode = function(user, mode) {
    this.nickUserModesMap[user.nick] += this.nickUserModesMap[user.nick].replace(mode, "");
};

/**
 * Check if current buffer contains specified user
 * @param {IRCUser} user
 */
IRCBuffer.prototype.hasUser = function(user) {
    return user.nick in this.nickUserMap;
};

/**
 * Remove user from buffer
 * @param {string} username
 */
IRCBuffer.prototype.removeUser = function(username) {
    delete this.nickUserMap[username];
    delete this.nickUserModesMap[username];
};

/**
 * Add message to buffer
 * @param {*} message
 * @return the message, if successfully added, null otherwise
 */
IRCBuffer.prototype.addMessage = function(message) {
    if (message.id in this.messages) {
        return null;
    }
    this.messages[message.id] = {
        datetime: new Date(message.timestamp * 1000),
        type: message.type,
        flags: message.flags,
        sender: message.sender?message.sender.str():null,
        content: message.content?message.content.str():null
    };
    return this.messages[message.id];
};

/**
 * Name setter
 * @param {Buffer} name
 */
IRCBuffer.prototype.setName = function(name) {
    this.name = name?name.toString():null;
};

var IRCBufferCollection = function() {
    this.buffers = [];
    this.filteredBuffers = [];
};

/**
 * @param {IRCBuffer} buffer
 */
IRCBufferCollection.prototype.addBuffer = function(buffer) {
    if (buffer.id in this.buffers) {
        console.log("Buffer already added (" + buffer.name + ")");
        return;
    }
    this.buffers[buffer.id] = buffer;
    this._computeFilteredBuffers();
};

/**
 * @param {IRCBuffer} buffer
 * @protected
 */
IRCBufferCollection.prototype._isBufferFiltered = function(buffer) {
    if (buffer.isPermanentlyHidden || buffer.isTemporarilyHidden) {
        return true;
    } else {
        return false;
    }
};

/**
 * @param {(number|string)} bufferId
 */
IRCBufferCollection.prototype.getBuffer = function(bufferId) {
    if (typeof bufferId === 'string') {
        for (var key in this.buffers) {
            if (this.buffers[key].name === bufferId) {
                return this.buffers[key];
            }
        }
        return null;
    }
    // number
    return this.buffers[bufferId];
};

/**
 * @param {(number|string)} bufferId
 */
IRCBufferCollection.prototype.hasBuffer = function(bufferId) {
    if (typeof bufferId === 'string') {
        return this.getBuffer(bufferId) !== null;
    } else {
        return bufferId in this.buffers;
    }
};

/**
 * @param {(number|string)} bufferId
 */
IRCBufferCollection.prototype.removeBuffer = function(bufferId) {
    if (this.hasBuffer(bufferId)) {
        delete this.buffers[this.getBuffer(bufferId).id];
    }
};

/**
 * @protected
 */
IRCBufferCollection.prototype._computeFilteredBuffers = function() {
    this.filteredBuffers = [];
    var key;
    for (key in this.buffers) {
        if (this._isBufferFiltered(this.buffers[key])){
            this.filteredBuffers.append(this.buffers[key]);
        }
    }
};


exports.IRCBuffer = IRCBuffer;
exports.IRCBufferCollection = IRCBufferCollection;