/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2017 Joël Charles
 * Licensed under the MIT license.
 */

/** @module message */

const { util } = require('qtdatastream');

/**
 * @alias module:message.Type
 * @readonly
 * @enum {number}
 * @default
 */
const Types = {
  PLAIN: 0x00001,
  NOTICE: 0x00002,
  ACTION: 0x00004,
  NICK: 0x00008,
  MODE: 0x00010,
  JOIN: 0x00020,
  PART: 0x00040,
  QUIT: 0x00080,
  KICK: 0x00100,
  KILL: 0x00200,
  SERVER: 0x00400,
  INFO: 0x00800,
  ERROR: 0x01000,
  DAYCHANGE: 0x02000,
  TOPIC: 0x04000,
  NETSPLITJOIN: 0x08000,
  NETSPLITQUIT: 0x10000,
  INVITE: 0x20000
};


/**
 * @alias module:message.Flag
 * @readonly
 * @enum {number}
 * @default
 */
const Flags = {
  NONE: 0x00,
  SELF: 0x01,
  HIGHLIGHT: 0x02,
  REDIRECTED: 0x04,
  SERVERMSG: 0x08,
  BACKLOG: 0x80
};

/**
 * @alias module:message.HighlightModes
 * @readonly
 * @enum {number}
 * @default
 */
const HighlightModes = {
  NONE: 0x01,
  CURRENTNICK: 0x02,
  ALLIDENTITYNICKS: 0x03
};

/**
 * @class
 * @alias module:message.IRCMessage
 * @param {Object} message
 */
class IRCMessage {
  contructor(message, buffer) {
    this.nick = null;
    this.hostmask = null;
    this._flags = null;
    this.isSelf = false;
    this.isHighlighted = false;
    this._sender = null;

    this.id = message.id;
    this.datetime = new Date(message.timestamp * 1000);
    this.type = message.type;
    this.flags = message.flags;
    this.sender = message.sender ? util.str(message.sender) : null;
    this.content = message.content ? util.str(message.content) : null;
    this.buffer = buffer;
  }

  /**
   * Update internal highlight flags
   * @param {module:network.Network} network
   * @param {module:identity} identity
   * @param {module:libquassel~Quassel.HighlightModes} mode
   * @protected
   */
  _updateFlags(network, identity, mode) {
    // TODO move part of this into network
    let nickRegex = null, nicks = [];
    switch (mode) {
    case HighlightModes.NONE:
        // None, do nothing
      return;
    case HighlightModes.CURRENTNICK:
      if (this.type !== Types.PLAIN && this.type !== Types.ACTION) return;
      if (!network.nick) return;
      nickRegex = network.nick.replace(/([.?*+^$[\]\\(){}|-])/g, '\\$1');
      break;
    case HighlightModes.ALLIDENTITYNICKS:
      if (this.type !== Types.PLAIN && this.type !== Types.ACTION) return;
      if (identity.nicks.length === 0) return;
      for (let i=0; i<identity.nicks.length; i++) {
        nicks.push(identity.nicks[i].replace(/([.?*+^$[\]\\(){}|-])/g, '\\$1'));
      }
      if (network.nick && identity.nicks.indexOf(network.nick) === -1) {
        nicks.push(network.nick.replace(/([.?*+^$[\]\\(){}|-])/g, '\\$1'));
      }
      nickRegex = `(${nicks.join('|')})`;
      break;
    default:
      // Invalid, do nothing
      return;
    }
    let regex = new RegExp(`([\\W]|^)${nickRegex}([\\W]|$)`, 'i');
    if (regex.test(this.content)) {
      this.flags = this.flags | Flags.HIGHLIGHT;
    }
  }

  set flags(value) {
    this._flags = value;
    this.isSelf = (value & Flags.SELF) !== 0;
    this.isHighlighted = ((value & Flags.HIGHLIGHT) !== 0) && !this.isSelf;
  }

  get flags() {
    return this._flags;
  }

  set sender(value) {
    this._sender = value;
    [ this.nick, this.hostmask ] = value.split('!');
  }

  get sender() {
    return this._sender;
  }
}

module.exports = {
  IRCMessage,
  Types,
  Flags,
  HighlightModes
};