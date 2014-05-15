var Quassel = require('../lib/libquassel.js');
var quassel = new Quassel("getonmyhor.se", 4242);
/*
quassel.on('BacklogManager.receiveBacklog', function(buffer) {
    var n = quassel.getNetworks(), k, l, m;
    for (k in n) {
        console.log("Network : " + n[k].networkName);
        var buffers = n[k].getBuffers();
        for (l in buffers) {
            console.log("   "+(buffers[l].name||buffers[l].id));
            for (m in buffers[l].messages) {
                console.log("      " + buffers[l].messages[m].datetime + " - "
                    + buffers[l].messages[m].content);
            }
        }
    }
});*/

quassel.on('InitData.Network', function(network) {
    network.on('user.removeFromChannel', function(ircbuffer, ircuser) {
        console.log('Removed user ' + ircuser.nick + ' from channel ' + ircbuffer.name);
    });
    
    network.on('user.new', function(ircuser) {
        console.log('New user ' + ircuser.nick + ' arrived.');
    });
});