/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2017 Joël Charles
 * Licensed under the MIT license.
 */

/** @module user */

/**
 * @class
 * @alias module:user
 * @param {number} id
 * @param {?Object} data
 */
class IRCUser {
  constructor(data) {
    this._id = null;
    if (data) {
      this.update(data);
    }
    /** @member {String} id nick!u@x.y.z */
    /** @member {boolean} away */
    /** @member {String} awayMessage */
    /** @member {String[]} channels */
    /** @member {boolean} encrypted */
    /** @member {String} host */
    /** @member {Date} idleTime */
    /** @member {String} ircOperator */
    /** @member {boolean} lastAwayMessage */
    /** @member {Date} loginTime */
    /** @member {String} realName */
    /** @member {String} server */
    /** @member {String} userHost */
    /** @member {String} user */
    /** @member {String} userModes */
    /** @member {String} whoisServiceReply */

    /** @member {String} nick */
  }

  update(data) {
    const keys = Object.keys(data);
    for (let key of keys) {
      this[key] = data[key];
    }
  }

  get id() {
    return this._id;
  }

  set id(value) {
    this._id = value;
    [ this.nick ] = value.split('!');
  }
}

module.exports = IRCUser;