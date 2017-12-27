/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2017 Joël Charles
 * Licensed under the MIT license.
 */

/** @module buffer */

const logger = require('debug')('libquassel:buffer');
const { util } = require('qtdatastream');

import { IRCMessage } from './message';

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
 * @type {Object}
 * @property {number} Types.INVALID
 * @property {number} Types.STATUS
 * @property {number} Types.CHANNEL
 * @property {number} Types.QUERY
 * @property {number} Types.GROUP
 */
export const Types = {
  INVALID: 0x00,
  STATUS: 0x01,
  CHANNEL: 0x02,
  QUERY: 0x04,
  GROUP: 0x08
};

/**
 * User attached to a buffer, with its modes
 */
export class IRCBufferUser {

  /** @type {IRCUser} */
  public user;
  /** @type {boolean} */
  public isOp;
  /** @type {boolean} */
  public isHalfOp;
  /** @type {boolean} */
  public isOwner;
  /** @type {boolean} */
  public isAdmin;
  /** @type {boolean} */
  public isVoiced;

  /**
   * @param {IRCUser} user
   * @param {string} modes
   */
  constructor(user, modes) {
    this.user = user;
    this.isOp = false;
    this.isHalfOp = false;
    this.isOwner = false;
    this.isAdmin = false;
    this.isVoiced = false;
    this._modes = '';
    this.modes = modes;
  }

  /** @type {string} */
  get modes() {
    return this._modes;
  }

  /** @type {string} */
  set modes(value) {
    this._modes = value;
    this.isOp = this.hasMode('o');
    this.isHalfOp = this.hasMode('h');
    this.isOwner = this.hasMode('q');
    this.isAdmin = this.hasMode('a');
    this.isVoiced = this.hasMode('v');
  }

  /**
   * Returns `true` if user has specified mode
   * @param {string} mode
   * @returns {boolean}
   */
  hasMode(mode) {
    return this._modes.indexOf(mode) !== -1;
  }
}

/**
 * Quassel respresentation of a buffer
 */
export class IRCBuffer {

  /** @type {?number} */
  public id;
  /** @type {boolean} */
  public isChannel;
  /** @type {boolean} */
  public isActive;
  /** @type {boolean} */
  public isStatusBuffer;
  /** @type {?number} */
  public lastMessageId;
  /** @type {?number} */
  public firstMessageId;
  /**
   * Map of users of this channel.
   * @type {Map<string, IRCBufferUser>}
   */
  public users;
  /**
   * Map of messages in this buffer.
   * @type {Map<number, IRCMessage>}
   */
  public messages;
  /** @type {?Types} */
  public type;
  /** @type {number} */
  public network;
  /** @type {number} */
  public group;


  /**
   * @param {object} data
   */
  constructor(data) {
    this._name = null;
    this.isChannel = false;
    this.isActive = false;
    this.id = null;
    this.users = new Map();
    this.messages = new Map();
    this.lastMessageId = null;
    this.firstMessageId = null;

    this.update(data);
    this.isStatusBuffer = (this.type === Types.STATUS);
  }

  /**
   * Add {@link IRCUser} to the buffer
   * @param {IRCUser} user
   * @param {string} modes
   */
  addUser(user, modes) {
    if (user && typeof user.nick === 'string') {
      this.users.set(user.nick, new IRCBufferUser(user, modes));
    }
  }

  /**
   * Add a mode to an {@link IRCUser}
   * @param {IRCUser} user
   * @param {string} mode
   */
  addUserMode(user, mode) {
    if (user && typeof user.nick === 'string') {
      const userAndModes = this.users.get(user.nick);
      if (userAndModes) userAndModes.modes += mode;
    }
  }

  /**
   * remove mode from an {@link IRCUser}
   * @param {IRCUser} user
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
   * @param {string|IRCUser} nick
   * @returns {boolean}
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
   * @param {string|IRCUser} nick
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
   * Add an {@link IRCMessage} to the buffer
   * @param {Object} message
   * @returns {?IRCMessage} the message, if successfully added, `undefined` otherwise
   */
  addMessage(message) {
    if (this.messages.has(message.id)) return undefined;
    if (this.lastMessageId === null || this.lastMessageId < message.id) {
      this.lastMessageId = message.id;
    }
    if (this.firstMessageId === null || this.firstMessageId > message.id) {
      this.firstMessageId = message.id;
    }
    const ircmsg = new IRCMessage(message);
    this.messages.set(message.id, ircmsg);
    return ircmsg;
  }

  /**
   * Update internal lastMessageId and firstMessageId
   * @protected
   */
  _updateFirstAndLast() {
    this.lastMessageId = null;
    this.firstMessageId = null;
    for (let key of this.messages.keys()) {
      if (this.lastMessageId === null || this.lastMessageId < key) this.lastMessageId = key;
      if (this.firstMessageId === null || this.firstMessageId > key) this.firstMessageId = key;
    }
  }

  /**
   * Clear buffer messages
   */
  clearMessages() {
    this.lastMessageId = null;
    this.firstMessageId = null;
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
   * Check if specified `messageId` is the last one of this buffer
   * @param {number} messageId
   * @returns {boolean}
   */
  isLast(messageId) {
    return this.lastMessageId === messageId;
  }

  /**
   * get {@link BufferInfo} corresponding to the current buffer
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
    return this.messages.get(this.firstMessageId);
  }

  get lastMessage() {
    return this.messages.get(this.lastMessageId);
  }

  set name(value) {
    this._name = value ? value.toString() : null;
    this.isChannel = (this._name && '#&+!'.indexOf(this._name[0]) !== -1);
  }

  get name() {
    return this._name;
  }

  update(data) {
    Object.assign(this, data);
  }

  toString() {
    return `<IRCBuffer ${this._name ? this._name : '*'}>`;
  }
}

/**
 * A collection of buffers
 */
export class IRCBufferCollection extends Map {

  constructor(...args) {
    if (args.length > 0) throw new Error(`IRCBufferCollection doesn't support initializing with values.`);
    super();
    // This map references buffers by their IDs for quick lookup
    this._map_buffer_ids = new Map();
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
   * Get the buffer by name if `key` is a `String` or a `Buffer`, by id otherwise
   * @param {number|string|Buffer} key
   * @override
   * @returns {?Buffer}
   */
  get(key) {
    if (typeof key === 'number') {
      return this.get(this._map_buffer_ids.get(key));
    }
    if (key === undefined) return void 0;
    if (key instanceof Buffer) {
      key = util.str(key);
    }
    return super.get(key === null ? null : key.toLowerCase());
  }

  /**
   * Does the buffer exists in this collection
   * @param {number|string|Buffer} key
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
   * @param {number|string|Buffer} key
   * @override
   * @returns {boolean}
   */
  delete(key) {
    if (key === undefined) return false;
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
   * @param {IRCBuffer} buffer
   * @param {number} bufferIdTo
   */
  move(buffer, bufferIdTo) {
    this.delete(buffer.name);
    buffer.id = bufferIdTo;
    this.set(buffer.name, buffer);
  }
}
