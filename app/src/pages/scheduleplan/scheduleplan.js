var ko = require('knockout');
var serverService = require('../../services/server_service.js');
var scheduleService = require('../../services/schedule_service.js');
var utils = require('../../utils');
var root = require('../../root');

var TYPE_OPTIONS = Object.freeze([
    {value: 'SimpleScheduleStrategy', label: 'Simple Schedule'},
    {value: 'ABTestScheduleStrategy', label: 'A/B Test Schedule'}
]);

function newSchedulePlan() {
    return {
        type: 'SchedulePlan',
        label: "",
        strategy: scheduleService.newSimpleStrategy()
    };
}

/**
 * The complexity of this view comes from the fact that the entire data model is in the strategy,
 * and the strategy can entirely change the data model.
 * @param params
 */
module.exports = function(params) {
    var self = this;

    self.plan = null;
    self.publishedObs = ko.observable(false);

    // Models for the strategy object. The callback function will be called when saving the
    // schedule plan; the strategy implementation must implement this callback to return a
    // strategy object
    self.strategyObs = ko.observable();
    self.strategyObs.callback = utils.identity;

    // Fields for this form
    self.labelObs = ko.observable("");
    self.schedulePlanTypeObs = ko.observable('SimpleScheduleStrategy');
    self.schedulePlanTypeOptions = TYPE_OPTIONS;
    self.schedulePlanTypeLabel = utils.makeOptionLabelFinder(TYPE_OPTIONS);
    self.schedulePlanTypeObs = ko.observable('SimpleScheduleStrategy');
    self.schedulePlanTypeObs.subscribe(function(newValue) {
        if (newValue === 'SimpleScheduleStrategy') {
            self.strategyObs(scheduleService.newSimpleStrategy());
        } else if (newValue === 'ABTestScheduleStrategy') {
            self.strategyObs(scheduleService.newABTestStrategy());
        }
    });

    self.save = function(vm, event) {
        self.plan.label = self.labelObs();
        self.plan.strategy = self.strategyObs.callback();

        utils.deleteUnusedProperties(self.plan);

        utils.startHandler(self, event);
        serverService.saveSchedulePlan(self.plan)
            .then(utils.successHandler(self, event, "The schedule plan has been saved."))
            .then(function(response) {
                self.plan.guid = response.guid;
                self.plan.version = response.version;
            })
            .catch(utils.failureHandler(self, event));
    };

    function loadVM(plan) {
        self.plan = plan;
        self.labelObs(plan.label);
        self.schedulePlanTypeObs(plan.strategy.type);
        self.strategyObs(plan.strategy);
    }

    var notFoundHandler = utils.notFoundHandler(self, "Schedule plan not found.", "#/surveys");

    if (params.guid !== "new") {
        serverService.getSchedulePlan(params.guid).then(loadVM).catch(notFoundHandler);
    } else {
        loadVM(newSchedulePlan());
    }
}