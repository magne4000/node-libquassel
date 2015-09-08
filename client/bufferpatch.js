Buffer.prototype.str = function() {
    var str = this.toString();
    return str.replace('\0', '');
};