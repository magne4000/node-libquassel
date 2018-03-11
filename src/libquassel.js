/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2017 Joël Charles
 * Licensed under the MIT license.
 */

import './usertypes'; // register usertypes first
const { EventEmitter } = require('events');
const logger = require('debug')('libquassel:main');

import { Types as RequestTypes, Core } from './request';
import { NetworkCollection } from './network';
import { IRCBuffer } from './buffer';
import IRCUser from './user';
import Identity from './identity';
import BufferView from './bufferview';
import { Types as MessageTypes, HighlightModes } from './message';
import * as alias from './alias';
import * as ignore from './ignore';

/**
 * @type {Object}
 * @property {number} Features.SYNCHRONIZEDMARKERLINE
 * @property {number} Features.SASLAUTHENTICATION
 * @property {number} Features.SASLEXTERNAL
 * @property {number} Features.HIDEINACTIVENETWORKS
 * @property {number} Features.PASSWORDCHANGE
 * @property {number} Features.CAPNEGOTIATION
 * @property {number} Features.VERIFYSERVERSSL
 * @property {number} Features.CUSTOMRATELIMITS
 * @property {number} Features.NUMFEATURES
 */
export const Features = {
  SYNCHRONIZEDMARKERLINE: 0x0001,
  SASLAUTHENTICATION: 0x0002,
  SASLEXTERNAL: 0x0004,
  HIDEINACTIVENETWORKS: 0x0008,
  PASSWORDCHANGE: 0x0010,
  CAPNEGOTIATION: 0x0020, // IRCv3 capability negotiation, account tracking
  VERIFYSERVERSSL: 0x0040, // IRC server SSL validation
  CUSTOMRATELIMITS: 0x0080, // IRC server custom message rate limits
  NUMFEATURES: 0x0080
};

/**
 * @typedef {function(user: string, password: string)} loginCallback
 */

/**
 * Main class to interact with Quassel instance
 * @example
 * import { Client } from 'libquassel';
 * const net = require('net');
 *
 * const quassel = new Client(function(next) {
 *   next("user", "password");
 * });
 * const socket = net.createConnection({
 *   host: "localhost",
 *   port: 4242
 * });
 *
 * quassel.connect(socket);
 */
export class Client extends EventEmitter {
  /**
   * @param {function(next: loginCallback)} loginCallback
   * @param {Object} [options] Allows optionnal parameters
   * @param {number} [options.initialbackloglimit=options.backloglimit] number of backlogs to request per buffer at connection
   * @param {number} [options.backloglimit=100] number of backlogs to request per buffer after connection
   * @param {boolean} [options.securecore=true] Use SSL to connect to the core (if the core allows it)
   * @param {number} [options.highlightmode=0x02] Choose how highlights on nicks works. Defaults to only highlight a message if current nick is present.
   */
  constructor(loginCallback, options = {}) {
    super();
    /** @type {Object} options */
    this.options = {};
    this.options.backloglimit = parseInt(options.backloglimit || 100, 10);
    this.options.initialbackloglimit = parseInt(options.initialbackloglimit || this.options.backloglimit, 10);
    this.options.highlightmode = (typeof options.highlightmode === 'number') ? options.highlightmode : HighlightModes.CURRENTNICK;
    this.options.securecore = options.securecore !== false;
    /** @type {Core} */
    this.core = new Core(this.options);
    /** @type {NetworkCollection} */
    this.networks = new NetworkCollection();
    /** @type {Map<number, Identity>} */
    this.identities = new Map();
    /** @type {IgnoreList} */
    this.ignoreList = new ignore.IgnoreList();
    /** @type {AliasItem[]} */
    this.aliases = [];
    /** @type {Map<number, BufferView>} */
    this.bufferViews = new Map();
    /** @type {?number} */
    this.heartbeatInterval = null;
    /** @type {boolean} */
    this.useCompression = false;
    /** @type {?boolean} */
    this.connected = null;
    /** @type {?Object} */
    this.coreInfo = null;
    /** @type {?Object} */
    this.coreData = null;
    /** @type {function(next: loginCallback)} */
    this.loginCallback = loginCallback;

    if (typeof loginCallback !== 'function') {
      throw new Error('loginCallback parameter is mandatory and must be a function');
    }

    this.core.on('data', data => this.dispatch(data));
    this.core.on('error', err => this.emit('error', err));
  }

  /**
   * Handles quasselcore messages that possesses a `MsgType` attribute
   * @param {Object} obj
   * @emits {Event:coreinfoinit}
   * @emits {Event:login}
   * @emits {Event:loginfailed}
   * @emits {Event:network.addbuffer}
   * @emits {Event:init}
   * @emits {Event:setup}
   * @emits {Event:setupok}
   * @emits {Event:setupfailed}
   * @emits {Event:identities.init}
   * @emits {Event:unhandled}
   * @protected
   */
  handleMsgType(obj) {
    switch (obj.MsgType) {
    case 'ClientInitAck':
      this.handleClientInitAck(obj);
      break;
    case 'ClientLoginAck':
      logger('Logged in');
      this.emit('login');
      break;
    case 'ClientLoginReject':
      logger('ClientLoginReject: %O', obj);
      this.emit('loginfailed');
      break;
    case 'CoreSetupAck':
      logger('Core setup successful');
      this.emit('setupok');
      break;
    case 'CoreSetupReject':
      logger('Core setup failed: %O', obj.Error);
      this.emit('setupfailed', obj.Error);
      break;
    case 'SessionInit':
      this.handleSessionInit(obj);
      break;
    default:
      logger('Unhandled MsgType %s', obj.MsgType);
      this.emit('unhandled', obj);
    }
  }

  /**
   * @protected
   */
  handleClientInitAck(obj) {
    this.coreInfo = obj;
    this.emit('coreinfoinit', obj);
    if (!obj.Configured) {
      this.core.finishClientInit(() => this.emit('setup', obj.StorageBackends));
    } else if (obj.LoginEnabled) {
      this.core.finishClientInit(() => this.login());
    } else {
      this.emit('error', new Error('Your core is not supported'));
    }
  }

