const config = require('./webpack.config.default');

module.exports = Object.assign({}, config, {
  mode: 'development'
});