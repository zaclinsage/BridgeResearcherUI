var schemaUtils = require('./schema_utils');
var bind = require('../../binder');

module.exports = function(params) {
    var self = this;
    var type = params.field.typeObs();

    self.field = params.field;
    bind(self)
        .obs('focus', false)
        .obs('extra', 'none');
    schemaUtils.initFieldDefinitionVM(self, type);

    function updateExtraFields(type) {
        var typeInfo = schemaUtils.TYPE_LOOKUP[type];
        if (typeInfo) {
            self.extraObs(typeInfo.extra_fields);
        }
    }
    updateExtraFields(type);

    self.field.typeObs.subscribe(updateExtraFields);
    self.field.unboundedTextObs.subscribe(function(newValue) {
        if (newValue) {
            self.field.maxLengthObs("");
        } else {
            // let the field enable before trying to focus it.
            setTimeout(function() {self.focusObs(true);},1);
        }
    });
    self.updateExt = function(vm, event, object) {
        self.field.fileExtensionObs(object.ext);
    };
};