  /**
   * @protected
   */
  handleSessionInit(obj) {
    this.emit('init', obj);
    // Init networks
    for (let networkId of obj.SessionState.NetworkIds) {
      // Save network list
      this.networks.add(networkId);
      this.core.sendInitRequest('Network', String(networkId));
    }
    // Attach buffers to network
    for (let bufferInfo of obj.SessionState.BufferInfos) {
      const ircbuffer = new IRCBuffer(bufferInfo);
      this.networks.get(ircbuffer.network).buffers.add(ircbuffer);
      if (ircbuffer.isChannel) {
        this.core.sendInitRequest('IrcChannel', `${ircbuffer.network}/${ircbuffer.name}`);
      }
      this.emit('network.addbuffer', ircbuffer.network, bufferInfo.id);
      // Init backlogs for this buffer
      if (this.options.initialbackloglimit > 0) {
        this.core.backlog(bufferInfo.id, -1, -1, this.options.initialbackloglimit);
      }
    }
    // Init Identities
    for (let identity of obj.SessionState.Identities) {
      this.identities.set(identity.identityId, new Identity(identity));
    }
    this.emit('identities.init', this.identities);
    this.core.sendInitRequest('BufferSyncer');
    this.core.sendInitRequest('BufferViewManager');
    this.core.sendInitRequest('IgnoreListManager');
    this.core.sendInitRequest('AliasManager');
    this.heartbeatInterval = setInterval(() => this.core.heartBeat(), 30000);
  }

  /**
   * Returns `true` if the core supports the given feature
   * @example
   * quassel.supports(Features.PASSWORDCHANGE);
   * @param {number} feature
   * @returns {boolean}
   */
  supports(feature) {
    return (this.coreInfo.CoreFeatures & feature) > 0;
  }

  /**
   * Dispatch quasselcore messages
   * @param {Object} obj
   * @protected
   */
  dispatch(obj) {
    if (obj === null) {
      logger('Received null object ... ?');
    } else if (obj.MsgType !== undefined) {
      this.handleMsgType(obj);
    } else if (Array.isArray(obj)) {
      this.handleStruct(obj);
    } else {
      logger('Unknown message: %O', obj);
    }
  }

  /**
   * @protected
   */
  handleInitDataNetwork(id, data) {
    id = parseInt(id, 10);
    const network = this.networks.get(id);
    network.update(data);
    return network;
  }

  /**
   * Handles most of the quasselcore messages
   * @param {*} obj - quasselcore message decoded by qtdatasteam
   * @emits {Event:coreinfo}
   * @emits {Event:network.init}
   * @emits {Event:network.latency}
   * @emits {Event:network.connectionstate}
   * @emits {Event:network.addbuffer}
   * @emits {Event:network.connected}
   * @emits {Event:network.disconnected}
   * @emits {Event:network.userrenamed}
   * @emits {Event:network.mynick}
   * @emits {Event:network.networkname}
   * @emits {Event:network.server}
   * @emits {Event:network.serverlist}
   * @emits {Event:network.adduser}
   * @emits {Event:network.new}
   * @emits {Event:network.remove}
   * @emits {Event:network.codec.decoding}
   * @emits {Event:network.codec.encoding}
   * @emits {Event:network.codec.server}
   * @emits {Event:network.perform}
   * @emits {Event:network.identity}
   * @emits {Event:network.autoreconnect.interval}
   * @emits {Event:network.autoreconnect.retries}
   * @emits {Event:network.autoidentify.service}
   * @emits {Event:network.autoidentify.password}
   * @emits {Event:network.unlimitedreconnectretries}
   * @emits {Event:network.usesasl}
   * @emits {Event:network.sasl.account}
   * @emits {Event:network.sasl.password}
   * @emits {Event:network.rejoinchannels}
   * @emits {Event:network.usecustommessagerate}
   * @emits {Event:network.messagerate.unlimited}
   * @emits {Event:network.messagerate.delay}
   * @emits {Event:network.messagerate.burstsize}
   * @emits {Event:buffer.read}
   * @emits {Event:buffer.lastseen}
   * @emits {Event:buffer.markerline}
   * @emits {Event:buffer.remove}
   * @emits {Event:buffer.rename}
   * @emits {Event:buffer.merge}
   * @emits {Event:buffer.deactivate}
   * @emits {Event:buffer.activate}
   * @emits {Event:buffer.backlog}
   * @emits {Event:buffer.message}
   * @emits {Event:bufferview.ids}
   * @emits {Event:bufferview.bufferunhide}
   * @emits {Event:bufferview.bufferhidden}
   * @emits {Event:bufferview.orderchanged}
   * @emits {Event:bufferview.init}
   * @emits {Event:bufferview.networkid}
   * @emits {Event:bufferview.search}
   * @emits {Event:bufferview.hideinactivenetworks}
   * @emits {Event:bufferview.hideinactivebuffers}
   * @emits {Event:bufferview.allowedbuffertypes}
   * @emits {Event:bufferview.addnewbuffersautomatically}
   * @emits {Event:bufferview.minimumactivity}
   * @emits {Event:bufferview.bufferviewname}
   * @emits {Event:bufferview.disabledecoration}
   * @emits {Event:bufferview.update}
   * @emits {Event:user.part}
   * @emits {Event:user.quit}
   * @emits {Event:user.away}
   * @emits {Event:user.realname}
   * @emits {Event:channel.join}
   * @emits {Event:channel.addusermode}
   * @emits {Event:channel.removeusermode}
   * @emits {Event:channel.topic}
   * @emits {Event:ignorelist}
   * @emits {Event:identity}
   * @emits {Event:identity.new}
   * @emits {Event:identity.remove}
   * @emits {Event:aliases}
   * @protected
   */
  handleStruct(obj) {
    const [ requesttype ] = obj;
    let className, id, functionName, data;
    switch (requesttype) {
    case RequestTypes.SYNC:
      [ , className, id, functionName, ...data ] = obj;
      this.handleStructSync(className.toString(), id, functionName.toString(), data);
      break;
    case RequestTypes.RPCCALL:
      [ , functionName, ...data ] = obj;
      this.handleStructRpcCall(functionName.toString(), data);
      break;
    case RequestTypes.INITDATA:
      [ , className, id, ...data ] = obj;
      this.handleStructInitData(className.toString(), id, data);
      break;
    case RequestTypes.HEARTBEAT:
      logger('HeartBeat');
      this.core.heartBeat(true);
      break;
    case RequestTypes.HEARTBEATREPLY:
      logger('HeartBeatReply');
      break;
    default:
      logger('Unhandled RequestType #%s', requesttype);
    }
  }

