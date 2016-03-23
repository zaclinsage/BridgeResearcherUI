var ko = require('knockout');
var serverService = require('../../services/server_service.js');
var scheduleUtils = require('../schedule/schedule_utils.js');
var utils = require('../../utils');
var Promise = require('es6-promise').Promise;
var storeService = require('../../services/store_service');

var MULTI_FIELD_SORTER = utils.multiFieldSorter(
    utils.makeRangeSorter("minAppVersion", "maxAppVersion"),
    utils.makeFieldSorter("label")
);

function num(value, defaultValue) {
    return (typeof value !== "number") ? defaultValue : value;    
}

module.exports = function() {
    var self = this;
    self.allItems = [];

    self.itemsObs = ko.observableArray([]);
    self.formatDateTime = utils.formatDateTime;
    self.formatScheduleType = scheduleUtils.formatScheduleStrategyType;
    self.formatVersions = utils.formatVersionRange;
    self.atLeastOneChecked = function () {
        return self.itemsObs().some(function(item) {
            return item.checkedObs();
        });
    };
    self.filterObs = ko.observable(storeService.get('schedulePlansFilter'));
    self.applyFilter = function(vm, event) {
        if (event.keyCode === 13) {
          filterItems();
          storeService.set('schedulePlansFilter', self.filterObs());
        }
        return true;
    };
    
    self.copySchedulePlans = function(vm, event) {
        var copyables = self.itemsObs().filter(utils.hasBeenChecked);
        var confirmMsg = (copyables.length > 1) ?
            "Schedules have been copied." : "Schedule has been copied.";

        utils.startHandler(vm, event);
        var promises = copyables.map(function(plan) {
            delete plan.guid;
            delete plan.version;
            plan.label += " (Copy)";
            plan.minAppVersion = 9999999;
            delete plan.maxAppVersion;
            return serverService.saveSchedulePlan(plan);
        });
        Promise.all(promises)
            .then(load)
            .then(utils.successHandler(vm, event, confirmMsg))
            .catch(utils.failureHandler(vm, event));

    };
    self.deleteSchedulePlans = function(vm, event) {
        var deletables = self.itemsObs().filter(utils.hasBeenChecked);
        var msg = (deletables.length > 1) ?
                "Are you sure you want to delete these schedules?" :
                "Are you sure you want to delete this schedule?";
        var confirmMsg = (deletables.length > 1) ?
                "Schedules deleted." : "Schedule deleted.";

        if (confirm(msg)) {
            utils.startHandler(self, event);
            var promises = deletables.map(function(plan) {
                return serverService.deleteSchedulePlan(plan.guid);
            });
            Promise.all(promises)
                .then(utils.makeTableRowHandler(vm, deletables, "#/scheduleplans"))
                .then(utils.successHandler(vm, event, confirmMsg))
                .catch(utils.failureHandler(vm, event));
        }
    };
    self.formatStrategy = scheduleUtils.formatStrategy;
    
    function filterItems() {
        var filterNum = parseInt(self.filterObs(),10);
        self.itemsObs(self.allItems.filter(function(item) {
            if (isNaN(filterNum)) {
                return true;
            }
            var min = num(item.minAppVersion, 0);
            var max = num(item.maxAppVersion, Number.MAX_VALUE);
            return (filterNum >= min && filterNum <= max);
        }));
    }

    function load() {
        serverService.getSchedulePlans().then(function(response) {
            if (response.items.length) {
                self.allItems = response.items.map(utils.addCheckedObs);
                self.allItems.sort(MULTI_FIELD_SORTER);
                filterItems();
            } else {
                document.querySelector(".loading_status").textContent = "There are currently no schedules.";
            }
        });
    }
    scheduleUtils.loadOptions().then(load);
};