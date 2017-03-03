const { types: qtypes } = require('qtdatastream');

/**
 * Qt UserType
 * @typedef UserType
 */

/**
 * @typedef {UserType} UserType&lt;NetworkId&gt;
 * @property {INT} this
 */
qtypes.QUserType.register("NetworkId", qtypes.Types.INT);

/**
 * @typedef {UserType} UserType&lt;IdentityId&gt;
 * @property {INT} this
 */
qtypes.QUserType.register("IdentityId", qtypes.Types.INT);

/**
 * @typedef {UserType} UserType&lt;BufferId&gt;
 * @property {INT} this
 */
qtypes.QUserType.register("BufferId", qtypes.Types.INT);

/**
 * @typedef {UserType} UserType&lt;MsgId&gt;
 * @property {INT} this
 */
qtypes.QUserType.register("MsgId", qtypes.Types.INT);

/**
 * @typedef {UserType} UserType&lt;Identity&gt;
 * @property {MAP} this
 */
qtypes.QUserType.register("Identity", qtypes.Types.MAP);

/**
 * @typedef {UserType} UserType&lt;NetworkInfo&gt;
 * @property {MAP} this
 */
qtypes.QUserType.register("NetworkInfo", qtypes.Types.MAP);

/**
 * @typedef {UserType} UserType&lt;Network::Server&gt;
 * @property {MAP} this
 */
qtypes.QUserType.register("Network::Server", qtypes.Types.MAP);

/**
 * @typedef {UserType} UserType&lt;NetworkId&gt;
 * @property {INT} this
 */
qtypes.QUserType.register("NetworkId", qtypes.Types.INT);

/**
 * @typedef {UserType} UserType&lt;BufferInfo&gt;
 * @property {INT} id
 * @property {INT} network
 * @property {SHORT} type
 * @property {UINT} group
 * @property {BYTEARRAY} name
 */
qtypes.QUserType.register("BufferInfo", [
  {id: qtypes.Types.INT},
  {network: qtypes.Types.INT},
  {type: qtypes.Types.SHORT},
  {group: qtypes.Types.UINT},
  {name: qtypes.Types.BYTEARRAY}
]);

/**
 * @typedef {UserType} UserType&lt;Message&gt;
 * @property {INT} id
 * @property {UINT} timestamp
 * @property {UINT} type
 * @property {BOOL} flags
 * @property {UserType<BufferInfo>} bufferInfo
 * @property {BYTEARRAY} sender
 * @property {BYTEARRAY} content
 */
qtypes.QUserType.register("Message", [
  {id: qtypes.Types.INT},
  {timestamp: qtypes.Types.UINT},
  {type: qtypes.Types.UINT},
  {flags: qtypes.Types.BOOL},
  {bufferInfo: "BufferInfo"},
  {sender: qtypes.Types.BYTEARRAY},
  {content: qtypes.Types.BYTEARRAY}
]);