  /**
   * @protected
   */
  handleStructSync(className, id, functionName, data) {
    let networkId, username, buffername;
    switch (className) {
    case 'Network':
      return this.handleStructSyncNetwork(parseInt(id.toString(), 10), functionName, data);
    case 'BufferSyncer':
      return this.handleStructSyncBufferSyncer(functionName, data);
    case 'BufferViewManager':
      return this.handleStructSyncBufferViewManager(functionName, data);
    case 'BufferViewConfig':
      return this.handleStructSyncBufferViewConfig(parseInt(id.toString(), 10), functionName, data);
    case 'IrcUser':
      [ networkId, username ] = splitOnce(id, '/');
      return this.handleStructSyncIrcUser(parseInt(networkId, 10), username, functionName, data);
    case 'IrcChannel':
      [ networkId, buffername ] = splitOnce(id, '/');
      return this.handleStructSyncIrcChannel(parseInt(networkId, 10), buffername, functionName, data);
    case 'BacklogManager':
      return this.handleStructSyncBacklogManager(functionName, data);
    case 'IgnoreListManager':
      return this.handleStructSyncIgnoreListManager(functionName, data);
    case 'Identity':
      return this.handleStructSyncIdentity(parseInt(id, 10), functionName, data);
    case 'AliasManager':
      return this.handleStructSyncAliasManager(functionName, data);
    default:
      logger('Unhandled Sync %s', className);
    }
  }

  /**
   * @protected
   */
  handleStructRpcCall(functionName, data) {
    switch (functionName) {
    case '2displayStatusMsg(QString,QString)':
      // Even official client doesn't use this ...
      break;
    case '2displayMsg(Message)':
      this.handleStructRpcCallDisplayMsg(data);
      break;
    case '__objectRenamed__':
      this.handleStructRpcCall__objectRenamed__(data);
      break;
    case '2networkCreated(NetworkId)':
      // data[0] is networkId
      this.networks.add(data[0]);
      this.core.sendInitRequest('Network', String(data[0]));
      this.emit('network.new', data[0]);
      break;
    case '2networkRemoved(NetworkId)':
      // data[0] is networkId
      this.networks.add(data[0]);
      this.networks.delete(data[0]);
      this.emit('network.remove', data[0]);
      break;
    case '2identityCreated(Identity)':
      // data[0] is identity
      this.identities.set(data[0].identityId, new Identity(data[0]));
      this.emit('identity.new', data[0].identityId);
      break;
    case '2identityRemoved(IdentityId)':
      // data[0] is identityId
      this.identities.delete(data[0]);
      this.emit('identity.remove', data[0]);
      break;
    default:
      logger('Unhandled RpcCall %s', functionName);
    }
  }

  /**
   * @protected
   */
  handleStructRpcCallDisplayMsg([ message ]) {
    const network = this.networks.get(message.bufferInfo.network);
    if (network) {
      const identity = this.identities.get(network.identityId);
      let buffer = network.buffers.get(message.bufferInfo.id);
      if (!buffer) {
        buffer = network.buffers.get(message.bufferInfo.name);
        if (buffer) {
          buffer.update(message.bufferInfo);
          network.buffers.move(buffer, message.bufferInfo.id);
        } else {
          buffer = new IRCBuffer(message.bufferInfo);
          this.networks.get(message.bufferInfo.network).buffers.add(buffer);
          this.emit('network.addbuffer', message.bufferInfo.network, message.bufferInfo.id);
        }
      }
      if (message.type === MessageTypes.NETSPLITJOIN) {
        // TODO
      } else if (message.type === MessageTypes.NETSPLITQUIT) {
        // TODO
      }

      const simpleMessage = buffer.addMessage(message);
      if (simpleMessage) {
        simpleMessage._updateFlags(network, identity, this.options.highlightmode);
        this.emit('buffer.message', message.bufferInfo.id, simpleMessage.id);
      }
    } else {
      logger('Network %d does not exists', message.bufferInfo.network);
    }
  }

  /**
   * @protected
   */
  handleStructRpcCall__objectRenamed__([ renamedSubject, oldSubject, newSubject ]) {
    renamedSubject = renamedSubject.toString();
    let networkId, newNick, oldNick;
    switch (renamedSubject) {
    case 'IrcUser':
      [ networkId, newNick ] = splitOnce(oldSubject, '/'); // 1/Nick
      networkId = parseInt(networkId, 10);
      [ , oldNick ] = splitOnce(newSubject, '/'); // 1/Nick_
      this.networks.get(networkId).renameUser(oldNick, newNick);
      this.emit('network.userrenamed', networkId, oldNick, newNick);
      break;
    default:
      logger('Unhandled RpcCall.__objectRenamed__ %s', renamedSubject);
    }
  }

  /**
   * @protected
   */
  handleStructInitData(className, id, [ data ]) {
    let network, bufferViewIds;
    switch (className) {
    case 'Network':
      network = this.handleInitDataNetwork(id, data);
      this.emit('network.init', network.networkId);
      break;
    case 'BufferSyncer':
      this.handleStructInitDataBufferSyncer(data);
      break;
    case 'IrcUser':
      this.handleStructInitDataIrcUser(id, data);
      break;
    case 'IrcChannel':
      this.handleStructInitDataIrcChannel(id, data);
      break;
    case 'BufferViewManager':
      ({ BufferViewIds: bufferViewIds } = data);
      for (let bufferViewId of bufferViewIds) {
        this.core.sendInitRequest('BufferViewConfig', bufferViewId);
      }
      this.emit('bufferview.ids', bufferViewIds);
      break;
    case 'BufferViewConfig':
      this.handleStructInitDataBufferViewConfig(id, data);
      break;
    case 'IgnoreListManager':
      this.ignoreList.import(data);
      this.emit('ignorelist', this.ignoreList);
      break;
    case 'AliasManager':
      this.aliases = alias.toArray(data);
      this.emit('aliases', this.aliases);
      break;
    case 'CoreInfo':
      this.coreData = data;
      this.emit('coreinfo', data);
      break;
    default:
      logger('Unhandled InitData %s', className);
    }
  }

