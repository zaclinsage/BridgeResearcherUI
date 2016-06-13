var ko = require('knockout');

// See http://jsfiddle.net/unlsj/

var formatter = {};
formatter.replacer = function(match, pIndent, pKey, pVal, pEnd) {
    var key = '<span class=json-key>';
    var val = '<span class=json-value>';
    var str = '<span class=json-string>';
    var r = pIndent || '';
    if (pKey)
    r = r + key + pKey.replace(/[": ]/g, '') + '</span>: ';
    if (pVal)
    r = r + (pVal[0] == '"' ? str : val) + pVal + '</span>';
    return r + (pEnd || '');
};
formatter.prettyPrint = function(obj) {
    var jsonLine = /^( *)("[\w]+": )?("[^"]*"|[\w.+-]*)?([,[{])?$/mg;
    return JSON.stringify(obj, null, 3)
    .replace(/&/g, '&amp;').replace(/\\"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(jsonLine, formatter.replacer);
};
function mapItem(item) {
    item.collapsedObs = ko.observable(true);
    try {
        var json = JSON.parse(item.data);
        item.data = formatter.prettyPrint(json);
        item.collapsedValue = "{&hellip;}";
    } catch(e) {
        item.collapsedObs(false);
        item.collapsedValue = "&hellip;";
    }
    return item;
}

module.exports = {
    mapItem: mapItem
};