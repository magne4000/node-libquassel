/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2016 Joël Charles
 * Licensed under the MIT license.
 */

/** @module libquassel */

var net = require('net'),
    zlib = require('zlib'),
    tls = require('tls'),
    RequestType = require('./requesttype'),
    NetworkCollection = require('./network').NetworkCollection,
    Network = require('./network').Network,
    IRCBuffer = require('./buffer').IRCBuffer,
    IRCUser = require('./user'),
    Identity = require('./identity'),
    BufferView = require('./bufferview'),
    alias = require('./alias'),
    MessageType = require('./message').Type,
    ignore = require('./ignore'),
    qtdatastream = require('qtdatastream'),
    util = require('util'),
    EventEmitter2 = require('eventemitter2').EventEmitter2,
    logger = require('debug')('libquassel:main'),
    Writer = qtdatastream.Writer;

/**
 * This callback is used by Quassel at login phase
 * @callback module:libquassel~Quassel~loginCallback
 * @param {function} next - callback with 2 parameters: user and password; must be called at the end of this callback
 * @example
 * function(next) {
 *   var user = source.getUser();
 *   var password = source.getPassword();
 *   next(user, password);
 * }
 */

/**
 * Main class to interact with Quassel instance. It extends {@link https://github.com/asyncly/EventEmitter2|EventEmitter2}
 * @class
 * @augments {EventEmitter2}
 * @param {string} server The server hostname or IP address
 * @param {number} port The port on which runs Quassel on the server
 * @param {Object} [options] Allows optionnal parameters
 * @param {boolean} [options.nobacklogs=false] Do not request backlogs (mostly for debug purpose)
 * @param {number} [options.initialbackloglimit=options.backloglimit] number of backlogs to request per buffer at connection
 * @param {number} [options.backloglimit=100] number of backlogs to request per buffer after connection
 * @param {boolean} [options.securecore=true] Use SSL to connect to the core (if the core allows it)
 * @param {module:libquassel~Quassel.HighlightModes} [options.highlightmode=0x02] Choose how highlights on nicks works. Defaults to only highlight a message if current nick is present.
 * @param {module:libquassel~Quassel~loginCallback} loginCallback
 * @example
 * var quassel = new Quassel("localhost", 4242, {}, function(next) {
 *   next("user", "password");
 * });
 * quassel.connect();
 */
var Quassel = function(server, port, options, loginCallback) {
    EventEmitter2.call(this, {wildcard: true});
    var self = this;
    /** @member {?net.Socket} */
    this.client = null;
    /** @member {?qtdatastream.Socket} */
    this.qtsocket = null;
    /** @member {String} */
    this.server = server;
    /** @member {number} */
    this.port = port;
    /** @member {Object} */
    this.options = options || {};
    this.options.backloglimit = parseInt(options.backloglimit || 100, 10);
    this.options.initialbackloglimit = parseInt(options.initialbackloglimit || this.options.backloglimit, 10);
    this.options.highlightmode = (typeof options.highlightmode === 'number') ? options.highlightmode : Quassel.HighlightModes.CurrentNick;
    /** @member {module:network.NetworkCollection} */
    this.networks = new NetworkCollection();
    /** @member {Map.<number, module:identity>} */
    this.identities = new Map;
    /** @member {module:ignore.IgnoreList} */
    this.ignoreList = new ignore.IgnoreList();
    /** @member {Map.<string, string>} */
    this.aliases = new Map;
    /** @member {Map.<number, module:bufferview>} */
    this.bufferViews = new Map;
    /** @member {?number} */
    this.heartbeatInterval = null;
    /** @member {boolean} */
    this.useSSL = false;
    /** @member {boolean} */
    this.useCompression = false;
    /** @member {?boolean} */
    this.connected = null;
    /** @member {?Object} */
    this.coreInfo = null;
    /** @member {?Object} */
    this.coreData = null;
    
    if (typeof options === 'function' && typeof loginCallback === 'undefined') {
        /** @member {module:libquassel~Quassel~loginCallback} */
        this.loginCallback = options;
    } else if (typeof loginCallback === 'function') {
        this.loginCallback = loginCallback;
    } else {
        throw new Error("loginCallback parameter is mandatory");
    }
    
    self.init();
};

util.inherits(Quassel, EventEmitter2);

/**
 * @readonly
 * @enum {number}
 * @default
 */
Quassel.HighlightModes = {
    None: 0x01,
    CurrentNick: 0x02,
    AllIdentityNicks: 0x03
};

/**
 * @alias module:libquassel~Quassel.Feature
 * @readonly
 * @enum {number}
 * @default
 */
Quassel.Feature = {
    SynchronizedMarkerLine: 0x0001,
    SaslAuthentication: 0x0002,
    SaslExternal: 0x0004,
    HideInactiveNetworks: 0x0008,
    PasswordChange: 0x0010,
    CapNegotiation: 0x0020,           /// IRCv3 capability negotiation, account tracking
    VerifyServerSSL: 0x0040,          /// IRC server SSL validation
    CustomRateLimits: 0x0080,         /// IRC server custom message rate limits

    NumFeatures: 0x0080
};

/**
 * This event is fired when quasselcore information are received
 * @event module:libquassel~Quassel#event:"coreinfoinit"
 * @property {Object} data
 * @property {boolean} data.Configured - Is the core configured
 * @property {number} data.CoreFeatures
 * @property {String} data.CoreInfo
 * @property {boolean} data.LoginEnabled
 * @property {boolean} data.MsgType - Is always "ClientInitAck"
 * @property {number} data.ProtocolVersion
 * @property {Array} [data.StorageBackends]
 * @property {boolean} data.SupportSsl
 * @property {boolean} data.SupportsCompression
 */
/**
 * This event is fired upon successful login
 * @event module:libquassel~Quassel#event:"login"
 */
/**
 * This event is fired upon unsuccessful login
 * @event module:libquassel~Quassel#event:"loginfailed"
 */
/**
 * This event is fired upon successful session initialization
 * @event module:libquassel~Quassel#event:"init"
 * @property {Object} obj
 */
/**
 * This event is fired when {@link module:identity} objects are first initialized
 * @event module:libquassel~Quassel#event:"identities.init"
 * @property {Map.<number, module:identity>}
 */
/**
 * This event is fired when a buffer is added to a network
 * @event module:libquassel~Quassel#event:"network.addbuffer"
 * @property {number} networkId
 * @property {number} bufferId
 */
/**
 * Network latency value
 * @event module:libquassel~Quassel#event:"network.latency"
 * @property {number} networkId
 * @property {number} value
 */
/**
 * Network connection state
 * @event module:libquassel~Quassel#event:"network.connectionstate"
 * @property {number} networkId
 * @property {number} connectionState
 */
/**
 * This event is fired when a network state is switched to connected
 * @event module:libquassel~Quassel#event:"network.connected"
 * @property {number} networkId
 */
/**
 * This event is fired when a network state is switched to disconnected
 * @event module:libquassel~Quassel#event:"network.disconnected"
 * @property {number} networkId
 */
/**
 * This event is fired when a user is renamed on a network
 * @event module:libquassel~Quassel#event:"network.userrenamed"
 * @property {number} networkId
 * @property {String} oldNick
 * @property {String} nick
 */
/**
 * This event is fired when current connected user is renamed on a network
 * @event module:libquassel~Quassel#event:"network.mynick"
 * @property {number} networkId
 * @property {String} nick
 */
/**
 * This event is fired when the name of a network changes
 * @event module:libquassel~Quassel#event:"network.networkname"
 * @property {number} networkId
 * @property {String} networkName
 */
/**
 * This event is fired when the server on which a network is connected changes
 * @event module:libquassel~Quassel#event:"network.server"
 * @property {number} networkId
 * @property {String} server
 */
/**
 * This event is fired when a network server list is updated
 * @event module:libquassel~Quassel#event:"network.serverlist"
 * @property {number} networkId
 * @property {Object[]} serverlist
 */
/**
 * Fired when encoding for sent messages has changed
 * @event module:libquassel~Quassel#event:"network.codec.decoding"
 * @property {number} networkId
 * @property {String} codec
 */
/**
 * Fired when encoding for received messages has changed
 * @event module:libquassel~Quassel#event:"network.codec.encoding"
 * @property {number} networkId
 * @property {String} codec
 */
/**
 * Fired when server encoding has changed
 * @event module:libquassel~Quassel#event:"network.codec.server"
 * @property {number} networkId
 * @property {String} codec
 */
/**
 * Fired when the list of commands to perform on connection to a server has changed
 * @event module:libquassel~Quassel#event:"network.perform"
 * @property {number} networkId
 * @property {String[]} commands
 */
/**
 * Fired when the network identity changed
 * @event module:libquassel~Quassel#event:"network.identity"
 * @property {number} networkId
 * @property {number} identityId
 */
/**
 * Fired when interval value for reconnecting to the network changed
 * @event module:libquassel~Quassel#event:"network.autoreconnect.interval"
 * @property {number} networkId
 * @property {number} interval
 */
/**
 * Fired when retries value for reconnecting to the network changed
 * @event module:libquassel~Quassel#event:"network.autoreconnect.retries"
 * @property {number} networkId
 * @property {number} retries
 */
/**
 * Fired when auto identify service changed
 * @event module:libquassel~Quassel#event:"network.autoidentify.service"
 * @property {number} networkId
 * @property {String} service
 */
/**
 * Fired when auto identify service password changed
 * @event module:libquassel~Quassel#event:"network.autoidentify.password"
 * @property {number} networkId
 * @property {String} password
 */
/**
 * Fired when Unlimited reconnect retries value has changed
 * @event module:libquassel~Quassel#event:"network.unlimitedreconnectretries"
 * @property {number} networkId
 * @property {boolean} unlimitedreconnectretries
 */
/**
 * Fired when Use Sasl value has changed
 * @event module:libquassel~Quassel#event:"network.usesasl"
 * @property {number} networkId
 * @property {boolean} usesasl
 */
/**
 * Fired when Sasl account has changed
 * @event module:libquassel~Quassel#event:"network.sasl.account"
 * @property {number} networkId
 * @property {String} account
 */
/**
 * Fired when Sasl account password has changed
 * @event module:libquassel~Quassel#event:"network.sasl.password"
 * @property {number} networkId
 * @property {String} password
 */
/**
 * Fired when Rejoin Channels value has changed
 * @event module:libquassel~Quassel#event:"network.rejoinchannels"
 * @property {number} networkId
 * @property {boolean} rejoinchannels
 */
/**
 * Fired when Use Custom Message Rate value has changed
 * @event module:libquassel~Quassel#event:"network.usecustommessagerate"
 * @property {number} networkId
 * @property {boolean} usecustommessagerate
 */
/**
 * Fired when Unlimited Message Rate Burst Size value has changed
 * @event module:libquassel~Quassel#event:"network.messagerate.unlimited"
 * @property {number} networkId
 * @property {boolean} unlimited
 */