  handleStructInitDataBufferSyncerProperty(data, eventName) {
    let bufferId, value, i;
    for (i=0; i<data.length; i+=2) {
      bufferId = data[i];
      value = data[i+1];
      if (this.networks.hasBuffer(bufferId)) {
        this.emit(eventName, bufferId, value);
      } else {
        logger('Buffer #%d does not exists', bufferId);
      }
    }
  }

  /**
   * @protected
   */
  handleStructInitDataBufferSyncer(data) {
    const { MarkerLines: markerLinesData, LastSeenMsg: lastSeenData, Activities: activities } = data;
    if (lastSeenData) {
      this.handleStructInitDataBufferSyncerProperty(lastSeenData, 'buffer.lastseen');
    }
    if (markerLinesData) {
      this.handleStructInitDataBufferSyncerProperty(markerLinesData, 'buffer.markerline');
    }
    if (activities) {
      this.handleStructInitDataBufferSyncerProperty(activities, 'buffer.activity');
    }
  }

  /**
   * @protected
   */
  handleStructInitDataIrcChannel(id, data) {
    let [ networkId, bufferName ] = splitOnce(id, '/');
    networkId = parseInt(networkId, 10);
    const buffer = this.networks.get(networkId).buffers.get(bufferName);
    buffer.topic = data.topic;
    buffer.isActive = true;
    this.emit('channel.topic', buffer.id, data.topic);
    this.emit('buffer.activate', buffer.id);
  }

  /**
   * @protected
   */
  handleStructInitDataIrcUser(id, data) {
    let [ networkId, nick ] = splitOnce(id, '/');
    networkId = parseInt(networkId, 10);
    const user = this.networks.get(networkId).getUser(nick);
    if (user) {
      user.update(data);
      this.emit('network.adduser', networkId, nick);
    }
  }

  /**
   * @protected
   */
  handleStructInitDataBufferViewConfig(id, data) {
    id = parseInt(id, 10);
    this.bufferViews.set(id, new BufferView(id, data));
    for (let temporarilyRemovedBuffer of data.TemporarilyRemovedBuffers) {
      this.emit('bufferview.bufferhidden', id, temporarilyRemovedBuffer, 'temp');
    }
    for (let removedBuffer of data.RemovedBuffers) {
      this.emit('bufferview.bufferhidden', id, removedBuffer, 'perm');
    }
    this.emit('bufferview.orderchanged', id);
    this.emit('bufferview.init', id);
  }

  /**
   * @protected
   */
  handleStructSyncNetwork(id, functionName, [ data ]) {
    const network = this.networks.get(id);
    let nick, oldNick;
    if (!network) {
      logger('Uninitialized network %d. Ignoring %s', id, functionName);
      return;
    }
    switch (functionName) {
    case 'addIrcUser':
      network.addUser(new IRCUser(data));
      [ nick ] = data.split('!');
      this.core.sendInitRequest('IrcUser',  `${id}/${nick}`);
      break;
    case 'addIrcChannel':
      if (network.buffers.has(data)) {
        this.emit('network.addbuffer', id, network.buffers.get(data).id);
      } else {
        const ircbuffer = new IRCBuffer({ name: data, network: id });
        this.networks.get(ircbuffer.network).buffers.add(ircbuffer);
        this.emit('network.addbuffer', id, data);
      }
      this.core.sendInitRequest('IrcChannel', `${id}/${data}`);
      break;
    case 'setConnectionState':
      network.connectionState = data;
      this.emit('network.connectionstate', id, data);
      break;
    case 'setLatency':
      network.latency = data;
      this.emit('network.latency', id, data);
      break;
    case 'setConnected':
      network.isConnected = data;
      this.emit(data ? 'network.connected' : 'network.disconnected', id);
      break;
    case 'setMyNick':
      oldNick = network.nick;
      network.nick = data;
      network.renameUser(oldNick, data);
      this.emit('network.userrenamed', id, oldNick, data);
      this.emit('network.mynick', id, data);
      break;
    case 'setNetworkName':
      network.networkName = data;
      this.emit('network.networkname', id, data);
      break;
    case 'setCurrentServer':
      network.currentServer = data;
      this.emit('network.server', id, data);
      break;
    case 'setServerList':
      network.ServerList = data;
      this.emit('network.serverlist', id, data);
      break;
    case 'setCodecForDecoding':
      network.codecForDecoding = data;
      this.emit('network.codec.decoding', id, data);
      break;
    case 'setCodecForEncoding':
      network.codecForEncoding = data;
      this.emit('network.codec.encoding', id, data);
      break;
    case 'setCodecForServer':
      network.codecForServer = data;
      this.emit('network.codec.server', id, data);
      break;
    case 'setPerform':
      network.perform = data;
      this.emit('network.perform', id, data);
      break;
    case 'setIdentity':
      network.identityId = data;
      this.emit('network.identity', id, data);
      break;
    case 'setAutoReconnectInterval':
      network.autoReconnectInterval = data;
      this.emit('network.autoreconnect.interval', id, data);
      break;
    case 'setAutoReconnectRetries':
      network.autoReconnectRetries = data;
      this.emit('network.autoreconnect.retries', id, data);
      break;
    case 'setAutoIdentifyService':
      network.autoIdentifyService = data;
      this.emit('network.autoidentify.service', id, data);
      break;
    case 'setAutoIdentifyPassword':
      network.autoIdentifyPassword = data;
      this.emit('network.autoidentify.password', id, data);
      break;
    case 'setUnlimitedReconnectRetries':
      network.unlimitedReconnectRetries = data;
      this.emit('network.unlimitedreconnectretries', id, data);
      break;
    case 'setUseSasl':
      network.useSasl = data;
      this.emit('network.usesasl', id, data);
      break;
    case 'setSaslAccount':
      network.saslAccount = data;
      this.emit('network.sasl.account', id, data);
      break;
    case 'setSaslPassword':
      network.saslPassword = data;
      this.emit('network.sasl.password', id, data);
      break;
    case 'setRejoinChannels':
      network.rejoinChannels = data;
      this.emit('network.rejoinchannels', id, data);
      break;
    case 'setUseCustomMessageRate':
      network.useCustomMessageRate = data;
      this.emit('network.usecustommessagerate', id, data);
      break;
    case 'setUnlimitedMessageRate':
      network.unlimitedMessageRate = data;
      this.emit('network.messagerate.unlimited', id, data);
      break;
    case 'setMessageRateDelay':
      network.msgRateMessageDelay = data;
      this.emit('network.messagerate.delay', id, data);
      break;
    case 'setMessageRateBurstSize':
      network.msgRateBurstSize = data;
      this.emit('network.messagerate.burstsize', id, data);
      break;
    default:
      logger('Unhandled Sync.Network %s', functionName);
    }
  }

