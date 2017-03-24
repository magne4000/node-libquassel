const config = require('./webpack.config.default');
const CleanWebpackPlugin = require('clean-webpack-plugin');
const webpack = require('webpack');
const path = require('path');

module.exports = Object.assign({}, config, {
  plugins: [
    new webpack.optimize.UglifyJsPlugin({
      output: {
        comments: false
      }
    }),
    new CleanWebpackPlugin([ 'dist' ], {
      root: path.resolve(__dirname)
    })
  ]
});