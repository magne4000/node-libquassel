const config = require('./webpack.config.default');

module.exports = Object.assign({}, config, {
  devtool: "cheap-module-source-map"
});