  /**
   * @protected
   */
  handleStructSyncBufferSyncer(functionName, [ bufferId, data ]) {
    let bufferTo, bufferFrom;
    switch (functionName) {
    case 'markBufferAsRead':
      this.emit('buffer.read', bufferId);
      break;
    case 'setLastSeenMsg':
      // data is a messageId
      this.emit('buffer.lastseen', bufferId, data);
      break;
    case 'setMarkerLine':
      // data is a messageId
      this.emit('buffer.markerline', bufferId, data);
      break;
    case 'setBufferActivity':
      this.emit('buffer.activity', bufferId, data);
      break;
    case 'removeBuffer':
      this.networks.deleteBuffer(bufferId);
      this.emit('buffer.remove', bufferId);
      break;
    case 'renameBuffer':
      // data is the new name
      this.networks.getBuffer(bufferId).name = data;
      this.emit('buffer.rename', bufferId, data);
      break;
    case 'mergeBuffersPermanently':
      bufferTo = this.networks.getBuffer(bufferId);
      bufferFrom = this.networks.getBuffer(data);
      if (bufferTo && bufferFrom) {
        for (const [ key, val ] of bufferFrom.messages) {
          val.buffer = bufferTo;
          bufferTo.messages.set(key, val);
        }
      }
      this.networks.deleteBuffer(bufferFrom);
      this.emit('buffer.merge', bufferTo, bufferFrom);
      break;
    default:
      logger('Unhandled Sync.BufferSyncer %s', functionName);
    }
  }

  /**
   * @protected
   */
  handleStructSyncBufferViewManager(functionName, [ data ]) {
    switch (functionName) {
    case 'addBufferViewConfig':
      // data is a bufferViewId
      this.core.sendInitRequest('BufferViewConfig', String(data));
      break;
    default:
      logger('Unhandled Sync.BufferViewManager %s', functionName);
    }
  }

  /**
   * @protected
   */
  handleStructSyncBufferViewConfig(id, functionName, data) {
    const bufferView = this.bufferViews.get(id);
    if (!bufferView) {
      logger('Uninitialized bufferView %d. Ignoring %s', id, functionName);
      return;
    }
    switch (functionName) {
    case 'addBuffer':
      bufferView.addBuffer(...data);
      bufferView.unhide(data[0]);
      this.emit('bufferview.bufferunhide', id, data[0]);
      this.emit('bufferview.orderchanged', id);
      break;
    case 'removeBuffer':
      bufferView.setTemporarilyRemoved(data[0]);
      this.emit('bufferview.bufferhidden', id, data[0], 'temp');
      break;
    case 'removeBufferPermanently':
      bufferView.setPermanentlyRemoved(data[0]);
      this.emit('bufferview.bufferhidden', id, data[0], 'perm');
      break;
    case 'moveBuffer':
      bufferView.moveBuffer(...data);
      this.emit('bufferview.orderchanged', id);
      break;
    case 'setNetworkId':
      [ bufferView.networkId ] = data;
      this.emit('bufferview.networkid', id, bufferView.networkId);
      break;
    case 'setShowSearch':
      [ bufferView.showSearch ] = data;
      this.emit('bufferview.search', id, bufferView.showSearch);
      break;
    case 'setHideInactiveNetworks':
      [ bufferView.hideInactiveNetworks ] = data;
      this.emit('bufferview.hideinactivenetworks', id, bufferView.hideInactiveNetworks);
      break;
    case 'setHideInactiveBuffers':
      [ bufferView.hideInactiveBuffers ] = data;
      this.emit('bufferview.hideinactivebuffers', id, bufferView.hideInactiveBuffers);
      break;
    case 'setAllowedBufferTypes':
      [ bufferView.allowedBufferTypes ] = data;
      this.emit('bufferview.allowedbuffertypes', id, bufferView.allowedBufferTypes);
      break;
    case 'setAddNewBuffersAutomatically':
      [ bufferView.addNewBuffersAutomatically ] = data;
      this.emit('bufferview.addnewbuffersautomatically', id, bufferView.addNewBuffersAutomatically);
      break;
    case 'setMinimumActivity':
      [ bufferView.minimumActivity ] = data;
      this.emit('bufferview.minimumactivity', id, bufferView.minimumActivity);
      break;
    case 'setBufferViewName':
      [ bufferView.bufferViewName ] = data;
      this.emit('bufferview.bufferviewname', id, bufferView.bufferViewName);
      break;
    case 'setDisableDecoration':
      [ bufferView.disableDecoration ] = data;
      this.emit('bufferview.disabledecoration', id, bufferView.disableDecoration);
      break;
    case 'update':
      bufferView.update(data[0]);
      this.emit('bufferview.update', id, data[0]);
      break;
    default:
      logger('Unhandled Sync.BufferViewConfig %s', functionName);
    }
  }

  /**
   * @protected
   */
  handleStructSyncIrcUser(networkId, username, functionName, [ data ]) {
    const network = this.networks.get(networkId);
    let user, buffer, ids;
    if (!network) {
      logger('Uninitialized network %d. Ignoring %s', networkId, functionName);
      return;
    }
    switch (functionName) {
    case 'partChannel':
      // data is bufferName
      buffer = network.buffers.get(data);
      buffer.removeUser(username);
      this.emit('user.part', networkId, username, buffer.id);
      if (buffer.isChannel) {
        if (network.nick !== null && network.nick.toLowerCase() === username.toLowerCase()) {
          // We part
          buffer.active = false;
          this.emit('buffer.deactivate', buffer.id);
        }
      } else if (buffer.name === username) {
        buffer.active = false;
        this.emit('buffer.deactivate', buffer.id);
      }
      break;
    case 'quit':
      ids = network.deleteUser(username);
      for (let id of ids) {
        this.emit('buffer.deactivate', id);
      }
      this.emit('user.quit', networkId, username);
      break;
    case 'setNick':
      // Already handled by RPC call
      break;
    /*case "setServer":
      // TODO
      break;*/
    case 'setAway':
      // data is isAway
      user = network.getUser(username);
      if (user) {
        user.away = data;
        this.emit('user.away', networkId, username, data);
      }
      break;
    case 'setRealName':
      // data is realname
      user = network.getUser(username);
      if (user) {
        user.realname = data;
        this.emit('user.realname', networkId, username, data);
      }
      break;
    default:
      logger('Unhandled Sync.IrcUser %s', functionName);
    }
  }

