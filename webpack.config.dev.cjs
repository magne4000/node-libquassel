const config = require('./webpack.config.default.cjs');

module.exports = Object.assign({}, config, {
  mode: 'development'
});
