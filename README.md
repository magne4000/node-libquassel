# libquassel
Javascript library to connect and interact with Quassel IRC server.

## Install
```sh
npm install --production libquassel
```

## Use in browser
You just need to import `dist/libquassel.js` in your HTML page.

## Development
```sh
npm install libquassel
```

In order to create a browser compatible file, run the following commands
```sh
# use browserify to build on change
npm run watch
# before commit, make the dev version + minified version + the doc
npm run build
```

### 3.0 breaking changes
Version `3.0` introduces the following breaking changes:

- `message.Type` as been superseded by `message.Types`, and all its constants are now UPPERCASE
- `channel.active` as been superseded by `channel.isActive`
- `channel.isChannel()` as been superseded by `channel.isChannel`
- `channel.isHighlighted()` as been superseded by `channel.isHighlighted`
- `channel.getStatusBuffer()` as been superseded by `channel.statusBuffer`

#### node specific
- `Client(...).connect` method expects a `Socket` or any other `Duplex` as parameter.

#### browser specific
- `libquassel` is available as a global object.
- `Client(...).connect` method expects a `libquassel.WebSocketStream` or any other `Duplex` as parameter.

### Getting Started
#### node
```javascript
const { Client } = require('libquassel.js');
const net = require('net');

const socket = net.createConnection({
  host: "localhost",
  port: 4242
});

const quassel = new Client((next) => next("user", "password"));

quassel.on('network.init', (networkId) => {
    network = quassel.networks.get(networkId);
    // ...
});

// ...

quassel.connect(socket);
```

#### browser
```html
<!-- In your HTML -->
<script src="/path/to/libquassel.js"></script>
```
```javascript
// libquassel in available as a global in browser
const socket = new libquassel.WebSocketStream('wss://domain.tld:12345', ['binary', 'base64']);
const quassel = new libquassel.Client((next) => next("user", "password"));

quassel.on('network.init', (networkId) => {
    network = quassel.networks.get(networkId);
    // ...
});

// ...

quassel.connect(socket);
```

### Documentation
[3.0.0](https://magne4000.github.com/libquassel/3.0.0 "libquassel 3.0.0 documentation")

### Examples
See [test](test) folder for examples.

## License
Copyright (c) 2017 Joël Charles
Licensed under the MIT license.
