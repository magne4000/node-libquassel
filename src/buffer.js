/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2017 Joël Charles
 * Licensed under the MIT license.
 */

/** @module buffer */

const logger = require('debug')('libquassel:buffer');
const { IRCMessage } = require('./message');
const { util } = require('qtdatastream');

/**
 * @alias module:buffer.Types
 * @readonly
 * @enum {number}
 * @default
 */
const Types = {
  INVALID: 0x00,
  STATUS: 0x01,
  CHANNEL: 0x02,
  QUERY: 0x04,
  GROUP: 0x08
};

/**
 * BufferInfo object representation
 * @typedef {Object} BufferInfo
 * @property {number} id
 * @property {number} network
 * @property {number} type
 * @property {number} group
 * @property {String} name
 */

/**
 * @alias module:buffer.IRCBufferUser
 */
class IRCBufferUser {
  constructor(user, modes) {
    this.user = user;
    this.isOp = false;
    this.isHalfOp = false;
    this.isOwner = false;
    this.isAdmin = false;
    this.isVoiced = false;
    this._modes = null;
    this.modes = modes;
  }

  get modes() {
    return this._modes;
  }

  set modes(value) {
    this._modes = value;
    this.isOp = this.hasMode('o');
    this.isHalfOp = this.hasMode('h');
    this.isOwner = this.hasMode('q');
    this.isAdmin = this.hasMode('a');
    this.isVoiced = this.hasMode('v');
  }

  /**
   * Returns true if user has specified mode
   * @param {string} mode
   * @returns {boolean}
   */
  hasMode(mode) {
    if (typeof this._modes === 'string') {
      return this._modes.indexOf(mode) !== -1;
    }
    return false;
  }
}

/**
 * @alias module:buffer.IRCBuffer
 */
class IRCBuffer {
  constructor(data) {
    this._name = null;
    this.isChannel = false;
    /** @member {number} id */
    /** @member {boolean} isChannel */
    /**
     * Map of users of this channel.
     * The Map keys are users nicknames `string`, the values is an `IRCBufferUser` with 2 attributes:
     *  * value.user {@link module:user}
     *  * value.modes `String`
     * @member {Map.<string, IRCBufferUser>}
     */
    this.users = new Map();
    /**
     * Map of messages in this buffer.
     * @member {Map.<number, IRCMessage>}
     */
    this.messages = new Map();

    this.update(data);

    /** @member {boolean} */
    this.isActive = false;
    /**
     * @member {boolean}
     * @protected
     */
    this.isStatusBuffer = (this.type === Types.STATUS);
  }

  /**
   * Add user to buffer
   * @param {module:user} user
   * @param {string} modes
   */
  addUser(user, modes) {
    if (user && typeof user.nick === 'string') {
      this.users.set(user.nick, new IRCBufferUser(user, modes));
    }
  }

  /**
   * Add mode to user
   * @param {module:user} user
   * @param {string} mode
   */
  addUserMode(user, mode) {
    if (user && typeof user.nick === 'string') {
      const userAndModes = this.users.get(user.nick);
      if (userAndModes) userAndModes.modes += mode;
    }
  }

  /**
   * remove mode from user
   * @param {module:user} user
   * @param {string} mode
   */
  removeUserMode(user, mode) {
    if (user && typeof user.nick === 'string') {
      let userAndModes = this.users.get(user.nick);
      if (userAndModes) userAndModes.modes = userAndModes.modes.replace(mode, '');
    }
  }

  /**
   * Check if current buffer contains specified user
   * @param {(string|module:user)} nick
   * @returns {?boolean}
   */
  hasUser(nick) {
    if (nick === undefined || nick === null) {
      logger('User should not be null or undefined');
      return null;
    }
    return this.users.has(typeof nick.nick === 'string' ? nick.nick : nick);
  }

  /**
   * Remove user from buffer
   * @param {(string|module:user)} nick
   */
  removeUser(nick) {
    this.users.delete(typeof nick.nick === 'string' ? nick.nick : nick);
  }

  /**
   * Update user maps hashes with current .nick
   * @param {string} oldnick
   */
  updateUserMaps(oldnick) {
    const userAndModes = this.users.get(oldnick);
    if (oldnick !== userAndModes.user.nick) {
      this.users.set(userAndModes.user.nick, userAndModes);
      this.users.delete(oldnick);
    }
  }

  /**
   * Add message to buffer
   * @param {Object} message
   * @returns {?message/IRCMessage} the message, if successfully added, `undefined` otherwise
   */
  addMessage(message) {
    if (this.messages.has(message.id)) return undefined;
    if (this._lastMessageId === null || this._lastMessageId < message.id) {
      this._lastMessageId = message.id;
    }
    if (this._firstMessageId === null || this._firstMessageId > message.id) {
      this._firstMessageId = message.id;
    }
    const ircmsg = new IRCMessage(message);
    this.messages.set(message.id, ircmsg);
    return ircmsg;
  }

  /**
   * Update internal _lastMessageId and _firstMessageId
   * @protected
   */
  _updateFirstAndLast() {
    this._lastMessageId = null;
    this._firstMessageId = null;
    this.messages.forEach((val, key) => {
      if (this._lastMessageId === null || this._lastMessageId < key) this._lastMessageId = key;
      if (this._firstMessageId === null || this._firstMessageId > key) this._firstMessageId = key;
    });
  }