  /**
   * @protected
   */
  handleStructSyncIrcChannel(networkId, buffername, functionName, data) {
    const network = this.networks.get(networkId);
    if (!network) {
      logger('Uninitialized network %d. Ignoring %s', networkId, functionName);
      return;
    }
    const buffer = network.buffers.get(buffername);
    if (!buffer) {
      logger('Uninitialized buffer %s. Ignoring %s', buffername, functionName);
      return;
    }
    let user, nick, mode;
    switch (functionName) {
    case 'joinIrcUsers':
      for (let i=0; i < data[0].length; i++) {
        user = network.getUser(data[0][i]); // nick
        buffer.addUser(user, data[1][i]); // modes
        this.emit('channel.join', buffer.id, data[0][i]);
      }
      break;
    case 'addUserMode':
      [ nick, mode ] = data;
      user = network.getUser(nick);
      buffer.addUserMode(user, mode);
      this.emit('channel.addusermode', buffer.id, nick, mode);
      break;
    case 'removeUserMode':
      [ nick, mode ] = data;
      user = network.getUser(nick);
      buffer.removeUserMode(user, mode);
      this.emit('channel.removeusermode', buffer.id, nick, mode);
      break;
    case 'setTopic':
      [ buffer.topic ] = data;
      this.emit('channel.topic', buffer.id, buffer.topic);
      break;
    default:
      logger('Unhandled Sync.IrcChannel %s', functionName);
    }
  }

  /**
   * @protected
   */
  handleStructSyncBacklogManager(functionName, [ bufferId, _first, _last, _maxAmount, _, data ]) {
    const messageIds = [];
    let buffer, network, identity, message;
    switch (functionName) {
    case 'receiveBacklog':
      buffer = this.networks.getBuffer(bufferId);
      network = this.networks.get(buffer.network);
      identity = this.identities.get(network.identityId);
      if (buffer) {
        for (let rawmessage of data) {
          message = buffer.addMessage(rawmessage);
          if (!message) {
            logger('Message %d already exists in buffer %d', rawmessage.id, buffer.id);
          } else {
            messageIds.push(message.id);
            message._updateFlags(network, identity, this.options.highlightmode);
          }
        }
        this.emit('buffer.backlog', bufferId, messageIds);
      } else {
        logger('Buffer %d does not exists.', bufferId);
      }
      break;
    default:
      logger('Unhandled Sync.BacklogManager %s', functionName);
    }
  }

  /**
   * @protected
   */
  handleStructSyncIgnoreListManager(functionName, [ data ]) {
    switch (functionName) {
    case 'update':
      this.ignoreList.import(data);
      this.emit('ignorelist', this.ignoreList);
      break;
    default:
      logger('Unhandled Sync.IgnoreListManager %s', functionName);
    }
  }

  /**
   * @protected
   */
  handleStructSyncIdentity(id, functionName, [ data ]) {
    const identity = this.identities.get(id);
    if (identity) {
      if (functionName.indexOf('set') === 0) {
        let key = functionName.substring(3);
        key = key.charAt(0).toLowerCase() + key.slice(1);
        identity[key] = data;
        this.emit(`identity.${key.toLowerCase()}`, id, data);
      } else {
        logger('Unhandled Sync.Identity %s', functionName);
      }
    } else {
      logger('Unknown Identity %d', id);
    }
  }

  /**
   * @protected
   */
  handleStructSyncAliasManager(functionName, [ data ]) {
    switch (functionName) {
    case 'update':
      this.aliases = alias.toArray(data);
      this.emit('aliases', this.aliases);
      break;
    default:
      logger('Unhandled Sync.AliasManager %s', functionName);
    }
  }

  /**
   * Setup core
   * @param {string} backend
   * @param {string} adminuser
   * @param {string} adminpassword
   * @param {Object} [properties={}]
   */
  setupCore(backend, adminuser, adminpassword, properties = {}) {
    this.core.setupCore(backend, adminuser, adminpassword, properties);
  }

  /**
   * Login to core
   */
  login() {
    this.loginCallback((user, password) => this.core.login(user, password));
  }

  /**
   * Connect to the core
   * @param {net.Duplex} duplex
   */
  connect(duplex) {
    this.core.init(duplex);
    this.core.connect();
  }

  /**
   * Disconnect the client from the core
   */
  disconnect() {
    clearInterval(this.heartbeatInterval);
    this.core.disconnect();
  }
}

/**
 * This event is fired when quasselcore information are received
 * @typedef {Event} Event:coreinfoinit
 * @property {Object} data
 * @property {boolean} data.Configured - Is the core configured
 * @property {number} data.CoreFeatures
 * @property {String} data.CoreInfo
 * @property {boolean} data.LoginEnabled
 * @property {boolean} data.MsgType - Is always "ClientInitAck"
 * @property {number} data.ProtocolVersion
 * @property {Array} [data.StorageBackends]
 * @property {boolean} data.SupportSsl
 * @property {boolean} data.SupportsCompression
 */
/**
 * This event is fired upon successful login
 * @typedef {Event} Event:login
 */
/**
 * This event is fired upon unsuccessful login
 * @typedef {Event} Event:loginfailed
 */
/**
 * This event is fired upon successful session initialization
 * @typedef {Event} Event:init
 * @property {Object} obj
 */
/**
 * This event is fired when {@link Identity} objects are first initialized
 * @typedef {Event} Event:identities.init
 * @property {Map<number, Identity>} identities
 */
