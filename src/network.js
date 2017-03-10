/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2017 Joël Charles
 * Licensed under the MIT license.
 */

const { EventEmitter } = require('events');
const logger = require('debug')('libquassel:network');
const { util, types: qtypes } = require('qtdatastream');
const { Exportable, exportas, usertype } = qtypes;

import IRCUser from './user';
import { IRCBufferCollection } from './buffer';
import { traits } from 'traits-decorator';

/**
 * @type {Object}
 * @property {number} ConnectionStates.DISCONNECTED
 * @property {number} ConnectionStates.CONNECTING
 * @property {number} ConnectionStates.INITIALIZING
 * @property {number} ConnectionStates.INITIALIZED
 * @property {number} ConnectionStates.RECONNECTING
 * @property {number} ConnectionStates.DISCONNECTING
 */
export const ConnectionStates = {
  DISCONNECTED: 0x00,
  CONNECTING: 0x01,
  INITIALIZING: 0x02,
  INITIALIZED: 0x03,
  RECONNECTING: 0x04,
  DISCONNECTING: 0x05
};

/**
 * A server as used in {@link Network}
 * @implements {Exportable}
 */
@traits(Exportable)
@usertype('Network::Server')
export class Server {
  /** @type {string} */
  @exportas(qtypes.QString, 'Host')
  host;

  @exportas(qtypes.QUInt, 'Port')
  port = 6667;

  @exportas(qtypes.QString, 'Password')
  password = '';

  @exportas(qtypes.QBool, 'UseSSL')
  useSSL = false;

  @exportas(qtypes.QInt, 'sslVersion')
  sslVersion = 0;

  @exportas(qtypes.QBool, 'UseProxy')
  useProxy = false;

  @exportas(qtypes.QInt, 'ProxyType')
  proxyType = 0;

  @exportas(qtypes.QString, 'ProxyHost')
  proxyHost = '';

  @exportas(qtypes.QUInt, 'ProxyPort')
  proxyPort = 8080;

  @exportas(qtypes.QString, 'ProxyUser')
  proxyUser = '';

  @exportas(qtypes.QString, 'ProxyPass')
  proxyPass = '';

  @exportas(qtypes.QBool, 'sslVerify')
  sslVerify = false;

  constructor(...args) {
    Object.assign(this, args);
  }
}

/**
 * Quassel Network
 * @implements {Exportable}
 */
@traits(Exportable)
@usertype('NetworkInfo')
export class Network extends EventEmitter {

  /** @type {number} */
  @exportas(qtypes.QUserType.get('NetworkId'), 'NetworkId')
  get networkId() {
    return this.id;
  }

  /** @type {number} */
  set networkId(value) {
    this.id = value;
  }

  /** @type {string} */
  @exportas(qtypes.QString, 'NetworkName')
  get networkName() {
    return this.name;
  }

  /** @type {string} */
  set networkName(value) {
    this.name = value;
  }

  /** @type {number} */
  @exportas(qtypes.QUserType.get('IdentityId'), 'Identity')
  identityId;

  /** @type {string} */
  @exportas(qtypes.QByteArray, 'CodecForServer')
  get codecForServer() {
    return this._codecForServer;
  }

  /** @type {string|Buffer} */
  set codecForServer(s) {
    this._codecForServer = Buffer.isBuffer(s) ? util.str(s) : s;
  }

  /** @type {string} */
  @exportas(qtypes.QByteArray, 'CodecForEncoding')
  get codecForEncoding() {
    return this._codecForEncoding;
  }

  /** @type {string|Buffer} */
  set codecForEncoding(s) {
    this._codecForEncoding = Buffer.isBuffer(s) ? util.str(s) : s;
  }

  /** @type {string} */
  @exportas(qtypes.QByteArray, 'CodecForDecoding')
  get codecForDecoding() {
    return this._codecForDecoding;
  }

  /** @type {string|Buffer} */
  set codecForDecoding(s) {
    this._codecForDecoding = Buffer.isBuffer(s) ? util.str(s) : s;
  }

  @exportas(qtypes.QList, 'ServerList')
  ServerList = [];

  @exportas(qtypes.QBool, 'UseRandomServer')
  useRandomServer = false;

