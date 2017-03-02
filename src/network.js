/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2016 Joël Charles
 * Licensed under the MIT license.
 */

/** @module network */

const { EventEmitter } = require('events');
const IRCUser = require('./user');
const { IRCBufferCollection } = require('./buffer');
const logger = require('debug')('libquassel:network');
const { util, types: qtypes } = require('qtdatastream');
const { Exportable, exportas, usertype } = qtypes;

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
@usertype("Network::Server")
class Server extends Exportable {
  @exportas(qtypes.QString, "Host")
  host;

  @exportas(qtypes.QUInt, "Port")
  port = 6667;

  @exportas(qtypes.QString, "Password")
  password = "";

  @exportas(qtypes.QBool, "UseSSL")
  useSSL = false;

  @exportas(qtypes.QInt, "sslVersion")
  sslVersion = 0;

  @exportas(qtypes.QBool, "UseProxy")
  useProxy = false;

  @exportas(qtypes.QInt, "ProxyType")
  proxyType = 0;

  @exportas(qtypes.QString, "ProxyHost")
  proxyHost = "";

  @exportas(qtypes.QUInt, "ProxyPort")
  proxyPort = 8080;

  @exportas(qtypes.QString, "ProxyUser")
  proxyUser = "";

  @exportas(qtypes.QString, "ProxyPass")
  proxyPass = "";

  @exportas(qtypes.QBool, "sslVerify")
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
class Network extends EventEmitter {
  
  @exportas(qtypes.QUserType.get("NetworkId"), "NetworkId")
  networkId;
  
  @exportas(qtypes.QString, "NetworkName")
  networkName;
  
  @exportas(qtypes.QUserType.get("IdentityId"), "Identity")
  identityId;
  
  @exportas(qtypes.QByteArray, "CodecForServer")
  codecForServer;
  
  @exportas(qtypes.QByteArray, "CodecForEncoding")
  codecForEncoding;
  
  @exportas(qtypes.QByteArray, "CodecForDecoding")
  codecForDecoding;
  
  @exportas(qtypes.QList, "ServerList")
  // TODO
  
  @exportas(qtypes.QBool, "UseRandomServer")
  useRandomServer;
  
  @exportas(qtypes.QStringList, "Perform")
  perform;
  
  @exportas(qtypes.QBool, "UseAutoIdentify")
  useAutoIdentify;
  
  @exportas(qtypes.QString, "AutoIdentifyService")
  autoIdentifyService;
  
  @exportas(qtypes.QString, "AutoIdentifyPassword")
  autoIdentifyPassword;
  
  @exportas(qtypes.QBool, "UseSasl")
  useSasl;
  
  @exportas(qtypes.QString, "SaslAccount")
  saslAccount;
  
  @exportas(qtypes.QString, "SaslPassword")
  saslPassword;
  
  @exportas(qtypes.QBool, "UseAutoReconnect")
  useAutoReconnect;
  
  @exportas(qtypes.QUInt, "AutoReconnectInterval")
  autoReconnectInterval;
  
  @exportas(qtypes.QUInt, "AutoReconnectRetries")
  autoReconnectRetries;
  
  @exportas(qtypes.QBool, "UnlimitedReconnectRetries")
  unlimitedReconnectRetries;
  
  @exportas(qtypes.QBool, "RejoinChannels")
  rejoinChannels;
  
  @exportas(qtypes.QBool, "UseCustomMessageRate")
  useCustomMessageRate;
  
  @exportas(qtypes.QBool, "UnlimitedMessageRate")
  unlimitedMessageRate;
  
  @exportas(qtypes.QUInt, "MessageRateDelay")
  msgRateMessageDelay;
  
  @exportas(qtypes.QUInt, "MessageRateBurstSize")
  msgRateBurstSize;
  
  constructor(id) {
    /** @member {number} id */
    this.id = id;
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
    this.name = null;
    /** @member {?string} nick */
    this.nick = null;
    /** @member {Object[]} ServerList */
    // TODO create class for ServerList element
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

  set networkName(value) {
    this.name = value;
  }

  get networkName() {
    return this.name;
  }

  set myNick(value) {
    this.nick = value;
  }

  get myNick() {
    return this.nick;
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
    if (typeof nick.nick === 'string') {
      nick = nick.nick;
    }
    return this.users.has(nick);
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
    // TODO weakmap ?
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
   * Set current codec for decoding messages
   * @param {(Buffer|string)} s
   */
  set codecForDecoding(s) {
    this._codecForDecoding = Buffer.isBuffer(s) ? util.str(s) : s;
  }

  /**
   * Set current codec for encoding messages
   * @param {(Buffer|string)} s
   */
  set codecForEncoding(s) {
    this._codecForEncoding = Buffer.isBuffer(s) ? util.str(s) : s;
  }

  /**
   * Set current codec used by the server
   * @param {(Buffer|string)} s
   */
  set codecForServer(s) {
    this._codecForServer = Buffer.isBuffer(s) ? util.str(s) : s;
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
          logger("User %s have not been found on server", nick);
        }
      }
    }
  }

