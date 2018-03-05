const { types: qtypes } = require('qtdatastream');

/**
 * @typedef {QUserType} UserType<NetworkId>
 * @property {INT} this
 */
qtypes.QUserType.register('NetworkId', qtypes.Types.INT);

/**
 * @typedef {QUserType} UserType<IdentityId>
 * @property {INT} this
 */
qtypes.QUserType.register('IdentityId', qtypes.Types.INT);

/**
 * @typedef {QUserType} UserType<BufferId>
 * @property {INT} this
 */
qtypes.QUserType.register('BufferId', qtypes.Types.INT);

/**
 * @typedef {QUserType} UserType<MsgId>
 * @property {INT} this
 */
qtypes.QUserType.register('MsgId', qtypes.Types.INT);

/**
 * @typedef {QUserType} UserType<Identity>
 * @property {MAP} this
 */
qtypes.QUserType.register('Identity', qtypes.Types.MAP);

/**
 * @typedef {QUserType} UserType<NetworkInfo>
 * @property {MAP} this
 */
qtypes.QUserType.register('NetworkInfo', qtypes.Types.MAP);

/**
 * @typedef {QUserType} UserType<Network::Server>
 * @property {MAP} this
 */
qtypes.QUserType.register('Network::Server', qtypes.Types.MAP);

/**
 * @typedef {QUserType} UserType<NetworkId>
 * @property {INT} this
 */
qtypes.QUserType.register('NetworkId', qtypes.Types.INT);

/**
 * @typedef {QUserType} UserType<BufferInfo>
 * @property {INT} id
 * @property {INT} network
 * @property {SHORT} type
 * @property {UINT} group
 * @property {BYTEARRAY} name
 */
qtypes.QUserType.register('BufferInfo', [
  { id: qtypes.Types.INT },
  { network: qtypes.Types.INT },
  { type: qtypes.Types.SHORT },
  { group: qtypes.Types.UINT },
  { name: qtypes.Types.BYTEARRAY }
]);

/**
 * @typedef {QUserType} UserType<Message>
 * @property {INT} id
 * @property {UINT} timestamp
 * @property {UINT} type
 * @property {BOOL} flags
 * @property {UserType<BufferInfo>} bufferInfo
 * @property {BYTEARRAY} sender
 * @property {BYTEARRAY} content
 */
qtypes.QUserType.register('Message', [
  { id: qtypes.Types.INT },
  { timestamp: qtypes.Types.UINT },
  { type: qtypes.Types.UINT },
  { flags: qtypes.Types.BOOL },
  { bufferInfo: 'BufferInfo' },
  { sender: qtypes.Types.BYTEARRAY },
  { content: qtypes.Types.BYTEARRAY }
]);