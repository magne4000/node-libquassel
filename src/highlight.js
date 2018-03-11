/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2018 Joël Charles
 * Licensed under the MIT license.
 */

const logger = require('debug')('libquassel:highlight');
const { Serializable } = require('qtdatastream').serialization;

/**
 * @type {Object}
 * @property {number} IgnoreTypes.NONICK
 * @property {number} IgnoreTypes.CURRENTNICK
 * @property {number} IgnoreTypes.ALLNICKS
 */
export const HighlightNickType = {
  NONICK: 0,
  CURRENTNICK: 1,
  ALLNICKS: 2
};

/**
 * Represent a unique highlight rule defined by the user
 */
export class HighlightRule {
  /** @type {string} */
  name;
  /** @type {boolean} */
  isRegEx;
  /** @type {boolean} */
  isCaseSensitive;
  /** @type {boolean} */
  isEnabled;
  /** @type {boolean} */
  isInverse;
  /** @type {string} */
  sender;
  /** @type {string} */
  channel;

  /**
   * @param {string} name
   * @param {boolean} isRegEx
   * @param {boolean} isCaseSensitive
   * @param {boolean} isEnabled
   * @param {boolean} isInverse
   * @param {string} sender
   * @param {string} channel
   */
  constructor(name, isRegEx, isCaseSensitive, isEnabled, isInverse, sender, channel){
    this.name = name;
    this.isRegEx = isRegEx;
    this.isCaseSensitive = isCaseSensitive;
    this.isEnabled = isEnabled;
    this.isInverse = isInverse;
    this.sender = sender;
    this.channel = channel;
  }


  toString() {
    const ret = [ '<HighlightRule' ];
    for (let key of [ 'name', 'isRegEx', 'isCaseSensitive', 'isEnabled', 'isInverse', 'sender', 'channel' ]) {
      ret.push(`${key}=${this[key]}`);
    }
    ret.push('>');
    return ret.join(' ');
  }
}

/**
 * Handles list of {@link IgnoreItem}
 * @implements {Serializable}
 */
@Serializable()
export class HighlightRuleManager {

  constructor() {
    this.list = [];
    this.highlightNick = HighlightNickType.NONICK;
    this.nicksCaseSensitive = false;
  }

  /**
   * Import object as a list of {@link HighlightRule}
   * @param {Object} data
   */
  import(data) {
    logger('import', data);
    this.list = new Array(data.HighlightRuleList.name.length);
    for (let i=0; i<data.HighlightRuleList.name.length; i++) {
      this.list[i] = new HighlightRule(
        data.HighlightRuleList.name[i],
        data.HighlightRuleList.isRegEx[i],
        data.HighlightRuleList.isCaseSensitive[i],
        data.HighlightRuleList.isEnabled[i],
        data.HighlightRuleList.isInverse[i],
        data.HighlightRuleList.sender[i],
        data.HighlightRuleList.channel[i]
      );
    }
    this.highlightNick = data.HighlightRuleList.highlightNick;
    this.nicksCaseSensitive = data.HighlightRuleList.nicksCaseSensitive;
  }

  /**
   * Export the map into an Object ready for qtdatasteam
   * @override
   * @returns {Object}
   */
  _export() {
    const len = this.list.length;
    const ret = {
      HighlightRuleList: {
        name: Array(len),
        isRegEx: Array(len),
        isCaseSensitive: Array(len),
        isEnabled: Array(len),
        isInverse: Array(len),
        sender: Array(len),
        channel: Array(len),
        highlightNick: this.highlightNick,
        nicksCaseSensitive: this.nicksCaseSensitive
      }
    };
    for (let i=0; i<len; i++) {
      ret.HighlightRuleList.name[i] = this.list[i].name;
      ret.HighlightRuleList.isRegEx[i] = this.list[i].isRegEx;
      ret.HighlightRuleList.isCaseSensitive[i] = this.list[i].isCaseSensitive;
      ret.HighlightRuleList.isEnabled[i] = this.list[i].isEnabled;
      ret.HighlightRuleList.isInverse[i] = this.list[i].isInverse;
      ret.HighlightRuleList.sender[i] = this.list[i].sender;
      ret.HighlightRuleList.channel[i] = this.list[i].channel;
    }
    logger('export', ret);
    return ret;
  }

  toString() {
    return [
      '<HighlightRuleManager',
      `highlightNick=${this.highlightNick}`,
      `nicksCaseSensitive=${this.nicksCaseSensitive}`,
      this.list.map(x => '\n\t' + x),
      '>'
    ].join(' ');
  }
}
