/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2016 Joël Charles
 * Licensed under the MIT license.
 */

/** @module requesttype */
/**
 * @alias module:requesttype
 * @readonly
 * @enum {number}
 * @default
 */
module.exports = {
    Invalid: 0,
    Sync: 1,
    RpcCall: 2,
    InitRequest: 3,
    InitData: 4,
    HeartBeat: 5,
    HeartBeatReply: 6
};