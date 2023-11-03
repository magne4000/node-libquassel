const config = require('./webpack.config.default.cjs');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = Object.assign({}, config, {
  mode: 'production',
  plugins: [
    new CleanWebpackPlugin()
  ],
  optimization: {
    minimize: true,
    minimizer: [ new TerserPlugin() ],
  },
});