  update(data) {
    const keys = Object.keys(data);
    for (let key of keys) {
      this[key] = data[key];
    }
  }
}

/**
 * Transform a given network object to an Object representation prepared for QDataStream injection
 * @param {Network} network
 * @returns {object}
 */
// TODO Change that
Network.toQ = function(network) {
  var jServerList = [];
  for (var i = 0; i < network.ServerList.length; i++) {
    jServerList.push(new qtypes.QUserType("Network::Server", {
      Host: qtypes.QString.from(network.ServerList[i].Host),
      Port: qtypes.QUInt.from(network.ServerList[i].Port),
      Password: qtypes.QString.from(network.ServerList[i].Password),
      UseSSL: qtypes.QBool.from(network.ServerList[i].UseSSL),
      sslVersion: qtypes.QInt.from(network.ServerList[i].sslVersion),
      UseProxy: qtypes.QBool.from(network.ServerList[i].UseProxy),
      ProxyType: qtypes.QInt.from(network.ServerList[i].ProxyType),
      ProxyHost: qtypes.QString.from(network.ServerList[i].ProxyHost),
      ProxyPort: qtypes.QUInt.from(network.ServerList[i].ProxyPort),
      ProxyUser: qtypes.QString.from(network.ServerList[i].ProxyUser),
      ProxyPass: qtypes.QString.from(network.ServerList[i].ProxyPass),
      sslVerify: qtypes.QBool.from(network.ServerList[i].sslVerify)
    }));
  }
  var jNetwork = {
    NetworkId: new qtypes.QUserType("NetworkId", network.networkId),
    NetworkName: qtypes.QString.from(network.networkName),
    Identity: new qtypes.QUserType("IdentityId", network.identityId),
    CodecForServer: qtypes.QByteArray.from(network.codecForServer),
    CodecForEncoding: qtypes.QByteArray.from(network.codecForEncoding),
    CodecForDecoding: qtypes.QByteArray.from(network.codecForDecoding),
    ServerList: qtypes.QList.from(jServerList),
    UseRandomServer: qtypes.QBool.from(network.useRandomServer),
    Perform: qtypes.QStringList.from(network.perform),
    UseAutoIdentify: qtypes.QBool.from(network.useAutoIdentify),
    AutoIdentifyService: qtypes.QString.from(network.autoIdentifyService),
    AutoIdentifyPassword: qtypes.QString.from(network.autoIdentifyPassword),
    UseSasl: qtypes.QBool.from(network.useSasl),
    SaslAccount: qtypes.QString.from(network.saslAccount),
    SaslPassword: qtypes.QString.from(network.saslPassword),
    UseAutoReconnect: qtypes.QBool.from(network.useAutoReconnect),
    AutoReconnectInterval: qtypes.QUInt.from(network.autoReconnectInterval),
    AutoReconnectRetries: qtypes.QUInt.from(network.autoReconnectRetries),
    UnlimitedReconnectRetries: qtypes.QBool.from(network.unlimitedReconnectRetries),
    RejoinChannels: qtypes.QBool.from(network.rejoinChannels),
    UseCustomMessageRate: qtypes.QBool.from(network.useCustomMessageRate),
    UnlimitedMessageRate: qtypes.QBool.from(network.unlimitedMessageRate),
    MessageRateDelay: qtypes.QUInt.from(network.msgRateMessageDelay),
    MessageRateBurstSize: qtypes.QUInt.from(network.msgRateBurstSize)
  };
  return new qtypes.QUserType("NetworkInfo", jNetwork);
};

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
    if (typeof bufferId !== "number") return undefined;
    const networks = this.values();
    let buffer;
    for (let network of networks) {
      buffer = network.value.buffers.get(bufferId);
      if (buffer) return buffer;
    }
    return undefined;
  }

  /**
   * Delete the {@link module:buffer.IRCBuffer} Object identified by `bufferId` from the networks
   * @param {number} bufferId
   */
  deleteBuffer(bufferId) {
    const buffer = this.getBuffer(bufferId);
    if (buffer) {
      this.get(buffer.network).buffers.removeBuffer(bufferId);
    }
  }
}

module.exports = {
  Network,
  NetworkCollection,
  ConnectionStates,
  Server
};