/**
 * Fired when Message Rate Burst Size value has changed
 * @event module:libquassel~Quassel#event:"network.messagerate.burstsize"
 * @property {number} networkId
 * @property {number} burstsize
 */
/**
 * Fired when Message Rate Delay value has changed
 * @event module:libquassel~Quassel#event:"network.messagerate.delay"
 * @property {number} networkId
 * @property {number} delay
 */
/**
 * Buffer has been marked as read
 * @event module:libquassel~Quassel#event:"buffer.read"
 * @property {number} bufferId
 */
/**
 * Buffer's last seen message updated
 * @event module:libquassel~Quassel#event:"buffer.lastseen"
 * @property {number} bufferId
 * @property {number} messageId
 */
/**
 * Buffer's markeline attached to a message
 * @event module:libquassel~Quassel#event:"buffer.markerline"
 * @property {number} bufferId
 * @property {number} messageId
 */
/**
 * Buffer has been removed
 * @event module:libquassel~Quassel#event:"buffer.remove"
 * @property {number} bufferId
 */
/**
 * Buffer has been renamed
 * @event module:libquassel~Quassel#event:"buffer.rename"
 * @property {number} bufferId
 */
/**
 * bufferId2 has been merged into bufferId1
 * @event module:libquassel~Quassel#event:"buffer.merge"
 * @property {number} bufferId1
 * @property {number} bufferId2
 */
/**
 * Buffer's hidden state removed
 * @event module:libquassel~Quassel#event:"bufferview.bufferunhide"
 * @property {number} bufferViewId
 * @property {number} bufferId
 */
/**
 * Buffer's hidden state set
 * @event module:libquassel~Quassel#event:"bufferview.bufferhidden"
 * @property {number} bufferViewId
 * @property {number} bufferId
 * @property {String} type - Either "temp" or "perm"
 */
/**
 * Buffer set as inactive
 * @event module:libquassel~Quassel#event:"buffer.deactivate"
 * @property {number} bufferId
 */
/**
 * User has left a channel
 * @event module:libquassel~Quassel#event:"user.part"
 * @property {number} networkId
 * @property {String} nick
 * @property {number} bufferId
 */
/**
 * User has left a network
 * @event module:libquassel~Quassel#event:"user.quit"
 * @property {number} networkId
 * @property {String} nick
 */
/**
 * User away state changed
 * @event module:libquassel~Quassel#event:"user.away"
 * @property {number} networkId
 * @property {String} nick
 * @property {boolean} isAway
 */
/**
 * User realname changed
 * @event module:libquassel~Quassel#event:"user.realname"
 * @property {number} networkId
 * @property {String} nick
 * @property {String} realname
 */
/**
 * User joined a channel
 * @event module:libquassel~Quassel#event:"channel.join"
 * @property {number} bufferId
 * @property {String} nick
 */
/**
 * User mode has been added
 * @event module:libquassel~Quassel#event:"channel.addusermode"
 * @property {number} bufferId
 * @property {String} nick
 * @property {String} mode
 */
/**
 * User mode has been removed
 * @event module:libquassel~Quassel#event:"channel.removeusermode"
 * @property {number} bufferId
 * @property {String} nick
 * @property {String} mode
 */
/**
 * Channel topic changed
 * @event module:libquassel~Quassel#event:"channel.topic"
 * @property {number} bufferId
 * @property {String} topic
 */
/**
 * Core information
 * @event module:libquassel~Quassel#event:"coreinfo"
 * @property {Object} data
 */
/**
 * Buffer activated
 * @event module:libquassel~Quassel#event:"buffer.activate"
 * @property {number} bufferId
 */
/**
 * Backlogs received
 * @event module:libquassel~Quassel#event:"buffer.backlog"
 * @property {number} bufferId
 * @property {number[]} messageIds
 */
/**
 * Message received on a buffer
 * @event module:libquassel~Quassel#event:"buffer.message"
 * @property {number} bufferId
 * @property {number} messageId
 */
/**
 * Buffers order changed
 * @event module:libquassel~Quassel#event:"bufferview.orderchanged"
 * @property {number} bufferViewId
 */
/**
 * Buffer view manager init request received
 * @event module:libquassel~Quassel#event:"bufferview.ids"
 * @property {number[]} ids
 */
/**
 * Buffer view initialized
 * @event module:libquassel~Quassel#event:"bufferview.init"
 * @property {number} bufferViewId
 */
/**
 * Buffer view networkId updated
 * @event module:libquassel~Quassel#event:"bufferview.networkid"
 * @property {number} bufferViewId
 * @property {number} networkId
 */
/**
 * Buffer view search updated
 * @event module:libquassel~Quassel#event:"bufferview.search"
 * @property {number} bufferViewId
 * @property {boolean} search
 */
/**
 * Buffer view hideInactiveNetworks updated
 * @event module:libquassel~Quassel#event:"bufferview.hideinactivenetworks"
 * @property {number} bufferViewId
 * @property {boolean} hideinactivenetworks
 */
/**
 * Buffer view hideInactiveBuffers updated
 * @event module:libquassel~Quassel#event:"bufferview.hideinactivebuffers"
 * @property {number} bufferViewId
 * @property {boolean} hideinactivebuffers
 */
/**
 * Buffer view allowedBufferTypes updated
 * @event module:libquassel~Quassel#event:"bufferview.allowedbuffertypes"
 * @property {number} bufferViewId
 * @property {number} allowedbuffertypes
 */
/**
 * Buffer view addNewBuffersAutomatically updated
 * @event module:libquassel~Quassel#event:"bufferview.addnewbuffersautomatically"
 * @property {number} bufferViewId
 * @property {boolean} addnewbuffersautomatically
 */
/**
 * Buffer view minimumActivity updated
 * @event module:libquassel~Quassel#event:"bufferview.minimumactivity"
 * @property {number} bufferViewId
 * @property {boolean} minimumactivity
 */
/**
 * Buffer view bufferViewName updated
 * @event module:libquassel~Quassel#event:"bufferview.bufferviewname"
 * @property {number} bufferViewId
 * @property {String} bufferviewname
 */
/**
 * Buffer view disableDecoration updated
 * @event module:libquassel~Quassel#event:"bufferview.disabledecoration"
 * @property {number} bufferViewId
 * @property {boolean} disabledecoration
 */
/**
 * Buffer view object updated
 * @event module:libquassel~Quassel#event:"bufferview.update"
 * @property {number} bufferViewId
 * @property {object} data
 */
/**
 * {@link module:ignore.IgnoreList} updated
 * @event module:libquassel~Quassel#event:"ignorelist"
 */
/**
 * {@link module:identity} updated
 * @event module:libquassel~Quassel#event:"identity"
 */
/**
 * New {@link module:identity} created
 * @event module:libquassel~Quassel#event:"identity.new"
 * @property {number} identityId
 */
/**
 * {@link module:identity} removed
 * @event module:libquassel~Quassel#event:"identity.remove"
 * @property {number} identityId
 */
/**
 * User connected to the {@link module:network.Network}
 * @event module:libquassel~Quassel#event:"network.adduser"
 * @property {number} networkId
 * @property {String} nick
 */
/**
 * New {@link module:network.Network} created
 * @event module:libquassel~Quassel#event:"network.new"
 * @property {number} networkId
 */
/**
 * {@link module:network.Network} removed
 * @event module:libquassel~Quassel#event:"network.remove"
 * @property {number} networkId
 */
/**
 * {@link module:network.Network} is ready
 * @event module:libquassel~Quassel#event:"network.init"
 * @property {number} networkId
 */
/**
 * {@link module:aliases} updated
 * @event module:libquassel~Quassel#event:"aliases"
 */
/**
 * This event is fired when the core needs it's first setup
 * @event module:libquassel~Quassel#event:"setup"
 * @property {Object[]} backends - List of available storage backends
 * @property {String} backends[].DisplayName - Storage backends name
 * @property {String} backends[].Description - Storage backends description
 * @property {String[]} backends[].SetupKeys - Keys that will need a corresponding value to configure chosen storage backend
 * @property {Object} backends[].SetupDefaults - Defaults values for corresponding SetupKeys
 */
/**
 * This event is fired if the setup of the core was successful
 * @event module:libquassel~Quassel#event:"setupok"
 */
/**
 * This event is fired if the setup of the core has failed
 * @event module:libquassel~Quassel#event:"setupfailed"
 * @property {Object} error - The reason of the failure
 */
/**
 * An error occured
 * @event module:libquassel~Quassel#event:"error"
 * @property {Object} error
 */

/**
 * Handles quasselcore messages that possesses a `MsgType` attribute
 * @param {Object} obj
 * @fires module:libquassel~Quassel#event:"coreinfoinit"
 * @fires module:libquassel~Quassel#event:"login"
 * @fires module:libquassel~Quassel#event:"loginfailed"
 * @fires module:libquassel~Quassel#event:"network.addbuffer"
 * @fires module:libquassel~Quassel#event:"init"
 * @fires module:libquassel~Quassel#event:"setup"
 * @fires module:libquassel~Quassel#event:"setupok"
 * @fires module:libquassel~Quassel#event:"setupfailed"
 * @fires module:libquassel~Quassel#event:"identities.init"
 * @fires module:libquassel~Quassel#event:"unhandled"
 * @protected
 */
Quassel.prototype.handleMsgType = function(obj) {
    var self = this;
    switch (obj.MsgType) {
        case 'ClientInitAck':
            self.coreInfo = obj;
            self.emit('coreinfoinit', obj);
            if (!obj.Configured) {
                self.emit('setup', obj.StorageBackends);
            } else if (obj.LoginEnabled) {
                self.login();
            } else {
                self.emit('error', new Error("Your core is not supported"));
            }
            break;
        case 'ClientLoginAck':
            logger('Logged in');
            self.emit('login');
            break;
        case 'ClientLoginReject':
            logger(obj);
            self.emit('loginfailed');
            break;
        case 'CoreSetupAck':
            logger('Core setup successful');
            self.emit('setupok');
            break;
        case 'CoreSetupReject':
            logger('Core setup failed');
            self.emit('setupfailed', obj.Error);
            break;
        case 'SessionInit':
            var i;
            // Init networks
            for (i=0; i<obj.SessionState.NetworkIds.length; i++) {
                // Save network list
                self.networks.add(parseInt(obj.SessionState.NetworkIds[i], 10));
                // Ask server to give more information on each network
                self.sendInitRequest("Network", ""+obj.SessionState.NetworkIds[i]);
            }
            // Attach buffers to network
            for (i=0; i<obj.SessionState.BufferInfos.length; i++) {
                var ircbuffer = new IRCBuffer(obj.SessionState.BufferInfos[i].id, obj.SessionState.BufferInfos[i]);
                self.networks.get(ircbuffer.network).getBufferCollection().addBuffer(ircbuffer);
                if (ircbuffer.isChannel()) {
                    self.sendInitRequest("IrcChannel", ircbuffer.network + "/" + ircbuffer.name);
                }
                self.emit("network.addbuffer", ircbuffer.network, obj.SessionState.BufferInfos[i].id);
            }
            // Init Identities
            for (i=0; i<obj.SessionState.Identities.length; i++) {
                self.identities.set(parseInt(obj.SessionState.Identities[i].identityId, 10), new Identity(obj.SessionState.Identities[i]));
            }
            self.emit('init', obj);
            self.emit('identities.init', self.identities);
            self.sendInitRequest("BufferSyncer", "");
            self.sendInitRequest("BufferViewManager", "");
            self.sendInitRequest("IgnoreListManager", "");
            self.sendInitRequest("AliasManager", "");
            if (!self.options.nobacklogs && this.options.initialbackloglimit > 0) {
                setTimeout(function(){
                    self.requestBacklogs(self.options.initialbackloglimit);
                }, 1000);
            }
            self.heartbeatInterval = setInterval(function() {
                self.heartBeat();
            }, 30000);
            break;
        default:
            logger('Unhandled MsgType %s', obj.MsgType);
            self.emit("unhandled", obj);
    }
};

