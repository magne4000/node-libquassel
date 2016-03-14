/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2014 Joël Charles
 * Licensed under the MIT license.
 */
var serialize = require('./serializer').serialize,
    Glouton = require('./glouton'),
    HashMap = require('./hashmap'),
    logger = require('debug', 'libquassel:buffer'),
    IRCMessage = require('./message').IRCMessage,
    util = require('qtdatastream').util;

var IRCBuffer = function IRCBuffer(id, data) {
    serialize(this);
    this.devour(data);
    this.id = id;
    this.nickUserMap = {};
    this.nickUserModesMap = {};
    this.messages = new Map;
    this.active = false;
    this._isStatusBuffer = false;
    this.order = null;
    if (this.type == IRCBuffer.Types.StatusBuffer) {
        this._isStatusBuffer = true;
    }
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
 * Set buffer index
 * @param {number} order
 */
IRCBuffer.prototype.setOrder = function(order) {
    this.order = order;
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
    if (user && typeof user.nick === "string") {
        this.nickUserMap[user.nick] = user;
        this.nickUserModesMap[user.nick] = modes;
    }
};

/**
 * add mode to user
 * @param {IRCUser} user
 * @param {string} mode
 */
IRCBuffer.prototype.addUserMode = function(user, mode) {
    if (user && typeof user.nick === "string") {
        this.nickUserModesMap[user.nick] += mode;
    }
};

/**
 * Returns true if user is chan operator
 * @param {string} nick
 * @return
 */
IRCBuffer.prototype.isOp = function(nick) {
    return (this.nickUserModesMap[nick]||"").indexOf('o') !== -1;
};

/**
 * Returns true if user is voiced
 * @param {string} nick
 * @return
 */
IRCBuffer.prototype.isVoiced = function(nick) {
    return (this.nickUserModesMap[nick]||"").indexOf('v') !== -1;
};

/**
 * remove mode from user
 * @param {IRCUser} user
 * @param {string} mode
 */
IRCBuffer.prototype.removeUserMode = function(user, mode) {
    if (user && typeof user.nick === "string") {
        this.nickUserModesMap[user.nick] = this.nickUserModesMap[user.nick].replace(mode, "");
    }
};

/**
 * Check if current buffer contains specified user
 * @param {(string|IRCUser)} user
 */
IRCBuffer.prototype.hasUser = function(username) {
    if (typeof username === 'undefined' || username === null) {
        logger("User should not be null or undefined");
        return null;
    }
    if (typeof username.nick === 'string') {
        username = username.nick;
    }
    return username in this.nickUserMap;
};

/**
 * Remove user from buffer
 * @param {(string|IRCUser)} username
 */
IRCBuffer.prototype.removeUser = function(username) {
    if (typeof username.nick === 'string') {
        username = username.nick;
    }
    delete this.nickUserMap[username];
    delete this.nickUserModesMap[username];
};

/**
 * Update user maps hashes with current .nick
 * @param {string} nick
 */
IRCBuffer.prototype.updateUserMaps = function(oldnick) {
    var newnick = this.nickUserMap[oldnick].nick;
    this.nickUserMap[newnick] = this.nickUserMap[oldnick];
    this.nickUserModesMap[newnick] = this.nickUserModesMap[oldnick];
    delete this.nickUserMap[oldnick];
    delete this.nickUserModesMap[oldnick];
};

/**
 * Add message to buffer
 * @param {*} message
 * @return the message, if successfully added, null otherwise
 */
IRCBuffer.prototype.addMessage = function(message) {
    message.id = parseInt(message.id, 10);
    if (this.messages.has(message.id)) {
        return null;
    }
    var ircmsg = new IRCMessage(message);
    this.messages.set(message.id, ircmsg);
    return ircmsg;
};

/**
 * Check if specified messageId is the last one of this buffer
 * @param {*} messageId
 * @return
 */
IRCBuffer.prototype.isLast = function(messageId) {
    messageId = parseInt(messageId, 10);
    var max = Math.max.apply(null, this.messages.keys());
    return max === messageId;
};

/**
 * get the first message (sorted by id)
 * @param {*} messageId
 * @return
 */
IRCBuffer.prototype.getFirstMessage = function() {
    var min = Math.min.apply(null, this.messages.keys());
    return this.messages.get(min);
};

/**
 * get the last message (sorted by id)
 * @param {*} messageId
 * @return
 */
IRCBuffer.prototype.getLastMessage = function() {
    var max = Math.max.apply(null, this.messages.keys());
    return this.messages.get(max);
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
        group: this.group || 0,
        name: this.name
    };
};

/**
 * Returns true if this buffer is a StatusBuffer
 * @return BufferInfo
 */
IRCBuffer.prototype.isStatusBuffer = function(bool) {
    if (typeof bool === "undefined")
        return this._isStatusBuffer;
    else
        this._isStatusBuffer = bool;
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

/**
 * Is the buffer hidden/removed (permanently or temporarily)
 */
IRCBuffer.prototype.isHidden = function() {
    return this.isPermanentlyRemoved || this.isTemporarilyRemoved;
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
        logger("Buffer already added (" + buffer.name + ")");
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
 * @param {(number|string|Buffer)} bufferId
 */
IRCBufferCollection.prototype.getBuffer = function(bufferId) {
    if (bufferId instanceof Buffer) {
        bufferId = util.str(bufferId);
    }
    if (typeof bufferId === 'string') {
        bufferId = bufferId.toLowerCase();
        var buffers = this.buffers.values();
        for (var key in buffers) {
            if (typeof buffers[key].name === 'string') {
                if (buffers[key].name.toLowerCase() === bufferId) {
                    return buffers[key];
                }
            }
        }
    } else {
        // number
        var buffer = this.buffers.get(bufferId);
        if (typeof buffer !== 'undefined') {
            return buffer;
        }
    }
    return null;
};

/**
 * @param {(number|string|Buffer)} bufferId
 */
IRCBufferCollection.prototype.hasBuffer = function(bufferId) {
    if (typeof bufferId === 'string' || bufferId instanceof Buffer) {
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
 * @param {Buffer} buffer
 * @param {(number|string)} bufferIdTo
 */
IRCBufferCollection.prototype.moveBuffer = function(buffer, bufferIdTo) {
    var bufferIdFrom = buffer.id;
    this.buffers.set(bufferIdTo, buffer);
    buffer.id = bufferIdTo;
    this.buffers.remove(bufferIdFrom);
};

/**
 * @protected
 */
IRCBufferCollection.prototype._computeFilteredBuffers = function() {
    var key, buffers = this.buffers.values(), has;
    for (key in buffers) {
        has = this.filteredBuffers.has(buffers[key].id);
        if (this._isBufferFiltered(buffers[key])){
            if (!has) {
                this.filteredBuffers.set(buffers[key].id, buffers[key]);
            }
        } else {
            if (has) {
                this.filteredBuffers.remove(buffers[key].id);
            }
        }
    }
};

IRCBuffer.Types = {
    InvalidBuffer: 0x00,
    StatusBuffer: 0x01,
    ChannelBuffer: 0x02,
    QueryBuffer: 0x04,
    GroupBuffer: 0x08
};

exports.IRCBuffer = IRCBuffer;
exports.IRCBufferCollection = IRCBufferCollection;
