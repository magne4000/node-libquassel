import { Duplex } from 'stream';
import toBuffer from 'blob-to-buffer';

const ErrorCodes = {
  1001: 'The endpoint is going away, either because of a server failure or because the browser is navigating away from the page that opened the connection.',
  1002: 'The endpoint is terminating the connection due to a protocol error.',
  1003: 'The connection is being terminated because the endpoint received data of a type it cannot accept (for example, a text-only endpoint received binary data).',
  1005: 'No status code was provided even though one was expected.',
  1006: 'The connection was closed abnormally (that is, with no close frame being sent) when a status code was expected.',
  1007: 'The endpoint is terminating the connection because a message was received that contained inconsistent data (e.g., non-UTF-8 data within a text message).',
  1008: 'The endpoint is terminating the connection because it received a message that violates its policy. This is a generic status code, used when codes 1003 and 1009 are not suitable.',
  1009: 'The endpoint is terminating the connection because a data frame was received that is too large.',
  1010: 'The client is terminating the connection because it expected the server to negotiate one or more extension, but the server didn\'t.',
  1011: 'The server is terminating the connection because it encountered an unexpected condition that prevented it from fulfilling the request.',
  1012: 'The server is terminating the connection because it is restarting.',
  1013: 'The server is terminating the connection due to a temporary condition, e.g. it is overloaded and is casting off some of its clients',
  1015: 'The connection was closed due to a failure to perform a TLS handshake (e.g., the server certificate can\'t be verified).'
};

export default class WebSocketStream extends Duplex {
  constructor(target, protocols) {
    super();
    if (typeof target === 'object') {
      this.socket = target;
    } else {
      this.socket = new WebSocket(target, protocols);
    }
    this.socket.onopen = () => this.emit('connected');
    this.socket.onclose = (event) => {
      if (event.code > 1000) {
        console.error(event);
        if (event.code in ErrorCodes) {
          this.emit('error', new Error(ErrorCodes[event.code]));
        } else {
          this.emit('error', new Error('Unknown WebSocket error'));
        }
      }
      this.emit('end');
    };
    this.socket.onerror = _err => {}; // Handled by onclose
    this.socket.onmessage = (event) => {
      toBuffer(event.data, (err, buffer) => {
        if (err) throw err;
        this.push(buffer);
      });
    };
  }

  _read(_size) {}

  _write(chunk, encoding, callback) {
    if (this.socket.readyState === 1) { // open
      this.socket.send(chunk);
      callback();
    } else if (this.socket.readyState === 0) { // connecting
      this.once('connected', () => this.write(chunk, encoding, () => {}));
      callback();
    } else { // closing or close
      callback('Attempt to write on a closed websocket');
    }
  }
}
