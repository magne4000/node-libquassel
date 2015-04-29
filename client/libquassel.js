require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2014 Joël Charles
 * Licensed under the MIT license.
 */

var Glouton = function() {
};

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

Glouton.extend = function(aclass) {
    aclass.prototype.devour = Glouton.prototype.devour;
};

module.exports = Glouton;
},{}],2:[function(require,module,exports){

/**
 * This is the web browser implementation of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = require('./debug');
exports.log = log;
exports.formatArgs = formatArgs;
exports.save = save;
exports.load = load;
exports.useColors = useColors;

/**
 * Use chrome.storage.local if we are in an app
 */

var storage;

if (typeof chrome !== 'undefined' && typeof chrome.storage !== 'undefined')
  storage = chrome.storage.local;
else
  storage = localstorage();

/**
 * Colors.
 */

exports.colors = [
  'lightseagreen',
  'forestgreen',
  'goldenrod',
  'dodgerblue',
  'darkorchid',
  'crimson'
];

/**
 * Currently only WebKit-based Web Inspectors, Firefox >= v31,
 * and the Firebug extension (any Firefox version) are known
 * to support "%c" CSS customizations.
 *
 * TODO: add a `localStorage` variable to explicitly enable/disable colors
 */

function useColors() {
  // is webkit? http://stackoverflow.com/a/16459606/376773
  return ('WebkitAppearance' in document.documentElement.style) ||
    // is firebug? http://stackoverflow.com/a/398120/376773
    (window.console && (console.firebug || (console.exception && console.table))) ||
    // is firefox >= v31?
    // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
    (navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31);
}

/**
 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
 */

exports.formatters.j = function(v) {
  return JSON.stringify(v);
};


/**
 * Colorize log arguments if enabled.
 *
 * @api public
 */

function formatArgs() {
  var args = arguments;
  var useColors = this.useColors;

  args[0] = (useColors ? '%c' : '')
    + this.namespace
    + (useColors ? ' %c' : ' ')
    + args[0]
    + (useColors ? '%c ' : ' ')
    + '+' + exports.humanize(this.diff);

  if (!useColors) return args;

  var c = 'color: ' + this.color;
  args = [args[0], c, 'color: inherit'].concat(Array.prototype.slice.call(args, 1));

  // the final "%c" is somewhat tricky, because there could be other
  // arguments passed either before or after the %c, so we need to
  // figure out the correct index to insert the CSS into
  var index = 0;
  var lastC = 0;
  args[0].replace(/%[a-z%]/g, function(match) {
    if ('%%' === match) return;
    index++;
    if ('%c' === match) {
      // we only are interested in the *last* %c
      // (the user may have provided their own)
      lastC = index;
    }
  });

  args.splice(lastC, 0, c);
  return args;
}

/**
 * Invokes `console.log()` when available.
 * No-op when `console.log` is not a "function".
 *
 * @api public
 */

function log() {
  // this hackery is required for IE8/9, where
  // the `console.log` function doesn't have 'apply'
  return 'object' === typeof console
    && console.log
    && Function.prototype.apply.call(console.log, console, arguments);
}

/**
 * Save `namespaces`.
 *
 * @param {String} namespaces
 * @api private
 */

function save(namespaces) {
  try {
    if (null == namespaces) {
      storage.removeItem('debug');
    } else {
      storage.debug = namespaces;
    }
  } catch(e) {}
}

/**
 * Load `namespaces`.
 *
 * @return {String} returns the previously persisted debug modes
 * @api private
 */

function load() {
  var r;
  try {
    r = storage.debug;
  } catch(e) {}
  return r;
}

/**
 * Enable namespaces listed in `localStorage.debug` initially.
 */

exports.enable(load());

/**
 * Localstorage attempts to return the localstorage.
 *
 * This is necessary because safari throws
 * when a user disables cookies/localstorage
 * and you attempt to access it.
 *
 * @return {LocalStorage}
 * @api private
 */

function localstorage(){
  try {
    return window.localStorage;
  } catch (e) {}
}

},{"./debug":3}],3:[function(require,module,exports){

/**
 * This is the common logic for both the Node.js and web browser
 * implementations of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = debug;
exports.coerce = coerce;
exports.disable = disable;
exports.enable = enable;
exports.enabled = enabled;
exports.humanize = require('ms');

/**
 * The currently active debug mode names, and names to skip.
 */

exports.names = [];
exports.skips = [];

/**
 * Map of special "%n" handling functions, for the debug "format" argument.
 *
 * Valid key names are a single, lowercased letter, i.e. "n".
 */

exports.formatters = {};

/**
 * Previously assigned color.
 */

var prevColor = 0;

/**
 * Previous log timestamp.
 */

var prevTime;

/**
 * Select a color.
 *
 * @return {Number}
 * @api private
 */

function selectColor() {
  return exports.colors[prevColor++ % exports.colors.length];
}

/**
 * Create a debugger with the given `namespace`.
 *
 * @param {String} namespace
 * @return {Function}
 * @api public
 */

function debug(namespace) {

  // define the `disabled` version
  function disabled() {
  }
  disabled.enabled = false;

  // define the `enabled` version
  function enabled() {

    var self = enabled;

    // set `diff` timestamp
    var curr = +new Date();
    var ms = curr - (prevTime || curr);
    self.diff = ms;
    self.prev = prevTime;
    self.curr = curr;
    prevTime = curr;

    // add the `color` if not set
    if (null == self.useColors) self.useColors = exports.useColors();
    if (null == self.color && self.useColors) self.color = selectColor();

    var args = Array.prototype.slice.call(arguments);

    args[0] = exports.coerce(args[0]);

    if ('string' !== typeof args[0]) {
      // anything else let's inspect with %o
      args = ['%o'].concat(args);
    }

    // apply any `formatters` transformations
    var index = 0;
    args[0] = args[0].replace(/%([a-z%])/g, function(match, format) {
      // if we encounter an escaped % then don't increase the array index
      if (match === '%%') return match;
      index++;
      var formatter = exports.formatters[format];
      if ('function' === typeof formatter) {
        var val = args[index];
        match = formatter.call(self, val);

        // now we need to remove `args[index]` since it's inlined in the `format`
        args.splice(index, 1);
        index--;
      }
      return match;
    });

    if ('function' === typeof exports.formatArgs) {
      args = exports.formatArgs.apply(self, args);
    }
    var logFn = enabled.log || exports.log || console.log.bind(console);
    logFn.apply(self, args);
  }
  enabled.enabled = true;

  var fn = exports.enabled(namespace) ? enabled : disabled;

  fn.namespace = namespace;

  return fn;
}

/**
 * Enables a debug mode by namespaces. This can include modes
 * separated by a colon and wildcards.
 *
 * @param {String} namespaces
 * @api public
 */

function enable(namespaces) {
  exports.save(namespaces);

  var split = (namespaces || '').split(/[\s,]+/);
  var len = split.length;

  for (var i = 0; i < len; i++) {
    if (!split[i]) continue; // ignore empty strings
    namespaces = split[i].replace(/\*/g, '.*?');
    if (namespaces[0] === '-') {
      exports.skips.push(new RegExp('^' + namespaces.substr(1) + '$'));
    } else {
      exports.names.push(new RegExp('^' + namespaces + '$'));
    }
  }
}

/**
 * Disable debug output.
 *
 * @api public
 */

function disable() {
  exports.enable('');
}

/**
 * Returns true if the given mode name is enabled, false otherwise.
 *
 * @param {String} name
 * @return {Boolean}
 * @api public
 */

function enabled(name) {
  var i, len;
  for (i = 0, len = exports.skips.length; i < len; i++) {
    if (exports.skips[i].test(name)) {
      return false;
    }
  }
  for (i = 0, len = exports.names.length; i < len; i++) {
    if (exports.names[i].test(name)) {
      return true;
    }
  }
  return false;
}

/**
 * Coerce `val`.
 *
 * @param {Mixed} val
 * @return {Mixed}
 * @api private
 */

function coerce(val) {
  if (val instanceof Error) return val.stack || val.message;
  return val;
}

},{"ms":4}],4:[function(require,module,exports){
/**
 * Helpers.
 */

var s = 1000;
var m = s * 60;
var h = m * 60;
var d = h * 24;
var y = d * 365.25;

/**
 * Parse or format the given `val`.
 *
 * Options:
 *
 *  - `long` verbose formatting [false]
 *
 * @param {String|Number} val
 * @param {Object} options
 * @return {String|Number}
 * @api public
 */

module.exports = function(val, options){
  options = options || {};
  if ('string' == typeof val) return parse(val);
  return options.long
    ? long(val)
    : short(val);
};

/**
 * Parse the given `str` and return milliseconds.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function parse(str) {
  var match = /^((?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|years?|yrs?|y)?$/i.exec(str);
  if (!match) return;
  var n = parseFloat(match[1]);
  var type = (match[2] || 'ms').toLowerCase();
  switch (type) {
    case 'years':
    case 'year':
    case 'yrs':
    case 'yr':
    case 'y':
      return n * y;
    case 'days':
    case 'day':
    case 'd':
      return n * d;
    case 'hours':
    case 'hour':
    case 'hrs':
    case 'hr':
    case 'h':
      return n * h;
    case 'minutes':
    case 'minute':
    case 'mins':
    case 'min':
    case 'm':
      return n * m;
    case 'seconds':
    case 'second':
    case 'secs':
    case 'sec':
    case 's':
      return n * s;
    case 'milliseconds':
    case 'millisecond':
    case 'msecs':
    case 'msec':
    case 'ms':
      return n;
  }
}

/**
 * Short format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function short(ms) {
  if (ms >= d) return Math.round(ms / d) + 'd';
  if (ms >= h) return Math.round(ms / h) + 'h';
  if (ms >= m) return Math.round(ms / m) + 'm';
  if (ms >= s) return Math.round(ms / s) + 's';
  return ms + 'ms';
}

/**
 * Long format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function long(ms) {
  return plural(ms, d, 'day')
    || plural(ms, h, 'hour')
    || plural(ms, m, 'minute')
    || plural(ms, s, 'second')
    || ms + ' ms';
}

/**
 * Pluralization helper.
 */

function plural(ms, n, name) {
  if (ms < n) return;
  if (ms < n * 1.5) return Math.floor(ms / n) + ' ' + name;
  return Math.ceil(ms / n) + ' ' + name + 's';
}

},{}],5:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],6:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};
var queue = [];
var draining = false;

