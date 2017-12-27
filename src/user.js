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
  public away;
  /** @type {string} */
  public awayMessage;
  /** @type {string[]} */
  public channels;
  /** @type {boolean} */
  public encrypted;
  /** @type {string} */
  public host;
  /** @type {Date} */
  public idleTime;
  /** @type {string} */
  public ircOperator;
  /** @type {boolean} */
  public lastAwayMessage;
  /** @type {Date} */
  public loginTime;
  /** @type {string} */
  public realName;
  /** @type {string} */
  public server;
  /** @type {string} */
  public userHost;
  /** @type {string} */
  public user;
  /** @type {string} */
  public userModes;
  /** @type {string} */
  public whoisServiceReply;
  /** @type {string} */
  public nick;

  constructor(data) {
    this._id = null;

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
