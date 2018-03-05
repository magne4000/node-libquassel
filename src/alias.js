/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2017 Joël Charles
 * Licensed under the MIT license.
 */

/**
 * Converts core object to an Array of {@link AliasItem}
 * @param {Object} data
 * @returns {AliasItem[]}
 */
export function toArray(data) {
  let i = 0, ret = Array(data.Aliases.names.length);
  for (; i<data.Aliases.names.length; i++) {
    ret[i] = new AliasItem(data.Aliases.names[i], data.Aliases.expansions[i]);
  }
  return ret;
}

/**
 * Returns an object that can be fed to the core
 * @param {AliasItem[]} aliasitems
 * @returns {Object}
 */
export function toCoreObject(aliasitems) {
  const ret = { Aliases: { names: [], expansions: [] } };
  for (let item of aliasitems) {
    ret.Aliases.names.push(item.name);
    ret.Aliases.expansions.push(item.expansion);
  }
  return ret;
}

/**
 * Object representing an alias
 * @param {String} name
 * @param {String} expansion
 */
export class AliasItem {
  constructor(name, expansion) {
    this.name = name;
    this.expansion = expansion;
  }
}
