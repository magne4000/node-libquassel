/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2017 Joël Charles
 * Licensed under the MIT license.
 */

/** @module alias */

/**
 * Returns a {@link module:alias.AliasItem[]} for the given object received from the core.
 * @alias module:alias.toArray
 * @param {object} data
 * @returns {module:alias.AliasItem[]}
 */
function toArray(data) {
  let i = 0, ret = [];
  for (; i<data.Aliases.names.length; i++) {
    ret.push(new AliasItem(data.Aliases.names[i], data.Aliases.expansions[i]));
  }
  return ret;
}

/**
 * Returns an object that can be fed to the core
 * @alias module:alias.toCoreObject
 * @param {module:alias.AliasItem[]} data
 * @returns {object}
 */
function toCoreObject(aliasitems) {
  const ret = {Aliases: {names: [], expansions: []}};
  for (let item of aliasitems) {
    ret.Aliases.names.push(item.name);
    ret.Aliases.expansions.push(item.expansion);
  }
  return ret;
}

/**
 * @class
 * @alias module:alias.AliasItem
 * @param {String} name
 * @param {String} expansion
 */
class AliasItem {
  contructor(name, expansion) {
    this.name = name;
    this.expansion = expansion;
  }
}

module.exports = {
  toArray,
  toCoreObject,
  AliasItem
};