/**
 * Returns `true` if the core supports the given feature
 * @example
 * quassel.supports(Quassel.Feature.PasswordChange);
 * @param {module:libquassel~Quassel.Feature} feature
 * @returns {boolean}
 */
Quassel.prototype.supports = function(feature) {
    return (this.coreInfo.CoreFeatures & feature) > 0;
};

/**
 * Handles heartbeat
 * @param {boolean} reply - is this a heartbeat reply
 * @protected
 */
Quassel.prototype.heartBeat = function(reply) {
    var d = new Date();
    var secs = d.getSeconds() + (60 * d.getMinutes()) + (60 * 60 * d.getHours());
    var slist = [
        reply?RequestType.HeartBeat:RequestType.HeartBeatReply,
        new qtdatastream.QTime(secs)
    ];
    logger('Sending heartbeat');
    this.qtsocket.write(slist);
};

/**
 * Get the highest bufferId among all buffers
 * @returns {number}
 */
Quassel.prototype.getMaxBufferId = function() {
    var maxId = 0;
    this.getNetworksMap().forEach(function(network){
        network.getBufferMap().forEach(function(buffer, bufferId){
            if (bufferId > maxId) maxId = bufferId;
        });
    });
    return maxId;
};

// TODO set bufferId to -1
/**
 * Create a {@link module:buffer.IRCBuffer} Object with given name on specified network
 * @param {number} networkId
 * @param {String} name
 * @param {number} [bufferId]
 * @fires module:libquassel~Quassel#event:"network.addbuffer"
 * @returns {number}
 */
Quassel.prototype.createBuffer = function(networkId, name, bufferId) {
    var buffer;
    bufferId = bufferId || this.getMaxBufferId()+1;
    networkId = parseInt(networkId, 10);
    if (name === null) {
        // Assuming that only StatusBuffer have null name
        buffer = new IRCBuffer(bufferId, {type : IRCBuffer.Types.StatusBuffer, network: networkId});
    } else {
        buffer = new IRCBuffer(bufferId, {name: name, network: networkId, type: IRCBuffer.Types.ChannelBuffer});
    }
    this.networks.get(networkId).getBufferCollection().addBuffer(buffer);
    this.emit("network.addbuffer", networkId, bufferId);
};

/**
 * Handles most of the quasselcore messages
 * @param {Object} obj - quasselcore message decoded by qtdatasteam
 * @fires module:libquassel~Quassel#event:"coreinfo"
 * @fires module:libquassel~Quassel#event:"network.init"
 * @fires module:libquassel~Quassel#event:"network.latency"
 * @fires module:libquassel~Quassel#event:"network.connectionstate"
 * @fires module:libquassel~Quassel#event:"network.addbuffer"
 * @fires module:libquassel~Quassel#event:"network.connected"
 * @fires module:libquassel~Quassel#event:"network.disconnected"
 * @fires module:libquassel~Quassel#event:"network.userrenamed"
 * @fires module:libquassel~Quassel#event:"network.mynick"
 * @fires module:libquassel~Quassel#event:"network.networkname"
 * @fires module:libquassel~Quassel#event:"network.server"
 * @fires module:libquassel~Quassel#event:"network.serverlist"
 * @fires module:libquassel~Quassel#event:"network.adduser"
 * @fires module:libquassel~Quassel#event:"network.new"
 * @fires module:libquassel~Quassel#event:"network.remove"
 * @fires module:libquassel~Quassel#event:"network.codec.decoding"
 * @fires module:libquassel~Quassel#event:"network.codec.encoding"
 * @fires module:libquassel~Quassel#event:"network.codec.server"
 * @fires module:libquassel~Quassel#event:"network.perform"
 * @fires module:libquassel~Quassel#event:"network.identity"
 * @fires module:libquassel~Quassel#event:"network.autoreconnect.interval"
 * @fires module:libquassel~Quassel#event:"network.autoreconnect.retries"
 * @fires module:libquassel~Quassel#event:"network.autoidentify.service"
 * @fires module:libquassel~Quassel#event:"network.autoidentify.password"
 * @fires module:libquassel~Quassel#event:"network.unlimitedreconnectretries"
 * @fires module:libquassel~Quassel#event:"network.usesasl"
 * @fires module:libquassel~Quassel#event:"network.sasl.account"
 * @fires module:libquassel~Quassel#event:"network.sasl.password"
 * @fires module:libquassel~Quassel#event:"network.rejoinchannels"
 * @fires module:libquassel~Quassel#event:"network.usecustommessagerate"
 * @fires module:libquassel~Quassel#event:"network.messagerate.unlimited"
 * @fires module:libquassel~Quassel#event:"network.messagerate.delay"
 * @fires module:libquassel~Quassel#event:"network.messagerate.burstsize"
 * @fires module:libquassel~Quassel#event:"buffer.read"
 * @fires module:libquassel~Quassel#event:"buffer.lastseen"
 * @fires module:libquassel~Quassel#event:"buffer.markerline"
 * @fires module:libquassel~Quassel#event:"buffer.remove"
 * @fires module:libquassel~Quassel#event:"buffer.rename"
 * @fires module:libquassel~Quassel#event:"buffer.merge"
 * @fires module:libquassel~Quassel#event:"buffer.deactivate"
 * @fires module:libquassel~Quassel#event:"buffer.activate"
 * @fires module:libquassel~Quassel#event:"buffer.backlog"
 * @fires module:libquassel~Quassel#event:"buffer.message"
 * @fires module:libquassel~Quassel#event:"buffer.order"
 * @fires module:libquassel~Quassel#event:"bufferview.ids"
 * @fires module:libquassel~Quassel#event:"bufferview.bufferunhide"
 * @fires module:libquassel~Quassel#event:"bufferview.bufferhidden"
 * @fires module:libquassel~Quassel#event:"bufferview.orderchanged"
 * @fires module:libquassel~Quassel#event:"bufferview.init"
 * @fires module:libquassel~Quassel#event:"bufferview.networkid"
 * @fires module:libquassel~Quassel#event:"bufferview.search"
 * @fires module:libquassel~Quassel#event:"bufferview.hideinactivenetworks"
 * @fires module:libquassel~Quassel#event:"bufferview.hideinactivebuffers"
 * @fires module:libquassel~Quassel#event:"bufferview.allowedbuffertypes"
 * @fires module:libquassel~Quassel#event:"bufferview.addnewbuffersautomatically"
 * @fires module:libquassel~Quassel#event:"bufferview.minimumactivity"
 * @fires module:libquassel~Quassel#event:"bufferview.bufferviewname"
 * @fires module:libquassel~Quassel#event:"bufferview.disabledecoration"
 * @fires module:libquassel~Quassel#event:"bufferview.update"
 * @fires module:libquassel~Quassel#event:"user.part"
 * @fires module:libquassel~Quassel#event:"user.quit"
 * @fires module:libquassel~Quassel#event:"user.away"
 * @fires module:libquassel~Quassel#event:"user.realname"
 * @fires module:libquassel~Quassel#event:"channel.join"
 * @fires module:libquassel~Quassel#event:"channel.addusermode"
 * @fires module:libquassel~Quassel#event:"channel.removeusermode"
 * @fires module:libquassel~Quassel#event:"channel.topic"
 * @fires module:libquassel~Quassel#event:"ignorelist"
 * @fires module:libquassel~Quassel#event:"identity"
 * @fires module:libquassel~Quassel#event:"identity.new"
 * @fires module:libquassel~Quassel#event:"identity.remove"
 * @fires module:libquassel~Quassel#event:"aliases"
 * @protected
 */
