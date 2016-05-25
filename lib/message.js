/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2016 Joël Charles
 * Licensed under the MIT license.
 */

/** @module message */

var util = require('qtdatastream').util;

/**
 * @alias module:message.Type
 * @readonly
 * @enum {number}
 * @default
 */
var Type = {
    Plain: 0x00001,
    Notice: 0x00002,
    Action: 0x00004,
    Nick: 0x00008,
    Mode: 0x00010,
    Join: 0x00020,
    Part: 0x00040,
    Quit: 0x00080,
    Kick: 0x00100,
    Kill: 0x00200,
    Server: 0x00400,
    Info: 0x00800,
    Error: 0x01000,
    DayChange: 0x02000,
    Topic: 0x04000,
    NetsplitJoin: 0x08000,
    NetsplitQuit: 0x10000,
    Invite: 0x20000
};


/**
 * @alias module:message.Flag
 * @readonly
 * @enum {number}
 * @default
 */
var Flag = {
    None: 0x00,
    Self: 0x01,
    Highlight: 0x02,
    Redirected: 0x04,
    ServerMsg: 0x08,
    Backlog: 0x80
};

/**
 * @class
 * @alias module:message.IRCMessage
 * @param {Object} message
 */
var IRCMessage = function IRCMessage(message) {
    this.id = message.id;
    this.datetime = new Date(message.timestamp * 1000);
    this.type = message.type;
    this.flags = message.flags;
    this.sender = message.sender?util.str(message.sender):null;
    this.content = message.content?util.str(message.content):null;
    this.networkId = message.bufferInfo.network;
    this.bufferId = message.bufferInfo.id;
};

/**
 * Does the message comes from myself
 * @returns {boolean}
 */
IRCMessage.prototype.isSelf = function() {
    return (this.flags & Flag.Self) !== 0;
};

/**
 * Update internal highlight flags
 * @param {module:network.Network} network
 * @param {module:identity} identity
 * @param {module:libquassel~Quassel.HighlightModes} mode
 * @protected
 */
IRCMessage.prototype._updateFlags = function(network, identity, mode) {
    var nickRegex = null, nicks = [];
    switch (mode) {
        case 0x01:
            // None, do nothing
            return;
        case 0x02:
            if (this.type != Type.Plain && this.type != Type.Action) return;
            if (!network.nick) return;
            nickRegex = network.nick.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1");
            break;
        case 0x03:
            if (this.type != Type.Plain && this.type != Type.Action) return;
            if (identity.nicks.length === 0) return;
            for (var i=0; i<identity.nicks.length; i++) {
                nicks.push(identity.nicks[i].replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1"));
            }
            if (network.nick && identity.nicks.indexOf(network.nick) === -1) {
                nicks.push(network.nick.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1"));
            }
            nickRegex = '(' + nicks.join('|') + ')';
            break;
        default:
            // Invalid, do nothing
            console.log('Invalid _updateFlags mode', mode);
            return;
    }
    var regex = new RegExp("([\\W]|^)"+nickRegex+"([\\W]|$)", "i");
    if (regex.test(this.content)) {
        this.flags = this.flags | Flag.Highlight;
    }
};

/**
 * Am I highlighted
 * @returns {boolean}
 */
IRCMessage.prototype.isHighlighted = function() {
    return ((this.flags & Flag.Highlight) !== 0) && !this.isSelf();
};

/**
 * Get short sender nick
 * @returns {String}
 */
IRCMessage.prototype.getNick = function() {
    return this.sender.split("!")[0];
};

/**
 * Get sender hostmask
 * @returns {String}
 */
IRCMessage.prototype.getHostmask = function() {
    return this.sender.split("!")[1];
};

exports.IRCMessage = IRCMessage;
exports.Type = Type;
exports.Flag = Flag;
