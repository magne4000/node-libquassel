/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2017 Joël Charles
 * Licensed under the MIT license.
 */

/** @module network */

const { EventEmitter } = require('events');
const IRCUser = require('./user');
const { IRCBufferCollection } = require('./buffer');
const logger = require('debug')('libquassel:network');
const { util, types: qtypes } = require('qtdatastream');
const { Exportable, exportas, usertype } = qtypes;

import { traits } from 'traits-decorator';

/**
 * @alias module:network.Network.ConnectionState
 * @readonly
 * @enum {number}
 * @default
 */
const ConnectionStates = {
  DISCONNECTED: 0x00,
  CONNECTING: 0x01,
  INITIALIZING: 0x02,
  INITIALIZED: 0x03,
  RECONNECTING: 0x04,
  DISCONNECTING: 0x05
};

/**
 * @class
 * @alias module:network.Server
 */
@traits(Exportable)
@usertype('Network::Server')
class Server {
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
 * @class
 * @alias module:network.Network
 * @augments EventEmitter
 * @param {number} id
 */
@traits(Exportable)
@usertype('NetworkInfo')
class Network extends EventEmitter {

  @exportas(qtypes.QUserType.get('NetworkId'), 'NetworkId')
  get networkId() {
    return this.id;
  }

  set networkId(value) {
    this.id = value;
  }

  @exportas(qtypes.QString, 'NetworkName')
  get networkName() {
    return this.name;
  }

  set networkName(value) {
    this.name = value;
  }

  @exportas(qtypes.QUserType.get('IdentityId'), 'Identity')
  identityId;

  @exportas(qtypes.QByteArray, 'CodecForServer')
  get codecForServer() {
    return this._codecForServer;
  }

  set codecForServer(s) {
    this._codecForServer = Buffer.isBuffer(s) ? util.str(s) : s;
  }

  @exportas(qtypes.QByteArray, 'CodecForEncoding')
  get codecForEncoding() {
    return this._codecForEncoding;
  }

  set codecForEncoding(s) {
    this._codecForEncoding = Buffer.isBuffer(s) ? util.str(s) : s;
  }

  @exportas(qtypes.QByteArray, 'CodecForDecoding')
  get codecForDecoding() {
    return this._codecForDecoding;
  }

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

  constructor(id, name = null) {
    super();
    /** @member {number} id */
    this.id = typeof id === 'number' ? id : -1;
    /** @member {module:buffer.IRCBufferCollection} buffers */
    this.buffers = new IRCBufferCollection();
    /** @member {Map.<String, module:user>} users */
    this.users = new Map;
    /** @member {boolean} open */
    this.open = false;
    /** @member {module:network.Network.ConnectionStates} connectionState */
    this.connectionState = ConnectionStates.DISCONNECTED;
    /** @member {boolean} isConnected */
    this._isConnected = false;
    /** @member {number} latency */
    this.latency = 0;
    /** @member {?module:buffer.IRCBuffer} statusBuffer */
    this.statusBuffer = null;
    /** @member {?string} networkName */
    this.name = name;
    /** @member {?string} nick */
    this._nick = null;
    this.nickRegex = null;
    /** @member {Server[]} ServerList */
    /** @member {?string} autoIdentifyPassword */
    /** @member {?string} autoIdentifyService */
    /** @member {number} autoReconnectInterval */
    /** @member {number} autoReconnectRetries */
    /** @member {?string} codecForDecoding */
    this._codecForDecoding = null;
    /** @member {?string} codecForEncoding */
    this._codecForEncoding = null;
    /** @member {?string} codecForServer */
    this._codecForServer = null;
    /** @member {?string} currentServer */
    /** @member {number} identityId */
    /** @member {string[]} perform */
    /** @member {boolean} rejoinChannels */
    /** @member {?string} saslAccount */
    /** @member {?string} saslPassword */
    /** @member {boolean} unlimitedReconnectRetries */
    /** @member {boolean} useAutoIdentify */
    /** @member {boolean} useAutoReconnect */
    /** @member {boolean} useRandomServer */
    /** @member {boolean} useSasl */
    /** @member {boolean} useCustomMessageRate */
    /** @member {boolean} unlimitedMessageRate */
    /** @member {number} messageRateDelay */
    /** @member {number} messageRateBurstSize */
  }

  set myNick(value) {
    this.nick = value;
  }

  get myNick() {
    return this._nick;
  }

  set nick(value) {
    this._nick = value;
    this.nickRegex = value.replace(/([.?*+^$[\]\\(){}|-])/g, '\\$1');
  }

  get nick() {
    return this._nick;
  }

  /**
   * Update `isConnected` value, and change the state of the `statusBuffer` of this network
   * @param {boolean} connected
   */
  set isConnected(connected) {
    connected = Boolean(connected);
    if (this.statusBuffer) {
      this.statusBuffer.isActive = connected;
    }
    this._isConnected = connected;
  }

  get isConnected() {
    return this._isConnected;
  }

  getUser(nick) {
    return this.users.get(nick);
  }

  /**
   * Add given user to the network
   * @param {module:user} user
   */
  addUser(user) {
    this.users.set(user.nick, user);
  }

  /**
   * Returns `true` if the specified nick exists in the network, `false` otherwise
   * @param {(string|module:user)} nick
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
   * @returns {Array} list of buffers that has been deactivated
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

  updateUsers(userlist) {
    this.users.clear();
    if (Array.isArray(userlist) && userlist.length> 0) {
      for (let user of userlist) {
        this.users.set(user.nick, user);
      }
    }
  }

  /**
   * Get the {module:buffer.IRCBuffer} corresponding to specified ID or name
   * @param {(number|string)} bufferId
   */
  getBuffer(bufferId) {
    return this.buffers.get(bufferId);
  }

  /**
   * Returns `true` if a buffer exists with corresponding ID or name
   * @param {(number|string)} bufferId
   */
  hasBuffer(bufferId) {
    return this.buffers.has(bufferId);
  }

  /**
   * This method is used internally by update method
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
 * @class
 * @alias module:network.NetworkCollection
 */
class NetworkCollection extends Map {
  /**
   * Add and empty {@link module:network.Network} identified by `networkId` to the collection
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
   * Returns {@link module:buffer.IRCBuffer} corresponding to given `bufferId`, or `undefined` otherwise
   * @param {number} bufferId
   * @returns {?module:buffer.IRCBuffer}
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
   * Delete the {@link module:buffer.IRCBuffer} Object identified by `bufferId` from the networks
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

module.exports = {
  Network,
  NetworkCollection,
  ConnectionStates,
  Server
};