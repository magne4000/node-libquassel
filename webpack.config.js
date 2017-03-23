const path = require('path');
const webpack = require('webpack');

module.exports = {
  devtool: "cheap-module-source-map",
  entry: path.resolve(__dirname, 'index.js'),
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'libquassel.js',
    library: 'libquassel',
    libraryTarget: 'umd'
  },
  resolve: {
    alias: {
      tls: path.resolve(__dirname, 'src/tls'),
    },
    symlinks: false
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /(node_modules|bower_components)/,
        loader: 'babel-loader',
        query: {
          plugins: [
            "babel-plugin-transform-decorators-legacy",
            "babel-plugin-transform-class-properties",
            "babel-plugin-transform-runtime",
            [
              "babel-plugin-transform-builtin-extend", {
                globals: [ "Map" ]
              }
            ]
          ],
          presets: ['babel-preset-es2015']
        }
      }
    ]
  },
  // plugins: [
  //   new webpack.optimize.UglifyJsPlugin({
  //     output: {
  //       comments: false
  //     }
  //   })
  // ]
};