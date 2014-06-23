/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2014 Joël Charles
 * Licensed under the MIT license.
 */
var serialize = require('./serializer').serialize,
    Glouton = require('./glouton'),
    HashMap = require('./hashmap');

var IRCBuffer = function IRCBuffer(id, data) {
    serialize(this);
    this.devour(data);
    this.id = id;
    this.nickUserMap = {};
    this.nickUserModesMap = {};
    this.messages = new HashMap();
    this.active = false;
};

Glouton.extend(IRCBuffer);

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
    return this.name && "#&+!".indexOf(this.name[0]) !== -1;
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
    if (typeof user === 'undefined' || user === null) {
        console.log("User should not be null or undefined");
        return null;
    }
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
    this.messages.set(message.id, {
        id: message.id,
        datetime: new Date(message.timestamp * 1000),
        type: message.type,
        flags: message.flags,
        sender: message.sender?message.sender.str():null,
        content: message.content?message.content.str():null
    });
    return this.messages.get(message.id);
};

/**
 * Name setter
 * @param {string} name
 */
IRCBuffer.prototype.setName = function(name) {
    this.name = name?name.toString():null;
};

/**
 * get BufferInfo structure
 * @return BufferInfo
 */
IRCBuffer.prototype.getBufferInfo = function() {
    return {
        id: this.id,
        network: this.network,
        type: this.type,
        group: this.group,
        name: this.name
    };
};

/**
 * Flag the buffer as temporarily removed
 * @param {boolean} flag
 */
IRCBuffer.prototype.setTemporarilyRemoved = function(flag) {
    this.isTemporarilyRemoved = flag;
};

/**
 * Flag the buffer as permanently removed
 * @param {boolean} flag
 */
IRCBuffer.prototype.setPermanentlyRemoved = function(flag) {
    this.isPermanentlyRemoved = flag;
};

var IRCBufferCollection = function IRCBufferCollection() {
    serialize(this);
    this.buffers = new HashMap();
    this.filteredBuffers = new HashMap();
};

/**
 * @param {IRCBuffer} buffer
 */
IRCBufferCollection.prototype.addBuffer = function(buffer) {
    if (this.buffers.has(buffer.id)) {
        console.log("Buffer already added (" + buffer.name + ")");
        return;
    }
    this.buffers.set(buffer.id, buffer);
    this._computeFilteredBuffers();
};

/**
 * @param {IRCBuffer} buffer
 * @protected
 */
IRCBufferCollection.prototype._isBufferFiltered = function(buffer) {
    if (buffer.isPermanentlyRemoved || buffer.isTemporarilyRemoved) {
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
        var buffers = this.buffers.values();
        for (var key in buffers) {
            if (typeof buffers[key].name === 'string') {
                if (buffers[key].name.toLowerCase() === bufferId.toLowerCase()) {
                    return buffers[key];
                }
            }
        }
        return null;
    }
    // number
    return this.buffers.get(bufferId);
};

/**
 * @param {(number|string)} bufferId
 */
IRCBufferCollection.prototype.hasBuffer = function(bufferId) {
    if (typeof bufferId === 'string') {
        return this.getBuffer(bufferId) !== null;
    } else {
        return this.buffers.has(bufferId);
    }
};

/**
 * @param {(number|string)} bufferId
 */
IRCBufferCollection.prototype.removeBuffer = function(bufferId) {
    if (this.hasBuffer(bufferId)) {
        this.buffers.remove(this.getBuffer(bufferId).id);
    }
};

/**
 * @protected
 */
IRCBufferCollection.prototype._computeFilteredBuffers = function() {
    this.filteredBuffers.clear();
    var key, buffers = this.buffers.values();
    for (key in buffers) {
        if (this._isBufferFiltered(buffers[key])){
            this.filteredBuffers.set(buffers[key].id, buffers[key]);
        }
    }
};


exports.IRCBuffer = IRCBuffer;
exports.IRCBufferCollection = IRCBufferCollection;