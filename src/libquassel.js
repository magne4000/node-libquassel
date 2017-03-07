/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2017 Joël Charles
 * Licensed under the MIT license.
 */

/** @module libquassel */

require('./usertypes'); // register usertypes first
const { EventEmitter } = require('events');
const { Types: RequestTypes } = require('./request');
const { NetworkCollection } = require('./network');
const { IRCBuffer } = require('./buffer');
const IRCUser = require('./user');
const Identity = require('./identity');
const { Core } = require('./request');
const BufferView = require('./bufferview');
const alias = require('./alias');
const { Types: MessageTypes, HighlightModes } = require('./message');
const ignore = require('./ignore');
const logger = require('debug')('libquassel:main');

/**
 * @alias module:libquassel~Quassel.Features
 * @readonly
 * @enum {number}
 * @default
 */
const Features = {
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
 * This callback is used by Quassel at login phase
 * @callback module:libquassel~Quassel~loginCallback
 * @param {function} next - callback with 2 parameters: user and password; must be called at the end of this callback
 * @example
 * function(next) {
 *   var user = source.getUser();
 *   var password = source.getPassword();
 *   next(user, password);
 * }
 */

/**
 * Main class to interact with Quassel instance. It extends {@link https://nodejs.org/api/events.html#events_class_eventemitter|EventEmitter}
 * @class
 * @extends {EventEmitter}
 * @param {Object} [options] Allows optionnal parameters
 * @param {number} [options.initialbackloglimit=options.backloglimit] number of backlogs to request per buffer at connection
 * @param {number} [options.backloglimit=100] number of backlogs to request per buffer after connection
 * @param {boolean} [options.securecore=true] Use SSL to connect to the core (if the core allows it)
 * @param {module:libquassel~Quassel.HighlightModes} [options.highlightmode=0x02] Choose how highlights on nicks works. Defaults to only highlight a message if current nick is present.
 * @param {module:libquassel~Quassel~loginCallback} loginCallback
 * @example
 * //FIXME
 * var quassel = new Quassel("localhost", 4242, {}, function(next) {
 *   next("user", "password");
 * });
 * quassel.connect();
 */
class Client extends EventEmitter {
  constructor(loginCallback, options = {}) {
    super();
    /** @member {Object} options */
    this.options = {};
    this.options.backloglimit = parseInt(options.backloglimit || 100, 10);
    this.options.initialbackloglimit = parseInt(options.initialbackloglimit || this.options.backloglimit, 10);
    this.options.highlightmode = (typeof options.highlightmode === 'number') ? options.highlightmode : HighlightModes.CURRENTNICK;
    /** @member {?module:request.Request} */
    this.core = new Core(this.options);
    /** @member {module:network.NetworkCollection} */
    this.networks = new NetworkCollection();
    /** @member {Map.<number, module:identity>} */
    this.identities = new Map();
    /** @member {module:ignore.IgnoreList} */
    this.ignoreList = new ignore.IgnoreList();
    /** @member {Map.<string, string>} */
    this.aliases = new Map();
    /** @member {Map.<number, module:bufferview>} */
    this.bufferViews = new Map();
    /** @member {?number} */
    this.heartbeatInterval = null;
    /** @member {boolean} */
    this.useSSL = false;
    /** @member {boolean} */
    this.useCompression = false;
    /** @member {?boolean} */
    this.connected = null;
    /** @member {?Object} */
    this.coreInfo = null;
    /** @member {?Object} */
    this.coreData = null;
    /** @member {module:libquassel~Quassel~loginCallback} */
    this.loginCallback = loginCallback;

    if (typeof loginCallback !== 'function') {
      throw new Error('loginCallback parameter is mandatory and must be a function');
    }

    this.core.on('data', data => this.dispatch(data));
  }

  /**
   * Handles quasselcore messages that possesses a `MsgType` attribute
   * @param {Object} obj
   * @fires module:libquassel~Quassel#event:"coreinfoinit"
   * @fires module:libquassel~Quassel#event:"login"
   * @fires module:libquassel~Quassel#event:"loginfailed"
   * @fires module:libquassel~Quassel#event:"network.addbuffer"
   * @fires module:libquassel~Quassel#event:"init"
   * @fires module:libquassel~Quassel#event:"setup"
   * @fires module:libquassel~Quassel#event:"setupok"
   * @fires module:libquassel~Quassel#event:"setupfailed"
   * @fires module:libquassel~Quassel#event:"identities.init"
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
    }
  }

  handleClientInitAck(obj) {
    this.coreInfo = obj;
    this.emit('coreinfoinit', obj);
    if (!obj.Configured) {
      this.emit('setup', obj.StorageBackends);
    } else if (obj.LoginEnabled) {
      this.login();
    } else {
      this.emit('error', new Error('Your core is not supported'));
    }
  }

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
        this.core.backlog(bufferInfo.id);
      }
    }
    // Init Identities
    for (let identity of obj.SessionState.Identities) {
      this.identities.set(new Identity(identity));
    }
    this.emit('identities.init', this.identities);
    this.core.sendInitRequest('BufferSyncer');
    this.core.sendInitRequest('BufferViewManager');
    this.core.sendInitRequest('IgnoreListManager');
    this.core.sendInitRequest('AliasManager');
    this.heartbeatInterval = setInterval(() => {
      this.core.heartBeat();
    }, 30000);
  }

  /**
   * Returns `true` if the core supports the given feature
   * @example
   * quassel.supports(Features.PASSWORDCHANGE);
   * @param {module:libquassel~Quassel.Features} feature
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
   * Affects obj to corresponding {@link module:network.Network}
   * @param {Object} obj
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
   * @param {Object} obj - quasselcore message decoded by qtdatasteam
   * @fires module:libquassel~Quassel#event:"coreinfo"
   * @fires module:libquassel~Quassel#event:"network.init"
   * @fires module:libquassel~Quassel#event:"network.latency"
   * @fires module:libquassel~Quassel#event:"network.connectionstate"
   * @fires module:libquassel~Quassel#event:"network.addbuffer"
   * @fires module:libquassel~Quassel#event:"network.connected"
   * @fires module:libquassel~Quassel#event:"network.disconnected"
   * @fires module:libquassel~Quassel#event:"network.userrenamed"
   * @fires module:libquassel~Quassel#event:"network.mynick"
   * @fires module:libquassel~Quassel#event:"network.networkname"
   * @fires module:libquassel~Quassel#event:"network.server"
   * @fires module:libquassel~Quassel#event:"network.serverlist"
   * @fires module:libquassel~Quassel#event:"network.adduser"
   * @fires module:libquassel~Quassel#event:"network.new"
   * @fires module:libquassel~Quassel#event:"network.remove"
   * @fires module:libquassel~Quassel#event:"network.codec.decoding"
   * @fires module:libquassel~Quassel#event:"network.codec.encoding"
   * @fires module:libquassel~Quassel#event:"network.codec.server"
   * @fires module:libquassel~Quassel#event:"network.perform"
   * @fires module:libquassel~Quassel#event:"network.identity"
   * @fires module:libquassel~Quassel#event:"network.autoreconnect.interval"
   * @fires module:libquassel~Quassel#event:"network.autoreconnect.retries"
   * @fires module:libquassel~Quassel#event:"network.autoidentify.service"
   * @fires module:libquassel~Quassel#event:"network.autoidentify.password"
   * @fires module:libquassel~Quassel#event:"network.unlimitedreconnectretries"
   * @fires module:libquassel~Quassel#event:"network.usesasl"
   * @fires module:libquassel~Quassel#event:"network.sasl.account"
   * @fires module:libquassel~Quassel#event:"network.sasl.password"
   * @fires module:libquassel~Quassel#event:"network.rejoinchannels"
   * @fires module:libquassel~Quassel#event:"network.usecustommessagerate"
   * @fires module:libquassel~Quassel#event:"network.messagerate.unlimited"
   * @fires module:libquassel~Quassel#event:"network.messagerate.delay"
   * @fires module:libquassel~Quassel#event:"network.messagerate.burstsize"
   * @fires module:libquassel~Quassel#event:"buffer.read"
   * @fires module:libquassel~Quassel#event:"buffer.lastseen"
   * @fires module:libquassel~Quassel#event:"buffer.markerline"
   * @fires module:libquassel~Quassel#event:"buffer.remove"
   * @fires module:libquassel~Quassel#event:"buffer.rename"
   * @fires module:libquassel~Quassel#event:"buffer.merge"
   * @fires module:libquassel~Quassel#event:"buffer.deactivate"
   * @fires module:libquassel~Quassel#event:"buffer.activate"
   * @fires module:libquassel~Quassel#event:"buffer.backlog"
   * @fires module:libquassel~Quassel#event:"buffer.message"
   * @fires module:libquassel~Quassel#event:"buffer.order"
   * @fires module:libquassel~Quassel#event:"bufferview.ids"
   * @fires module:libquassel~Quassel#event:"bufferview.bufferunhide"
   * @fires module:libquassel~Quassel#event:"bufferview.bufferhidden"
   * @fires module:libquassel~Quassel#event:"bufferview.orderchanged"
   * @fires module:libquassel~Quassel#event:"bufferview.init"
   * @fires module:libquassel~Quassel#event:"bufferview.networkid"
   * @fires module:libquassel~Quassel#event:"bufferview.search"
   * @fires module:libquassel~Quassel#event:"bufferview.hideinactivenetworks"
   * @fires module:libquassel~Quassel#event:"bufferview.hideinactivebuffers"
   * @fires module:libquassel~Quassel#event:"bufferview.allowedbuffertypes"
   * @fires module:libquassel~Quassel#event:"bufferview.addnewbuffersautomatically"
   * @fires module:libquassel~Quassel#event:"bufferview.minimumactivity"
   * @fires module:libquassel~Quassel#event:"bufferview.bufferviewname"
   * @fires module:libquassel~Quassel#event:"bufferview.disabledecoration"
   * @fires module:libquassel~Quassel#event:"bufferview.update"
   * @fires module:libquassel~Quassel#event:"user.part"
   * @fires module:libquassel~Quassel#event:"user.quit"
   * @fires module:libquassel~Quassel#event:"user.away"
   * @fires module:libquassel~Quassel#event:"user.realname"
   * @fires module:libquassel~Quassel#event:"channel.join"
   * @fires module:libquassel~Quassel#event:"channel.addusermode"
   * @fires module:libquassel~Quassel#event:"channel.removeusermode"
   * @fires module:libquassel~Quassel#event:"channel.topic"
   * @fires module:libquassel~Quassel#event:"ignorelist"
   * @fires module:libquassel~Quassel#event:"identity"
   * @fires module:libquassel~Quassel#event:"identity.new"
   * @fires module:libquassel~Quassel#event:"identity.remove"
   * @fires module:libquassel~Quassel#event:"aliases"
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
      logger('Unhandled RequestType %s', obj[0]);
    }
  }

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

  handleStructRpcCallDisplayMsg([ message ]) {
    const network = this.networks.get(message.bufferInfo.network);
    if (network) {
      const identity = this.identities.get(network.identityId);
      let buffer = network.buffers.get(message.bufferInfo.id);
      if (!buffer) {
        buffer = network.buffers.get(message.bufferInfo.name);
        if (buffer) {
          // TODO move this in BufferCollection
          buffer.update(message.bufferInfo);
          network.buffers.move(buffer, message.bufferInfo.id);
        } else {
          // TODO Create buffer ?
        }
      }
      if (message.type === MessageTypes.NETSPLITJOIN) {
        // TODO
      } else if (message.type === MessageTypes.NETSPLITQUIT) {
        // TODO
      }

      if (buffer) {
        const simpleMessage = buffer.addMessage(message);
        if (simpleMessage) {
          simpleMessage._updateFlags(network, identity, this.options.highlightmode);
          this.emit('buffer.message', message.bufferInfo.id, simpleMessage.id);
        }
      } else {
        logger('Buffer %s does not exists', message.bufferInfo.name);
      }
    } else {
      logger('Network %d does not exists', message.bufferInfo.network);
    }
  }

  handleStructRpcCall__objectRenamed__([ renamedSubject, oldSubject, newSubject ]) {
    renamedSubject = renamedSubject.toString();
    let networkId, newNick, oldNick;
    switch (renamedSubject) {
    case 'IrcUser':
      [ networkId, newNick ] = splitOnce(oldSubject, '/'); // 1/Nick
      [ , oldNick ] = splitOnce(newSubject, '/'); // 1/Nick_
      this.networks.get(networkId).renameUser(oldNick, newNick);
      this.emit('network.userrenamed', networkId, oldNick, newNick);
      break;
    default:
      logger('Unhandled RpcCall.__objectRenamed__ %s', renamedSubject);
    }
  }

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

  handleStructInitDataBufferSyncer(data) {
    const { MarkerLines: markerLinesData, LastSeenMsg: lastSeenData } = data;
    if (lastSeenData) {
      for (let i=0; i<lastSeenData.length; i+=2) {
        let bufferId = lastSeenData[i];
        let messageId = lastSeenData[i+1];
        if (this.networks.hasBuffer(bufferId)) {
          this.emit('buffer.lastseen', bufferId, messageId);
        } else {
          logger('Buffer #%d does not exists', bufferId);
        }
      }
    }
    if (markerLinesData) {
      for (let i=0; i<markerLinesData.length; i+=2) {
        let bufferId = markerLinesData[i];
        let messageId = markerLinesData[i+1];
        if (this.networks.hasBuffer(bufferId)) {
          this.emit('buffer.markerline', bufferId, messageId);
        } else {
          logger('Buffer #%d does not exists', bufferId);
        }
      }
    }
  }

  handleStructInitDataIrcChannel(id, data) {
    let [ networkId, bufferName ] = splitOnce(id, '/');
    networkId = parseInt(networkId, 10);
    const buffer = this.networks.get(networkId).buffers.get(bufferName);
    buffer.topic = data.topic;
    buffer.isActive = true;
    this.emit('channel.topic', networkId, bufferName, data.topic);
    this.emit('buffer.activate', buffer.id);
  }

  handleStructInitDataIrcUser(id, data) {
    let [ networkId, nick ] = splitOnce(id, '/');
    networkId = parseInt(networkId, 10);
    const user = this.networks.get(networkId).getUser(nick);
    if (user) {
      user.update(data);
      this.emit('network.adduser', networkId, nick);
    }
  }

  handleStructInitDataBufferViewConfig(id, data) {
    id = parseInt(id, 10);
    this.bufferViews.set(id, new BufferView(id, data));
    for (let temporarilyRemovedBuffer in data.TemporarilyRemovedBuffers) {
      this.emit('bufferview.bufferhidden', id, temporarilyRemovedBuffer, 'temp');
    }
    for (let removedBuffer in data.RemovedBuffers) {
      this.emit('bufferview.bufferhidden', id, removedBuffer, 'perm');
    }
    this.emit('bufferview.orderchanged', id);
    this.emit('bufferview.init', id);
  }

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

  handleStructSyncBacklogManager(functionName, [ bufferId, _first, _last, _maxAmount, _, data ]) {
    const messageIds = [];
    let buffer, network, identity;
    switch (functionName) {
    case 'receiveBacklog':
      buffer = this.networks.getBuffer(bufferId);
      network = this.networks.get(buffer.network);
      identity = this.identities.get(network.identityId);
      if (buffer) {
        for (let message of data) {
          message = buffer.addMessage(message);
          if (!message) {
            logger('Message %d already exists in buffer %d', message.id, buffer.id);
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

  handleStructSyncIdentity(id, functionName, [ data ]) {
    const identity = this.identities.get(id);
    if (identity) {
      if (functionName.indexOf('set') === 0) {
        let key = functionName.substring(3);
        key[0] = key[0].toLowerCase();
        identity[key] = data;
        this.emit(`identity.${key.toLowerCase()}`, id, data);
      } else {
        logger('Unhandled Sync.Identity %s', functionName);
      }
    } else {
      logger('Unknown Identity %d', id);
    }
  }

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
   * Sends a request to quasselcore to fetch initial backlogs for all buffers
   * @param {number} limit
   */
  backlogs(limit = undefined){
    for (let network of this.networks) {
      for (let buffer of network.buffers) {
        this.core.backlog(buffer.id, -1, -1, limit);
      }
    }
  }

  /**
   * Setup core
   * @param {String} backend
   * @param {String} adminuser
   * @param {String} adminpassword
   * @param {Object} [properties]
   */
  setupCore(backend, adminuser, adminpassword, properties = {}) {
    this.core.setupCore(backend, adminuser, adminpassword, this.useSSL, properties);
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
 * @event module:libquassel~Quassel#event:"coreinfoinit"
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
 * @event module:libquassel~Quassel#event:"login"
 */
/**
 * This event is fired upon unsuccessful login
 * @event module:libquassel~Quassel#event:"loginfailed"
 */
/**
 * This event is fired upon successful session initialization
 * @event module:libquassel~Quassel#event:"init"
 * @property {Object} obj
 */
/**
 * This event is fired when {@link module:identity} objects are first initialized
 * @event module:libquassel~Quassel#event:"identities.init"
 * @property {Map.<number, module:identity>}
 */
/**
 * This event is fired when a buffer is added to a network
 * @event module:libquassel~Quassel#event:"network.addbuffer"
 * @property {number} networkId
 * @property {(number|String)} bufferId
 */
/**
 * Network latency value
 * @event module:libquassel~Quassel#event:"network.latency"
 * @property {number} networkId
 * @property {number} value
 */
/**
 * Network connection state
 * @event module:libquassel~Quassel#event:"network.connectionstate"
 * @property {number} networkId
 * @property {number} connectionState
 */
/**
 * This event is fired when a network state is switched to connected
 * @event module:libquassel~Quassel#event:"network.connected"
 * @property {number} networkId
 */
/**
 * This event is fired when a network state is switched to disconnected
 * @event module:libquassel~Quassel#event:"network.disconnected"
 * @property {number} networkId
 */
/**
 * This event is fired when a user is renamed on a network
 * @event module:libquassel~Quassel#event:"network.userrenamed"
 * @property {number} networkId
 * @property {String} oldNick
 * @property {String} nick
 */
/**
 * This event is fired when current connected user is renamed on a network
 * @event module:libquassel~Quassel#event:"network.mynick"
 * @property {number} networkId
 * @property {String} nick
 */
/**
 * This event is fired when the name of a network changes
 * @event module:libquassel~Quassel#event:"network.networkname"
 * @property {number} networkId
 * @property {String} networkName
 */
/**
 * This event is fired when the server on which a network is connected changes
 * @event module:libquassel~Quassel#event:"network.server"
 * @property {number} networkId
 * @property {String} server
 */
/**
 * This event is fired when a network server list is updated
 * @event module:libquassel~Quassel#event:"network.serverlist"
 * @property {number} networkId
 * @property {Object[]} serverlist
 */
/**
 * Fired when encoding for sent messages has changed
 * @event module:libquassel~Quassel#event:"network.codec.decoding"
 * @property {number} networkId
 * @property {String} codec
 */
/**
 * Fired when encoding for received messages has changed
 * @event module:libquassel~Quassel#event:"network.codec.encoding"
 * @property {number} networkId
 * @property {String} codec
 */
/**
 * Fired when server encoding has changed
 * @event module:libquassel~Quassel#event:"network.codec.server"
 * @property {number} networkId
 * @property {String} codec
 */
/**
 * Fired when the list of commands to perform on connection to a server has changed
 * @event module:libquassel~Quassel#event:"network.perform"
 * @property {number} networkId
 * @property {String[]} commands
 */
/**
 * Fired when the network identity changed
 * @event module:libquassel~Quassel#event:"network.identity"
 * @property {number} networkId
 * @property {number} identityId
 */
/**
 * Fired when interval value for reconnecting to the network changed
 * @event module:libquassel~Quassel#event:"network.autoreconnect.interval"
 * @property {number} networkId
 * @property {number} interval
 */
/**
 * Fired when retries value for reconnecting to the network changed
 * @event module:libquassel~Quassel#event:"network.autoreconnect.retries"
 * @property {number} networkId
 * @property {number} retries
 */
/**
 * Fired when auto identify service changed
 * @event module:libquassel~Quassel#event:"network.autoidentify.service"
 * @property {number} networkId
 * @property {String} service
 */
/**
 * Fired when auto identify service password changed
 * @event module:libquassel~Quassel#event:"network.autoidentify.password"
 * @property {number} networkId
 * @property {String} password
 */
/**
 * Fired when Unlimited reconnect retries value has changed
 * @event module:libquassel~Quassel#event:"network.unlimitedreconnectretries"
 * @property {number} networkId
 * @property {boolean} unlimitedreconnectretries
 */
/**
 * Fired when Use Sasl value has changed
 * @event module:libquassel~Quassel#event:"network.usesasl"
 * @property {number} networkId
 * @property {boolean} usesasl
 */
/**
 * Fired when Sasl account has changed
 * @event module:libquassel~Quassel#event:"network.sasl.account"
 * @property {number} networkId
 * @property {String} account
 */
/**
 * Fired when Sasl account password has changed
 * @event module:libquassel~Quassel#event:"network.sasl.password"
 * @property {number} networkId
 * @property {String} password
 */
/**
 * Fired when Rejoin Channels value has changed
 * @event module:libquassel~Quassel#event:"network.rejoinchannels"
 * @property {number} networkId
 * @property {boolean} rejoinchannels
 */
/**
 * Fired when Use Custom Message Rate value has changed
 * @event module:libquassel~Quassel#event:"network.usecustommessagerate"
 * @property {number} networkId
 * @property {boolean} usecustommessagerate
 */
/**
 * Fired when Unlimited Message Rate Burst Size value has changed
 * @event module:libquassel~Quassel#event:"network.messagerate.unlimited"
 * @property {number} networkId
 * @property {boolean} unlimited
 */
/**
 * Fired when Message Rate Burst Size value has changed
 * @event module:libquassel~Quassel#event:"network.messagerate.burstsize"
 * @property {number} networkId
 * @property {number} burstsize
 */
/**
 * Fired when Message Rate Delay value has changed
 * @event module:libquassel~Quassel#event:"network.messagerate.delay"
 * @property {number} networkId
 * @property {number} delay
 */
/**
 * Buffer has been marked as read
 * @event module:libquassel~Quassel#event:"buffer.read"
 * @property {number} bufferId
 */
/**
 * Buffer's last seen message updated
 * @event module:libquassel~Quassel#event:"buffer.lastseen"
 * @property {number} bufferId
 * @property {number} messageId
 */
/**
 * Buffer's markeline attached to a message
 * @event module:libquassel~Quassel#event:"buffer.markerline"
 * @property {number} bufferId
 * @property {number} messageId
 */
/**
 * Buffer has been removed
 * @event module:libquassel~Quassel#event:"buffer.remove"
 * @property {number} bufferId
 */
/**
 * Buffer has been renamed
 * @event module:libquassel~Quassel#event:"buffer.rename"
 * @property {number} bufferId
 */
/**
 * bufferId2 has been merged into bufferId1
 * @event module:libquassel~Quassel#event:"buffer.merge"
 * @property {number} bufferId1
 * @property {number} bufferId2
 */
/**
 * Buffer's hidden state removed
 * @event module:libquassel~Quassel#event:"bufferview.bufferunhide"
 * @property {number} bufferViewId
 * @property {number} bufferId
 */
/**
 * Buffer's hidden state set
 * @event module:libquassel~Quassel#event:"bufferview.bufferhidden"
 * @property {number} bufferViewId
 * @property {number} bufferId
 * @property {String} type - Either "temp" or "perm"
 */
/**
 * Buffer set as inactive
 * @event module:libquassel~Quassel#event:"buffer.deactivate"
 * @property {number} bufferId
 */
/**
 * User has left a channel
 * @event module:libquassel~Quassel#event:"user.part"
 * @property {number} networkId
 * @property {String} nick
 * @property {number} bufferId
 */
/**
 * User has left a network
 * @event module:libquassel~Quassel#event:"user.quit"
 * @property {number} networkId
 * @property {String} nick
 */
/**
 * User away state changed
 * @event module:libquassel~Quassel#event:"user.away"
 * @property {number} networkId
 * @property {String} nick
 * @property {boolean} isAway
 */
/**
 * User realname changed
 * @event module:libquassel~Quassel#event:"user.realname"
 * @property {number} networkId
 * @property {String} nick
 * @property {String} realname
 */
/**
 * User joined a channel
 * @event module:libquassel~Quassel#event:"channel.join"
 * @property {number} bufferId
 * @property {String} nick
 */
/**
 * User mode has been added
 * @event module:libquassel~Quassel#event:"channel.addusermode"
 * @property {number} bufferId
 * @property {String} nick
 * @property {String} mode
 */
/**
 * User mode has been removed
 * @event module:libquassel~Quassel#event:"channel.removeusermode"
 * @property {number} bufferId
 * @property {String} nick
 * @property {String} mode
 */
/**
 * Channel topic changed
 * @event module:libquassel~Quassel#event:"channel.topic"
 * @property {number} bufferId
 * @property {String} topic
 */
/**
 * Core information
 * @event module:libquassel~Quassel#event:"coreinfo"
 * @property {Object} data
 */
/**
 * Buffer activated
 * @event module:libquassel~Quassel#event:"buffer.activate"
 * @property {number} bufferId
 */
/**
 * Backlogs received
 * @event module:libquassel~Quassel#event:"buffer.backlog"
 * @property {number} bufferId
 * @property {number[]} messageIds
 */
/**
 * Message received on a buffer
 * @event module:libquassel~Quassel#event:"buffer.message"
 * @property {number} bufferId
 * @property {number} messageId
 */
/**
 * Buffers order changed
 * @event module:libquassel~Quassel#event:"bufferview.orderchanged"
 * @property {number} bufferViewId
 */
/**
 * Buffer view manager init request received
 * @event module:libquassel~Quassel#event:"bufferview.ids"
 * @property {number[]} ids
 */
/**
 * Buffer view initialized
 * @event module:libquassel~Quassel#event:"bufferview.init"
 * @property {number} bufferViewId
 */
/**
 * Buffer view networkId updated
 * @event module:libquassel~Quassel#event:"bufferview.networkid"
 * @property {number} bufferViewId
 * @property {number} networkId
 */
/**
 * Buffer view search updated
 * @event module:libquassel~Quassel#event:"bufferview.search"
 * @property {number} bufferViewId
 * @property {boolean} search
 */
/**
 * Buffer view hideInactiveNetworks updated
 * @event module:libquassel~Quassel#event:"bufferview.hideinactivenetworks"
 * @property {number} bufferViewId
 * @property {boolean} hideinactivenetworks
 */
/**
 * Buffer view hideInactiveBuffers updated
 * @event module:libquassel~Quassel#event:"bufferview.hideinactivebuffers"
 * @property {number} bufferViewId
 * @property {boolean} hideinactivebuffers
 */
/**
 * Buffer view allowedBufferTypes updated
 * @event module:libquassel~Quassel#event:"bufferview.allowedbuffertypes"
 * @property {number} bufferViewId
 * @property {number} allowedbuffertypes
 */
/**
 * Buffer view addNewBuffersAutomatically updated
 * @event module:libquassel~Quassel#event:"bufferview.addnewbuffersautomatically"
 * @property {number} bufferViewId
 * @property {boolean} addnewbuffersautomatically
 */
/**
 * Buffer view minimumActivity updated
 * @event module:libquassel~Quassel#event:"bufferview.minimumactivity"
 * @property {number} bufferViewId
 * @property {boolean} minimumactivity
 */
/**
 * Buffer view bufferViewName updated
 * @event module:libquassel~Quassel#event:"bufferview.bufferviewname"
 * @property {number} bufferViewId
 * @property {String} bufferviewname
 */
/**
 * Buffer view disableDecoration updated
 * @event module:libquassel~Quassel#event:"bufferview.disabledecoration"
 * @property {number} bufferViewId
 * @property {boolean} disabledecoration
 */
/**
 * Buffer view object updated
 * @event module:libquassel~Quassel#event:"bufferview.update"
 * @property {number} bufferViewId
 * @property {object} data
 */
/**
 * {@link module:ignore.IgnoreList} updated
 * @event module:libquassel~Quassel#event:"ignorelist"
 */
/**
 * {@link module:identity} updated
 * @event module:libquassel~Quassel#event:"identity"
 */
/**
 * New {@link module:identity} created
 * @event module:libquassel~Quassel#event:"identity.new"
 * @property {number} identityId
 */
/**
 * {@link module:identity} removed
 * @event module:libquassel~Quassel#event:"identity.remove"
 * @property {number} identityId
 */
/**
 * User connected to the {@link module:network.Network}
 * @event module:libquassel~Quassel#event:"network.adduser"
 * @property {number} networkId
 * @property {String} nick
 */
/**
 * New {@link module:network.Network} created
 * @event module:libquassel~Quassel#event:"network.new"
 * @property {number} networkId
 */
/**
 * {@link module:network.Network} removed
 * @event module:libquassel~Quassel#event:"network.remove"
 * @property {number} networkId
 */
/**
 * {@link module:network.Network} is ready
 * @event module:libquassel~Quassel#event:"network.init"
 * @property {number} networkId
 */
/**
 * {@link module:aliases} updated
 * @event module:libquassel~Quassel#event:"aliases"
 */
/**
 * This event is fired when the core needs it's first setup
 * @event module:libquassel~Quassel#event:"setup"
 * @property {Object[]} backends - List of available storage backends
 * @property {String} backends[].DisplayName - Storage backends name
 * @property {String} backends[].Description - Storage backends description
 * @property {String[]} backends[].SetupKeys - Keys that will need a corresponding value to configure chosen storage backend
 * @property {Object} backends[].SetupDefaults - Defaults values for corresponding SetupKeys
 */
/**
 * This event is fired if the setup of the core was successful
 * @event module:libquassel~Quassel#event:"setupok"
 */
/**
 * This event is fired if the setup of the core has failed
 * @event module:libquassel~Quassel#event:"setupfailed"
 * @property {Object} error - The reason of the failure
 */
/**
 * An error occured
 * @event module:libquassel~Quassel#event:"error"
 * @property {Object} error
 */

/**
 * Handles quasselcore messages that possesses a `MsgType` attribute
 * @param {Object} obj
 * @fires module:libquassel~Quassel#event:"coreinfoinit"
 * @fires module:libquassel~Quassel#event:"login"
 * @fires module:libquassel~Quassel#event:"loginfailed"
 * @fires module:libquassel~Quassel#event:"network.addbuffer"
 * @fires module:libquassel~Quassel#event:"init"
 * @fires module:libquassel~Quassel#event:"setup"
 * @fires module:libquassel~Quassel#event:"setupok"
 * @fires module:libquassel~Quassel#event:"setupfailed"
 * @fires module:libquassel~Quassel#event:"identities.init"
 * @protected
 */

function splitOnce(str, character) {
  const i = str.indexOf(character);
  return [ str.slice(0, i), str.slice(i+1) ];
}

module.exports = {
  Features,
  Client
};