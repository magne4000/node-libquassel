/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2017 Joël Charles
 * Licensed under the MIT license.
 */

/**
 * IRC user
 */
export default class IRCUser {
  constructor(data) {
    this._id = null;
    /** @type {string} */
    this.id;
    /** @type {boolean} */
    this.away;
    /** @type {string} */
    this.awayMessage;
    /** @type {string[]} */
    this.channels;
    /** @type {boolean} */
    this.encrypted;
    /** @type {string} */
    this.host;
    /** @type {Date} */
    this.idleTime;
    /** @type {string} */
    this.ircOperator;
    /** @type {boolean} */
    this.lastAwayMessage;
    /** @type {Date} */
    this.loginTime;
    /** @type {string} */
    this.realName;
    /** @type {string} */
    this.server;
    /** @type {string} */
    this.userHost;
    /** @type {string} */
    this.user;
    /** @type {string} */
    this.userModes;
    /** @type {string} */
    this.whoisServiceReply;
    /** @type {string} */
    this.nick;
    if (data) {
      this.update(data);
    }
  }

  update(data) {
    Object.assign(this, data);
  }

  /** @type {string} */
  get id() {
    return this._id;
  }

  /** @type {string} */
  set id(value) {
    this._id = value;
    [ this.nick ] = value.split('!');
  }
}
