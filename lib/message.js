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
};

IRCMessage.prototype.isSelf = function() {
    return ((this.flags & Flag.Self) !== 0);
};

IRCMessage.prototype.isHighlighted = function() {
    return (((this.flags & Flag.Highlight) !== 0) && !this.isSelf());
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