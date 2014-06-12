/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2014 Joël Charles
 * Licensed under the MIT license.
 */

var HM = require("hashmap").HashMap,
    util = require("util"),
    serialize = require('./serializer').serialize;

var HashMap = function HashMap(){
    HashMap.super_.call(this);
    serialize(this);
};

util.inherits(HashMap, HM);

module.exports = HashMap;