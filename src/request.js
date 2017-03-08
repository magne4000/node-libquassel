/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2017 Joël Charles
 * Licensed under the MIT license.
 */

/** @module request */

const { EventEmitter } = require('events');
const { types: qtypes, socket } = require('qtdatastream');
const { Network, Server } = require('./network');
const logger = require('debug')('libquassel:request');
const pkg = require('../package.json');

/**
 * @readonly
 * @enum {number}
 * @default
 */
const Types = {
  INVALID: 0x00,
  SYNC: 0x01,
  RPCCALL: 0x02,
  INITREQUEST: 0x03,
  INITDATA: 0x04,
  HEARTBEAT: 0x05,
  HEARTBEATREPLY: 0x06
};

/**
 * Decorator for SYNC methods
 * @protected
 */
function sync(className, functionName, ...datatypes) {
  const qsync = qtypes.QInt.from(Types.SYNC);
  const qclassName = qtypes.QByteArray.from(className);
  const qfunctionName = qtypes.QByteArray.from(functionName);
  return function(target, _key, descriptor) {
    return {
      enumerable: false,
      configurable: false,
      writable: false,
      value: function(...args) {
        const [ id, ...data ] = descriptor.value.apply(this, args);
        this.qtsocket.write([
          qsync,
          qclassName,
          qtypes.QByteArray.from(id),
          qfunctionName,
          ...data.map((value, index) => datatypes[index].from(value))
        ]);
      }
    };
  };
}

/**
 * Decorator for RPC methods
 * @protected
 */
function rpc(functionName, ...datatypes) {
  const qrpc = qtypes.QInt.from(Types.RPCCALL);
  const qfunctionName = qtypes.QByteArray.from(`2${functionName}`);
  return function(target, _key, descriptor) {
    return {
      enumerable: false,
      configurable: false,
      writable: false,
      value: function(...args) {
        const data = descriptor.value.apply(this, args);
        this.qtsocket.write([
          qrpc,
          qfunctionName,
          ...data.map((value, index) => datatypes[index].from(value))
        ]);
      }
    };
  };
}

/**
 * Send commands to the core
 */