Quassel.prototype.handleStruct = function(obj) {
    var self = this, networkId, identity, identityId, className, functionName, bufferId, buffer, bufferName,
               messageId, tmp, userNetworkId, userName, networkNick, user, mode, data, oldNick, i, ind, bufferCollection,
               codec, bufferViewId, bufferView;
    switch (obj[0]) {
        case RequestType.Sync:
            className = obj[1].toString();
            functionName = obj[3].toString();
            logger("%s received : %s", className, functionName);
            switch(className) {
                case "Network":
                    networkId = obj[2].toString();
                    switch(functionName) {
                        case "setLatency":
                            self.networks.get(networkId).setLatency(obj[4]);
                            self.emit('network.latency', networkId, obj[4]);
                            break;
                        case "addIrcUser":
                            user = new IRCUser(obj[4]);
                            self.networks.get(networkId).addUser(user);
                            self.sendInitRequest("IrcUser", networkId + "/" + obj[4].split("!")[0]);
                            break;
                        case "setConnectionState":
                            var connectionState = obj[4];
                            var network = self.networks.get(networkId);
                            if (network) {
                                network.connectionState = connectionState;
                                self.emit('network.connectionstate', networkId, connectionState);
                            }
                            break;
                        case "addIrcChannel":
                            bufferName = obj[4];
                            var hasBuffer = self.networks.get(networkId).getBufferCollection().hasBuffer(bufferName);
                            if (hasBuffer) {
                                self.emit('network.addbuffer', networkId, self.networks.get(networkId).getBufferCollection().getBuffer(bufferName).id);
                            }
                            self.sendInitRequest("IrcChannel", networkId + "/" + bufferName);
                            break;
                        case "setConnected":
                            var isConnected = obj[4];
                            self.networks.get(networkId).setConnected(isConnected);
                            if (isConnected) {
                                self.emit('network.connected', networkId);
                            } else {
                                self.emit('network.disconnected', networkId);
                            }
                            break;
                        case "setMyNick":
                            var nick = obj[4];
                            oldNick = self.networks.get(networkId).nick;
                            self.networks.get(networkId).setMyNick(nick);
                            self.networks.get(networkId).renameUser(oldNick, nick);
                            self.emit("network.userrenamed", networkId, oldNick, nick);
                            self.emit('network.mynick', networkId, nick);
                            break;
                        case "setNetworkName":
                            var networkName = obj[4];
                            self.networks.get(networkId).networkName = networkName;
                            self.emit('network.networkname', networkId, networkName);
                            break;
                        case "setCurrentServer":
                            var server = obj[4];
                            self.networks.get(networkId).currentServer = server;
                            self.emit('network.server', networkId, server);
                            break;
                        case "setServerList":
                            var serverList = obj[4];
                            self.networks.get(networkId).ServerList = serverList;
                            self.emit('network.serverlist', networkId, serverList);
                            break;
                        case "setCodecForDecoding":
                            codec = obj[4];
                            self.networks.get(networkId).setCodecForDecoding(codec);
                            self.emit('network.codec.decoding', networkId, codec);
                            break;
                        case "setCodecForEncoding":
                            codec = obj[4];
                            self.networks.get(networkId).setCodecForEncoding(codec);
                            self.emit('network.codec.encoding', networkId, codec);
                            break;
                        case "setCodecForServer":
                            codec = obj[4];
                            self.networks.get(networkId).setCodecForServer(codec);
                            self.emit('network.codec.server', networkId, codec);
                            break;
                        case "setPerform":
                            var commands = obj[4];
                            self.networks.get(networkId).perform = commands;
                            self.emit('network.perform', networkId, commands);
                            break;
                        case "setIdentity":
                            identityId = obj[4];
                            self.networks.get(networkId).identityId = identityId;
                            self.emit('network.identity', networkId, identityId);
                            break;
                        case "setAutoReconnectInterval":
                            self.networks.get(networkId).autoReconnectInterval = obj[4];
                            self.emit('network.autoreconnect.interval', networkId, obj[4]);
                            break;
                        case "setAutoReconnectRetries":
                            self.networks.get(networkId).autoReconnectRetries = obj[4];
                            self.emit('network.autoreconnect.retries', networkId, obj[4]);
                            break;
                        case "setAutoIdentifyService":
                            self.networks.get(networkId).autoIdentifyService = obj[4];
                            self.emit('network.autoidentify.service', networkId, obj[4]);
                            break;
                        case "setAutoIdentifyPassword":
                            self.networks.get(networkId).autoIdentifyPassword = obj[4];
                            self.emit('network.autoidentify.password', networkId, obj[4]);
                            break;
                        case "setUnlimitedReconnectRetries":
                            self.networks.get(networkId).unlimitedReconnectRetries = obj[4];
                            self.emit('network.unlimitedreconnectretries', networkId, obj[4]);
                            break;
                        case "setUseSasl":
                            self.networks.get(networkId).useSasl = obj[4];
                            self.emit('network.usesasl', networkId, obj[4]);
                            break;
                        case "setSaslAccount":
                            self.networks.get(networkId).saslAccount = obj[4];
                            self.emit('network.sasl.account', networkId, obj[4]);
                            break;
                        case "setSaslPassword":
                            self.networks.get(networkId).saslPassword = obj[4];
                            self.emit('network.sasl.password', networkId, obj[4]);
                            break;
                        case "setRejoinChannels":
                            self.networks.get(networkId).rejoinChannels = obj[4];
                            self.emit('network.rejoinchannels', networkId, obj[4]);
                            break;
                        case "setUseCustomMessageRate":
                            self.networks.get(networkId).useCustomMessageRate = obj[4];
                            self.emit('network.usecustommessagerate', networkId, obj[4]);
                            break;
                        case "setUnlimitedMessageRate":
                            self.networks.get(networkId).unlimitedMessageRate = obj[4];
                            self.emit('network.messagerate.unlimited', networkId, obj[4]);
                            break;
                        case "setMessageRateDelay":
                            self.networks.get(networkId).msgRateMessageDelay = obj[4];
                            self.emit('network.messagerate.delay', networkId, obj[4]);
                            break;
                        case "setMessageRateBurstSize":
                            self.networks.get(networkId).msgRateBurstSize = obj[4];
                            self.emit('network.messagerate.burstsize', networkId, obj[4]);
                            break;
                        default:
                            logger('Unhandled Sync.Network %s', functionName);
                    }
                    break;
                case "BufferSyncer":
                    switch(functionName) {
                        case "markBufferAsRead":
                            bufferId = obj[4];
                            self.emit('buffer.read', bufferId);
                            break;
                        case "setLastSeenMsg":
                            bufferId = obj[4];
                            messageId = obj[5];
                            self.emit('buffer.lastseen', bufferId, messageId);
                            break;
                        case "setMarkerLine":
                            bufferId = obj[4];
                            messageId = obj[5];
                            self.emit('buffer.markerline', bufferId, messageId);
                            break;
                        case "removeBuffer":
                            bufferId = obj[4];
                            self.networks.removeBuffer(bufferId);
                            self.emit('buffer.remove', bufferId);
                            break;
                        case "renameBuffer":
                            bufferId = obj[4];
                            var newName = obj[5];
                            self.networks.findBuffer(bufferId).setName(newName);
                            self.emit('buffer.rename', bufferId, newName);
                            break;
                        case 'mergeBuffersPermanently':
                            var bufferId1 = obj[4];
                            var bufferId2 = obj[5];
                            var buffer1 = self.networks.findBuffer(bufferId1);
                            var buffer2 = self.networks.findBuffer(bufferId2);
                            if (buffer1 !== null && buffer2 !== null) {
                                buffer2.messages.forEach(function(message, messageId){
                                    buffer1.messages.set(messageId, message);
                                });
                            }
                            self.networks.removeBuffer(bufferId2);
                            self.emit('buffer.merge', bufferId1, bufferId2);
                            break;
                        default:
                            logger('Unhandled Sync.BufferSyncer %s', functionName);
                    }
                    break;
                case "BufferViewManager":
                    switch(functionName) {
                        case "addBufferViewConfig":
                            bufferViewId = obj[4];
                            self.sendInitRequest("BufferViewConfig", ""+bufferViewId);
                            break;
                        default:
                            logger('Unhandled Sync.BufferViewManager %s', functionName);
                    }
                    break;
                case "BufferViewConfig":
                    bufferViewId = parseInt(obj[2], 10);
                    bufferView = self.bufferViews.get(bufferViewId);
                    if (!bufferView) return;
                    switch(functionName) {
                        case "addBuffer":
                            bufferId = obj[4];
                            bufferView.addBuffer(bufferId, obj[5]);
                            bufferView.unhide(bufferId);
                            self.emit('bufferview.bufferunhide', bufferViewId, bufferId);
                            self.emit('bufferview.orderchanged', bufferViewId);
                            break;
                        case "removeBuffer":
                            bufferId = obj[4];
                            bufferView.setTemporarilyRemoved(bufferId);
                            self.emit('bufferview.bufferhidden', bufferViewId, bufferId, "temp");
                            break;
                        case "removeBufferPermanently":
                            bufferId = obj[4];
                            bufferView.setPermanentlyRemoved(bufferId);
                            self.emit('bufferview.bufferhidden', bufferViewId, bufferId, "perm");
                            break;
                        case "moveBuffer":
                            bufferId = obj[4];
                            bufferView.moveBuffer(bufferId, obj[5]);
                            self.emit('bufferview.orderchanged', bufferViewId);
                            break;
                        case "setNetworkId":
                            bufferView.networkId = obj[4];
                            self.emit('bufferview.networkid', bufferViewId, obj[4]);
                            break;
                        case "setShowSearch":
                            bufferView.showSearch = obj[4] === 1;
                            self.emit('bufferview.search', bufferViewId, bufferView.showSearch);
                            break;
                        case "setHideInactiveNetworks":
                            bufferView.hideInactiveNetworks = obj[4] === 1;
                            self.emit('bufferview.hideinactivenetworks', bufferViewId, bufferView.hideInactiveNetworks);
                            break;
                        case "setHideInactiveBuffers":
                            bufferView.hideInactiveBuffers = obj[4] === 1;
                            self.emit('bufferview.hideinactivebuffers', bufferViewId, bufferView.hideInactiveBuffers);
                            break;
                        case "setAllowedBufferTypes":
                            bufferView.allowedBufferTypes = obj[4];
                            self.emit('bufferview.allowedbuffertypes', bufferViewId, obj[4]);
                            break;
                        case "setAddNewBuffersAutomatically":
                            bufferView.addNewBuffersAutomatically = obj[4] === 1;
                            self.emit('bufferview.addnewbuffersautomatically', bufferViewId, bufferView.addNewBuffersAutomatically);
                            break;
                        case "setMinimumActivity":
                            bufferView.minimumActivity = obj[4];
                            self.emit('bufferview.minimumactivity', bufferViewId, obj[4]);
                            break;
                        case "setBufferViewName":
                            bufferView.bufferViewName = obj[4];
                            self.emit('bufferview.bufferviewname', bufferViewId, obj[4]);
                            break;
                        case "setDisableDecoration":
                            bufferView.disableDecoration = obj[4] === 1;
                            self.emit('bufferview.disabledecoration', bufferViewId, bufferView.disableDecoration);
                            break;
                        case "update":
                            bufferView.devour(obj[4]);
                            self.emit('bufferview.update', bufferViewId, obj[4]);
                            break;
                        default:
                            logger('Unhandled Sync.BufferViewConfig %s', functionName);
                    }
                    break;
                case "IrcUser":
                    switch(functionName) {
                        case "partChannel":
                            tmp = splitOnce(obj[2], "/");
                            userNetworkId = parseInt(tmp[0], 10);
                            userName = tmp[1];
                            bufferName = obj[4];
                            networkNick = self.networks.get(userNetworkId).nick;
                            buffer = self.networks.get(userNetworkId).getBufferCollection().getBuffer(bufferName);
                            self.networks.get(userNetworkId).getBufferCollection().getBuffer(bufferName).removeUser(userName);
                            self.emit('user.part', userNetworkId, userName, buffer.id);
                            if (buffer.isChannel()) {
                                if (networkNick !== null && networkNick.toLowerCase() === userName.toLowerCase()) {
                                    // We part
                                    buffer.setActive(false);
                                    self.emit('buffer.deactivate', buffer.id);
                                }
                            } else if (buffer.name === userName){
                                buffer.setActive(false);
                                self.emit('buffer.deactivate', buffer.id);
                            }
                            break;
                        case "quit":
                            tmp = splitOnce(obj[2], "/");
                            userNetworkId = parseInt(tmp[0], 10);
                            userName = tmp[1];
                            networkNick = self.networks.get(userNetworkId).nick;
                            self.networks.get(userNetworkId).removeUser(userName, function(buffer){
                                if (buffer.isChannel()) {
                                    if (networkNick !== null && networkNick.toLowerCase() === userName.toLowerCase()) {
                                        // We part
                                        buffer.setActive(false);
                                        self.emit('buffer.deactivate', buffer.id);
                                    }
                                } else if (buffer.name === userName) {
                                    buffer.setActive(false);
                                    self.emit('buffer.deactivate', buffer.id);
                                }
                            });
                            self.emit('user.quit', userNetworkId, userName);
                            break;
                        case "setNick":
                            // Already handled by RPC call
                            break;
                        /*case "setServer":
                            // TODO
                            break;*/
                        case "setAway":
                            tmp = splitOnce(obj[2], "/");
                            userNetworkId = parseInt(tmp[0], 10);
                            userName = tmp[1];
                            var isAway = obj[4];
                            user = self.networks.get(userNetworkId).getUserByNick(userName);
                            if (user !== null) {
                                user.away = isAway;
                                self.emit('user.away', userNetworkId, userName, isAway);
                            }
                            break;
                        case "setRealName":
                            tmp = splitOnce(obj[2], "/");
                            userNetworkId = parseInt(tmp[0], 10);
                            userName = tmp[1];
                            var realname = obj[4];
                            user = self.networks.get(userNetworkId).getUserByNick(userName);
                            if (user !== null) {
                                user.realname = realname;
                                self.emit('user.realname', userNetworkId, userName, realname);
                            }
                            break;
                        default:
                            logger('Unhandled Sync.IrcUser %s', functionName);
                    }
                    break;
                case "IrcChannel":
                    var tmp2 = splitOnce(obj[2], "/");
                    var bufferNetworkId = parseInt(tmp2[0], 10);
                    bufferName = tmp2[1];
                    var attemps = 10;
                    buffer = null;

                    var bufferattempt = function bufferattempt(callback){
                        buffer = self.networks.get(bufferNetworkId).getBufferCollection().getBuffer(bufferName);
                        if (buffer === null && attemps >= 0) {
                            attemps--;
                            setTimeout(function() {
                                bufferattempt(callback);
                            }, 5);
                        } else if (buffer !== null) {
                            callback(buffer);
                        } else {
                            logger('Did not succeed to get channel %s after 10 attempts', tmp2);
                        }
                    };

                    bufferattempt(function(buffer){
                        switch(functionName) {
                            case "joinIrcUsers":
                                for (i=0; i<obj[4].length; i++) {
                                    var user2 = self.networks.get(bufferNetworkId).getUserByNick(obj[4][i]);
                                    buffer.addUser(user2, obj[5][i]);
                                    self.emit('channel.join', buffer.id, obj[4][i]);
                                }
                                break;
                            case "addUserMode":
                                nick = obj[4];
                                mode = obj[5];
                                user = self.networks.get(bufferNetworkId).getUserByNick(nick);
                                buffer.addUserMode(user, mode);
                                self.emit('channel.addusermode', buffer.id, nick, mode);
                                break;
                            case "removeUserMode":
                                nick = obj[4];
                                mode = obj[5];
                                user = self.networks.get(bufferNetworkId).getUserByNick(nick);
                                buffer.removeUserMode(user, mode);
                                self.emit('channel.removeusermode', buffer.id, nick, mode);
                                break;
                            case "setTopic":
                                var topic = obj[4];
                                buffer.topic = topic;
                                self.emit('channel.topic', buffer.id, topic);
                                break;
                            default:
                                logger('Unhandled Sync.IrcChannel %s', functionName);
                        }
                    });
                    break;
                case "BacklogManager":
                    switch(functionName) {
                        case "receiveBacklog":
                            bufferId = obj[4];
                            data = obj[9];
                            buffer = self.networks.findBuffer(bufferId);
                            if (buffer !== null) {
                                var messageIds = [], message;
                                for (i=0; i<data.length; i++) {
                                    message = buffer.addMessage(data[i]);
                                    if (!message) {
                                        logger("Getting message buffer already have %s", data[i].bufferInfo.name);
                                    } else {
                                        messageIds.push(message.id);
                                        network = self.networks.get(buffer.network);
                                        message._updateFlags(network, self.identities.get(network.identityId), self.options.highlightmode);
                                    }
                                }
                                self.emit("buffer.backlog", bufferId, messageIds);
                            } else {
                                logger("Buffer %d does not exists.", bufferId);
                            }
                            break;
                        default:
                            logger('Unhandled Sync.BacklogManager %s', functionName);
                    }
                    break;
                case "IgnoreListManager":
                    switch(functionName) {
                        case "update":
                            data = obj[4];
                            self.ignoreList.import(data);
                            self.emit('ignorelist', self.ignoreList);
                            break;
                        default:
                            logger('Unhandled Sync.IgnoreListManager %s', functionName);
                    }
                    break;
                case "Identity":
                    identityId = parseInt(obj[2], 10);
                    identity = self.identities.get(identityId);
                    if (identity) {
                        if (typeof identity[functionName] === 'function') {
                            identity[functionName](obj[4]);
                            self.emit('identity.' + functionName, identityId, obj[4]);
                        } else {
                            logger('Unhandled Sync.Identity %s', functionName);
                        }
                    } else {
                        logger('Unknown Identity %s', obj[2]);
                    }
                    break;
                case "AliasManager":
                    switch(functionName) {
                        case "update":
                            data = obj[4];
                            self.aliases = alias.toArray(data);
                            self.emit('aliases', self.aliases);
                            break;
                        default:
                            logger('Unhandled Sync.AliasManager %s', functionName);
                    }
                    break;
                default:
                    logger('Unhandled Sync %s', className);
            }
            break;
        case RequestType.RpcCall:
            functionName = obj[1].toString();
            switch(functionName) {
                case "2displayStatusMsg(QString,QString)":
                    // Even official client doesn't use this ...
                    break;
                case "2displayMsg(Message)":
                    message = obj[2];
                    networkId = message.bufferInfo.network;
                    bufferId = message.bufferInfo.id;
                    network = self.networks.get(networkId);
                    bufferCollection = network.getBufferCollection();
                    if (!bufferCollection.hasBuffer(bufferId)) {
                        if (bufferCollection.hasBuffer(message.bufferInfo.name)) {
                            buffer = bufferCollection.getBuffer(message.bufferInfo.name);
                            bufferCollection.moveBuffer(buffer, bufferId);
                        } else {
                            buffer = new IRCBuffer(bufferId, message.bufferInfo);
                            bufferCollection.addBuffer(buffer);
                            if (message.bufferInfo.type === IRCBuffer.Types.StatusBuffer) {
                                // Status Buffer special case
                                buffer.isStatusBuffer(true);
                                network.setStatusBuffer(buffer);
                            }
                        }
                        self.emit("network.addbuffer", networkId, bufferId);
                    }
                    
                    if (message.type === MessageType.NetsplitJoin) {
                        // TODO
                    } else if (message.type === MessageType.NetsplitQuit) {
                        // TODO
                    }

                    buffer = bufferCollection.getBuffer(bufferId);
                    if (buffer !== null) {
                        var simpleMessage = buffer.addMessage(message);
                        if (simpleMessage) {
                            simpleMessage._updateFlags(network, self.identities.get(network.identityId), self.options.highlightmode);
                            self.emit("buffer.message", bufferId, simpleMessage.id);
                        }
                    }
                    break;
                case "__objectRenamed__":
                    var renamedSubject = obj[2].toString();
                    switch(renamedSubject) {
                        case "IrcUser":
                            var newNick = splitOnce(obj[3], "/"); // 1/Nick
                            oldNick = splitOnce(obj[4], "/"); // 1/Nick_
                            self.networks.get(newNick[0]).renameUser(oldNick[1], newNick[1]);
                            self.emit("network.userrenamed", newNick[0], oldNick[1], newNick[1]);
                            break;
                        default:
                            logger('Unhandled RpcCall.__objectRenamed__ %s', renamedSubject);
                    }
                    break;
                case "2networkCreated(NetworkId)":
                    networkId = obj[2];
                    self.networks.add(networkId);
                    self.sendInitRequest("Network", ""+networkId);
                    self.emit("network.new", networkId);
                    break;
                case "2networkRemoved(NetworkId)":
                    networkId = obj[2];
                    self.networks.remove(networkId);
                    self.emit("network.remove", networkId);
                    break;
                case "2identityCreated(Identity)":
                    identity = obj[2];
                    self.identities.set(identity.identityId, new Identity(identity));
                    self.emit("identity.new", identity.identityId);
                    break;
                case "2identityRemoved(IdentityId)":
                    identityId = obj[2];
                    self.identities.delete(identityId);
                    self.emit('identity.remove', identityId);
                    break;
                default:
                    logger('Unhandled RpcCall %s', functionName);
            }
            break;
        case RequestType.InitData:
            className = obj[1].toString();
            switch(className) {
                case "Network":
                    network = self.handleInitDataNetwork(obj);
                    var syncRequest = [
                        new qtdatastream.QUInt(RequestType.Sync),
                        new qtdatastream.QString("BufferSyncer"),
                        new qtdatastream.QString(""),
                        new qtdatastream.QString("requestPurgeBufferIds")
                    ];
                    self.qtsocket.write(syncRequest);
                    self.emit("network.init", network.networkId);
                    break;
                case "BufferSyncer":
                    var markerLinesData = obj[3]["MarkerLines"];
                    var lastSeenData = obj[3]["LastSeenMsg"];
                    if (lastSeenData !== null) {
                        for (i=0; i<lastSeenData.length; i+=2) {
                            bufferId = lastSeenData[i];
                            messageId = lastSeenData[i+1];
                            buffer = self.networks.findBuffer(bufferId);
                            if (buffer !== null) {
                                self.emit('buffer.lastseen', bufferId, messageId);
                            } else {
                                logger("Buffer #%d does not exists", bufferId);
                            }
                        }
                    } else {
                        logger("Received null LastSeenMsg");
                    }
                    if (markerLinesData !== null) {
                        for (i=0; i<markerLinesData.length; i+=2) {
                            bufferId = markerLinesData[i];
                            messageId = markerLinesData[i+1];
                            buffer = self.networks.findBuffer(bufferId);
                            if (buffer !== null) {
                                self.emit('buffer.markerline', bufferId, messageId);
                            } else {
                                logger("Buffer #%d does not exists", bufferId);
                            }
                        }
                    } else {
                        logger("Received null markerLines");
                    }
                    break;
                case "IrcUser":
                    tmp = splitOnce(obj[2], "/");
                    data = obj[3];
                    networkId = parseInt(tmp[0], 10);
                    user = self.networks.get(networkId).getUserByNick(tmp[1]);
                    if (user !== null) {
                        user.devour(data);
                        self.emit('network.adduser', networkId, tmp[1]);
                    }
                    break;
                case "IrcChannel":
                    tmp = splitOnce(obj[2], "/");
                    data = obj[3];
                    bufferNetworkId = parseInt(tmp[0], 10);
                    bufferName = tmp[1];
                    buffer = self.networks.get(bufferNetworkId).getBufferCollection().getBuffer(bufferName);
                    buffer.topic = data.topic;
                    buffer.setActive(true);
                    self.emit('channel.topic', bufferNetworkId, bufferName, data.topic);
                    self.emit('buffer.activate', buffer.id);
                    break;
                case "BufferViewManager":
                    data = obj[3]["BufferViewIds"];
                    for (ind in data) {
                        self.sendInitRequest("BufferViewConfig", ""+data[ind]);
                    }
                    self.emit('bufferview.ids', data);
                    break;
                case "BufferViewConfig":
                    bufferViewId = parseInt(obj[2], 10);
                    data = obj[3];
                    this.bufferViews.set(bufferViewId, new BufferView(bufferViewId, data));
                    for (ind in data.TemporarilyRemovedBuffers) {
                        self.emit('bufferview.bufferhidden', bufferViewId, data.TemporarilyRemovedBuffers[ind], "temp");
                    }
                    for (ind in data.RemovedBuffers) {
                        self.emit('bufferview.bufferhidden', bufferViewId, data.RemovedBuffers[ind], "perm");
                    }
                    self.emit('bufferview.orderchanged', bufferViewId);
                    self.emit('bufferview.init', bufferViewId);
                    break;
                case "IgnoreListManager":
                    data = obj[3];
                    self.ignoreList.import(data);
                    self.emit('ignorelist', self.ignoreList);
                    break;
                case "AliasManager":
                    data = obj[3];
                    self.aliases = alias.toArray(data);
                    self.emit('aliases', self.aliases);
                    break;
                case "CoreInfo":
                    data = obj[3];
                    self.coreData = data;
                    self.emit('coreinfo', data);
                    break;
                default:
                    logger('Unhandled InitData %s', className);
            }
            break;
        case RequestType.HeartBeat:
            logger('HeartBeat');
            self.heartBeat(true);
            break;
        case RequestType.HeartBeatReply:
            logger('HeartBeatReply');
            break;
        default:
            logger('Unhandled RequestType %s', obj[0]);
    }
};

