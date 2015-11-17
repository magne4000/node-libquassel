# libquassel
NodeJS lib to connect and interact with Quassel IRC server.
The last version is only compatible with nodeJS>=5.
For a version compatible with nodeJS between 0.12 and 4.x, please use 0.7.1 (through `npm`).

## Install
  npm install --production libquassel

## Development
  npm install libquassel

In order to create a browser compatible file, run the following command
  # for nodejs 0.12 to 4.x
  grunt lts
  # for nodejs >=5
  grunt stable

## Getting Started
```javascript
var Quassel = require('../lib/libquassel.js');
var quassel = new Quassel(
        "quassel.domain.tld", // Quasselcore address
        4242, // Quasselcore port
        // Options:
        //   nobacklogs (default false): if true, do not handle backlogs
        //   backloglimit: number of backlogs to request per buffer at connection
        //   unsecurecore (default false): if true, do not use SSL to connect to the core
        {backloglimit: 10}, 
        function(next) {
    next("user", "password");
});

quassel.on('network.init', function(networkId) {
    network = quassel.getNetworks().get(networkId);
    // ...
});

// ...

quassel.connect();
```

All events are detailed in _test/manual.js_ for now.

## Examples
See _test/manual.js_ for details.

## License
Copyright (c) 2014-2015 Joël Charles  
Licensed under the MIT license.
