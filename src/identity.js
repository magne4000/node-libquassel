/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2017 Joël Charles
 * Licensed under the MIT license.
 */

/** @module identity */

const { types: qtypes } = require('qtdatastream');
const { Exportable, exportas } = qtypes;

import { traits } from 'traits-decorator';

/**
 * @class
 * @alias module:identity
 * @extends {Exportable}
 * @param {Object} data
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

  @exportas(qtypes.QString)
  identityName;

  @exportas(qtypes.QString)
  realName;

  @exportas(qtypes.QList)
  get nicks() {
    return this._nicks;
  }

  set nicks(value) {
    this._nicks = value;
    this.nickRegexes = value.map(nick => nick.replace(/([.?*+^$[\]\\(){}|-])/g, '\\$1'));
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
    /** @member {String} ident */
    /** @member {number} identityId */
    /** @member {String} identityName */
    /** @member {String[]} nicks */
    /** @member {String} partReason */
    /** @member {String} quitReason */
    /** @member {String} realName */
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

  set id(value) {
    this.identityId = value;
  }

  get id() {
    return this.identityId;
  }

  toString() {
    return `<Identity ${this.identityName}>`;
  }
}