  /**
   * Clear buffer messages
   */
  clearMessages() {
    this._lastMessageId = null;
    this._firstMessageId = null;
    this.messages.clear();
  }

  /**
   * Delete a message from the buffer
   * @param {number} messageId
   */
  deleteMessage(messageId) {
    if (this.messages.size <= 1) {
      this.clearMessages();
    } else {
      this.messages.delete(messageId);
      this._updateFirstAndLast();
    }
  }

  /**
   * Trim messages and leave only `n` messages
   * @param {number} n
   */
  trimMessages(n) {
    if (n <= 0) {
      this.clearMessages();
    } else if (n < this.messages.size) {
      let idsToKeep = [], newMap = new Map;
      this.messages.forEach((val, key) => {
        idsToKeep.push(key);
      });
      idsToKeep.sort();
      idsToKeep.splice(0, idsToKeep.length - n);
      idsToKeep.forEach(val => {
        newMap.set(val, this.messages.get(val));
      });
      this.messages = newMap;
      this._updateFirstAndLast();
    }
  }

  /**
   * Check if specified messageId is the last one of this buffer
   * @param {*} messageId
   * @returns {boolean}
   */
  isLast(messageId) {
    messageId = parseInt(messageId, 10);
    return this._lastMessageId === messageId;
  }

  /**
   * get BufferInfo structure
   * @returns {BufferInfo}
   */
  getBufferInfo() {
    return {
      id: this.id,
      network: this.network,
      type: this.type,
      group: this.group || 0,
      name: this.name
    };
  }

  get firstMessage() {
    return this.messages.get(this._firstMessageId);
  }

  get lastMessage() {
    return this.messages.get(this._lastMessageId);
  }

  set name(value) {
    this._name = value ? value.toString() : null;
    this.isChannel = (this._name && '#&+!'.indexOf(this._name[0]) !== -1);
  }

  get name() {
    return this._name;
  }

  update(data) {
    const keys = Object.keys(data);
    for (let key of keys) {
      this[key] = data[key];
    }
  }
}

/**
 * A collection of buffers
 * @alias module:buffer.IRCBufferCollection
 * @extends {Map}
 */
class IRCBufferCollection extends Map {

  constructor(...args) {
    if (args.length > 0) throw new Error(`IRCBufferCollection doesn't support initializing with values.`);
    super();
    // This map references buffers by their IDs for quick lookup
    this._map_buffer_ids = new Map();
    this.statusBuffer = null;
  }

  /**
   * Add a buffer to this collection
   * @param {IRCBuffer} buffer
   */
  add(buffer) {
    if (this.has(buffer.name)) {
      logger('Buffer already added (%s)', buffer.name);
      return;
    }
    this.set(buffer.name, buffer);
  }

  /**
   * @override
   */
  set(key, value) {
    if (key !== null && typeof key !== 'string') throw new Error(`Key must be a string or null`);
    key = key === null ? null : key.toLowerCase();
    if (value.id !== -1) {
      this._map_buffer_ids.set(value.id, key);
    }
    super.set(key, value);
  }

  /**
   * Get the buffer by name if bufferId is a `String` or a `Buffer`, by id otherwise
   * @param {(number|string|Buffer)} key
   * @override
   * @returns {?Buffer}
   */
  get(key) {
    if (typeof key === 'number') {
      return this.get(this._map_buffer_ids.get(key));
    }
    if (key === undefined) return false;
    if (key instanceof Buffer) {
      key = util.str(key);
    }
    return super.get(key === null ? null : key.toLowerCase());
  }

  /**
   * Does the buffer exists in this collection
   * @param {(number|string|Buffer)} key
   * @override
   * @returns {boolean}
   */
  has(key) {
    if (key === undefined) return false;
    if (key instanceof Buffer) {
      key = util.str(key);
    }
    if (typeof key === 'number') {
      return this._map_buffer_ids.has(key);
    }
    return super.has(key === null ? null : key.toLowerCase());
  }

  /**
   * Delete the buffer from the collection
   * @param {(number|string|Buffer)} key
   * @override
   * @returns {boolean}
   */
  delete(key) {
    if (key === undefined) return undefined;
    if (key instanceof Buffer) {
      key = util.str(key);
    }
    if (typeof key === 'number') {
      key = this._map_buffer_ids.delete(key);
      return super.delete(key);
    }
    const deleted = super.delete(key === null ? null : key.toLowerCase());
    if (deleted.id !== -1) {
      this._map_buffer_ids.delete(deleted.id);
    }
    return deleted;
  }

  /**
   * Clear the buffer
   * @override
   */
  clear() {
    super.clear();
    this._map_buffer_ids.clear();
  }

  /**
   * Change buffer id
   * @param {Buffer} buffer
   * @param {(number|string)} bufferIdTo
   */
  move(buffer, bufferIdTo) {
    this.delete(buffer.name);
    buffer.id = bufferIdTo;
    this.set(buffer.name, buffer);
  }
}

module.exports = {
  Types,
  IRCBuffer,
  IRCBufferCollection,
  IRCBufferUser
};