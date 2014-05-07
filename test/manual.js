var Quassel = require('../lib/libquassel.js');
var quassel = new Quassel("getonmyhor.se", 4242, function() {
    var n = quassel.getNetworks(), k, l;
    for (k in n) {
        console.log("Network : " + n[k].networkName)
        var buffers = n[k].getBuffers();
        for (l in buffers) {
            console.log("   "+(buffers[l].name||buffers[l].id));
        }
    }
});