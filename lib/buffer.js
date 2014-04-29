/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2014 Joël Charles
 * Licensed under the MIT license.
 */
var extend = require("extend"),
    Glouton = require('./glouton'),
    Concert = require('concert');

var IRCBuffer = function(id, data) {
    extend(this, new Glouton(), new Concert());
    this.devour(data);
    this.id = id;
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
        var key;
        for (key in this.buffers) {
            if (this.buffers[key].getInfo().name === bufferId) {
                return this.buffers[key];
            }
        }
        return null;
    }
    // number
    return this.buffers[bufferId];
};

/**
 * @param {number} bufferId
 */
IRCBufferCollection.prototype.hasBuffer = function(bufferId) {
    return bufferId in this.buffers;
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