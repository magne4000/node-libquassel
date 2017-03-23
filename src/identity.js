/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2017 Joël Charles
 * Licensed under the MIT license.
 */

const { types: qtypes, serialization: { Serializable, serialize } } = require('qtdatastream');

/**
 * Quassel Identity
 * @implements {Serializable}
 */
@Serializable()
export default class Identity {

  @serialize(qtypes.QBool)
  autoAwayEnabled = false;

  @serialize(qtypes.QString)
  autoAwayReason = 'Not here. No, really. not here!';

  @serialize(qtypes.QBool)
  autoAwayReasonEnabled = false;

  @serialize(qtypes.QUInt)
  autoAwayTime = 10;

  @serialize(qtypes.QString)
  awayNick = '';

  @serialize(qtypes.QBool)
  awayNickEnabled = false;

  @serialize(qtypes.QString)
  awayReason = 'Gone fishing.';

  @serialize(qtypes.QBool)
  awayReasonEnabled = true;

  @serialize(qtypes.QBool)
  detachAwayEnabled = false;

  @serialize(qtypes.QString)
  detachAwayReason = 'All Quassel clients vanished from the face of the earth...';

  @serialize(qtypes.QBool)
  detachAwayReasonEnabled = false;

  @serialize(qtypes.QString)
  ident = 'quassel';

  @serialize(qtypes.QUserType.get('IdentityId'))
  identityId = -1;

  /** @type {string} */
  @serialize(qtypes.QString)
  identityName;

  /** @type {string} */
  @serialize(qtypes.QString)
  realName;

  /** @type {string[]} */
  @serialize(qtypes.QList)
  get nicks() {
    return this._nicks;
  }

  /** @type {string[]} */
  set nicks(value) {
    this._nicks = value;
    this.nickRegexes = value.map(nick => nick.replace(/([.?*+^$[\]\\(){}|-])/g, '\\$1'));
  }

  /** @type {number} */
  set id(value) {
    this.identityId = value;
  }

  /** @type {number} */
  get id() {
    return this.identityId;
  }

  @serialize(qtypes.QString)
  kickReason = 'Kindergarten is elsewhere!';

  @serialize(qtypes.QString)
  partReason = 'http://quassel-irc.org - Chat comfortably. Anywhere.';

  @serialize(qtypes.QString)
  quitReason = 'http://quassel-irc.org - Chat comfortably. Anywhere.';

  constructor(data) {
    this._nicks = [];
    this.nickRegexes = [];
    if (data) {
      this.update(data);
    }
    // TODO see if identityId is always a number, otherwise parseInt
  }

  update(data) {
    Object.assign(this, data);
  }

  /**
   * Create an {@link module:identity} object with default values
   * @param {String} name
   * @param {?String} nick
   * @param {?String} realname
   */
  static create(name, nick, realname) {
    const options = {
      identityName: name,
      realName: realname || name,
      nicks: [ nick || name ]
    };
    return new this(options);
  }

  toString() {
    return `<Identity ${this.identityName}>`;
  }
}