/**
 * Dispatch quasselcore messages
 * @param {Object} obj
 * @protected
 */
Quassel.prototype.dispatch = function(obj) {
    if (obj === null) {
        logger("Received null object ... ?");
    } else if (typeof obj.MsgType !== 'undefined') {
        this.handleMsgType(obj);
    } else if(Buffer.isBuffer(obj[1])) {
        this.handleStruct(obj);
    }
};

/**
 * Affects obj to corresponding {@link module:network.Network}
 * @param {Object} obj
 * @protected
 */
Quassel.prototype.handleInitDataNetwork = function(obj) {
    var networkId = parseInt(obj[2], 10);
    var network = this.networks.get(networkId);
    network.devour(obj[3]);
    return network;
};

/**
 * Sends a request to quasselcore to fetch initial backlogs for all buffers
 * @param {number} limit
 */
Quassel.prototype.requestBacklogs = function(limit){
    var self = this;
    this.networks.hm.forEach(function(network){
        var buffers = network.getBufferMap();
        buffers.forEach(function(value) {
            self.requestBacklog(value.id, -1, -1, limit);
        });
    });
};

/**
 * Sends an initialization request to quasselcore for specified `classname` and `objectname`
 * @param {String} classname
 * @param {String} objectname
 * @example
 * self.sendInitRequest("IrcUser", "1/randomuser");
 */