/**
 * This event is fired when a buffer is added to a network
 * @typedef {Event} Event:network.addbuffer
 * @property {number} networkId
 * @property {number|String} bufferId
 */
/**
 * Network latency value
 * @typedef {Event} Event:network.latency
 * @property {number} networkId
 * @property {number} value
 */
/**
 * Network connection state
 * @typedef {Event} Event:network.connectionstate
 * @property {number} networkId
 * @property {number} connectionState
 */
/**
 * This event is fired when a network state is switched to connected
 * @typedef {Event} Event:network.connected
 * @property {number} networkId
 */
/**
 * This event is fired when a network state is switched to disconnected
 * @typedef {Event} Event:network.disconnected
 * @property {number} networkId
 */
/**
 * This event is fired when a user is renamed on a network
 * @typedef {Event} Event:network.userrenamed
 * @property {number} networkId
 * @property {String} oldNick
 * @property {String} nick
 */
/**
 * This event is fired when current connected user is renamed on a network
 * @typedef {Event} Event:network.mynick
 * @property {number} networkId
 * @property {String} nick
 */
/**
 * This event is fired when the name of a network changes
 * @typedef {Event} Event:network.networkname
 * @property {number} networkId
 * @property {String} networkName
 */
/**
 * This event is fired when the server on which a network is connected changes
 * @typedef {Event} Event:network.server
 * @property {number} networkId
 * @property {String} server
 */
/**
 * This event is fired when a network server list is updated
 * @typedef {Event} Event:network.serverlist
 * @property {number} networkId
 * @property {Object[]} serverlist
 */
/**
 * Fired when encoding for sent messages has changed
 * @typedef {Event} Event:network.codec.decoding
 * @property {number} networkId
 * @property {String} codec
 */
/**
 * Fired when encoding for received messages has changed
 * @typedef {Event} Event:network.codec.encoding
 * @property {number} networkId
 * @property {String} codec
 */
/**
 * Fired when server encoding has changed
 * @typedef {Event} Event:network.codec.server
 * @property {number} networkId
 * @property {String} codec
 */
/**
 * Fired when the list of commands to perform on connection to a server has changed
 * @typedef {Event} Event:network.perform
 * @property {number} networkId
 * @property {String[]} commands
 */
/**
 * Fired when the network identity changed
 * @typedef {Event} Event:network.identity
 * @property {number} networkId
 * @property {number} identityId
 */
/**
 * Fired when interval value for reconnecting to the network changed
 * @typedef {Event} Event:network.autoreconnect.interval
 * @property {number} networkId
 * @property {number} interval
 */
/**
 * Fired when retries value for reconnecting to the network changed
 * @typedef {Event} Event:network.autoreconnect.retries
 * @property {number} networkId
 * @property {number} retries
 */
/**
 * Fired when auto identify service changed
 * @typedef {Event} Event:network.autoidentify.service
 * @property {number} networkId
 * @property {String} service
 */
/**
 * Fired when auto identify service password changed
 * @typedef {Event} Event:network.autoidentify.password
 * @property {number} networkId
 * @property {String} password
 */
/**
 * Fired when Unlimited reconnect retries value has changed
 * @typedef {Event} Event:network.unlimitedreconnectretries
 * @property {number} networkId
 * @property {boolean} unlimitedreconnectretries
 */
/**
 * Fired when Use Sasl value has changed
 * @typedef {Event} Event:network.usesasl
 * @property {number} networkId
 * @property {boolean} usesasl
 */
/**
 * Fired when Sasl account has changed
 * @typedef {Event} Event:network.sasl.account
 * @property {number} networkId
 * @property {String} account
 */
/**
 * Fired when Sasl account password has changed
 * @typedef {Event} Event:network.sasl.password
 * @property {number} networkId
 * @property {String} password
 */
/**
 * Fired when Rejoin Channels value has changed
 * @typedef {Event} Event:network.rejoinchannels
 * @property {number} networkId
 * @property {boolean} rejoinchannels
 */
/**
 * Fired when Use Custom Message Rate value has changed
 * @typedef {Event} Event:network.usecustommessagerate
 * @property {number} networkId
 * @property {boolean} usecustommessagerate
 */
/**
 * Fired when Unlimited Message Rate Burst Size value has changed
 * @typedef {Event} Event:network.messagerate.unlimited
 * @property {number} networkId
 * @property {boolean} unlimited
 */
/**
 * Fired when Message Rate Burst Size value has changed
 * @typedef {Event} Event:network.messagerate.burstsize
 * @property {number} networkId
 * @property {number} burstsize
 */
/**
 * Fired when Message Rate Delay value has changed
 * @typedef {Event} Event:network.messagerate.delay
 * @property {number} networkId
 * @property {number} delay
 */
/**
 * Buffer has been marked as read
 * @typedef {Event} Event:buffer.read
 * @property {number} bufferId
 */
/**
 * Buffer's last seen message updated
 * @typedef {Event} Event:buffer.lastseen
 * @property {number} bufferId
 * @property {number} messageId
 */
/**
 * Buffer's markeline attached to a message
 * @typedef {Event} Event:buffer.markerline
 * @property {number} bufferId
 * @property {number} messageId
 */
/**
 * Buffer's activity which represents all unread message types for this buffer
 * @typedef {Event} Event:buffer.activity
 * @property {number} bufferId
 * @property {number} unreadTypes
 */
/**
 * Buffer has been removed
 * @typedef {Event} Event:buffer.remove
 * @property {number} bufferId
 */
/**
 * Buffer has been renamed
 * @typedef {Event} Event:buffer.rename
 * @property {number} bufferId
 */
/**
 * bufferId2 has been merged into bufferId1
 * @typedef {Event} Event:buffer.merge
 * @property {number} bufferId1
 * @property {number} bufferId2
 */
/**
 * Buffer's hidden state removed
 * @typedef {Event} Event:bufferview.bufferunhide
 * @property {number} bufferViewId
 * @property {number} bufferId
 */
/**
 * Buffer's hidden state set
 * @typedef {Event} Event:bufferview.bufferhidden
 * @property {number} bufferViewId
 * @property {number} bufferId
 * @property {String} type Either "temp" or "perm"
 */
/**
 * Buffer set as inactive
 * @typedef {Event} Event:buffer.deactivate
 * @property {number} bufferId
 */
