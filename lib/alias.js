/** @module alias */

/**
 * Returns a {@link module:alias.AliasItem[]} for the given object received from the core.
 * @alias module:alias.toArray
 * @param {object} data
 * @returns {module:alias.AliasItem[]}
 */
function toArray(data) {
    var i = 0, name, expansion, ret = [];
    for (i; i<data.Aliases.names.length; i++) {
        name = data.Aliases.names[i];
        expansion = data.Aliases.expansions[i];
        ret.push(new AliasItem(name, expansion));
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
    var i = 0, ret = {Aliases: {names: [], expansions: []}};
    for (i; i<aliasitems.length; i++) {
        ret.Aliases.names.push(aliasitems[i].name);
        ret.Aliases.expansions.push(aliasitems[i].expansion);
    }
    return ret;
}

/**
 * @class
 * @alias module:alias.AliasItem
 * @param {String} name
 * @param {String} expansion
 */
var AliasItem = function AliasItem(name, expansion) {
    this.name = name;
    this.expansion = expansion;
};

exports.toArray = toArray;
exports.toCoreObject = toCoreObject;
exports.AliasItem = AliasItem;