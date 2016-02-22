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
    /*
    away: 0
    awayMessage: ""
    channels: Array[1]
    encrypted: 0
    host: "x.y.z"
    id: "u!u@x.y.z"
    idleTime: Mon Jan 12 -4712 18:02:47 GMT+0100 (Romance Standard Time)
    ircOperator: ""
    lastAwayMessage: 0
    loginTime: Mon Jan 12 -4712 18:02:47 GMT+0100 (Romance Standard Time)
    nick: "u"
    realName: "u"
    server: "x.y.z"
    suserHost: ""
    user: "u"
    userModes: ""
    whoisServiceReply: ""
    */
};

Glouton.extend(IRCUser);

module.exports = IRCUser;