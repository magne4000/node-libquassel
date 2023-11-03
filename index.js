import { Features, Client } from './src/libquassel.js';

module.exports = {
  alias: require('./src/alias.js'),
  buffer: require('./src/buffer.js'),
  bufferview: require('./src/bufferview.js'),
  identity: require('./src/identity.js'),
  ignore: require('./src/ignore.js'),
  highlight: require('./src/highlight.js'),
  message: require('./src/message.js'),
  network: require('./src/network.js'),
  request: require('./src/request.js'),
  user: require('./src/user.js'),
  WebSocketStream: require('./src/websocket.js').default,
  debug: require('debug'),
  Features,
  Client
};
