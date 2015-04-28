/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2014 Joël Charles
 * Licensed under the MIT license.
 */

var extend = require('extend');

var serialize = function serialize(obj) {
    obj.__s_cls = obj.constructor.name;
    obj.__s_done = false;
};

var Reviver = function() {
    var args = Array.prototype.slice.call(arguments), i;
    this.map = {};
    // Used for revive
    for (i=0; i<args.length; i++) {
        this.push(args[i].name, args[i]);
    }
};

Reviver.prototype.push = function(key, val) {
    this.map[key] = val;
};

Reviver.prototype.get = function(key) {
    return this.map[key];
};

Reviver.prototype.revivable = function(obj) {
    return !!obj && !obj.__s_done && !!obj.__s_cls;
};

Reviver.prototype.afterReviving = function(obj, callback) {
    var self = this;
    if (this.revivable(obj)) {
        setTimeout(function() {
            self.afterReviving(obj, callback);
        }, 10);
    } else {
        callback(obj);
    }
};

Reviver.prototype.revive = function(obj) {
    if (this.revivable(obj)) {
        var cls = this.get(obj.__s_cls);
        var newobj = Object.create(cls.prototype);
        extend(obj, newobj);
        obj.__s_done = true;
        return true;
    }
    return false;
};

Reviver.prototype.reviveAll = function(obj) {
    var self = this;
    if (self.revive(obj) && typeof obj.revived === "function") {
        obj.revived();
    }
    walk(obj, function(node) {
        if (self.revive(node) && typeof node.revived === "function") {
            node.revived();
        }
    });
};


// inspired from https://github.com/substack/js-traverse
function walk (root, cb) {
    var path = [];
    var parents = [];

    function walker (node) {
        var state = {
            node : node,
            path : [].concat(path),
            parent : parents[parents.length - 1],
            parents : parents,
            key : path.slice(-1)[0],
            isRoot : path.length === 0,
            level : path.length,
            circular : null,
            keys : null
        };

        function updateState() {
            if (typeof node === 'object' && node !== null) {
                if (!state.keys) {
                    state.keys = Object.keys(node);
                }

                for (var i = 0; i < parents.length; i++) {
                    if (parents[i].node === node) {
                        state.circular = true;
                        break;
                    }
                }
            } else {
                state.keys = null;
            }
        }

        updateState();

        cb(node);

        if (typeof node === 'object' && node !== null && !state.circular) {
            parents.push(state);

            updateState();

            state.keys.forEach(function (key) {
                path.push(key);
                walker(node[key]);
                path.pop();
            });
            parents.pop();
        }

        return state;
    }
    walker(root);
}

exports.serialize = serialize;
exports.Reviver = Reviver;
