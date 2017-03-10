/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2017 Joël Charles
 * Licensed under the MIT license.
 */

const { types: qtypes } = require('qtdatastream');
const { Exportable, exportas } = qtypes;

import { traits } from 'traits-decorator';

/**
 * Quassel Identity
 * @implements {Exportable}
 */
@traits(Exportable)
export default class Identity {

  @exportas(qtypes.QBool)
  autoAwayEnabled = false;

  @exportas(qtypes.QString)
  autoAwayReason = 'Not here. No, really. not here!';

  @exportas(qtypes.QBool)
  autoAwayReasonEnabled = false;

  @exportas(qtypes.QUInt)
  autoAwayTime = 10;

  @exportas(qtypes.QString)
  awayNick = '';

  @exportas(qtypes.QBool)
  awayNickEnabled = false;

  @exportas(qtypes.QString)
  awayReason = 'Gone fishing.';

  @exportas(qtypes.QBool)
  awayReasonEnabled = true;

  @exportas(qtypes.QBool)
  detachAwayEnabled = false;

  @exportas(qtypes.QString)
  detachAwayReason = 'All Quassel clients vanished from the face of the earth...';

  @exportas(qtypes.QBool)
  detachAwayReasonEnabled = false;

  @exportas(qtypes.QString)
  ident = 'quassel';

  @exportas(qtypes.QUserType.get('IdentityId'))
  identityId = -1;

  /** @type {string} */
  @exportas(qtypes.QString)
  identityName;

  /** @type {string} */
  @exportas(qtypes.QString)
  realName;

  /** @type {string[]} */
  @exportas(qtypes.QList)
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

  @exportas(qtypes.QString)
  kickReason = 'Kindergarten is elsewhere!';

  @exportas(qtypes.QString)
  partReason = 'http://quassel-irc.org - Chat comfortably. Anywhere.';

  @exportas(qtypes.QString)
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