Quassel.prototype.sendInitRequest = function(classname, objectname) {
    var initRequest = [
        new qtdatastream.QUInt(RequestType.InitRequest),
        new qtdatastream.QString(classname),
        new qtdatastream.QString(objectname)
    ];
    this.qtsocket.write(initRequest);
};

/**
 * Sends client information to quasselcore
 * @param {boolean} useSSL
 * @param {boolean} useCompression - Not supported
 * @protected
 */
Quassel.prototype.sendClientInfo = function(useSSL, useCompression){
    var smap = {
        "ClientDate": "Apr 14 2014 17:18:30",
        "UseSsl": useSSL,
        "ClientVersion": "JS libquassel v1.0",
        "UseCompression": useCompression,
        "MsgType": "ClientInit",
        "ProtocolVersion": 10
    };
    logger('Sending client informations');
    this.qtsocket.write(smap);
};

/**
 * Initialize connection settings
 * @fires module:libquassel~Quassel#event:"error"
 * @protected
 */
Quassel.prototype.init = function() {
    var self = this;
    this.client = net.Socket();
    
    // Handle magic number response
    this.client.once('data', function(data) {
        var ret = data.readUInt32BE(0);
        if (((ret >> 24) & 0x01) > 0) {
            self.useSSL = true;
            logger('Using SSL');
        }
        
        if (((ret >> 24) & 0x02) > 0) {
            self.useCompression = true;
            logger('Using compression');
        }
        
        
        if (self.useCompression) {
            // Not working, don't know why yet
            self.qtsocket = new qtdatastream.Socket(self.client, function(buffer, next) {
                zlib.inflate(buffer, next);
            }, function(buffer, next) {
                var deflate = zlib.createDeflate({flush: zlib.Z_SYNC_FLUSH}), buffers = [];
                deflate.on('data', function(chunk) {
                    buffers.push(chunk);
                });
                
                deflate.on('end', function() {
                    logger(buffers);
                    next(null, Buffer.concat(buffers));
                });
                
                deflate.end(buffer);
            });
        } else {
            self.qtsocket = new qtdatastream.Socket(self.client);
        }
        
        // bind events on qtsocket
        self.qtsocket.on('data', function(data) {
            self.dispatch(data);
        })
        .on('close', function() {
            logger('Connection closed');
        })
        .on('end', function() {
            logger('END');
        })
        .on('error', function(e) {
            console.log('ERROR', e);
            self.emit('error', e);
        });
        
        self.sendClientInfo(self.useSSL, self.useCompression);
    });
    
    this.client.on('error', function(e) {
        logger('ERROR', e);
        self.emit('error', e);
    });  
};

/**
 * Get network collection
 * @returns {module:network.NetworkCollection}
 */
Quassel.prototype.getNetworks = function() {
    return this.networks;
};

/**
 * Get network Map
 * @returns {Map.<number, module:network.Network>}
 */
Quassel.prototype.getNetworksMap = function() {
    return this.networks.hm;
};

/**
 * Setup core
 * @param {String} backend
 * @param {String} adminuser
 * @param {String} adminpassword
 * @param {Object} [properties]
 */
Quassel.prototype.setupCore = function(backend, adminuser, adminpassword, properties) {
    var self = this;
    
    properties = properties || {};
    var obj = {
        SetupData: {
            ConnectionProperties: properties,
            Backend: backend,
            AdminUser: adminuser,
            AdminPasswd: adminpassword
        },
        MsgType: 'CoreSetupData'
    };
    
    if (self.useSSL) {
        var secureStream = tls.connect(null, {
            socket: self.qtsocket.socket,
            rejectUnauthorized: false,
            secureProtocol: 'TLSv1_client_method'
        });
        self.qtsocket.updateSocket(secureStream);
    }
    
    this.qtsocket.write(obj);
};

/**
 * Login to quasselcore
 */
Quassel.prototype.login = function() {
    var self = this;
    if (self.useSSL) {
        var secureStream = tls.connect(null, {
            socket: self.qtsocket.socket,
            rejectUnauthorized: false,
            secureProtocol: 'TLSv1_client_method'
        });
        self.qtsocket.updateSocket(secureStream);
    }

    self.loginCallback(function(user, password) {
        var obj = {
            "MsgType": "ClientLogin",
            "User": user,
            "Password": password
        };
        self.qtsocket.write(obj);
    });
};

/**
 * Initialize the connection
 * @example
 * var quassel = new Quassel(...);
 * quassel.connect();
 */
Quassel.prototype.connect = function() {
    var self = this;
    var magic = 0x42b33f00;
    // magic | 0x01 Encryption
    // magic | 0x02 Compression
    if (self.options.securecore) {
        magic = magic | 0x01;
    }
    
    if (this.connected !== null) {
        this.init();
    }
    
    this.client.connect(this.port, this.server, function(){
        var writer = new Writer();
        writer.writeUInt(magic);
        writer.writeUInt(0x01);
        writer.writeUInt(0x01 << 31);
        self.client.write(writer.getRawBuffer());
        self.connected = true;
    });
};

/**
 * Disconnect the client from the core
 */
Quassel.prototype.disconnect = function() {
    clearInterval(this.heartbeatInterval);
    this.client.end();
    this.client.destroy();
    this.connected = false;
};

/**
 * Core RPC request - Create a new {@link module:identity}
 * @param {String} identityName
 * @param {Object} [options]
 * @param {String} [options.realName=identityName]
 * @param {String} [options.nick=identityName]
 * @param {String} [options.awayNick=""]
 * @param {boolean} [options.awayNickEnabled=false]
 * @param {String} [options.awayReason="Gone fishing."]
 * @param {boolean} [options.awayReasonEnabled=true]
 * @param {boolean} [options.autoAwayEnabled=false]
 * @param {number} [options.autoAwayTime=10]
 * @param {String} [options.autoAwayReason="Not here. No, really. not here!"]
 * @param {boolean} [options.autoAwayReasonEnabled=false]
 * @param {boolean} [options.detachAwayEnabled=false]
 * @param {String} [options.detachAwayReason="All Quassel clients vanished from the face of the earth..."]
 * @param {boolean} [options.detachAwayReasonEnabled=false]
 * @param {String} [options.ident="quassel"]
 * @param {String} [options.kickReason="Kindergarten is elsewhere!"]
 * @param {String} [options.partReason="http://quassel-irc.org - Chat comfortably. Anywhere."]
 * @param {String} [options.quitReason="http://quassel-irc.org - Chat comfortably. Anywhere."]
 */
