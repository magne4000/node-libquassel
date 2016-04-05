var Quassel = require('../lib/libquassel.js');
var test = require('tape');

function loginOk(next) {
    next("unittest", "unittest");
}

function loginError(next) {
    next("wrong", "wrong");
}

var timeoutObj = {timeout: 3000};

var quassel = new Quassel("127.0.0.1", 4243, loginError);

test('setup', timeoutObj, function (t) {
    t.plan(3);

    quassel.once('setup', function(data) {
        t.pass("setup event received");
        quassel.setupCore('wrongbackend', 'unittest', 'unittest');
    });
    
    quassel.once('setupfailed', function(data) {
        t.pass("setupfailed event received");
        quassel.setupCore('SQLite', 'unittest', 'unittest');
    });

    quassel.once('setupok', function(data) {
        t.pass("setupok event received");
    });
});

test('login', timeoutObj, function (t) {
    t.plan(2);

    quassel.login();

    quassel.once('loginfailed', function() {
        t.pass("loginfailed event received");
        quassel.loginCallback = loginOk;
        quassel.login();
    });

    quassel.once('login', function() {
        t.pass("login event received");
    });
});

test('identity', timeoutObj, function (t) {
    t.plan(2);

    quassel.once('identity.new', function(identityId) {
        t.pass("identity.new event received");
        var identity = quassel.identities.get(identityId);
        t.deepEqual(identity, {
            autoAwayEnabled: false,
            autoAwayReason: 'Not here. No, really. not here!',
            autoAwayReasonEnabled: false,
            autoAwayTime: 10,
            awayNick: '',
            awayNickEnabled: false,
            awayReason: 'Gone fishing.',
            awayReasonEnabled: true,
            detachAwayEnabled: false,
            detachAwayReason: 'All Quassel clients vanished from the face of the earth...',
            detachAwayReasonEnabled: false,
            ident: 'unittest',
            identityId: 1,
            identityName: 'unittestidentity',
            kickReason: 'Kindergarten is elsewhere!',
            nicks: ['unittestlibquassel'],
            partReason: 'http://quassel-irc.org - Chat comfortably. Anywhere.',
            quitReason: 'http://quassel-irc.org - Chat comfortably. Anywhere.',
            realName: 'libquassel unittest build'
        }, "Identity object mismatch");
    });
    
    quassel.createIdentity('unittestidentity', {
        realName: 'libquassel unittest build',
        nick: 'unittestlibquassel',
        ident: 'unittest'
    });
});

test('network', timeoutObj, function (t) {
    t.plan(4);
    
    quassel.once('network.new', function(networkId) {
        t.pass("network.new event received");
        var network = quassel.networks.get(networkId);
        t.deepEqual(network, {
            buffers: {
                buffers: new Map,
                filteredBuffers: new Map
            },
            connectionState: 0,
            isConnected: false,
            latency: 0,
            networkId: 1,
            networkName: null,
            nick: null,
            open: false,
            server: null,
            statusBuffer: null,
            users: new Map
        }, "Network object mismatch");
    });
    
    quassel.once('network.init', function(networkId) {
        t.pass("network.init event received");
        var network = quassel.networks.get(networkId);
        t.deepEqual(network, {
            ServerList: [{
                Host: 'chat.freenode.net',
                Password: '',
                Port: 6665,
                ProxyHost: '',
                ProxyPass: '',
                ProxyPort: 0,
                ProxyType: 0,
                ProxyUser: '',
                UseProxy: 0,
                UseSSL: 1,
                sslVersion: 0
            }],
            Supports: {},
            autoIdentifyPassword: '',
            autoIdentifyService: 'NickServ',
            autoReconnectInterval: 60,
            autoReconnectRetries: 20,
            buffers: {
                buffers: new Map,
                filteredBuffers: new Map
            },
            codecForDecoding: null,
            codecForEncoding: null,
            codecForServer: null,
            connectionState: 0,
            currentServer: '',
            identityId: 1,
            isConnected: 0,
            latency: 0,
            networkId: 1,
            networkName: 'UTF-8 Network ♥♦♣∞',
            nick: '',
            open: false,
            perform: [],
            rejoinChannels: 1,
            saslAccount: '',
            saslPassword: '',
            server: null,
            statusBuffer: null,
            unlimitedReconnectRetries: 0,
            useAutoIdentify: 0,
            useAutoReconnect: 1,
            useRandomServer: 0,
            useSasl: 0,
            users: new Map
        }, "Network object mismatch");
    });
    
    quassel.createNetwork('UTF-8 Network ♥♦♣∞', 1, {
        host: 'chat.freenode.net',
        port: '6665'
    });
});

test.onFinish(function(){
    quassel.disconnect();
});

quassel.connect();