const { Features, Client } = require('./src/libquassel');

module.exports = {
  alias: require('./src/alias'),
  buffer: require('./src/buffer'),
  bufferview: require('./src/bufferview'),
  identity: require('./src/identity'),
  ignore: require('./src/ignore'),
  message: require('./src/message'),
  network: require('./src/network'),
  request: require('./src/request'),
  user: require('./src/user'),
  WebSocketStream: require('./src/websocket').default,
  debug: require('debug'),
  Features,
  Client
};