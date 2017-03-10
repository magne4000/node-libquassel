/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2017 Joël Charles
 * Licensed under the MIT license.
 */

const { util } = require('qtdatastream');

/**
 * @type {Object}
 * @property {number} Types.PLAIN
 * @property {number} Types.NOTICE
 * @property {number} Types.ACTION
 * @property {number} Types.NICK
 * @property {number} Types.MODE
 * @property {number} Types.JOIN
 * @property {number} Types.PART
 * @property {number} Types.QUIT
 * @property {number} Types.KICK
 * @property {number} Types.KILL
 * @property {number} Types.SERVER
 * @property {number} Types.INFO
 * @property {number} Types.ERROR
 * @property {number} Types.DAYCHANGE
 * @property {number} Types.TOPIC
 * @property {number} Types.NETSPLITJOIN
 * @property {number} Types.NETSPLITQUIT
 * @property {number} Types.INVITE
 */
export const Types = {
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
 * @type {Object}
 * @property {number} Flags.NONE
 * @property {number} Flags.SELF
 * @property {number} Flags.HIGHLIGHT
 * @property {number} Flags.REDIRECTED
 * @property {number} Flags.SERVERMSG
 * @property {number} Flags.BACKLOG
 */
export const Flags = {
  NONE: 0x00,
  SELF: 0x01,
  HIGHLIGHT: 0x02,
  REDIRECTED: 0x04,
  SERVERMSG: 0x08,
  BACKLOG: 0x80
};

/**
 * @type {Object}
 * @property {number} HighlightModes.NONE
 * @property {number} HighlightModes.CURRENTNICK
 * @property {number} HighlightModes.ALLIDENTITYNICKS
 */
export const HighlightModes = {
  NONE: 0x01,
  CURRENTNICK: 0x02,
  ALLIDENTITYNICKS: 0x03
};

/**
 * IRC Message
 */
export class IRCMessage {
  constructor(message) {
    /** @type {string} */
    this.nick = null;
    /** @type {string} */
    this.hostmask = null;
    this._flags = null;
    this.isSelf = false;
    this.isHighlighted = false;
    this._sender = null;

    /** @type {number} */
    this.id = message.id;
    /** @type {Date} */
    this.datetime = new Date(message.timestamp * 1000);
    /** @type {number} */
    this.type = message.type;
    /** @type {number} */
    this.flags = message.flags;
    /** @type {string} */
    this.sender = message.sender ? util.str(message.sender) : null;
    /** @type {string} */
    this.content = message.content ? util.str(message.content) : null;
    /** @type {BufferInfo} */
    this.bufferInfo = message.bufferInfo;
  }

  /**
   * Update internal highlight flags
   * @param {Network} network
   * @param {Identity} identity
   * @param {number} mode
   * @protected
   */
  _updateFlags(network, identity, mode) {
    let nickRegex = null, nicks = [];
    switch (mode) {
    case HighlightModes.NONE:
      // None, do nothing
      return;
    case HighlightModes.CURRENTNICK:
      if (this.type !== Types.PLAIN && this.type !== Types.ACTION) return;
      if (!network.nick) return;
      ({ nickRegex } = network);
      break;
    case HighlightModes.ALLIDENTITYNICKS:
      if (this.type !== Types.PLAIN && this.type !== Types.ACTION) return;
      if (identity.nicks.length === 0) return;
      for (let identityNickRegex of identity.nickRegexes) {
        nicks.push(identityNickRegex);
      }
      if (network.nick && identity.nicks.indexOf(network.nick) === -1) {
        nicks.push(network.nickRegex);
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

  /** @type {number} */
  set flags(value) {
    this._flags = value;
    this.isSelf = (value & Flags.SELF) !== 0;
    this.isHighlighted = ((value & Flags.HIGHLIGHT) !== 0) && !this.isSelf;
  }

  /** @type {number} */
  get flags() {
    return this._flags;
  }

  /** @type {string} */
  set sender(value) {
    this._sender = value;
    if (value) {
      [ this.nick, this.hostmask ] = value.split('!');
    } else {
      this.nick = this.hostmask = null;
    }
  }

  /** @type {string} */
  get sender() {
    return this._sender;
  }

  toString() {
    return `<IRCMessage [${this.nick}] ${this.content ? this.content.substring(0, 9) : '*empty*'}>`;
  }
}
