const config = require('./webpack.config.default');
const CleanWebpackPlugin = require('clean-webpack-plugin');
const UglifyJsPlugin = require('uglifyjs-webpack-plugin');
const path = require('path');

module.exports = Object.assign({}, config, {
  mode: 'production',
  plugins: [
    new CleanWebpackPlugin([ 'dist' ], {
      root: path.resolve(__dirname)
    })
  ]
});