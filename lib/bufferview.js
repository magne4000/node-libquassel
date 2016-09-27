/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2016 Joël Charles
 * Licensed under the MIT license.
 */

/** @module bufferview */

var Glouton = require('./glouton');

/**
 * @class
 * @alias module:bufferview
 * @augments module:glouton.Glouton
 * @param {Object} data
 */
var BufferView = function BufferView(id, data) {
    if (data) {
        this.devour(data);
    }
    /** @member {number} id */
    this.id = id;
    /** @member {boolean} sortAlphabetically */
    /** @member {number} showSearch */
    /** @member {number} networkId */
    /** @member {number} minimumActivity */
    /** @member {boolean} hideInactiveNetworks */
    /** @member {boolean} hideInactiveBuffers */
    /** @member {boolean} disableDecoration */
    /** @member {String} bufferViewName */
    /** @member {number} allowedBufferTypes */
    /** @member {boolean} addNewBuffersAutomatically */
    /** @member {number[]} TemporarilyRemovedBuffers */
    /** @member {number[]} RemovedBuffers */
    /** @member {number[]} BufferList */
};

Glouton.extend(BufferView);

/**
 * @param {(number|boolean)} iBoolean
 */
BufferView.prototype.setSortAlphabetically = function(iBoolean) {
    this.sortAlphabetically = !!iBoolean;
};

/**
 * @param {(number|boolean)} iBoolean
 */
BufferView.prototype.setHideInactiveNetworks = function(iBoolean) {
    this.hideInactiveNetworks = !!iBoolean;
};

/**
 * @param {(number|boolean)} iBoolean
 */
BufferView.prototype.setHideInactiveBuffers = function(iBoolean) {
    this.hideInactiveBuffers = !!iBoolean;
};

/**
 * @param {(number|boolean)} iBoolean
 */
BufferView.prototype.setDisableDecoration = function(iBoolean) {
    this.disableDecoration = !!iBoolean;
};

/**
 * @param {(number|boolean)} iBoolean
 */
BufferView.prototype.setAddNewBuffersAutomatically = function(iBoolean) {
    this.addNewBuffersAutomatically = !!iBoolean;
};

/**
 * Returns `true` if given `bufferId` is temporarily hidden
 * @param {number} bufferId
 * @returns {?boolean}
 */
BufferView.prototype.isTemporarilyRemoved = function(bufferId) {
    if (typeof bufferId !== "number") return null;
    return this.TemporarilyRemovedBuffers.indexOf(bufferId) !== -1;
};

/**
 * Returns `true` if given `bufferId` is permanently hidden
 * @param {number} bufferId
 * @returns {?boolean}
 */
BufferView.prototype.isPermanentlyRemoved = function(bufferId) {
    if (typeof bufferId !== "number") return null;
    return this.RemovedBuffers.indexOf(bufferId) !== -1;
};

/**
 * Returns `true` if given `bufferId` is hidden
 * @param {number} bufferId
 * @returns {?boolean}
 */
BufferView.prototype.isHidden = function(bufferId) {
    if (typeof bufferId !== "number") return null;
    return this.isTemporarilyRemoved(bufferId) || this.isPermanentlyRemoved(bufferId);
};

/**
 * Temporarily hide given `bufferId`
 * @param {number} bufferId
 */
BufferView.prototype.setTemporarilyRemoved = function(bufferId) {
    if (typeof bufferId !== "number") return;
    this.unhide(bufferId);
    this.TemporarilyRemovedBuffers.push(bufferId);
};

/**
 * Permanently hide given `bufferId`
 * @param {number} bufferId
 */
BufferView.prototype.setTemporarilyRemoved = function(bufferId) {
    if (typeof bufferId !== "number") return;
    this.unhide(bufferId);
    this.RemovedBuffers.push(bufferId);
};

/**
 * Remove hidden status for given `bufferId`
 * @param {number} bufferId
 */
BufferView.prototype.unhide = function(bufferId) {
    if (typeof bufferId !== "number") return;
    var index = this.TemporarilyRemovedBuffers.indexOf(bufferId);
    if (index !== -1) {
        this.TemporarilyRemovedBuffers.slice(index, 1);
    } else {
        index = this.RemovedBuffers.indexOf(bufferId);
        if (index !== -1) {
            this.RemovedBuffers.slice(index, 1);
        }
    }
};

BufferView.prototype.comparator = function(id1, id2) {
    if (!this.BufferList) return 0;
    var iid1 = this.BufferList.indexOf(id1);
    var iid2 = this.BufferList.indexOf(id2);
    if (iid1 === iid2) {  // -1
        return 0;
    }
    return iid1 < iid2 ? -1 : 1;
};

module.exports = BufferView;