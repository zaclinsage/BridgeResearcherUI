var utils = require('../../utils');
var serverService = require('../../services/server_service');
var Promise = require('bluebird');
var root = require('../../root');
var bind = require('../../binder');
var alerts = require('../../widgets/alerts');
var tables = require('../../tables');

module.exports = function(params) {
    var self = this;

    bind(self)
        .obs('userId', params.userId)
        .obs('items[]')
        .obs('isNew', false)
        .obs('noConsent', true)
        .obs('title', '&#160;');

    tables.prepareTable(self, {name:'consent'});

    self.isPublicObs = root.isPublicObs;
    serverService.getParticipantName(params.userId).then(function(part) {
        self.titleObs(root.isPublicObs() ? part.name : part.externalId);
    }).catch(utils.failureHandler());

    function signOut() {
        self.noConsentObs(true);
        return serverService.signOutUser(self.userIdObs());        
    }

    self.resendConsent = function(vm, event) {
        var subpopGuid = vm.consentURL.split("/subpopulations/")[1].split("/consents/")[0];
        alerts.confirmation("This will send email to this user.\n\nDo you wish to continue?", function() {
            utils.startHandler(vm, event);
            serverService.resendConsentAgreement(params.userId, subpopGuid)
                .then(utils.successHandler(vm, event, "Resent consent agreement."))
                .catch(utils.failureHandler(vm, event));
        });
    };
    self.withdraw = function(vm, event) {
        root.openDialog('withdrawal', {userId: params.userId, vm: self});
    };
    self.finishWithdrawal = function(reasonString) {
        var reason = {"reason": reasonString};
        serverService.withdrawParticipantFromStudy(params.userId, reason)
            .then(root.closeDialog)
            .then(load)
            .then(signOut)
            .then(utils.successHandler(self, null, "User has been withdrawn from the study."))
            .catch(utils.failureHandler());
    };

    // I know, ridiculous...
    function load() {
        self.itemsObs([]);
        self.recordsMessageObs("<div class='ui tiny active inline loader'></div>");
        serverService.getParticipant(self.userIdObs()).then(function(response) {
            var histories = response.consentHistories;
            
            return Promise.map(Object.keys(histories), function(guid) {
                return serverService.getSubpopulation(guid);
            }).then(function(subpopulations) {
                subpopulations.forEach(function(subpop) {
                    if (histories[subpop.guid].length === 0) {
                        self.itemsObs.push({
                            consentGroupName: subpop.name,
                            name: "No consent",
                            consented: false
                        });
                    }
                    histories[subpop.guid].reverse().map(function(record, i) {
                        var history = {consented:true, isFirst:(i === 0)};
                        history.consentGroupName = subpop.name;
                        history.consentURL = '/#/subpopulations/'+subpop.guid+'/consents/'+record.consentCreatedOn;
                        history.name = record.name;
                        history.birthdate = new Date(record.birthdate).toLocaleDateString(); 
                        history.signedOn = new Date(record.signedOn).toLocaleString();
                        history.consentCreatedOn = new Date(record.consentCreatedOn).toLocaleString();
                        history.hasSignedActiveConsent = record.hasSignedActiveConsent;
                        if (record.withdrewOn) {
                            history.withdrewOn = new Date(record.withdrewOn).toLocaleString();
                        } else {
                            self.noConsentObs(false);
                        }
                        if (record.imageMimeType && record.imageData) {
                            history.imageData = "data:"+record.imageMimeType+";base64,"+record.imageData;
                        }
                        self.itemsObs.push(history);
                    });
                });
            });
        }).catch(utils.notFoundHandler("Participant", "participants"));
    }
    load();
};