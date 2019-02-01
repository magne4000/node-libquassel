const path = require('path');

module.exports = {
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
        test: /\.m?js$/,
        exclude: /(node_modules|bower_components)/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
            plugins: [
              [
                '@babel/plugin-proposal-decorators',
                {
                  'legacy': true
                }
              ],
              '@babel/plugin-proposal-class-properties',
              '@babel/plugin-transform-runtime'
            ],
          }
        }
      }
    ]
  }
};