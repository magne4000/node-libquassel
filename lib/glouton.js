/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2016 Joël Charles
 * Licensed under the MIT license.
 */

/** @module glouton */

/**
 * @class
 * @alias module:glouton.Glouton
 */
var Glouton = function() {};

/**
 * Import data into current object.
 * Each member of data will be copied to the current object.
 * Functions can also be used to affect the values onto the current object.
 * For this, a function named setTheattribute must be defined.
 * @example
 * var data = {attributeOne: 1, attributeTwo: 2};
 * 
 * var MyClass = function() {};
 * 
 * MyClass.prototype.setAttributeTwo = function(value) {
 *   this.attributeTwo = value + 1;
 *   this.dummy = null;
 * };
 * 
 * Glouton.extend(MyClass);
 * 
 * var myClass = new MyClass;
 * myClass.devour(data);
 * // myClass.attributeOne = 1
 * // myClass.attributeTwo = 3
 * // myClass.dummy = null
 * @alias module:glouton.Glouton#devour
 * @param {Object} data
 */
Glouton.prototype.devour = function(data) {
    var key, functionName;
    for (key in data) {
        functionName = "set" + key.charAt(0).toUpperCase() + key.slice(1);
        if (typeof this[functionName] === 'function') {
            this[functionName](data[key]);
        } else {
            this[key] = data[key];
        }
    }
};

/**
 * Extend specified class prototype with Glouton methods.
 * @example
 * var MyClass = function() {};
 * Glouton.extend(MyClass);
 * @alias module:glouton.Glouton.extend
 * @param {Object} aclass
 */
Glouton.extend = function(aclass) {
    aclass.prototype.devour = Glouton.prototype.devour;
};

module.exports = Glouton;