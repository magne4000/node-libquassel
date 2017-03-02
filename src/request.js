/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2017 Joël Charles
 * Licensed under the MIT license.
 */

/** @module request */

const { types: qtypes } = require('qtdatastream');

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
  INITDATZ: 0x04,
  HEARTBEAT: 0x05,
  HEARTBEATREPLY: 0x06
};

buildSyncRequest(className, functionName, ...datatypes) {
  const qsync = qtypes.QInt.from(Types.SYNC);
  const qclassName = qtypes.QByteArray.from(className);
  const qfunctionName = qtypes.QByteArray.from(functionName);
  return (id, ...data) => {
    return [
      qsync,
      qclassName,
      qtypes.QByteArray.from(id),
      qfunctionName,
      ...data.map((value, index) => datatypes[index].from(value))
    ];
  }
}

buildRpcRequest(functionName, ...datatypes) {
  const qrpc = qtypes.QInt.from(Types.RPCCALL);
  const qfunctionName = qtypes.QByteArray.from(`2${functionName}`);
  return (...data) => {
    return [
      qrpc,
      qfunctionName,
      ...data.map((value, index) => datatypes[index].from(value))
    ];
  }
}

class Request {
  constructor(options) {
    this.options = options;
    // this.requests = {
    //   backlog: syncRequestBuilder(
    //     "BacklogManager",
    //     "requestBacklog",
    //     qtypes.QUserType.get("BufferId"),
    //     qtypes.QUserType.get("MsgId"),
    //     qtypes.QUserType.get("MsgId"),
    //     qtypes.QInt,
    //     qtypes.QInt
    //   ),
    //   connectNetwork: buildSyncRequest("Network", "requestConnect"),
    //   disconnectNetwork: buildSyncRequest("Network", "requestDisconnect"),
    //   markBufferAsRead: buildSyncRequest("BufferSyncer", "requestMarkBufferAsRead", qtypes.QUserType.get("BufferId")),
    //   setLastMsgRead: buildSyncRequest("BufferSyncer", "requestSetLastSeenMsg", qtypes.QUserType.get("BufferId"), qtypes.QUserType.get("MsgId")),
    //   setMarkerLine: buildSyncRequest("BufferSyncer", "requestSetMarkerLine", qtypes.QUserType.get("BufferId"), qtypes.QUserType.get("MsgId")),
    //   removeBuffer: buildSyncRequest("BufferSyncer", "requestRemoveBuffer", qtypes.QUserType.get("BufferId")),

    // }
  }

  /**
   * Core Sync request - Backlogs
   * @param {number} bufferId
   * @param {number} [firstMsgId=-1]
   * @param {number} [lastMsgId=-1]
   * @param {number} [maxAmount=backloglimit]
   */
  @sync(
    "BacklogManager",
    "requestBacklog",
    qtypes.QUserType.get("BufferId"),
    qtypes.QUserType.get("MsgId"),
    qtypes.QUserType.get("MsgId"),
    qtypes.QInt,
    qtypes.QInt
  )
  backlog(build, bufferId, firstMsgId = -1, lastMsgId = -1, maxAmount = undefined) {
    maxAmount = maxAmount || this.options.backloglimit;
    const slist = build("", bufferId, firstMsgId, lastMsgId, maxAmount, 0);
    logger('Sending backlog request');
    this.qtsocket.write(slist);
  }

  /**
   * Core Sync request - Connect the specified network
   * @param {number} networkId
   */
  @sync("Network", "requestConnect")
  connectNetwork(build, networkId) {
    const slist = build(networkId);
    logger('Sending connection request');
    this.qtsocket.write(slist);
  }

  /**
   * Core Sync request - Disconnect the specified network
   * @param {number} networkId
   */
  @sync("Network", "requestDisconnect")
  disconnectNetwork(build, networkId) {
    const slist = build(networkId);
    logger('Sending disconnection request');
    this.qtsocket.write(slist);
  }

