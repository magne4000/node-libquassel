import forge from 'node-forge';
import { Duplex } from 'stream';
import debug from 'debug';
const logger = debug('libquassel:network');

export class TLSSocket extends Duplex {
  constructor(duplex, options) {
    super(options);
    this._tlsOptions = options;
    this._secureEstablished = false;
    this._duplex = duplex;
    this._duplex.push = (data) => this._ssl.process(data.toString('binary'));
    this._ssl = null;
    this._before_secure_chunks = [];
    this._init();
    this._start();
  }

  _init() {
    const self = this;
    this._ssl = forge.tls.createConnection({
      server: false,
      verify: function(connection, verified, depth, certs) {
        if (!self._tlsOptions.rejectUnauthorized || !self._tlsOptions.servername) {
          logger('server certificate verification skipped');
          return true;
        }

        if (depth === 0) {
          const cn = certs[0].subject.getField('CN').value;
          if (cn !== self._tlsOptions.servername) {
            verified = {
              alert: forge.tls.Alert.Description.bad_certificate,
              message: 'Certificate Common Name does not match hostname.'
            };
            logger('%s !== %s', cn, self._tlsOptions.servername);
          }
          logger('server certificate verified');
        } else {
          logger('skipping certificate trust verification');
          verified = true;
        }

        return verified;
      },
      connected: function(_connection) {
        logger('connected');
        self._secureEstablished = true;
        self.emit('secure');
      },
      tlsDataReady: function(connection) {
        // encrypted data is ready to be sent to the server
        const data = connection.tlsData.getBytes();
        self._duplex.write(data, 'binary');
      },
      dataReady: function(connection) {
        // clear data from the server is ready
        const data = connection.data.getBytes();
        self.push(Buffer.from(data, 'binary'));
      },
      closed: function() {
        logger('disconnected');
        self.end();
      },
      error: function(connection, error) {
        logger('error', error);
        error.toString = function () {
          return 'TLS error: ' + error.message;
        };
        self.emit('error', error);
      }
    });
  }

  _start() {
    logger('handshake');
    this._ssl.handshake();
  }

  _write(chunk, encoding, callback) {
    if (!this._secureEstablished) {
      this._before_secure_chunks.push([ chunk, encoding, callback ]);
    } else {
      if (this._before_secure_chunks.length > 0) {
        for (let [ chunk, encoding, callback ] of this._before_secure_chunks) {
          this._writenow(chunk, encoding, callback);
        }
        this._before_secure_chunks = [];
      }
      this._writenow(chunk, encoding, callback);
    }
  }

  _writenow(chunk, encoding, callback=()=>{}) {
    const result = this._ssl.prepare(chunk);
    process.nextTick(() => {
      callback(result ? 'Error while packaging data into a TLS record' : null);
    });
  }

  _read(_size) {}
}

export function connect(options, callback=()=>{}) {
  const defaults = {
    rejectUnauthorized: '0' !== process.env.NODE_TLS_REJECT_UNAUTHORIZED
  };
  options = Object.assign({}, defaults, options);

  const socket = new TLSSocket(options.socket, options);
  socket.once('secure', callback);

  return socket;
}

export function createSecureContext(options) {
  return forge.tls.createSecureContext(options);
}
