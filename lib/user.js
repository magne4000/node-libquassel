/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2014 Joël Charles
 * Licensed under the MIT license.
 */

var serialize = require('./serializer').serialize,
    Glouton = require('./glouton');

var IRCUser = function IRCUser(id, data) {
    serialize(this);
    this.id = id;
    this.nick = this.id.split('!')[0];
    if (data) {
        this.devour(data);
    }
};

Glouton.extend(IRCUser);

module.exports = IRCUser;