function drainQueue() {
    if (draining) {
        return;
    }
    draining = true;
    var currentQueue;
    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        var i = -1;
        while (++i < len) {
            currentQueue[i]();
        }
        len = queue.length;
    }
    draining = false;
}
process.nextTick = function (fun) {
    queue.push(fun);
    if (!draining) {
        setTimeout(drainQueue, 0);
    }
};

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],7:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],8:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./support/isBuffer":7,"_process":6,"inherits":5}],9:[function(require,module,exports){
/**
 * HashMap - HashMap Class for JavaScript
 * @author Ariel Flesler <aflesler@gmail.com>
 * @version 2.0.1
 * Homepage: https://github.com/flesler/hashmap
 */

(function(factory) {
	if (typeof define === 'function' && define.amd) {
		// AMD. Register as an anonymous module.
		define([], factory);
	} else if (typeof module === 'object') {
		// Node js environment
		var HashMap = module.exports = factory();
		// Keep it backwards compatible
		HashMap.HashMap = HashMap;
	} else {
		// Browser globals (this is window)
		this.HashMap = factory();
	}
}(function() {

	function HashMap(other) {
		this.clear();
		switch (arguments.length) {
			case 0: break;
			case 1: this.copy(other); break;
			default: multi(this, arguments); break;
		}
	}

	var proto = HashMap.prototype = {
		constructor:HashMap,

		get:function(key) {
			var data = this._data[this.hash(key)];
			return data && data[1];
		},

		set:function(key, value) {
			// Store original key as well (for iteration)
			this._data[this.hash(key)] = [key, value];
		},

		multi:function() {
			multi(this, arguments);
		},

		copy:function(other) {
			for (var key in other._data) {
				this._data[key] = other._data[key];
			}
		},

		has:function(key) {
			return this.hash(key) in this._data;
		},

		search:function(value) {
			for (var key in this._data) {
				if (this._data[key][1] === value) {
					return this._data[key][0];
				}
			}

			return null;
		},

		remove:function(key) {
			delete this._data[this.hash(key)];
		},

		type:function(key) {
			var str = Object.prototype.toString.call(key);
			var type = str.slice(8, -1).toLowerCase();
			// Some browsers yield DOMWindow for null and undefined, works fine on Node
			if (type === 'domwindow' && !key) {
				return key + '';
			}
			return type;
		},

		keys:function() {
			var keys = [];
			this.forEach(function(value, key) { keys.push(key); });
			return keys;
		},

		values:function() {
			var values = [];
			this.forEach(function(value) { values.push(value); });
			return values;
		},

		count:function() {
			return this.keys().length;
		},

		clear:function() {
			// TODO: Would Object.create(null) make any difference
			this._data = {};
		},

		clone:function() {
			return new HashMap(this);
		},

		hash:function(key) {
			switch (this.type(key)) {
				case 'undefined':
				case 'null':
				case 'boolean':
				case 'number':
				case 'regexp':
					return key + '';

				case 'date':
					return ':' + key.getTime();

				case 'string':
					return '"' + key;

				case 'array':
					var hashes = [];
					for (var i = 0; i < key.length; i++) {
						hashes[i] = this.hash(key[i]);
					}
					return '[' + hashes.join('|');

				default:
					// TODO: Don't use expandos when Object.defineProperty is not available?
					if (!key._hmuid_) {
						key._hmuid_ = ++HashMap.uid;
						hide(key, '_hmuid_');
					}

					return '{' + key._hmuid_;
			}
		},

		forEach:function(func) {
			for (var key in this._data) {
				var data = this._data[key];
				func.call(this, data[1], data[0]);
			}
		}
	};

	HashMap.uid = 0;

	//- Automatically add chaining to some methods

	for (var method in proto) {
		// Skip constructor, valueOf, toString and any other built-in method
		if (method === 'constructor' || !proto.hasOwnProperty(method)) {
			continue;
		}
		var fn = proto[method];
		if (fn.toString().indexOf('return ') === -1) {
			proto[method] = chain(fn);
		}
	}

	//- Utils

	function multi(map, args) {
		for (var i = 0; i < args.length; i += 2) {
			map.set(args[i], args[i+1]);
		}
	}

	function chain(fn) {
		return function() {
			fn.apply(this, arguments);
			return this;
		};
	}

	function hide(obj, prop) {
		// Make non iterable if supported
		if (Object.defineProperty) {
			Object.defineProperty(obj, prop, {enumerable:false});
		}
	}

	return HashMap;
}));

},{}],"buffer":[function(require,module,exports){
/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2014 Joël Charles
 * Licensed under the MIT license.
 */
var serialize = require('./serializer').serialize,
    Glouton = require('./glouton'),
    HashMap = require('./hashmap'),
    logger = require('debug', 'libquassel:buffer'),
    IRCMessage = require('./message').IRCMessage;

var IRCBuffer = function IRCBuffer(id, data) {
    serialize(this);
    this.devour(data);
    this.id = id;
    this.nickUserMap = {};
    this.nickUserModesMap = {};
    this.messages = new HashMap();
    this.active = false;
    this._isStatusBuffer = false;
    this.order = null;
    if (this.type == IRCBuffer.Types.StatusBuffer) {
        this._isStatusBuffer = true;
    }
};

Glouton.extend(IRCBuffer);

/**
 * Switch buffer state
 * @param {boolean} bool
 */
IRCBuffer.prototype.setActive = function(bool) {
    this.active = bool;
};

/**
 * Set buffer index
 * @param {number} order
 */
IRCBuffer.prototype.setOrder = function(order) {
    this.order = order;
};

/**
 * Is this buffer a channel
 */
IRCBuffer.prototype.isChannel = function() {
    return this.name && "#&+!".indexOf(this.name[0]) !== -1;
};

/**
 * Add user to buffer
 * @param {IRCUser} user
 * @param {string} modes
 */
IRCBuffer.prototype.addUser = function(user, modes) {
    if (user && typeof user.nick === "string") {
        this.nickUserMap[user.nick] = user;
        this.nickUserModesMap[user.nick] = modes;
    }
};

/**
 * add mode to user
 * @param {IRCUser} user
 * @param {string} mode
 */
IRCBuffer.prototype.addUserMode = function(user, mode) {
    if (user && typeof user.nick === "string") {
        this.nickUserModesMap[user.nick] += mode;
    }
};

/**
 * Returns true if user is chan operator
 * @param {string} nick
 * @return
 */
IRCBuffer.prototype.isOp = function(nick) {
    return (this.nickUserModesMap[nick]||"").indexOf('o') !== -1;
};

/**
 * Returns true if user is voiced
 * @param {string} nick
 * @return
 */
IRCBuffer.prototype.isVoiced = function(nick) {
    return (this.nickUserModesMap[nick]||"").indexOf('v') !== -1;
};

/**
 * remove mode from user
 * @param {IRCUser} user
 * @param {string} mode
 */
IRCBuffer.prototype.removeUserMode = function(user, mode) {
    if (user && typeof user.nick === "string") {
        this.nickUserModesMap[user.nick] += this.nickUserModesMap[user.nick].replace(mode, "");
    }
};

/**
 * Check if current buffer contains specified user
 * @param {IRCUser} user
 */
IRCBuffer.prototype.hasUser = function(user) {
    if (typeof user === 'undefined' || user === null) {
        logger("User should not be null or undefined");
        return null;
    }
    return user.nick in this.nickUserMap;
};

/**
 * Remove user from buffer
 * @param {(string|IRCUser)} username
 */
IRCBuffer.prototype.removeUser = function(username) {
    if (typeof username.nick === 'string') {
        username = username.nick;
    }
    delete this.nickUserMap[username];
    delete this.nickUserModesMap[username];
};

/**
 * Add message to buffer
 * @param {*} message
 * @return the message, if successfully added, null otherwise
 */
IRCBuffer.prototype.addMessage = function(message) {
    message.id = parseInt(message.id, 10);
    if (this.messages.has(message.id)) {
        return null;
    }
    this.messages.set(message.id, new IRCMessage(message));
    return this.messages.get(message.id);
};

/**
 * Check if specified messageId is the last one of this buffer
 * @param {*} messageId
 * @return
 */
IRCBuffer.prototype.isLast = function(messageId) {
    messageId = parseInt(messageId, 10);
    var max = Math.max.apply(null, this.messages.keys());
    return max === messageId;
};

/**
 * get the first message (sorted by id)
 * @param {*} messageId
 * @return
 */
IRCBuffer.prototype.getFirstMessage = function() {
    var min = Math.min.apply(null, this.messages.keys());
    return this.messages.get(min);
};

/**
 * get the last message (sorted by id)
 * @param {*} messageId
 * @return
 */
IRCBuffer.prototype.getLastMessage = function() {
    var max = Math.max.apply(null, this.messages.keys());
    return this.messages.get(max);
};

/**
 * Name setter
 * @param {string} name
 */
IRCBuffer.prototype.setName = function(name) {
    this.name = name?name.toString():null;
};

/**
 * get BufferInfo structure
 * @return BufferInfo
 */
IRCBuffer.prototype.getBufferInfo = function() {
    return {
        id: this.id,
        network: this.network,
        type: this.type,
        group: this.group || 0,
        name: this.name
    };
};

/**
 * Returns true if this buffer is a StatusBuffer
 * @return BufferInfo
 */
IRCBuffer.prototype.isStatusBuffer = function(bool) {
    if (typeof bool === "undefined")
        return this._isStatusBuffer;
    else
        this._isStatusBuffer = bool;
};

/**
 * Flag the buffer as temporarily removed
 * @param {boolean} flag
 */
IRCBuffer.prototype.setTemporarilyRemoved = function(flag) {
    this.isTemporarilyRemoved = flag;
};

/**
 * Flag the buffer as permanently removed
 * @param {boolean} flag
 */
IRCBuffer.prototype.setPermanentlyRemoved = function(flag) {
    this.isPermanentlyRemoved = flag;
};

/**
 * Is the buffer hidden/removed (permanently or temporarily)
 */
IRCBuffer.prototype.isHidden = function() {
    return this.isPermanentlyRemoved || this.isTemporarilyRemoved;
};

var IRCBufferCollection = function IRCBufferCollection() {
    serialize(this);
    this.buffers = new HashMap();
    this.filteredBuffers = new HashMap();
};

/**
 * @param {IRCBuffer} buffer
 */
IRCBufferCollection.prototype.addBuffer = function(buffer) {
    if (this.buffers.has(buffer.id)) {
        logger("Buffer already added (" + buffer.name + ")");
        return;
    }
    this.buffers.set(buffer.id, buffer);
    this._computeFilteredBuffers();
};

/**
 * @param {IRCBuffer} buffer
 * @protected
 */
IRCBufferCollection.prototype._isBufferFiltered = function(buffer) {
    if (buffer.isPermanentlyRemoved || buffer.isTemporarilyRemoved) {
        return true;
    } else {
        return false;
    }
};

/**
 * @param {(number|string|Buffer)} bufferId
 */
IRCBufferCollection.prototype.getBuffer = function(bufferId) {
    if (typeof bufferId.str === 'function') {
        bufferId = bufferId.str();
    }
    if (typeof bufferId === 'string') {
        bufferId = bufferId.toLowerCase();
        var buffers = this.buffers.values();
        for (var key in buffers) {
            if (typeof buffers[key].name === 'string') {
                if (buffers[key].name.toLowerCase() === bufferId) {
                    return buffers[key];
                }
            }
        }
    } else {
        // number
        var buffer = this.buffers.get(bufferId);
        if (typeof buffer !== 'undefined') {
            return buffer;
        }
    }
    return null;
};

/**
 * @param {(number|string|Buffer)} bufferId
 */
IRCBufferCollection.prototype.hasBuffer = function(bufferId) {
    if (typeof bufferId === 'string' || typeof bufferId.str === 'function') {
        return this.getBuffer(bufferId) !== null;
    } else {
        return this.buffers.has(bufferId);
    }
};

/**
 * @param {(number|string)} bufferId
 */
IRCBufferCollection.prototype.removeBuffer = function(bufferId) {
    if (this.hasBuffer(bufferId)) {
        this.buffers.remove(this.getBuffer(bufferId).id);
    }
};


/**
 * @param {Buffer} buffer
 * @param {(number|string)} bufferIdTo
 */
IRCBufferCollection.prototype.moveBuffer = function(buffer, bufferIdTo) {
    var bufferIdFrom = buffer.id;
    this.buffers.set(bufferIdTo, buffer);
    buffer.id = bufferIdTo;
    this.buffers.remove(bufferIdFrom);
};

/**
 * @protected
 */
IRCBufferCollection.prototype._computeFilteredBuffers = function() {
    var key, buffers = this.buffers.values(), has;
    for (key in buffers) {
        has = this.filteredBuffers.has(buffers[key].id);
        if (this._isBufferFiltered(buffers[key])){
            if (!has) {
                this.filteredBuffers.set(buffers[key].id, buffers[key]);
            }
        } else {
            if (has) {
                this.filteredBuffers.remove(buffers[key].id);
            }
        }
    }
};

IRCBuffer.Types = {
    InvalidBuffer: 0x00,
    StatusBuffer: 0x01,
    ChannelBuffer: 0x02,
    QueryBuffer: 0x04,
    GroupBuffer: 0x08
};

exports.IRCBuffer = IRCBuffer;
exports.IRCBufferCollection = IRCBufferCollection;

},{"./glouton":1,"./hashmap":"serialized-hashmap","./message":"message","./serializer":"serializer","debug":2}],"extend":[function(require,module,exports){
var hasOwn = Object.prototype.hasOwnProperty;
var toString = Object.prototype.toString;
var undefined;

var isPlainObject = function isPlainObject(obj) {
	'use strict';
	if (!obj || toString.call(obj) !== '[object Object]') {
		return false;
	}

	var has_own_constructor = hasOwn.call(obj, 'constructor');
	var has_is_property_of_method = obj.constructor && obj.constructor.prototype && hasOwn.call(obj.constructor.prototype, 'isPrototypeOf');
	// Not own constructor property must be Object
	if (obj.constructor && !has_own_constructor && !has_is_property_of_method) {
		return false;
	}

	// Own properties are enumerated firstly, so to speed up,
	// if last one is own, then all properties are own.
	var key;
	for (key in obj) {}

	return key === undefined || hasOwn.call(obj, key);
};

module.exports = function extend() {
	'use strict';
	var options, name, src, copy, copyIsArray, clone,
		target = arguments[0],
		i = 1,
		length = arguments.length,
		deep = false;

	// Handle a deep copy situation
	if (typeof target === 'boolean') {
		deep = target;
		target = arguments[1] || {};
		// skip the boolean and the target
		i = 2;
	} else if ((typeof target !== 'object' && typeof target !== 'function') || target == null) {
		target = {};
	}

	for (; i < length; ++i) {
		options = arguments[i];
		// Only deal with non-null/undefined values
		if (options != null) {
			// Extend the base object
			for (name in options) {
				src = target[name];
				copy = options[name];

				// Prevent never-ending loop
				if (target === copy) {
					continue;
				}

				// Recurse if we're merging plain objects or arrays
				if (deep && copy && (isPlainObject(copy) || (copyIsArray = Array.isArray(copy)))) {
					if (copyIsArray) {
						copyIsArray = false;
						clone = src && Array.isArray(src) ? src : [];
					} else {
						clone = src && isPlainObject(src) ? src : {};
					}

					// Never move original objects, clone them
					target[name] = extend(deep, clone, copy);

				// Don't bring in undefined values
				} else if (copy !== undefined) {
					target[name] = copy;
				}
			}
		}
	}

	// Return the modified object
	return target;
};


},{}],"ignore":[function(require,module,exports){
var serialize = require('./serializer').serialize;
var MT = require('./message').Type;

var IgnoreType = {
    SENDER: 0,
    MESSAGE: 1,
    CTCP: 2
};
var StrictnessType = {
    UNMATCHED: 0,
    SOFT: 1,
    HARD: 2
};
var ScopeType = {
    GLOBAL: 0,
    NETWORK: 1,
    CHANNEL: 2
};

var IgnoreItem = function IgnoreItem(strictness, scopeRule, scope, isRegEx, isActive, ignoreType, ignoreRule){
    serialize(this);
    this.strictness = strictness;
    this.scopeRule = scopeRule;
    this.scope = scope;
    this.isRegEx = isRegEx;
    this.isActive = isActive;
    this.ignoreType = ignoreType;
    this.ignoreRule = ignoreRule;
    this.regexScope = [];
    this.revived();
};

IgnoreItem.prototype.matchScope = function(subject) {
    var ret = false, i = 0;
    for (; i<this.regexScope.length && !ret; i++) {
        ret = subject.match(this.regexScope[i]) !== null;
    }
    return ret;
};

IgnoreItem.prototype.matchIgnore = function(subject) {
    return subject.match(this.regexIgnore) !== null;
};

function wildcardToRegex(subject) {
    var input = subject.trim();
    input = input.replace(/([.+^$\\(){}|-])/g, "\\$1").replace("*", ".*").replace("?", ".");
    return new RegExp("^" + input + "$", 'i');
}

IgnoreItem.prototype.revived = function() {
    var scopeRules = this.scopeRule.split(";"), i = 0;
    this.regexScope = [];
    for (; i<scopeRules.length; i++) {
        this.regexScope.push(wildcardToRegex(scopeRules[i]));
    }
    try {
        this.regexIgnore = this.isRegEx?new RegExp(this.ignoreRule, 'i'):new RegExp(this.ignoreRule.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1"), 'i');
    } catch (e) {
        console.log("Invalid RexExp", e);
        this.isActive = false;
    }
};

var IgnoreList = function IgnoreList(){
    serialize(this);
    this.list = [];
};

IgnoreList.prototype.import = function(map) {
    var i=0;
    this.list = [];
    for (; i<map.IgnoreList.ignoreRule.length; i++) {
        var item = new IgnoreItem(
            map.IgnoreList.strictness[i],
            map.IgnoreList.scopeRule[i],
            map.IgnoreList.scope[i],
            map.IgnoreList.isRegEx[i],
            map.IgnoreList.isActive[i],
            map.IgnoreList.ignoreType[i],
            map.IgnoreList.ignoreRule[i]
        );
        this.list.push(item);
    }
};

IgnoreList.prototype.export = function() {
    var i=0;
    var ret = {
        IgnoreList: {
            strictness: [],
            scopeRule: [],
            scope: [],
            isRegEx: [],
            isActive: [],
            ignoreType: [],
            ignoreRule: []
        }
    };
    for (; i<this.list.length; i++) {
        ret.IgnoreList.strictness.push(this.list[i].strictness);
        ret.IgnoreList.scopeRule.push(this.list[i].scopeRule);
        ret.IgnoreList.scope.push(this.list[i].strictness);
        ret.IgnoreList.isRegEx.push(this.list[i].isRegEx);
        ret.IgnoreList.isActive.push(this.list[i].isActive);
        ret.IgnoreList.ignoreType.push(this.list[i].ignoreType);
        ret.IgnoreList.ignoreRule.push(this.list[i].ignoreRule);
    }
    return ret;
};

IgnoreList.prototype.matches = function(message, networks) {
    var network = networks.get(message.networkId);
    var buffer = network.getBufferCollection().getBuffer(message.bufferId);
    var i = 0;

    if (message.type !== MT.Plain && message.type !== MT.Action && message.type !== MT.Notice)
        return false;
    
    for (; i<this.list.length; i++) {
        var item = this.list[i];
        if (!item.isActive || item.ignoreType === IgnoreType.CTCP)
           continue;
        if (item.scope === ScopeType.GLOBAL
                || (item.scope === ScopeType.NETWORK && item.matchScope(network.networkName))
                || (item.scope === ScopeType.CHANNEL && item.matchScope(buffer.name))) {
            var subject;
            if (item.ignoreType === IgnoreType.MESSAGE)
                subject = message.content;
            else
                subject = message.sender;

            if (item.matchIgnore(subject)) {
                return true;
            }
        }
    }

    return false;
};

exports.IgnoreItem = IgnoreItem;
exports.IgnoreList = IgnoreList;

},{"./message":"message","./serializer":"serializer"}],"message":[function(require,module,exports){
var serialize = require('./serializer').serialize;

var Type = {
    Plain: 0x00001,
    Notice: 0x00002,
    Action: 0x00004,
    Nick: 0x00008,
    Mode: 0x00010,
    Join: 0x00020,
    Part: 0x00040,
    Quit: 0x00080,
    Kick: 0x00100,
    Kill: 0x00200,
    Server: 0x00400,
    Info: 0x00800,
    Error: 0x01000,
    DayChange: 0x02000,
    Topic: 0x04000,
    NetsplitJoin: 0x08000,
    NetsplitQuit: 0x10000,
    Invite: 0x20000
};

var Flag = {
    None: 0x00,
    Self: 0x01,
    Highlight: 0x02,
    Redirected: 0x04,
    ServerMsg: 0x08,
    Backlog: 0x80
};

var IRCMessage = function IRCMessage(message) {
    serialize(this);
    this.id = message.id;
    this.datetime = new Date(message.timestamp * 1000);
    this.type = message.type;
    this.flags = message.flags;
    this.sender = message.sender?message.sender.str():null;
    this.content = message.content?message.content.str():null;
    this.networkId = message.bufferInfo.network;
    this.bufferId = message.bufferInfo.id;
};

IRCMessage.prototype.isSelf = function() {
    return (this.flags & Flag.Self) !== 0;
};

IRCMessage.prototype._updateFlags = function(nick) {
    if (this.type == Type.Plain || this.type == Type.Action) {
        if (nick) {
            var quotedNick = nick.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1");
            var regex = new RegExp("([\\W]|^)"+quotedNick+"([\\W]|$)", "i");
            if (regex.test(this.content)) {
                this.flags = this.flags | Flag.Highlight;
            }
        }
    }
};

IRCMessage.prototype.isHighlighted = function() {
    return ((this.flags & Flag.Highlight) !== 0) && !this.isSelf();
};

IRCMessage.prototype.getNick = function() {
    return this.sender.split("!")[0];
};

IRCMessage.prototype.getHostmask = function() {
    return this.sender.split("!")[1];
};

exports.IRCMessage = IRCMessage;
exports.Type = Type;
exports.Flag = Flag;

},{"./serializer":"serializer"}],"network":[function(require,module,exports){
/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2014 Joël Charles
 * Licensed under the MIT license.
 */

var Glouton = require('./glouton'),
    serialize = require('./serializer').serialize,
    IRCUser = require('./user'),
    IRCBufferCollection = require('./buffer').IRCBufferCollection,
    logger = require('debug')('libquassel:network'),
    HashMap = require('./hashmap');

var Network = function Network(networkId) {
    serialize(this);
    
    this.networkId = networkId;
    this.buffers = new IRCBufferCollection();
    this.nickUserMap = {}; // HashMap<String, IrcUser>
    this.open = false;
    this.connectionState = Network.ConnectionState.Disconnected;
    this.isConnected = false;
    this.latency = 0;
    this.statusBuffer = null;
    this.networkName = null;
    this.nick = null;
    this.server = null;
};

Glouton.extend(Network);

var NetworkCollection = function NetworkCollection() {
    serialize(this);
    this.hm = new HashMap();
};

NetworkCollection.prototype.add = function(networkid) {
    networkid = parseInt(networkid, 10);
    this.hm.set(networkid, new Network(networkid));
    return this.hm.get(networkid);
};

NetworkCollection.prototype.set = function(networkid, network) {
    networkid = parseInt(networkid, 10);
    this.hm.set(networkid, network);
    return network;
};

NetworkCollection.prototype.get = function(networkid) {
    networkid = parseInt(networkid, 10);
    return this.hm.get(networkid);
};

NetworkCollection.prototype.remove = function(networkid) {
    networkid = parseInt(networkid, 10);
    this.hm.remove(networkid);
};

NetworkCollection.prototype.findBuffer = function(bufferId) {
    if (typeof bufferId !== "number") return null;
    var networks = this.hm.values(), ind;
    for (ind in networks) {
        if (networks[ind].getBufferCollection().hasBuffer(bufferId)) {
            return networks[ind].getBufferCollection().getBuffer(bufferId);
        }
    }
    return null;
};

NetworkCollection.prototype.removeBuffer = function(bufferId) {
    var buffer = this.findBuffer(bufferId);
    if (buffer !== null) {
        this.get(buffer.network).getBufferCollection().removeBuffer(bufferId);
    }
};

NetworkCollection.prototype.all = function() {
    return this.hm.values();
};

Network.ConnectionState = {
    Disconnected: 0,
    Connecting: 1,
    Initializing: 2,
    Initialized: 3,
    Reconnecting: 4,
    Disconnecting: 5
};

/**
 * @param {string} networkName
 */
Network.prototype.setName = function(networkName) {
    this.networkName = networkName;
    this.updateTopic();
};

/**
 * @param {Array<IrcUser>} networkName
 */
Network.prototype.setUserList = function(userList) {
    var i;
    this.nickUserMap.clear();
    if (userList !== null && userList.length> 0) {
        for (i=0; i<userList.length; i++) {
            this.nickUserMap.put(userList[i].nick, userList[i]);
        }
    }
};

/**
 * // Devour function
 * @param {Array<IrcUser>} networkName
 */
Network.prototype.setMyNick = function(nick) {
    this.nick = nick;
};

/**
 * @param {string} oldNick
 * @param {string} newNick
 */
Network.prototype.renameUser = function(oldNick, newNick) {
    var user = this.getUserByNick(oldNick);
    user.nick = newNick;
    this.nickUserMap[newNick] = user;
    delete this.nickUserMap[oldNick];
};

/**
 * @param {IrcUser} user
 */
Network.prototype.addUser = function(user) {
    this.nickUserMap[user.nick] = user;
};

/**
 * @param {string} nick
 * @param {function} cb
 */
Network.prototype.removeUser = function(nick, cb) {
    // remove user from channels
    // and disable user buffer
    var ircuser = this.getUserByNick(nick);
    this.getBufferHashMap().forEach(function(value, key){
        if (value.isChannel()) {
            if (value.hasUser(ircuser)) {
                value.removeUser(ircuser);
            }
        }
        if (typeof activeCallback === 'function') {
            cb(value);
        }
    });
    delete this.nickUserMap[nick];
};

/**
 * @param {string} nick
 */
Network.prototype.hasNick = function(nick) {
    return nick in this.nickUserMap;
};

/**
 * @param {string} nick
 */
Network.prototype.getUserByNick = function(nick) {
    return this.nickUserMap[nick] || null;
};

/**
 * @param {boolean} connected
 */
Network.prototype.setConnected = function(connected) {
    if (connected) {
        //this.setOpen(true);
        if (this.statusBuffer !== null) {
            this.statusBuffer.setActive(true);
        }
    } else {
        //this.setOpen(false);
        if (this.statusBuffer !== null) {
            this.statusBuffer.setActive(false);
        }
        /* TODO
        for (Buffer buffer : buffers.getRawBufferList()) {
            buffer.setActive(false);
        }
        */
    }
    this.isConnected = connected;
};

/**
 * @param {Object} uac
 */
Network.prototype.setIrcUsersAndChannels = function(uac) {
    var key, user, channel, nick, self=this;
    
    // Create IRCUsers and attach them to network
    for (key in uac.users) {
        user = new IRCUser(key, uac.users[key]);
        this.nickUserMap[user.nick] = user;
    }
    // If there is a buffer corresponding to a nick, activate the buffer
    this.getBufferHashMap().forEach(function(value){
        if (typeof self.nickUserMap[value.name] !== 'undefined') {
            value.setActive(true);
        }
    });
    // Create Channels and attach them to network
    for (key in uac.channels) {
        channel = this.getBuffer(key);
        //Then attach users to channels
        for (nick in uac.channels[key].UserModes) {
            user = this.getUserByNick(nick);
            if (user !== null) {
                channel.addUser(user, uac.channels[key].UserModes[nick]);
            } else {
                logger("User " + nick + " have not been found on server.");
            }
        }
    }
};

/**
 * @param {number} latency
 */
Network.prototype.setLatency = function(latency) {
    this.latency = latency;
};

/**
 * @param {string} server
 */
Network.prototype.setServer = function(server) {
    this.server = server;
};

/**
 */
Network.prototype.updateTopic = function() {
    if (this.statusBuffer !== null) {
        this.statusBuffer.setTopic("");
    }
};

/**
 * @param {IRCBuffer} statusBuffer
 */
Network.prototype.setStatusBuffer = function(statusBuffer) {
    this.statusBuffer = statusBuffer;
};

/**
 * @returns {IRCBuffer}
 */
Network.prototype.getStatusBuffer = function() {
    return this.statusBuffer;
};

/**
 * @returns {IRCBufferCollection}
 */
Network.prototype.getBufferCollection = function() {
    return this.buffers;
};

/**
 * @returns {HashMap}
 */
Network.prototype.getBufferHashMap = function() {
    return this.buffers.buffers;
};

/**
 */
Network.prototype.getBuffer = function(ind) {
    return this.buffers.getBuffer(ind);
};

exports.Network = Network;
exports.NetworkCollection = NetworkCollection;

},{"./buffer":"buffer","./glouton":1,"./hashmap":"serialized-hashmap","./serializer":"serializer","./user":"user","debug":2}],"serialized-hashmap":[function(require,module,exports){
/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2014 Joël Charles
 * Licensed under the MIT license.
 */

var HM = require("hashmap").HashMap,
    util = require("util"),
    serialize = require('./serializer').serialize;

var HashMap = function HashMap(){
    HashMap.super_.call(this);
    serialize(this);
};

util.inherits(HashMap, HM);

HashMap.prototype.forEach = function(func, sortfunction, stop) {
    var key, resp;
    if (typeof sortfunction === 'function') {
        var arr = [], i = 0;
        for (key in this._data) {
            arr.push(this._data[key][1]);
        }
        arr.sort(sortfunction);
        for (;i<arr.length;i++) {
            resp = func.call(this, arr[i], arr[i].id);
            if (stop && resp !== true) break;
        }
    } else {
        for (key in this._data) {
            var data = this._data[key];
            resp = func.call(this, data[1], data[0]);
            if (stop && resp !== true) break;
        }
    }
    return (stop && resp !== true);
};

module.exports = HashMap;

},{"./serializer":"serializer","hashmap":9,"util":8}],"serializer":[function(require,module,exports){
/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2014 Joël Charles
 * Licensed under the MIT license.
 */

var extend = require('extend');

var serialize = function serialize(obj) {
    obj.__s_cls = obj.constructor.name;
    obj.__s_done = false;
};

var Reviver = function() {
    var args = Array.prototype.slice.call(arguments), i;
    this.map = {};
    // Used for revive
    for (i=0; i<args.length; i++) {
        this.push(args[i].name, args[i]);
    }
};

Reviver.prototype.push = function(key, val) {
    this.map[key] = val;
};

Reviver.prototype.get = function(key) {
    return this.map[key];
};

Reviver.prototype.revivable = function(obj) {
    return !!obj && !obj.__s_done && !!obj.__s_cls;
};

Reviver.prototype.afterReviving = function(obj, callback) {
    var self = this;
    if (this.revivable(obj)) {
        setTimeout(function() {
            self.afterReviving(obj, callback);
        }, 10);
    } else {
        callback(obj);
    }
};

Reviver.prototype.revive = function(obj) {
    if (this.revivable(obj)) {
        var cls = this.get(obj.__s_cls);
        var newobj = Object.create(cls.prototype);
        extend(obj, newobj);
        obj.__s_done = true;
        return true;
    }
    return false;
};

Reviver.prototype.reviveAll = function(obj) {
    var self = this;
    if (self.revive(obj) && typeof obj.revived === "function") {
        obj.revived();
    }
    walk(obj, function(node) {
        if (self.revive(node) && typeof node.revived === "function") {
            node.revived();
        }
    });
};


// inspired from https://github.com/substack/js-traverse
function walk (root, cb) {
    var path = [];
    var parents = [];

    function walker (node) {
        var state = {
            node : node,
            path : [].concat(path),
            parent : parents[parents.length - 1],
            parents : parents,
            key : path.slice(-1)[0],
            isRoot : path.length === 0,
            level : path.length,
            circular : null,
            keys : null
        };

        function updateState() {
            if (typeof node === 'object' && node !== null) {
                if (!state.keys) {
                    state.keys = Object.keys(node);
                }

                for (var i = 0; i < parents.length; i++) {
                    if (parents[i].node === node) {
                        state.circular = true;
                        break;
                    }
                }
            } else {
                state.keys = null;
            }
        }

        updateState();

        cb(node);

        if (typeof node === 'object' && node !== null && !state.circular) {
            parents.push(state);

            updateState();

            state.keys.forEach(function (key) {
                path.push(key);
                walker(node[key]);
                path.pop();
            });
            parents.pop();
        }

        return state;
    }
    walker(root);
}

exports.serialize = serialize;
exports.Reviver = Reviver;

},{"extend":"extend"}],"user":[function(require,module,exports){
/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2014 Joël Charles
 * Licensed under the MIT license.
 */

var serialize = require('./serializer').serialize,
    Glouton = require('./glouton');

var IRCUser = function IRCUser(id, data) {
    serialize(this);
    this.id = id;
    this.nick = this.id.split('!')[0];
    if (data) {
        this.devour(data);
    }
};

Glouton.extend(IRCUser);

module.exports = IRCUser;
},{"./glouton":1,"./serializer":"serializer"}]},{},[]);
