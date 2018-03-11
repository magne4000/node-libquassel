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
  /** @type {boolean} */
  away;
  /** @type {string} */
  awayMessage;
  /** @type {string[]} */
  channels;
  /** @type {boolean} */
  encrypted;
  /** @type {string} */
  host;
  /** @type {Date} */
  idleTime;
  /** @type {string} */
  ircOperator;
  /** @type {boolean} */
  lastAwayMessage;
  /** @type {Date} */
  loginTime;
  /** @type {string} */
  realName;
  /** @type {string} */
  server;
  /** @type {string} */
  userHost;
  /** @type {string} */
  user;
  /** @type {string} */
  userModes;
  /** @type {string} */
  whoisServiceReply;
  /** @type {string} */
  nick;

  constructor(data) {
    if (data) {
      this.update(data);
    }
    this._id = this.nick;
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
