'use strict';
var ko = require('knockout');
var serverService = require('../../services/server_service');
var schemaUtils = require('./schema_utils');
var utils = require('../../utils');

function addCheckedObs(item) {
    item.checkedObs = ko.observable(false);
    return item;
}
function hasBeenChecked(item) {
    return item.checkedObs();
}
function makeDeletionCall(schema) {
    return function() {
        return serverService.deleteSchemaRevision(schema);
    };
}

module.exports = function(params) {
    var self = this;

    self.nameObs = ko.observable();
    self.messageObs = ko.observable();
    self.schemaIdObs = ko.observable(params.schemaId);
    self.itemsObs = ko.observableArray([]);

    // The first item, which is the latest, can be edited and saved as a new version, so
    // it is not loaded with a revision number. This queues the editor to make it writable
    self.link = function(item) {
        return (item.revision === self.itemsObs()[0].revision) ?
            ("#/schemas/"+item.schemaId) : ("#/schemas/"+item.schemaId+"/"+item.revision);
    };
    self.anyChecked = function() {
        return self.itemsObs().some(function(item) {
            return item.checkedObs();
        });
    };
    self.deleteRevisions = function(vm, event) {
        var deletables = self.itemsObs().filter(hasBeenChecked);
        var msg = (deletables.length > 2) ?
                "Are you sure you want to delete these schema versions?" :
                "Are you sure you want to delete this schema version?";
        var confirmMsg = (deletables.length > 2) ?
                "Upload schemas deleted." : "Upload schema deleted.";
        if (confirm(msg)) {
            utils.startHandler(self, event);

            deletables.reduce(function(promise, deletable) {
                if (promise === null) {
                    return serverService.deleteSchemaRevision(deletable);
                } else {
                    return promise.then(makeDeletionCall(deletable));
                }
            }, null)
                .then(utils.makeTableRowHandler(vm, deletables, "#/schemas"))
                .then(utils.successHandler(vm, event, confirmMsg))
                .catch(utils.failureHandler(vm, event));
        }
    };
    serverService.getUploadSchemaAllRevisions(params.schemaId).then(function(response) {
        self.itemsObs(response.items.map(addCheckedObs));
        if (response.items.length) {
            self.nameObs(response.items[0].name);
        }
    });
};