  @exportas(qtypes.QStringList, 'Perform')
  perform = [];

  @exportas(qtypes.QBool, 'UseAutoIdentify')
  useAutoIdentify = false;

  @exportas(qtypes.QString, 'AutoIdentifyService')
  autoIdentifyService = 'NickServ';

  @exportas(qtypes.QString, 'AutoIdentifyPassword')
  autoIdentifyPassword = '';

  @exportas(qtypes.QBool, 'UseSasl')
  useSasl = false;

  @exportas(qtypes.QString, 'SaslAccount')
  saslAccount = '';

  @exportas(qtypes.QString, 'SaslPassword')
  saslPassword = '';

  @exportas(qtypes.QBool, 'UseAutoReconnect')
  useAutoReconnect = true;

  @exportas(qtypes.QUInt, 'AutoReconnectInterval')
  autoReconnectInterval = 60;

  @exportas(qtypes.QUInt, 'AutoReconnectRetries')
  autoReconnectRetries = 20;

  @exportas(qtypes.QBool, 'UnlimitedReconnectRetries')
  unlimitedReconnectRetries = false;

  @exportas(qtypes.QBool, 'RejoinChannels')
  rejoinChannels = true;

  @exportas(qtypes.QBool, 'UseCustomMessageRate')
  useCustomMessageRate = false;

  @exportas(qtypes.QBool, 'UnlimitedMessageRate')
  unlimitedMessageRate = false;

  @exportas(qtypes.QUInt, 'MessageRateDelay')
  msgRateMessageDelay = 2200;

  @exportas(qtypes.QUInt, 'MessageRateBurstSize')
  msgRateBurstSize = 5;

  /** @type {string} */
  set myNick(value) {
    this.nick = value;
  }

  /** @type {string} */
  get myNick() {
    return this._nick;
  }

  /** @type {string} */
  set nick(value) {
    this._nick = value;
    this.nickRegex = value.replace(/([.?*+^$[\]\\(){}|-])/g, '\\$1');
  }

  /** @type {string} */
  get nick() {
    return this._nick;
  }

  /** @type {boolean} */
  set isConnected(connected) {
    connected = Boolean(connected);
    if (this.statusBuffer) {
      this.statusBuffer.isActive = connected;
    }
    this._isConnected = connected;
  }

  /** @type {boolean} */
  get isConnected() {
    return this._isConnected;
  }

  constructor(id, name = null) {
    super();
    this._isConnected = false;
    this._nick = null;
    this._codecForEncoding = null;
    this._codecForDecoding = null;
    this._codecForServer = null;
    this.id = typeof id === 'number' ? id : -1;
    /** @type {IRCBufferCollection} */
    this.buffers = new IRCBufferCollection();
    /** @type {Map<String, IRCUser>} */
    this.users = new Map;
    /** @type {boolean} */
    this.open = false;
    /** @type {number} */
    this.connectionState = ConnectionStates.DISCONNECTED;
    /** @type {number} */
    this.latency = 0;
    /** @type {?IRCBuffer} */
    this.statusBuffer = null;
    this.nickRegex = null;
    this.name = name;
  }

  getUser(nick) {
    return this.users.get(nick);
  }

  /**
   * Add given user to the network
   * @param {IRCUser} user
   */
  addUser(user) {
    this.users.set(user.nick, user);
  }

  /**
   * Returns `true` if the specified nick/{@link IRCUser} exists in the network, `false` otherwise
   * @param {string|IRCUser} nick
   * @returns {boolean}
   */
  hasUser(nick) {
    return this.users.has(typeof nick.nick === 'string' ? nick.nick : nick);
  }

  /**
   * Replace `oldNick` by `newNick` in current network and buffers
   * @param {string} oldNick
   * @param {string} newNick
   */
  renameUser(oldNick, newNick) {
    const user = this.users.get(oldNick);
    if (user) {
      user.nick = newNick;
      this.users.set(newNick, user);
      this.users.delete(oldNick);
      for (let buffer of this.buffers.values()) {
        if (buffer.isChannel && buffer.hasUser(oldNick)) {
          buffer.updateUserMaps(oldNick);
        }
      }
    }
  }

