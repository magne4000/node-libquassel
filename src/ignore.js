/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2017 Joël Charles
 * Licensed under the MIT license.
 */

const logger = require('debug')('libquassel:ignore');
const { Serializable } = require('qtdatastream').serialization;

import { Types } from './message';

/**
 * @type {Object}
 * @property {number} IgnoreTypes.SENDER
 * @property {number} IgnoreTypes.MESSAGE
 * @property {number} IgnoreTypes.CTCP
 */
export const IgnoreTypes = {
  SENDER: 0,
  MESSAGE: 1,
  CTCP: 2
};

/**
 * @type {Object}
 * @property {number} StrictnessTypes.UNMATCHED
 * @property {number} StrictnessTypes.SOFT
 * @property {number} StrictnessTypes.HARD
 */
export const StrictnessTypes = {
  UNMATCHED: 0,
  SOFT: 1,
  HARD: 2
};

/**
 * @type {Object}
 * @property {number} ScopeTypes.GLOBAL
 * @property {number} ScopeTypes.NETWORK
 * @property {number} ScopeTypes.CHANNEL
 */
export const ScopeTypes = {
  GLOBAL: 0,
  NETWORK: 1,
  CHANNEL: 2
};

/**
 * Ignore item as represented in the configuration
 */
export class IgnoreItem {
  /**
   * @param {number} strictness
   * @param {string} scopeRule
   * @param {number} scope
   * @param {boolean} isRegEx
   * @param {boolean} isActive
   * @param {number} ignoreType
   * @param {string} ignoreRule
   */
  constructor(strictness, scopeRule, scope, isRegEx, isActive, ignoreType, ignoreRule){
    /** @type {number} */
    this.strictness = strictness;
    /** @type {string} */
    this.scopeRule = scopeRule;
    /** @type {number} */
    this.scope = scope;
    /** @type {boolean} */
    this.isRegEx = isRegEx;
    /** @type {boolean} */
    this.isActive = isActive;
    /** @type {number} */
    this.ignoreType = ignoreType;
    /** @type {string} */
    this.ignoreRule = ignoreRule;
    /** @type {RegExp[]} */
    this.regexScope = [];
    /** @type {RegExp} */
    this.regexIgnore;
    this.compile();
  }

  /**
   * Returns `true` if subject match the scope rules, `false` otherwhise
   * @param {string} subject
   * @returns {boolean}
   */
  matchScope(subject) {
    if (typeof subject !== 'string') return false;
    let ret = false;
    for (let regexScope of this.regexScope) {
      ret = subject.match(regexScope) !== null;
      if (ret) break;
    }
    return ret;
  }

  /**
   * Returns `true` if subject match ignore rule, `false` otherwhise
   * @param {String} subject
   * @returns {boolean}
   */
  matchIgnore(subject) {
    if (typeof subject !== 'string') return false;
    return subject.match(this.regexIgnore) !== null;
  }

  /**
   * Compile internal regexes from `scopeRules` and `ignoreRule` attributes
   */
  compile() {
    const scopeRules = this.scopeRule.split(';');
    this.regexScope = new Array();
    for (let scopeRule of scopeRules) {
      this.regexScope.push(wildcardToRegex(scopeRule));
    }
    try {
      this.regexIgnore = this.isRegEx ? new RegExp(this.ignoreRule, 'i') : wildcardToRegex(this.ignoreRule);
    } catch (e) {
      logger('Invalid RexExp', e);
      this.isActive = false;
    }
  }

  toString() {
    const ret = [ '<IgnoreItem' ];
    for (let key of [ 'strictness', 'scopeRule', 'scope', 'isRegEx', 'isActive', 'ignoreType', 'ignoreRule' ]) {
      ret.push(`${key}=${this[key]}`);
    }
    ret.push('>');
    return ret.join(' ');
  }
}

function wildcardToRegex(subject) {
  const input = subject.trim().replace(/([.+^$\\(){}|-])/g, '\\$1').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${input}$`, 'i');
}

/**
 * Handles list of {@link IgnoreItem}
 * @implements {Serializable}
 */
@Serializable()
export class IgnoreList {

  constructor() {
    this.list = new Array();
  }

  /**
   * Import object as a list of {@link IgnoreItem}
   * @param {Object} data
   */
  import(data) {
    let item;
    this.list = new Array(data);
    for (let i=0; i<data.IgnoreList.ignoreRule.length; i++) {
      item = new IgnoreItem(
        data.IgnoreList.strictness[i],
        data.IgnoreList.scopeRule[i],
        data.IgnoreList.scope[i],
        data.IgnoreList.isRegEx[i],
        data.IgnoreList.isActive[i],
        data.IgnoreList.ignoreType[i],
        data.IgnoreList.ignoreRule[i]
      );
      this.list[i] = item;
    }
  }

  /**
   * Export the map into an Object ready for qtdatasteam
   * @override
   * @returns {Object}
   */
  _export() {
    const len = this.list.length;
    const ret = {
      IgnoreList: {
        strictness: Array(len),
        scopeRule: Array(len),
        scope: Array(len),
        isRegEx: Array(len),
        isActive: Array(len),
        ignoreType: Array(len),
        ignoreRule: Array(len)
      }
    };
    for (let i=0; i<len; i++) {
      ret.IgnoreList.strictness[i] = this.list[i].strictness;
      ret.IgnoreList.scopeRule[i] = this.list[i].scopeRule;
      ret.IgnoreList.scope[i] = this.list[i].scope;
      ret.IgnoreList.isRegEx[i] = this.list[i].isRegEx;
      ret.IgnoreList.isActive[i] = this.list[i].isActive;
      ret.IgnoreList.ignoreType[i] = this.list[i].ignoreType;
      ret.IgnoreList.ignoreRule[i] = this.list[i].ignoreRule;
    }
    return ret;
  }

  /**
   * Returns true if `message` matches ignore rules
   * @param {IRCMessage} message
   * @param {NetworkCollection} networks
   * @returns {boolean}
   */
  matches(message, networks) {
    const network = networks.get(message.bufferInfo.network);
    const buffer = network.buffers.get(message.bufferInfo.id);

    if (message.type !== Types.PLAIN && message.type !== Types.ACTION && message.type !== Types.NOTICE)
      return false;

    for (let item of this.list) {
      if (!item.isActive || item.ignoreType === IgnoreTypes.CTCP)
        continue;
      if (item.scope === ScopeTypes.GLOBAL
          || (item.scope === ScopeTypes.NETWORK && item.matchScope(network.networkName))
          || (item.scope === ScopeTypes.CHANNEL && item.matchScope(buffer.name))) {
        const subject = item.ignoreType === IgnoreTypes.MESSAGE ? message.content : message.sender;
        if (item.matchIgnore(subject)) {
          return true;
        }
      }
    }
    return false;
  }

  toString() {
    return [ '<IgnoreList', this.list.map(x => '\n\t' + x), '>' ].join(' ');
  }
}