Quassel.prototype.createIdentity = function(identityName, options) {
    options = options || {};
    var slit = [
        new qtdatastream.QInt(RequestType.RpcCall),
        "2createIdentity(Identity,QVariantMap)",
        new qtdatastream.QUserType("Identity", {
            identityId: new qtdatastream.QUserType("IdentityId", -1),
            identityName: identityName,
            realName: options.realName || identityName,
            nicks: [options.nick || identityName],
            awayNick: options.awayNick || "",
            awayNickEnabled: options.awayNickEnabled || false,
            awayReason: options.awayReason || "Gone fishing.",
            awayReasonEnabled: options.awayReasonEnabled || true,
            autoAwayEnabled: options.autoAwayEnabled || false,
            autoAwayTime: options.autoAwayTime || 10,
            autoAwayReason: options.autoAwayReason || "Not here. No, really. not here!",
            autoAwayReasonEnabled: options.autoAwayReasonEnabled || false,
            detachAwayEnabled: options.detachAwayEnabled || false,
            detachAwayReason: options.detachAwayReason || "All Quassel clients vanished from the face of the earth...",
            detachAwayReasonEnabled: options.detachAwayReasonEnabled || false,
            ident: options.ident || "quassel",
            kickReason: options.kickReason || "Kindergarten is elsewhere!",
            partReason: options.partReason || "http://quassel-irc.org - Chat comfortably. Anywhere.",
            quitReason: options.quitReason || "http://quassel-irc.org - Chat comfortably. Anywhere."
        }),
        {}
    ];
    logger('Creating identity');
    this.qtsocket.write(slit);
};

/**
 * Core RPC request - Remove an {@link module:identity}
 * @param {number} identityId
 */
Quassel.prototype.removeIdentity = function(identityId) {
    var slit = [
        new qtdatastream.QInt(RequestType.RpcCall),
        "2removeIdentity(IdentityId)",
        new qtdatastream.QUserType("IdentityId", identityId)
    ];
    logger('Deleting identity');
    this.qtsocket.write(slit);
};

function _getInsensitive(obj, prop) {
    prop = prop.toLowerCase();
    for (var p in obj) {
        if (obj.hasOwnProperty(p) && prop === p.toLowerCase()) {
            return obj[p];
        }
    }
    return void 0;
}

function _serverListDefaults(server) {
    return {
        Host: _getInsensitive(server, 'host'),
        Port: _getInsensitive(server, 'port') || "6667",
        Password: _getInsensitive(server, 'password') || "",
        UseSSL: _getInsensitive(server, 'usessl') || false,
        sslVersion: _getInsensitive(server, 'sslversion') || 0,
        UseProxy: _getInsensitive(server, 'useproxy') || false,
        ProxyType: _getInsensitive(server, 'proxytype') || 0,
        ProxyHost: _getInsensitive(server, 'proxyhost') || "",
        ProxyPort: _getInsensitive(server, 'proxyport') || 8080,
        ProxyUser: _getInsensitive(server, 'proxyuser') || "",
        ProxyPass: _getInsensitive(server, 'proxypass') || "",
        sslVerify: _getInsensitive(server, 'sslverify') || false
    };
}

/**
 * Core RPC request - Create a {@link module:network.Network}
 * @param {String} networkName
 * @param {number} identityId
 * @param {(String|Object)} initialServer - Server hostname or IP, or full Network::Server Object. Can also be undefined if options.ServerList is defined.
 * @param {String} [initialServer.Host=initialServer]
 * @param {String} [initialServer.Port="6667"]
 * @param {String} [initialServer.Password=""]
 * @param {boolean} [initialServer.UseSSL=true]
 * @param {number} [initialServer.sslVersion=0]
 * @param {boolean} [initialServer.UseProxy=false]
 * @param {number} [initialServer.ProxyType=0]
 * @param {String} [initialServer.ProxyHost=""]
 * @param {String} [initialServer.ProxyPort=""]
 * @param {String} [initialServer.ProxyUser=""]
 * @param {String} [initialServer.ProxyPass=""]
 * @param {Object} [options]
 * @param {String} [options.codecForServer=""]
 * @param {String} [options.codecForEncoding=""]
 * @param {String} [options.codecForDecoding=""]
 * @param {boolean} [options.useRandomServer=false]
 * @param {String[]} [options.perform=[]]
 * @param {Object[]} [options.ServerList=[]]
 * @param {boolean} [options.useAutoIdentify=false]
 * @param {String} [options.autoIdentifyService="NickServ"]
 * @param {String} [options.autoIdentifyPassword=""]
 * @param {boolean} [options.useSasl=false]
 * @param {String} [options.saslAccount=""]
 * @param {String} [options.saslPassword=""]
 * @param {boolean} [options.useAutoReconnect=true]
 * @param {number} [options.autoReconnectInterval=60]
 * @param {number} [options.autoReconnectRetries=20]
 * @param {boolean} [options.unlimitedReconnectRetries=false]
 * @param {boolean} [options.rejoinChannels=true]
 * @param {boolean} [options.useCustomMessageRate=false]
 * @param {boolean} [options.unlimitedMessageRate=false]
 * @param {number} [options.msgRateMessageDelay=2200]
 * @param {number} [options.msgRateBurstSize=5]
 */
Quassel.prototype.createNetwork = function(networkName, identityId, initialServer, options) {
    options = options || {};
    if (typeof initialServer === "string") {
        initialServer = {
            host: initialServer
        };
    }
    var serverList = [];
    if (options.ServerList && options.ServerList.length > 0) {
        for (var i=0; i<options.ServerList.length; i++) {
            serverList.push(new qtdatastream.QUserType("Network::Server", _serverListDefaults(options.ServerList[i])));
        }
    } else {
        serverList = [new qtdatastream.QUserType("Network::Server", _serverListDefaults(initialServer))];
    }
    var slit = [
        new qtdatastream.QInt(RequestType.RpcCall),
        "2createNetwork(NetworkInfo,QStringList)",
        new qtdatastream.QUserType("NetworkInfo", {
            NetworkId: new qtdatastream.QUserType("NetworkId", -1),
            NetworkName: networkName,
            Identity: new qtdatastream.QUserType("IdentityId", identityId),
            // useCustomEncodings: false,
            CodecForServer: new qtdatastream.QByteArray(options.codecForServer || ""),
            CodecForEncoding: new qtdatastream.QByteArray(options.codecForEncoding || ""),
            CodecForDecoding: new qtdatastream.QByteArray(options.codecForDecoding || ""),
            ServerList: serverList,
            UseRandomServer: options.useRandomServer || false,
            Perform: options.perform || [],
            UseAutoIdentify: options.useAutoIdentify || false,
            AutoIdentifyService: options.autoIdentifyService || "NickServ",
            AutoIdentifyPassword: options.autoIdentifyPassword || "",
            UseSasl: options.useSasl || false,
            SaslAccount: options.saslAccount || "",
            SaslPassword: options.saslPassword || "",
            UseAutoReconnect: options.useAutoReconnect || true,
            AutoReconnectInterval: options.autoReconnectInterval || 60,
            AutoReconnectRetries: options.autoReconnectRetries || 20,
            UnlimitedReconnectRetries: options.unlimitedReconnectRetries || false,
            RejoinChannels: options.rejoinChannels || true,
            UseCustomMessageRate: options.useCustomMessageRate || false,
            UnlimitedMessageRate: options.unlimitedMessageRate || false,
            MessageRateDelay: options.msgRateMessageDelay || 2200,
            MessageRateBurstSize: options.msgRateBurstSize || 5
        }),
        new qtdatastream.QStringList([])
    ];
    logger('Creating network');
    this.qtsocket.write(slit);
};

/**
 * Core RPC request - Remove a {@link module:network.Network}
 * @param {number} networkId
 */
Quassel.prototype.removeNetwork = function(networkId) {
    var slit = [
        new qtdatastream.QInt(RequestType.RpcCall),
        "2removeNetwork(NetworkId)",
        new qtdatastream.QUserType("NetworkId", networkId)
    ];
    logger('Deleting nhetwork');
    this.qtsocket.write(slit);
};

/**
 * Core RPC request - Send a user input to a specified buffer
 * @param {number} bufferId
 * @param {String} message
 */
Quassel.prototype.sendMessage = function(bufferId, message) {
    var buffer = this.networks.findBuffer(parseInt(bufferId, 10));
    if (buffer !== null) {
        var slit = [
            new qtdatastream.QInt(RequestType.RpcCall),
            "2sendInput(BufferInfo,QString)",
            new qtdatastream.QUserType("BufferInfo", buffer.getBufferInfo()),
            new qtdatastream.QString(message)
        ];
        logger('Sending message');
        this.qtsocket.write(slit);
    } else {
        logger("Could not send message to buffer %d. Buffer not found.", bufferId);
    }
};

/**
 * Core Sync request - Backlogs
 * @param {number} bufferId
 * @param {number} [firstMsgId=-1]
 * @param {number} [lastMsgId=-1]
 * @param {number} [maxAmount=backloglimit]
 */
Quassel.prototype.requestBacklog = function(bufferId, firstMsgId, lastMsgId, maxAmount) {
    firstMsgId = firstMsgId || -1;
    lastMsgId = lastMsgId || -1;
    maxAmount = maxAmount || this.options.backloglimit;
    var slist = [
        new qtdatastream.QInt(RequestType.Sync),
        "BacklogManager",
        "",
        "requestBacklog",
        new qtdatastream.QUserType("BufferId", bufferId),
        new qtdatastream.QUserType("MsgId", firstMsgId),
        new qtdatastream.QUserType("MsgId", lastMsgId),
        new qtdatastream.QInt(maxAmount),
        new qtdatastream.QInt(0)
    ];
    logger('Sending backlog request');
    this.qtsocket.write(slist);
};

/**
 * Core Sync request - Disconnect the specified network
 * @param {number} networkId
 */
Quassel.prototype.requestDisconnectNetwork = function(networkId) {
    var slist = [
        new qtdatastream.QInt(RequestType.Sync),
        "Network",
        ""+networkId,
        new qtdatastream.QByteArray("requestDisconnect")
    ];
    logger('Sending disconnection request');
    this.qtsocket.write(slist);
};

/**
 * Core Sync request - Connect the specified network
 * @param {number} networkId
 */
Quassel.prototype.requestConnectNetwork = function(networkId) {
    var slist = [
        new qtdatastream.QInt(RequestType.Sync),
        "Network",
        ""+networkId,
        new qtdatastream.QByteArray("requestConnect")
    ];
    logger('Sending connection request');
    this.qtsocket.write(slist);
};

/**
 * Core Sync request - Mark buffer as read
 * @param {number} bufferId
 */
Quassel.prototype.requestMarkBufferAsRead = function(bufferId) {
    var slist = [
        new qtdatastream.QInt(RequestType.Sync),
        "BufferSyncer",
        "",
        new qtdatastream.QByteArray("requestMarkBufferAsRead"),
        new qtdatastream.QUserType("BufferId", bufferId)
    ];
    logger('Sending mark buffer as read request');
    this.qtsocket.write(slist);
};

/**
 * Core Sync request - Set all messages before messageId as read for specified buffer
 * @param {number} bufferId
 * @param {number} messageId
 */
Quassel.prototype.requestSetLastMsgRead = function(bufferId, messageId) {
    var slist = [
        new qtdatastream.QInt(RequestType.Sync),
        "BufferSyncer",
        "",
        new qtdatastream.QByteArray("requestSetLastSeenMsg"),
        new qtdatastream.QUserType("BufferId", bufferId),
        new qtdatastream.QUserType("MsgId", messageId)
    ];
    logger('Sending last message read request');
    this.qtsocket.write(slist);
};

