const path = require('path');

module.exports = {
  entry: path.resolve(__dirname, 'index.js'),
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'libquassel.js',
    library: 'libquassel',
    libraryTarget: 'var'
  },
  resolve: {
    /*alias: {
      process: "process/browser"
    },*/
    symlinks: false,
    /*fallback: {
      'stream': require.resolve('stream-browserify'),
      "buffer": require.resolve('buffer'),
    }*/
  },
  module: {
    rules: [
      {
        test: /\.(m?|c?)js$/,
        exclude: /(node_modules|bower_components)/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              [
                '@babel/preset-env',
                {
                  targets: 'defaults',
                  include: [
                    '@babel/plugin-transform-class-properties'
                  ]
                }
              ]
            ]
          }
        }
      }
    ]
  }
};
