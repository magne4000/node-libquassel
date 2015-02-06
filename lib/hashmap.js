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

HashMap.prototype.forEach = function(func, sortfunction, stop) {
    var key, resp;
    if (typeof sortfunction === 'function') {
        var arr = [], i = 0;
        for (key in this._data) {
            arr.push(this._data[key][1]);
        }
        arr.sort(sortfunction);
        for (;i<arr.length;i++) {
            resp = func.call(this, arr[i], arr[i].id);
            if (stop && resp !== true) break;
        }
    } else {
        for (key in this._data) {
            var data = this._data[key];
            resp = func.call(this, data[1], data[0]);
            if (stop && resp !== true) break;
        }
    }
    return (stop && resp !== true);
};

module.exports = HashMap;
