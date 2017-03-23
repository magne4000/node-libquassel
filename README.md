# libquassel
Javascript library to connect and interact with Quassel IRC server.

## Install
```sh
npm install --production libquassel
```

## Use in browser
You just need to import `client/libquassel.js` or `client/libquassel.min.js` in your HTML page.

## Development
```sh
npm install libquassel
```

In order to create a browser compatible file, run the following commands
```sh
# for development
grunt dev
# before commit, make the dev version + minified version + the doc
grunt dist
# or if there is not need to update the doc
grunt browserify:dev browserify:dist
```

### 2.0 breaking changes
Version `2.0` introduces `BufferView` object, and this break some existing behavior.
* New `bufferview` module
* `IRCBuffer` changes
  * unused `order` attribute removed
  * `setTemporarilyRemoved`, `setPermanentlyRemoved` and `isHidden` are no longer part of this class. Those are moved to `BufferView` class.
* events
  * `buffer.unhide` replaced by `bufferview.bufferunhide`
  * `buffer.hidden` replaced by `bufferview.bufferhidden`
  * `buffer.order` deleted. New `bufferview.orderchanged` and `bufferview.init` events

### Getting Started
```javascript
var Quassel = require('../lib/libquassel.js');
var quassel = new Quassel(
    "quassel.domain.tld", // Quasselcore address
    4242, // Quasselcore port
    // Options:
    //   nobacklogs (default false): if true, do not handle backlogs
    //   backloglimit: number of backlogs to request per buffer at connection
    //   securecore (default true): if false, do not use SSL to connect to the core
    //   highlightmode (default to current nick only): see documentation
    {backloglimit: 10}, 
    function(next) {
        next("user", "password");
    }
);

quassel.on('network.init', function(networkId) {
    network = quassel.getNetworks().get(networkId);
    // ...
});

// ...

quassel.connect();
```

### Documentation
[2.1.7](https://magne4000.github.com/libquassel/2.1.7 "libquassel 2.1.7 documentation")

### Examples
See _test/manual.js_ for details.

## License
Copyright (c) 2017 Joël Charles  
Licensed under the MIT license.