/**
 * User has left a channel
 * @typedef {Event} Event:user.part
 * @property {number} networkId
 * @property {String} nick
 * @property {number} bufferId
 */
/**
 * User has left a network
 * @typedef {Event} Event:user.quit
 * @property {number} networkId
 * @property {String} nick
 */
/**
 * User away state changed
 * @typedef {Event} Event:user.away
 * @property {number} networkId
 * @property {String} nick
 * @property {boolean} isAway
 */
/**
 * User realname changed
 * @typedef {Event} Event:user.realname
 * @property {number} networkId
 * @property {String} nick
 * @property {String} realname
 */
/**
 * User joined a channel
 * @typedef {Event} Event:channel.join
 * @property {number} bufferId
 * @property {String} nick
 */
/**
 * User mode has been added
 * @typedef {Event} Event:channel.addusermode
 * @property {number} bufferId
 * @property {String} nick
 * @property {String} mode
 */
/**
 * User mode has been removed
 * @typedef {Event} Event:channel.removeusermode
 * @property {number} bufferId
 * @property {String} nick
 * @property {String} mode
 */
/**
 * Channel topic changed
 * @typedef {Event} Event:channel.topic
 * @property {number} bufferId
 * @property {String} topic
 */
/**
 * Core information
 * @typedef {Event} Event:coreinfo
 * @property {Object} data
 */
/**
 * {@link IRCBuffer} activated
 * @typedef {Event} Event:buffer.activate
 * @property {number} bufferId
 */
/**
 * Backlogs received
 * @typedef {Event} Event:buffer.backlog
 * @property {number} bufferId
 * @property {number[]} messageIds
 */
/**
 * {@link IRCMessage} received on a buffer
 * @typedef {Event} Event:buffer.message
 * @property {number} bufferId
 * @property {number} messageId
 */
/**
 * Buffers order changed
 * @typedef {Event} Event:bufferview.orderchanged
 * @property {number} bufferViewId
 */
/**
 * {@link BufferView} manager init request received
 * @typedef {Event} Event:bufferview.ids
 * @property {number[]} ids
 */
/**
 * {@link BufferView} initialized
 * @typedef {Event} Event:bufferview.init
 * @property {number} bufferViewId
 */
/**
 * {@link BufferView} networkId updated
 * @typedef {Event} Event:bufferview.networkid
 * @property {number} bufferViewId
 * @property {number} networkId
 */
/**
 * {@link BufferView} search updated
 * @typedef {Event} Event:bufferview.search
 * @property {number} bufferViewId
 * @property {boolean} search
 */
/**
 * {@link BufferView} hideInactiveNetworks updated
 * @typedef {Event} Event:bufferview.hideinactivenetworks
 * @property {number} bufferViewId
 * @property {boolean} hideinactivenetworks
 */
/**
 * {@link BufferView} hideInactiveBuffers updated
 * @typedef {Event} Event:bufferview.hideinactivebuffers
 * @property {number} bufferViewId
 * @property {boolean} hideinactivebuffers
 */
/**
 * {@link BufferView} allowedBufferTypes updated
 * @typedef {Event} Event:bufferview.allowedbuffertypes
 * @property {number} bufferViewId
 * @property {number} allowedbuffertypes
 */
/**
 * {@link BufferView} addNewBuffersAutomatically updated
 * @typedef {Event} Event:bufferview.addnewbuffersautomatically
 * @property {number} bufferViewId
 * @property {boolean} addnewbuffersautomatically
 */
/**
 * {@link BufferView} minimumActivity updated
 * @typedef {Event} Event:bufferview.minimumactivity
 * @property {number} bufferViewId
 * @property {boolean} minimumactivity
 */
/**
 * {@link BufferView} bufferViewName updated
 * @typedef {Event} Event:bufferview.bufferviewname
 * @property {number} bufferViewId
 * @property {String} bufferviewname
 */
/**
 * {@link BufferView} disableDecoration updated
 * @typedef {Event} Event:bufferview.disabledecoration
 * @property {number} bufferViewId
 * @property {boolean} disabledecoration
 */
/**
 * {@link BufferView} object updated
 * @typedef {Event} Event:bufferview.update
 * @property {number} bufferViewId
 * @property {object} data
 */
/**
 * {@link IgnoreList} updated
 * @typedef {Event} Event:ignorelist
 */
/**
 * {@link Identity} updated
 * @typedef {Event} Event:identity
 */
/**
 * New {@link Identity} created
 * @typedef {Event} Event:identity.new
 * @property {number} identityId
 */
/**
 * {@link Identity} removed
 * @typedef {Event} Event:identity.remove
 * @property {number} identityId
 */
/**
 * User connected to the {@link Network}
 * @typedef {Event} Event:network.adduser
 * @property {number} networkId
 * @property {String} nick
 */
/**
 * New {@link Network} created
 * @typedef {Event} Event:network.new
 * @property {number} networkId
 */
/**
 * {@link Network} removed
 * @typedef {Event} Event:network.remove
 * @property {number} networkId
 */
/**
 * {@link Network} is ready
 * @typedef {Event} Event:network.init
 * @property {number} networkId
 */
/**
 * Aliases updated
 * @typedef {Event} Event:aliases
 */
/**
 * This event is fired when the core needs to be setup
 * @typedef {Event} Event:setup
 * @property {Object[]} backends - List of available storage backends
 * @property {String} backends[].DisplayName - Storage backends name
 * @property {String} backends[].Description - Storage backends description
 * @property {String[]} backends[].SetupKeys - Keys that will need a corresponding value to configure chosen storage backend
 * @property {Object} backends[].SetupDefaults - Defaults values for corresponding SetupKeys
 */
/**
 * This event is fired if the setup of the core was successful
 * @typedef {Event} Event:setupok
 */
/**
 * This event is fired if the setup of the core has failed
 * @typedef {Event} Event:setupfailed
 * @property {Object} error - The reason of the failure
 */
/**
 * This event is fired if an unhandled message is received
 * @typedef {Event} Event:unhandled
 * @property {Object} obj
 */
/**
 * An error occured
 * @typedef {Event} Event:error
 * @property {Object} error
 */

function splitOnce(str, character) {
  const i = str.indexOf(character);
  return [ str.slice(0, i), str.slice(i+1) ];
}
