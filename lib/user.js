/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2014 Joël Charles
 * Licensed under the MIT license.
 */

var extend = require("extend"),
    Glouton = require('./glouton');

var IRCUser = function(id, data) {
    extend(this, new Glouton());
    this.devour(data);
    this.id = id;
};

module.exports = IRCUser;