const { Client } = require('../src/libquassel.js');
const test = require('tape');
const net = require('net');

function loginOk(next) {
  next("unittest", "unittest");
}

function loginError(next) {
  next("wrong", "wrong");
}

const timeoutObj = {timeout: 3000};

const quassel = new Client(loginError);

const socket = net.createConnection({
  host: "localhost",
  port: 4243
});

test('setup', timeoutObj, (t) => {
  t.plan(3);

  quassel.once('setup', (data) => {
    t.pass("setup event received");
    quassel.setupCore('wrongbackend', 'unittest', 'unittest');
  });

  quassel.once('setupfailed', (data) => {
    t.pass("setupfailed event received");
    quassel.setupCore('SQLite', 'unittest', 'unittest');
  });

  quassel.once('setupok', (data) => {
    t.pass("setupok event received");
  });
});

test('login', timeoutObj, (t) => {
  t.plan(5);

  quassel.once('loginfailed', () => {
    t.pass("loginfailed event received");
    quassel.loginCallback = loginOk;
    quassel.login();
  });

  quassel.once('login', () => {
    t.pass("login event received");
  });

  quassel.once('ignorelist', () => {
    t.pass("ignorelist event received");
  });

  quassel.once('bufferview.ids', () => {
    t.pass("bufferview.ids event received");
  });

  quassel.once('aliases', () => {
    t.pass("aliases event received");
  });

  quassel.login();
});

test('identity', timeoutObj, (t) => {
  const Identity = require('../src/identity').default;
  t.plan(6);

  quassel.once('identity.new', (identityId) => {
    t.pass("identity.new event received");
    const identity = quassel.identities.get(identityId);
    t.equals(identity.identityName, 'unittestidentity');
    t.equals(identity.realName, 'libquassel unittest build');
    t.deepEqual(identity._nicks, [ 'unittestlibquassel' ]);
    t.equals(identity.ident, 'quassel');
    t.equals(identity.identityId, 1);
  });

  quassel.core.createIdentity(Identity.create('unittestidentity', 'unittestlibquassel', 'libquassel unittest build'));
});

test('network', timeoutObj, (t) => {
  t.plan(5);

  quassel.once('network.new', (networkId) => {
    t.pass("network.new event received");
    const network = quassel.networks.get(networkId);
    t.equals(network.networkId, 1);
  });

  quassel.once('network.init', (networkId) => {
    t.pass("network.init event received");
    const network = quassel.networks.get(networkId);
    t.deepEqual(network.ServerList, [{
      Host: 'chat.freenode.net',
      Password: '',
      Port: 6665,
      ProxyHost: '',
      ProxyPass: '',
      ProxyPort: 8080,
      ProxyType: 0,
      ProxyUser: '',
      UseProxy: false,
      UseSSL: true,
      sslVerify: false,
      sslVersion: 0
    }]);
    t.equals(network.networkName, 'UTF-8 Network ♥♦♣∞');
  });

  quassel.core.createNetwork('UTF-8 Network ♥♦♣∞', 1, {
    Host: 'chat.freenode.net',
    Port: 6665,
    UseSSL: true
  });
});

test.onFinish(() => {
  quassel.disconnect();
});

quassel.connect(socket);