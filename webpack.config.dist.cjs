const config = require('./webpack.config.default.cjs');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');

module.exports = Object.assign({}, config, {
  mode: 'production',
  plugins: [
    new CleanWebpackPlugin(),
    new NodePolyfillPlugin()
  ],
  optimization: {
    minimize: true,
    minimizer: [ new TerserPlugin() ],
  },
});