  /**
   * Core Sync request - Update network information
   * @param {Number} networkId
   * @param {object} network
   */
  @sync("Network", "requestSetNetworkInfo", qtypes.QMap)
  setNetworkInfo(build, networkId, network) {
    // FIXME
    const slist = build(networkId, Network.toQ(network));
    logger('Sending update request (Network)');
    this.qtsocket.write(slist);
  }

  /**
   * Core Sync request - Mark buffer as read
   * @param {number} bufferId
   */
  @sync("BufferSyncer", "requestMarkBufferAsRead", qtypes.QUserType.get("BufferId"))
  markBufferAsRead(build, bufferId) {
    const slist = build("", bufferId);
    logger('Sending mark buffer as read request');
    this.qtsocket.write(slist);
  }

  /**
   * Core Sync request - Set all messages before messageId as read for specified buffer
   * @param {number} bufferId
   * @param {number} messageId
   */
  @sync("BufferSyncer", "requestSetLastSeenMsg", qtypes.QUserType.get("BufferId"), qtypes.QUserType.get("MsgId"))
  setLastMsgRead(build, bufferId, messageId) {
    const slist = build("", bufferId, messageId);
    logger('Sending last message read request');
    this.qtsocket.write(slist);
  }

  /**
   * Core Sync request - Mark a specified buffer line
   * @param {number} bufferId
   * @param {number} messageId
   */
  @sync("BufferSyncer", "requestSetMarkerLine", qtypes.QUserType.get("BufferId"), qtypes.QUserType.get("MsgId"))
  setMarkerLine(build, bufferId, messageId) {
    const slist = build("", bufferId, messageId);
    logger('Sending mark line request');
    this.qtsocket.write(slist);
  }

  /**
   * Core Sync request - Remove a buffer
   * @param {number} bufferId
   */
  @sync("BufferSyncer", "requestRemoveBuffer", qtypes.QUserType.get("BufferId"))
  removeBuffer(build, bufferId) {
    const slist = build("", bufferId);
    logger('Sending perm hide request');
    this.qtsocket.write(slist);
  }

  /**
   * Core Sync request - Merge bufferId2 into bufferId1
   * @param {number} bufferId1
   * @param {number} bufferId2
   */
  @sync("BufferSyncer", "requestMergeBuffersPermanently", qtypes.QUserType.get("BufferId"), qtypes.QUserType.get("BufferId"))
  mergeBuffersPermanently(build, bufferId1, bufferId2) {
    const slist = build("", bufferId1, bufferId2)
    logger('Sending merge request');
    this.qtsocket.write(slist);
  }

  /**
   * Core Sync request - Rename a buffer
   * @param {number} bufferId
   * @param {string} newName
   */
   @sync("BufferSyncer", "requestMergeBuffersPermanently", qtypes.QUserType.get("BufferId"), qtypes.QString)
  renameBuffer(bufferId, newName) {
    const slist = build("", bufferId, newName);
    logger('Sending rename buffer request');
    this.qtsocket.write(slist);
  }

  /**
   * Core Sync request - Hide a buffer temporarily
   * @param {number} bufferViewId
   * @param {number} bufferId
   */
  @sync("BufferViewConfig", "requestRemoveBuffer", qtypes.QUserType.get("BufferId"))
  hideBufferTemporarily(build, bufferViewId, bufferId) {
    const slist = build(bufferViewId, bufferId);
    logger('Sending temp hide request');
    this.qtsocket.write(slist);
  }

  /**
   * Core Sync request - Hide a buffer permanently
   * @param {number} bufferViewId
   * @param {number} bufferId
   */
  @sync("BufferViewConfig", "requestRemoveBufferPermanently", qtypes.QUserType.get("BufferId"))
  hideBufferPermanently(build, bufferViewId, bufferId) {
    // FIXME
    if (bufferViewId === undefined) bufferViewId = this.bufferViewId;
    const slist = build(bufferViewId, bufferId);
    logger('Sending perm hide request');
    this.qtsocket.write(slist);
  }

