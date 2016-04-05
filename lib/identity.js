/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2016 Joël Charles
 * Licensed under the MIT license.
 */

/** @module identity */

var Glouton = require('./glouton');

/**
 * @class
 * @alias module:identity
 * @augments module:glouton.Glouton
 * @param {Object} data
 */
var Identity = function Identity(data) {
    if (data) {
        this.devour(data);
    }
    /** @member {boolean} autoAwayEnabled */
    /** @member {String} autoAwayReason */
    /** @member {boolean} autoAwayReasonEnabled */
    /** @member {number} autoAwayTime */
    /** @member {String} awayNick */
    /** @member {String} kickReason */
    /** @member {boolean} awayNickEnabled */
    /** @member {String} awayReason */
    /** @member {boolean} awayReasonEnabled */
    /** @member {boolean} detachAwayEnabled */
    /** @member {String} detachAwayReason */
    /** @member {boolean} detachAwayReasonEnabled */
    /** @member {setIdent} setIdent */
    /** @member {number} identityId */
    /** @member {String} identityName */
    /** @member {String[]} nicks */
    /** @member {String} partReason */
    /** @member {String} quitReason */
    /** @member {String} realName */
};

Glouton.extend(Identity);

/**
 * @param {(number|boolean)} iBoolean
 */
Identity.prototype.setAutoAwayEnabled = function(iBoolean) {
    this.autoAwayEnabled = iBoolean === 1;
};

/**
 * @param {String} iBoolean
 */
Identity.prototype.setAutoAwayReason = function(s) {
    this.autoAwayReason = s;
};

/**
 * @param {(number|boolean)} iBoolean
 */
Identity.prototype.setAutoAwayReasonEnabled = function(iBoolean) {
    this.autoAwayReasonEnabled = iBoolean === 1;
};

/**
 * @param {number} iBoolean
 */
Identity.prototype.setAutoAwayTime = function(i) {
    this.autoAwayTime = i;
};

/**
 * @param {String} iBoolean
 */
Identity.prototype.setAwayNick = function(s) {
    this.awayNick = s;
};

/**
 * @param {String} iBoolean
 */
Identity.prototype.setKickReason = function(s) {
    this.kickReason = s;
};

/**
 * @param {(number|boolean)} iBoolean
 */
Identity.prototype.setAwayNickEnabled = function(iBoolean) {
    this.awayNickEnabled = iBoolean === 1;
};

/**
 * @param {String} iBoolean
 */
Identity.prototype.setAwayReason = function(s) {
    this.awayReason = s;
};

/**
 * @param {(number|boolean)} iBoolean
 */
Identity.prototype.setAwayReasonEnabled = function(iBoolean) {
    this.awayReasonEnabled = iBoolean === 1;
};

/**
 * @param {(number|boolean)} iBoolean
 */
Identity.prototype.setDetachAwayEnabled = function(iBoolean) {
    this.detachAwayEnabled = iBoolean === 1;
};

/**
 * @param {String} iBoolean
 */
Identity.prototype.setDetachAwayReason = function(s) {
    this.detachAwayReason = s;
};

/**
 * @param {(number|boolean)} iBoolean
 */
Identity.prototype.setDetachAwayReasonEnabled = function(iBoolean) {
    this.detachAwayReasonEnabled = iBoolean === 1;
};

/**
 * @param {String} iBoolean
 */
Identity.prototype.setIdent = function(s) {
    this.ident = s;
};

/**
 * @param {number} iBoolean
 */
Identity.prototype.setId = function(i) {
    this.identityId = i;
};

/**
 * @param {String} iBoolean
 */
Identity.prototype.setIdentityName = function(s) {
    this.identityName = s;
};

/**
 * @param {String[]} iBoolean
 */
Identity.prototype.setNicks = function(a) {
    this.nicks = a;
};

/**
 * @param {String} iBoolean
 */
Identity.prototype.setPartReason = function(s) {
    this.partReason = s;
};

/**
 * @param {String} iBoolean
 */
Identity.prototype.setQuitReason = function(s) {
    this.quitReason = s;
};

/**
 * @param {String} iBoolean
 */
Identity.prototype.setRealName = function(s) {
    this.realName = s;
};

/**
 * Calls {@link devour} upon data
 * @param {*} data
 */
Identity.prototype.update = function(data) {
    this.devour(data);
};

module.exports = Identity;