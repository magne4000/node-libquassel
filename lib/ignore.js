/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2016 Joël Charles
 * Licensed under the MIT license.
 */

var MT = require('./message').Type;

/** @module ignore */

/**
 * @alias module:ignore.IgnoreType
 * @readonly
 * @enum {number}
 * @default
 */
var IgnoreType = {
    SENDER: 0,
    MESSAGE: 1,
    CTCP: 2
};

/**
 * @alias module:ignore.StrictnessType
 * @readonly
 * @enum {number}
 * @default
 */
var StrictnessType = {
    UNMATCHED: 0,
    SOFT: 1,
    HARD: 2
};

/**
 * @alias module:ignore.ScopeType
 * @readonly
 * @enum {number}
 * @default
 */
var ScopeType = {
    GLOBAL: 0,
    NETWORK: 1,
    CHANNEL: 2
};

/**
 * @class
 * @alias module:ignore.IgnoreItem
 * @param {number} strictness
 * @param {String} scopeRule
 * @param {number} scope
 * @param {(number|boolean)} isRegEx
 * @param {(number|boolean)} isActive
 * @param {number} ignoreType
 * @param {String} ignoreRule
 */
var IgnoreItem = function IgnoreItem(strictness, scopeRule, scope, isRegEx, isActive, ignoreType, ignoreRule){
    this.strictness = strictness;
    this.scopeRule = scopeRule;
    this.scope = scope;
    this.isRegEx = isRegEx;
    this.isActive = isActive;
    this.ignoreType = ignoreType;
    this.ignoreRule = ignoreRule;
    this.regexScope = [];
    this.revived();
};

/**
 * Returns true if subject match the scope rules, false otherwhise
 * @param {String} subject
 * @returns {boolean}
 */
IgnoreItem.prototype.matchScope = function(subject) {
    if (typeof subject !== "string") return false;
    var ret = false, i = 0;
    for (; i<this.regexScope.length && !ret; i++) {
        ret = subject.match(this.regexScope[i]) !== null;
    }
    return ret;
};

/**
 * Returns true if subject match ignore rule, false otherwhise
 * @param {String} subject
 * @returns {boolean}
 */
IgnoreItem.prototype.matchIgnore = function(subject) {
    if (typeof subject !== "string") return false;
    return subject.match(this.regexIgnore) !== null;
};

function wildcardToRegex(subject) {
    var input = subject.trim();
    input = input.replace(/([.+^$\\(){}|-])/g, "\\$1").replace(/\*/g, ".*").replace(/\?/g, ".");
    return new RegExp("^" + input + "$", 'i');
}

/**
 * Update internal regex from `scopeRules` and `ignoreRule` attributes
 */
IgnoreItem.prototype.revived = function() {
    var scopeRules = this.scopeRule.split(";"), i = 0;
    this.regexScope = [];
    for (; i<scopeRules.length; i++) {
        this.regexScope.push(wildcardToRegex(scopeRules[i]));
    }
    try {
        this.regexIgnore = this.isRegEx?new RegExp(this.ignoreRule, 'i'):wildcardToRegex(this.ignoreRule);
    } catch (e) {
        console.log("Invalid RexExp", e);
        this.isActive = false;
    }
};

/**
 * @class
 * @alias module:ignore.IgnoreList
 */
var IgnoreList = function IgnoreList(){
    this.list = [];
};

/**
 * Import the map into current IgnoreList as a list of {@link module:ignore.IgnoreItem}
 * @param {Object} map
 */
IgnoreList.prototype.import = function(map) {
    var i=0;
    this.list = [];
    for (; i<map.IgnoreList.ignoreRule.length; i++) {
        var item = new IgnoreItem(
            map.IgnoreList.strictness[i],
            map.IgnoreList.scopeRule[i],
            map.IgnoreList.scope[i],
            map.IgnoreList.isRegEx[i],
            map.IgnoreList.isActive[i],
            map.IgnoreList.ignoreType[i],
            map.IgnoreList.ignoreRule[i]
        );
        this.list.push(item);
    }
};

/**
 * Export the map into an Object ready for qtdatasteam
 * @returns {Object}
 */
IgnoreList.prototype.export = function() {
    var i=0;
    var ret = {
        IgnoreList: {
            strictness: [],
            scopeRule: [],
            scope: [],
            isRegEx: [],
            isActive: [],
            ignoreType: [],
            ignoreRule: []
        }
    };
    for (; i<this.list.length; i++) {
        ret.IgnoreList.strictness.push(this.list[i].strictness);
        ret.IgnoreList.scopeRule.push(this.list[i].scopeRule);
        ret.IgnoreList.scope.push(this.list[i].scope);
        ret.IgnoreList.isRegEx.push(this.list[i].isRegEx);
        ret.IgnoreList.isActive.push(this.list[i].isActive);
        ret.IgnoreList.ignoreType.push(this.list[i].ignoreType);
        ret.IgnoreList.ignoreRule.push(this.list[i].ignoreRule);
    }
    return ret;
};

/**
 * Returns true if `message` match ignore rules
 * @param {message.IRCMessage} message
 * @param {network.NetworkCollection} networks
 * @returns {boolean}
 */
IgnoreList.prototype.matches = function(message, networks) {
    var network = networks.get(message.networkId);
    var buffer = network.getBufferCollection().getBuffer(message.bufferId);
    var i = 0;

    if (message.type !== MT.Plain && message.type !== MT.Action && message.type !== MT.Notice)
        return false;
    
    for (; i<this.list.length; i++) {
        var item = this.list[i];
        if (!item.isActive || item.ignoreType === IgnoreType.CTCP)
           continue;
        if (item.scope === ScopeType.GLOBAL
                || (item.scope === ScopeType.NETWORK && item.matchScope(network.networkName))
                || (item.scope === ScopeType.CHANNEL && item.matchScope(buffer.name))) {
            var subject;
            if (item.ignoreType === IgnoreType.MESSAGE)
                subject = message.content;
            else
                subject = message.sender;

            if (item.matchIgnore(subject)) {
                return true;
            }
        }
    }

    return false;
};

exports.IgnoreItem = IgnoreItem;
exports.IgnoreList = IgnoreList;
exports.IgnoreType = IgnoreType;
exports.StrictnessType = StrictnessType;
exports.ScopeType = ScopeType;
