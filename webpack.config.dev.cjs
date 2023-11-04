const config = require('./webpack.config.default.cjs');
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');

module.exports = Object.assign({}, config, {
  mode: 'development',
  plugins: [
    new NodePolyfillPlugin()
  ],
});
