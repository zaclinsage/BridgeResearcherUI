var serverService = require('../../services/server_service');
var root = require('../../root');
var bind = require('../../binder');
var utils = require('../../utils');

module.exports = function(params) {
    var self = this;

    bind(self)
        .bind('subject', '')
        .bind('message', '');

    self.send = function(vm, event) {
        if (self.subjectObs() === "" || self.messageObs() === "") {
            utils.formFailure(event.target, 'Subject and message are both required.');
            return;
        }
        var subject = self.subjectObs();
        var message = self.messageObs();
        utils.startHandler(vm, event);

        var msgObj = {subject: subject, message: message};
        var promise = null;
        if (params.userId) {
            promise = serverService.sendUserNotification(params.userId, msgObj);
        } else if (params.topicId) {
            promise = serverService.sendTopicNotification(params.topicId, msgObj);
        } else {
            throw new Error("No type of notification provided.");
        }
        promise.then(utils.successHandler(vm, event, "Notification has been sent."))
            .then(self.cancel)
            .catch(utils.dialogFailureHandler(vm, event));        
    };
    self.cancel = function(vm, event) {
        root.closeDialog();
    };
};