class Core extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.useSSL = false;
    this.useCompression = false;
    this.qtsocket = null;
    this.duplex = null;
  }

  // Handle magic number response
  init(duplex) {
    this.duplex = duplex;
    this.duplex.once('data', data => {
      const ret = data.readUInt32BE(0);
      if (((ret >> 24) & 0x01) > 0) {
        this.useSSL = true;
        logger('Using SSL');
      }

      if (((ret >> 24) & 0x02) > 0) {
        this.useCompression = true;
        logger('Using compression');
      }


      // if (self.useCompression) {
      //   const zlib = require('zlib');
      //     // Not working, don't know why yet
      //     self.qtsocket = new qtdatastream.socket.Socket(self.client, function(buffer, next) {
      //         zlib.inflate(buffer, next);
      //     }, function(buffer, next) {
      //         var deflate = zlib.createDeflate({flush: zlib.Z_SYNC_FLUSH}), buffers = [];
      //         deflate.on('data', function(chunk) {
      //             buffers.push(chunk);
      //         });

      //         deflate.on('end', function() {
      //             logger(buffers);
      //             next(null, Buffer.concat(buffers));
      //         });

      //         deflate.end(buffer);
      //     });
      // } else {
      this.qtsocket = new socket.Socket(duplex);
      // }

      this.qtsocket
      .on('data', data => this.emit('data', data))
      .on('close', () => this.emit('close'))
      .on('end', () => this.emit('end'))
      .on('error', e => this.emit('error', e));

      this.sendClientInfo(this.useSSL, this.useCompression);
    });
  }

  /**
   * Handles heartbeat
   * @param {boolean} reply - is this a heartbeat reply
   * @protected
   */
  heartBeat(reply) {
    const d = new Date();
    const ms = d.getTime() - d.setHours(0, 0, 0, 0);
    const slist = [
      reply ? Types.HEARTBEAT : Types.HEARTBEATREPLY,
      qtypes.QTime.from(ms)
    ];
    logger('Sending heartbeat');
    this.qtsocket.write(slist);
  }

  /**
   * Core Sync request - Backlogs
   * @param {number} bufferId
   * @param {number} [firstMsgId=-1]
   * @param {number} [lastMsgId=-1]
   * @param {number} [maxAmount=backloglimit]
   */
  @sync(
    'BacklogManager',
    'requestBacklog',
    qtypes.QUserType.get('BufferId'),
    qtypes.QUserType.get('MsgId'),
    qtypes.QUserType.get('MsgId'),
    qtypes.QInt,
    qtypes.QInt
  )
  backlog(bufferId, firstMsgId = -1, lastMsgId = -1, maxAmount = undefined) {
    maxAmount = maxAmount || this.options.backloglimit;
    logger('Sending backlog request');
    return [ '', bufferId, firstMsgId, lastMsgId, maxAmount, 0 ];
  }

  /**
   * Core Sync request - Connect the specified network
   * @param {number} networkId
   */
  @sync('Network', 'requestConnect')
  connectNetwork(networkId) {
    logger('Sending connection request');
    return [ networkId ];
  }

  /**
   * Core Sync request - Disconnect the specified network
   * @param {number} networkId
   */
  @sync('Network', 'requestDisconnect')
  disconnectNetwork(networkId) {
    logger('Sending disconnection request');
    return [ networkId ];
  }

  /**
   * Core Sync request - Update network information
   * @param {Number} networkId
   * @param {object} network
   */
  @sync('Network', 'requestSetNetworkInfo', qtypes.QMap)
  setNetworkInfo(networkId, network) {
    logger('Sending update request (Network)');
    return [ networkId, network ];
  }

  /**
   * Core Sync request - Mark buffer as read
   * @param {number} bufferId
   */
  @sync('BufferSyncer', 'requestMarkBufferAsRead', qtypes.QUserType.get('BufferId'))
  markBufferAsRead(bufferId) {
    logger('Sending mark buffer as read request');
    return [ '', bufferId ];
  }

  /**
   * Core Sync request - Set all messages before messageId as read for specified buffer
   * @param {number} bufferId
   * @param {number} messageId
   */
  @sync('BufferSyncer', 'requestSetLastSeenMsg', qtypes.QUserType.get('BufferId'), qtypes.QUserType.get('MsgId'))
  setLastMsgRead(bufferId, messageId) {
    logger('Sending last message read request');
    return [ '', bufferId, messageId ];
  }

  /**
   * Core Sync request - Mark a specified buffer line
   * @param {number} bufferId
   * @param {number} messageId
   */
  @sync('BufferSyncer', 'requestSetMarkerLine', qtypes.QUserType.get('BufferId'), qtypes.QUserType.get('MsgId'))
  setMarkerLine(bufferId, messageId) {
    logger('Sending mark line request');
    return [ '', bufferId, messageId ];
  }

  /**
   * Core Sync request - Remove a buffer
   * @param {number} bufferId
   */
  @sync('BufferSyncer', 'requestRemoveBuffer', qtypes.QUserType.get('BufferId'))
  removeBuffer(bufferId) {
    logger('Sending perm hide request');
    return [ '', bufferId ];
  }

  /**
   * Core Sync request - Merge bufferId2 into bufferId1
   * @param {number} bufferId1
   * @param {number} bufferId2
   */
  @sync('BufferSyncer', 'requestMergeBuffersPermanently', qtypes.QUserType.get('BufferId'), qtypes.QUserType.get('BufferId'))
  mergeBuffersPermanently( bufferId1, bufferId2) {
    logger('Sending merge request');
    return [ '', bufferId1, bufferId2 ];
  }

  /**
   * Core Sync request - Rename a buffer
   * @param {number} bufferId
   * @param {string} newName
   */
   @sync('BufferSyncer', 'requestMergeBuffersPermanently', qtypes.QUserType.get('BufferId'), qtypes.QString)
  renameBuffer(bufferId, newName) {
    logger('Sending rename buffer request');
    return [ '', bufferId, newName ];
  }

  /**
   * Core Sync request - Hide a buffer temporarily
   * @param {number} bufferViewId
   * @param {number} bufferId
   */
  @sync('BufferViewConfig', 'requestRemoveBuffer', qtypes.QUserType.get('BufferId'))
  hideBufferTemporarily(bufferViewId, bufferId) {
    logger('Sending temp hide request');
    return [ bufferViewId, bufferId ];
  }

  /**
   * Core Sync request - Hide a buffer permanently
   * @param {number} bufferViewId
   * @param {number} bufferId
   */
  @sync('BufferViewConfig', 'requestRemoveBufferPermanently', qtypes.QUserType.get('BufferId'))
  hideBufferPermanently(bufferViewId, bufferId) {
    logger('Sending perm hide request');
    return [ bufferViewId, bufferId ];
  }

  /**
   * Core Sync request - Unhide a buffer
   * @param {number} bufferViewId
   * @param {number} bufferId
   * @param {number} pos
   */
  @sync('BufferViewConfig', 'requestAddBuffer', qtypes.QUserType.get('BufferId'), qtypes.QInt)
  unhideBuffer(bufferViewId, bufferId, pos) {
    logger('Sending unhide request');
    return [ bufferViewId, bufferId, pos ];
  }

  /**
   * Core Sync request - Create a new chat list
   * @param {object} data
   * @example
   * FIXME
   * createBufferView({
   *     sortAlphabetically: 1,
   *     showSearch: 0,
   *     networkId: 0,
   *     minimumActivity: 0,
   *     hideInactiveNetworks: 0,
   *     hideInactiveBuffers: 0,
   *     disableDecoration: 0,
   *     bufferViewName: 'All Chats',
   *     allowedBufferTypes: 15,
   *     addNewBuffersAutomatically: 1,
   *     TemporarilyRemovedBuffers: [],
   *     RemovedBuffers: [],
   *     BufferList: []
   * });
   */
  @sync('BufferViewManager', 'requestCreateBufferView', qtypes.QMap)
  createBufferView(data) {
    logger('Sending create buffer view request');
    return [ '', data ];
  }

  /**
   * Core Sync request - Update ignoreList
   * @param {object} ignoreList
   */
  @sync('IgnoreListManager', 'requestUpdate', qtypes.QList)
  updateIgnoreListManager(ignoreList) {
    logger('Sending update request (IgnoreListManager)');
    return [ '', ignoreList ];
  }

  /**
   * Core Sync request - Update identity
   * @param {Number} identityId
   * @param {object} identity
   */
  @sync('IgnoreListManager', 'requestUpdate', qtypes.QMap)
  updateIdentity(identityId, identity) {
    logger('Sending update request (Identity)');
    return [ identityId, identity ];
  }

  /**
   * Core Sync request - Update aliases
   * @param {object} data @see {@link module:alias.toCoreObject}
   */
  @sync('AliasManager', 'requestUpdate', qtypes.QMap)
  updateAliasManager(data) {
    logger('Sending update request (AliasManager)');
    return [ '', data ];
  }

  @sync('BufferSyncer', 'requestPurgeBufferIds')
  purgeBufferIds() {
    logger('Sending purge buffer ids request');
    return [];
  }

  /**
   * Core RPC request - Remove an {@link module:identity}
   * @param {number} identityId
   */
  @rpc('removeIdentity(IdentityId)', qtypes.QUserType.get('IdentityId'))
  removeIdentity(build, identityId) {
    logger('Deleting identity');
    return [ identityId ];
  }

  /**
   * Core RPC request - Remove a {@link module:network.Network}
   * @param {number} networkId
   */
  @rpc('removeNetwork(NetworkId)', qtypes.QUserType.get('NetworkId'))
  removeNetwork (build, networkId) {
    logger('Deleting nhetwork');
    return [ networkId ];
  }

  /**
   * Core RPC request - Send a user input to a specified buffer
   * @param {bufferInfo} bufferInfo
   * @param {String} message
   */
  @rpc('sendInput(BufferInfo,QString)', qtypes.QUserType.get('BufferInfo'), qtypes.QString)
  sendMessage(build, bufferInfo, message) {
    logger('Sending message');
    return [ bufferInfo, message ];
  }

  /**
   * Core RPC request - Create a new {@link module:identity}
   * @param {module:identity} identity
   */
  @rpc('createIdentity(Identity,QVariantMap)', qtypes.QUserType.get('Identity'), qtypes.QMap)
  createIdentity(build, identity) {
    logger('Creating identity');
    return [ identity, {}];
  }

  /**
   * Core RPC request - Create a new {@link module:network.Network}
   * @param {String} networkName
   * @param {number} identityId
   * @param {(String|Object)} initialServer - Server hostname or IP, or full Network::Server Object. Can also be undefined if options.ServerList is defined.
   * @param {String} [initialServer.Host=initialServer]
   * @param {String} [initialServer.Port="6667"]
   * @param {String} [initialServer.Password=""]
   * @param {boolean} [initialServer.UseSSL=true]
   * @param {number} [initialServer.sslVersion=0]
   * @param {boolean} [initialServer.UseProxy=false]
   * @param {number} [initialServer.ProxyType=0]
   * @param {String} [initialServer.ProxyHost=""]
   * @param {String} [initialServer.ProxyPort=""]
   * @param {String} [initialServer.ProxyUser=""]
   * @param {String} [initialServer.ProxyPass=""]
   * @param {Object} [options]
   * @param {String} [options.codecForServer=""]
   * @param {String} [options.codecForEncoding=""]
   * @param {String} [options.codecForDecoding=""]
   * @param {boolean} [options.useRandomServer=false]
   * @param {String[]} [options.perform=[]]
   * @param {Object[]} [options.ServerList=[]]
   * @param {boolean} [options.useAutoIdentify=false]
   * @param {String} [options.autoIdentifyService="NickServ"]
   * @param {String} [options.autoIdentifyPassword=""]
   * @param {boolean} [options.useSasl=false]
   * @param {String} [options.saslAccount=""]
   * @param {String} [options.saslPassword=""]
   * @param {boolean} [options.useAutoReconnect=true]
   * @param {number} [options.autoReconnectInterval=60]
   * @param {number} [options.autoReconnectRetries=20]
   * @param {boolean} [options.unlimitedReconnectRetries=false]
   * @param {boolean} [options.rejoinChannels=true]
   * @param {boolean} [options.useCustomMessageRate=false]
   * @param {boolean} [options.unlimitedMessageRate=false]
   * @param {number} [options.msgRateMessageDelay=2200]
   * @param {number} [options.msgRateBurstSize=5]
   */
  @rpc('createNetwork(NetworkInfo,QStringList)', qtypes.QUserType.get('NetworkInfo'), qtypes.QStringList)
  createNetwork(build, networkName, identityId, initialServer, options = {}) {
    const network = new Network(-1, networkName);
    network.update(options);
    if (typeof initialServer === 'string') {
      initialServer = {
        host: initialServer
      };
    }
    network.ServerList.push(new Server(initialServer));
    logger('Creating network');
    return [ identityId, network, []];
  }

  /**
   * Sends an initialization request to quasselcore for specified `classname` and `objectname`
   * @param {String} classname
   * @param {String} objectname
   * @example
   * quassel.sendInitRequest("IrcUser", "1/randomuser");
   */
  sendInitRequest(classname, objectname = '') {
    let initRequest = [
      qtypes.QUInt.from(Types.INITREQUEST),
      qtypes.QString.from(classname),
      qtypes.QString.from(objectname)
    ];
    this.qtsocket.write(initRequest);
  }

  /**
   * Sends client information to the core
   * @param {boolean} useSSL
   * @param {boolean} useCompression - Not supported
   * @protected
   */
  sendClientInfo(useSSL, useCompression){
    let smap = {
      'ClientDate': '',
      'UseSsl': useSSL,
      'ClientVersion': `${pkg.name} ${pkg.version}`,
      'UseCompression': useCompression,
      'MsgType': 'ClientInit',
      'ProtocolVersion': 10
    };
    logger('Sending client informations');
    this.qtsocket.write(smap);
  }

  /**
   * Setup core
   * @param {String} backend
   * @param {String} adminuser
   * @param {String} adminpassword
   * @param {Object} [properties]
   */
  setupCore(backend, adminuser, adminpassword, useSSL = false, properties = {}) {
    const obj = {
      SetupData: {
        ConnectionProperties: properties,
        Backend: backend,
        AdminUser: adminuser,
        AdminPasswd: adminpassword
      },
      MsgType: 'CoreSetupData'
    };

    if (useSSL) {
      const tls = require('tls');
      const secureContext = tls.createSecureContext({
        secureProtocol: 'TLSv1_2_client_method'
      });
      const secureStream = tls.connect(null, {
        socket: this.duplex,
        rejectUnauthorized: false,
        secureContext: secureContext
      });
      this.qtsocket.setSocket(secureStream);
    }
    this.qtsocket.write(obj);
  }

  /**
   * Send login request to the core
   * @param {String} user
   * @param {String} password
   */
  login(user, password) {
    const obj = {
      'MsgType': 'ClientLogin',
      'User': user,
      'Password': password
    };
    this.qtsocket.write(obj);
  }

  /**
   * Initialize the connection
   * @example
   * const quassel = new Client(...);
   * quassel.connect();
   */
  connect() {
    let magic = 0x42b33f00;
    // magic | 0x01 Encryption
    // magic | 0x02 Compression
    if (this.options.securecore) {
      magic |= 0x01;
    }

    // At this point `duplex` should already be connected
    const bufs = [
      qtypes.QUInt.from(magic).toBuffer(),
      qtypes.QUInt.from(0x01).toBuffer(),
      qtypes.QUInt.from(0x01 << 31).toBuffer()
    ];
    this.duplex.write(Buffer.concat(bufs));
  }

  /**
   * Disconnect the client from the core
   */
  disconnect() {
    this.duplex.end();
    this.duplex.destroy();
  }
}

module.exports = {
  Types,
  Core
};