  /**
   * Delete the user identified by `nick` from the network and buffers
   * @param {string} nick
   * @returns {number[]} list of buffer ids that has been deactivated
   */
  deleteUser(nick) {
    const ids = [];
    for (let buffer of this.buffers.values()) {
      if (buffer.isChannel) {
        if (buffer.hasUser(nick)) {
          buffer.removeUser(nick);
          if (this.nick && this.nick.toLowerCase() === nick.toLowerCase()) {
            buffer.isActive = false;
            ids.push(buffer.id);
          }
        }
      } else if (buffer.name === nick) {
        buffer.isActive = false;
        ids.push(buffer.id);
      }
    }
    this.users.delete(nick);
    return ids;
  }

  /**
   * @param {IRCUser[]} userlist
   */
  updateUsers(userlist) {
    this.users.clear();
    if (Array.isArray(userlist) && userlist.length> 0) {
      for (let user of userlist) {
        this.users.set(user.nick, user);
      }
    }
  }

  /**
   * Get the {IRCBuffer} corresponding to specified id or name
   * @param {number|string} bufferId
   */
  getBuffer(bufferId) {
    return this.buffers.get(bufferId);
  }

  /**
   * Returns `true` if a buffer exists with corresponding id or name
   * @param {number|string} bufferId
   */
  hasBuffer(bufferId) {
    return this.buffers.has(bufferId);
  }

  /**
   * This method is used internally by update method
   * @protected
   * @param {Object} uac
   */
  set ircUsersAndChannels(uac) {
    // Create IRCUsers and attach them to network
    for (let user of uac.users) {
      this.addUser(new IRCUser(user));
    }
    // If there is a buffer corresponding to a nick, activate the buffer
    for (let buffer of this.buffers.values()) {
      if (!buffer.isChannel && this.hasUser(buffer.name)) {
        buffer.isActive = true;
      }
    }
    // Attach channels to network
    let channel, nick, user;
    for (let key of uac.channels) {
      channel = this.getBuffer(key);
      // Then attach users to channels
      for (nick in uac.channels[key].UserModes) {
        user = this.getUser(nick);
        if (user) {
          channel.addUser(user, uac.channels[key].UserModes[nick]);
        } else {
          logger('User %s have not been found on server', nick);
        }
      }
    }
  }

  update(data) {
    Object.assign(this, data);
  }

  toString() {
    return `<Network ${this.id} ${this.name}>`;
  }
}

/**
 * Map of {@link Network}, with helpers
 */
export class NetworkCollection extends Map {
  /**
   * Add an empty {@linkNetwork} identified by `networkId` to the collection
   * @param {number} networkId
   * @returns {module:network.Network}
   */
  add(networkId) {
    networkId = parseInt(networkId, 10);
    const network = new Network(networkId);
    this.set(networkId, network);
    return network;
  }

  /**
   * Returns {@link IRCBuffer} corresponding to given `bufferId`, or `undefined` otherwise
   * @param {number} bufferId
   * @returns {?IRCBuffer}
   */
  getBuffer(bufferId) {
    if (typeof bufferId !== 'number') return undefined;
    let buffer;
    for (let network of this.values()) {
      buffer = network.buffers.get(bufferId);
      if (buffer) return buffer;
    }
    return undefined;
  }

  /**
   * Delete the {@link IRCBuffer} object identified by `bufferId` from the networks
   * @param {number} bufferId
   */
  deleteBuffer(bufferId) {
    if (typeof bufferId !== 'number') {
      logger('deleteBuffer:%O is not a number', bufferId);
      return;
    }
    const buffer = this.getBuffer(bufferId);
    if (buffer) {
      this.get(buffer.network).buffers.delete(bufferId);
    }
  }

  /**
   * Yields all buffers of all networks
   */
  *buffers() {
    let buffer;
    for (let network of this.values()) {
      for (buffer of network.buffers.values()) {
        yield buffer;
      }
    }
  }

  /**
   * Returns `true` if buffer identified by `bufferId` exists
   * @param {number} bufferId
   */
  hasBuffer(bufferId) {
    if (typeof bufferId !== 'number') {
      logger('hasBuffer:%O is not a number', bufferId);
      return false;
    }
    for (let network of this.values()) {
      if (network.hasBuffer(bufferId)) return true;
    }
    return false;
  }
}