/**
 * Core Sync request - Mark a specified buffer line
 * @param {number} bufferId
 * @param {number} messageId
 */
Quassel.prototype.requestSetMarkerLine = function(bufferId, messageId) {
    var slist = [
        new qtdatastream.QInt(RequestType.Sync),
        "BufferSyncer",
        "",
        new qtdatastream.QByteArray("requestSetMarkerLine"),
        new qtdatastream.QUserType("BufferId", bufferId),
        new qtdatastream.QUserType("MsgId", messageId)
    ];
    logger('Sending mark line request');
    this.qtsocket.write(slist);
};

/**
 * Core Sync request - Remove a buffer
 * @param {number} bufferId
 */
Quassel.prototype.requestRemoveBuffer = function(bufferId) {
    var slist = [
        new qtdatastream.QInt(RequestType.Sync),
        "BufferSyncer",
        "",
        new qtdatastream.QByteArray("requestRemoveBuffer"),
        new qtdatastream.QUserType("BufferId", bufferId)
    ];
    logger('Sending perm hide request');
    this.qtsocket.write(slist);
};

/**
 * Core Sync request - Merge bufferId2 into bufferId1
 * @param {number} bufferId1
 * @param {number} bufferId2
 */
Quassel.prototype.requestMergeBuffersPermanently = function(bufferId1, bufferId2) {
    var slist = [
        new qtdatastream.QInt(RequestType.Sync),
        "BufferSyncer",
        "",
        new qtdatastream.QByteArray("requestMergeBuffersPermanently"),
        new qtdatastream.QUserType("BufferId", bufferId1),
        new qtdatastream.QUserType("BufferId", bufferId2)
    ];
    logger('Sending merge request');
    this.qtsocket.write(slist);
};

/**
 * Core Sync request - Hide a buffer temporarily
 * @param {number} bufferViewId
 * @param {number} bufferId
 */
Quassel.prototype.requestHideBufferTemporarily = function(bufferViewId, bufferId) {
    var slist = [
        new qtdatastream.QInt(RequestType.Sync),
        "BufferViewConfig",
        ""+bufferViewId,
        "requestRemoveBuffer",
        new qtdatastream.QUserType("BufferId", bufferId)
    ];
    logger('Sending temp hide request');
    this.qtsocket.write(slist);
};

/**
 * Core Sync request - Hide a buffer permanently
 * @param {number} bufferViewId
 * @param {number} bufferId
 */
Quassel.prototype.requestHideBufferPermanently = function(bufferViewId, bufferId) {
    if (typeof bufferViewId === "undefined") bufferViewId = this.bufferViewId;
    var slist = [
        new qtdatastream.QInt(RequestType.Sync),
        "BufferViewConfig",
        ""+bufferViewId,
        "requestRemoveBufferPermanently",
        new qtdatastream.QUserType("BufferId", bufferId)
    ];
    logger('Sending perm hide request');
    this.qtsocket.write(slist);
};

/**
 * Core Sync request - Unhide a buffer
 * @param {number} bufferViewId
 * @param {number} bufferId
 */
Quassel.prototype.requestUnhideBuffer = function(bufferViewId, bufferId) {
    bufferId = parseInt(bufferId, 10);
    var buffer = this.getNetworks().findBuffer(bufferId);
    var bufferCount = this.getNetworks().get(buffer.network).getBufferMap().size;
    if (typeof bufferViewId === "undefined") bufferViewId = this.bufferViewId;
    var slist = [
        new qtdatastream.QInt(RequestType.Sync),
        "BufferViewConfig",
        ""+bufferViewId,
        "requestAddBuffer",
        new qtdatastream.QUserType("BufferId", bufferId),
        new qtdatastream.QInt(bufferCount)
    ];
    logger('Sending unhide request');
    this.qtsocket.write(slist);
};

/**
 * Core Sync request - Rename a buffer
 * @param {number} bufferId
 * @param {string} newName
 */
Quassel.prototype.requestRenameBuffer = function(bufferId, newName) {
    bufferId = parseInt(bufferId, 10);
    var slist = [
        new qtdatastream.QInt(RequestType.Sync),
        "BufferSyncer",
        "",
        "requestRenameBuffer",
        new qtdatastream.QUserType("BufferId", bufferId),
        newName
    ];
    logger('Sending rename buffer request');
    this.qtsocket.write(slist);
};

/**
 * Core Sync request - Update ignoreList
 * @param {object} ignoreList
 */
Quassel.prototype.requestUpdateIgnoreListManager = function(ignoreList) {
    var slist = [
        new qtdatastream.QInt(RequestType.Sync),
        "IgnoreListManager",
        "",
        "requestUpdate",
        ignoreList
    ];
    logger('Sending update request (IgnoreListManager)');
    this.qtsocket.write(slist);
};

/**
 * Core Sync request - Update identity
 * @param {Number} identityId
 * @param {object} identity
 */
Quassel.prototype.requestUpdateIdentity = function(identityId, identity) {
    var slist = [
        new qtdatastream.QInt(RequestType.Sync),
        new qtdatastream.QByteArray("Identity"),
        ""+identityId,
        new qtdatastream.QByteArray("requestUpdate"),
        identity
    ];
    logger('Sending update request (Identity)');
    this.qtsocket.write(slist);
};

/**
 * Core Sync request - Update aliases
 * @param {object} data @see {@link module:alias.toCoreObject}
 */
Quassel.prototype.requestUpdateAliasManager = function(data) {
    var slist = [
        new qtdatastream.QInt(RequestType.Sync),
        new qtdatastream.QByteArray("AliasManager"),
        "",
        new qtdatastream.QByteArray("requestUpdate"),
        data
    ];
    logger('Sending update request (AliasManager)');
    this.qtsocket.write(slist);
};

/**
 * Core Sync request - Update network information
 * @param {Number} networkId
 * @param {object} network
 */
Quassel.prototype.requestSetNetworkInfo = function(networkId, network) {
    var slist = [
        new qtdatastream.QInt(RequestType.Sync),
        new qtdatastream.QByteArray("Network"),
        ""+networkId,
        new qtdatastream.QByteArray("requestSetNetworkInfo"),
        Network.toQ(network)
    ];
    logger('Sending update request (Network)');
    this.qtsocket.write(slist);
};

/**
 * Core Sync request - Create a new chat list
 * @param {object} data
 * @example
 * quassel.requestCreateBufferView({
 *     sortAlphabetically: 1,
 *     showSearch: 0,
 *     networkId: 0,
 *     minimumActivity: 0,
 *     hideInactiveNetworks: 0,
 *     hideInactiveBuffers: 0,
 *     disableDecoration: 0,
 *     bufferViewName: 'All Chats',
 *     allowedBufferTypes: 15,
 *     addNewBuffersAutomatically: 1,
 *     TemporarilyRemovedBuffers: [],
 *     RemovedBuffers: [],
 *     BufferList: []
 * });
 */
Quassel.prototype.requestCreateBufferView = function(data) {
    var slist = [
        new qtdatastream.QInt(RequestType.Sync),
        new qtdatastream.QByteArray("BufferViewManager"),
        "",
        "requestCreateBufferView",
        data
    ];
    logger('Sending create buffer view request');
    this.qtsocket.write(slist);
};

/**
 * Qt UserType
 * @typedef UserType
 * @see https://github.com/magne4000/node-qtdatastream/blob/master/README.md#qusertype-special-treatment
 * @example
 * new qtdatastream.Writer({
 *   "NetworkId": new QUserType("NetworkId", 1)
 * });
 * @example
 * new qtdatastream.Writer({
 *   "BufferInfo": new QUserType("BufferInfo", {
 *     id: 2,
 *     network: 4,
 *     type: 5,
 *     group: 1,
 *     name: "something"
 *   })
 * });
 */

/**
 * @typedef {UserType} UserType&lt;NetworkId&gt;
 * @property {INT} this
 */
qtdatastream.registerUserType("NetworkId", qtdatastream.Types.INT);

/**
 * @typedef {UserType} UserType&lt;IdentityId&gt;
 * @property {INT} this
 */
qtdatastream.registerUserType("IdentityId", qtdatastream.Types.INT);

/**
 * @typedef {UserType} UserType&lt;BufferId&gt;
 * @property {INT} this
 */
qtdatastream.registerUserType("BufferId", qtdatastream.Types.INT);

/**
 * @typedef {UserType} UserType&lt;MsgId&gt;
 * @property {INT} this
 */
qtdatastream.registerUserType("MsgId", qtdatastream.Types.INT);

/**
 * @typedef {UserType} UserType&lt;Identity&gt;
 * @property {MAP} this
 */
qtdatastream.registerUserType("Identity", qtdatastream.Types.MAP);

/**
 * @typedef {UserType} UserType&lt;NetworkInfo&gt;
 * @property {MAP} this
 */
qtdatastream.registerUserType("NetworkInfo", qtdatastream.Types.MAP);

/**
 * @typedef {UserType} UserType&lt;Network::Server&gt;
 * @property {MAP} this
 */
qtdatastream.registerUserType("Network::Server", qtdatastream.Types.MAP);

/**
 * @typedef {UserType} UserType&lt;NetworkId&gt;
 * @property {INT} this
 */
qtdatastream.registerUserType("NetworkId", qtdatastream.Types.INT);

/**
 * @typedef {UserType} UserType&lt;BufferInfo&gt;
 * @property {INT} id
 * @property {INT} network
 * @property {SHORT} type
 * @property {UINT} group
 * @property {BYTEARRAY} name
 */
qtdatastream.registerUserType("BufferInfo", [
    {id: qtdatastream.Types.INT},
    {network: qtdatastream.Types.INT},
    {type: qtdatastream.Types.SHORT},
    {group: qtdatastream.Types.UINT},
    {name: qtdatastream.Types.BYTEARRAY}
]);

/**
 * @typedef {UserType} UserType&lt;Message&gt;
 * @property {INT} id
 * @property {UINT} timestamp
 * @property {UINT} type
 * @property {BOOL} flags
 * @property {UserType<BufferInfo>} bufferInfo
 * @property {BYTEARRAY} sender
 * @property {BYTEARRAY} content
 */
qtdatastream.registerUserType("Message", [
    {id: qtdatastream.Types.INT},
    {timestamp: qtdatastream.Types.UINT},
    {type: qtdatastream.Types.UINT},
    {flags: qtdatastream.Types.BOOL},
    {bufferInfo: "BufferInfo"},
    {sender: qtdatastream.Types.BYTEARRAY},
    {content: qtdatastream.Types.BYTEARRAY}
]);

function splitOnce(str, character) {
    var i = str.indexOf(character);
    return [str.slice(0,i), str.slice(i+1)];
}

module.exports = Quassel;