  /**
   * Core Sync request - Unhide a buffer
   * @param {number} bufferViewId
   * @param {number} bufferId
   */
  @sync("BufferViewConfig", "requestAddBuffer", qtypes.QUserType.get("BufferId"), qtypes.QInt)
  unhideBuffer(build, bufferViewId, bufferId) {
    bufferId = parseInt(bufferId, 10);
    // FIXME
    if (typeof bufferViewId === "undefined") bufferViewId = this.bufferViewId;
    // FIXME
    const buffer = this.getNetworks().findBuffer(bufferId);
    // FIXME
    const bufferCount = this.getNetworks().get(buffer.network).getBufferMap().size;
    const slist = build(bufferViewId, bufferId, bufferCount);
    logger('Sending unhide request');
    this.qtsocket.write(slist);
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
  @sync("BufferViewManager", "requestCreateBufferView", qtypes.QMap)
  createBufferView(build, data) {
    const slist = build("", data);
    logger('Sending create buffer view request');
    this.qtsocket.write(slist);
  }

  /**
   * Core Sync request - Update ignoreList
   * @param {object} ignoreList
   */
  @sync("IgnoreListManager", "requestUpdate", qtypes.QList)
  updateIgnoreListManager(build, ignoreList) {
    const slist = build("", ignoreList);
    logger('Sending update request (IgnoreListManager)');
    this.qtsocket.write(slist);
  }

  /**
   * Core Sync request - Update identity
   * @param {Number} identityId
   * @param {object} identity
   */
  @sync("IgnoreListManager", "requestUpdate", qtypes.QMap)
  updateIdentity(build, identityId, identity) {
    const slist = build(identityId, identity);
    logger('Sending update request (Identity)');
    this.qtsocket.write(slist);
  }

  /**
   * Core Sync request - Update aliases
   * @param {object} data @see {@link module:alias.toCoreObject}
   */
  @sync("AliasManager", "requestUpdate", qtypes.QMap)
  updateAliasManager(build, data) {
    const slist = build("", data);
    logger('Sending update request (AliasManager)');
    this.qtsocket.write(slist);
  }

  /**
   * Core RPC request - Remove an {@link module:identity}
   * @param {number} identityId
   */
  @rpc("removeIdentity(IdentityId)", qtypes.QUserType.get("IdentityId"))
  removeIdentity(build, identityId) {
    const slist = build(identityId);
    logger('Deleting identity');
    this.qtsocket.write(slit);
  }

  /**
   * Core RPC request - Remove a {@link module:network.Network}
   * @param {number} networkId
   */
  @rpc("removeNetwork(NetworkId)", qtypes.QUserType.get("NetworkId"))
  removeNetwork (build, networkId) {
    const slist = build(networkId);
    logger('Deleting nhetwork');
    this.qtsocket.write(slit);
  };

  /**
   * Core RPC request - Send a user input to a specified buffer
   * @param {number} bufferId
   * @param {String} message
   */
  @rpc("sendInput(BufferInfo,QString)", qtypes.QUserType.get("BufferInfo"), qtypes.QString)
  sendMessage(build, ufferId, message) {
    // FIXME
    const buffer = this.networks.findBuffer(parseInt(bufferId, 10));
    if (buffer !== null) {
      const slist = build(buffer.getBufferInfo(), message);
      logger('Sending message');
      this.qtsocket.write(slit);
    } else {
      logger("Could not send message to buffer %d. Buffer not found.", bufferId);
    }
  }
  
  /**
   * Core RPC request - Create a new {@link module:identity}
   * @param {module:identity} identity
   */
  @rpc("createIdentity(Identity,QVariantMap)", qtypes.QUserType.get("Identity"), qtypes.QMap)
  Quassel.prototype.createIdentity = function(build, identity) {
    const slist = build(identity, {});
    logger('Creating identity');
    this.qtsocket.write(slit);
  };
}

module.exports = {
  Types
};