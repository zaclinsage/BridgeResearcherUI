/**
 * Manages the session and calls to the server. The two are closely bound since the former represents
 * the ability to do the latter.
 *
 * If a call is made to the server before a session exists, a one-time listener is registered to wait
 * for a session to be established, then the call is completed.
 */
// Necessary because export of library is broken
var EventEmitter = require('../events');
var storeService = require('./store_service');
var config = require('../config');
var utils = require("../utils");
var Promise = require('bluebird');
var transforms = require('../transforms');

var SESSION_KEY = 'session';
var SESSION_STARTED_EVENT_KEY = 'sessionStarted';
var SESSION_ENDED_EVENT_KEY = 'sessionEnded';
var listeners = new EventEmitter();
var session = null;
var $ = require('jquery');
var NO_CACHE_PATHS = ['studies/self/emailStatus','/participants','externalIds?'];

// jQuery throws up if there's no window, even in unit tests
if (typeof window !== "undefined") {
    $(function() {
        session = storeService.get(SESSION_KEY);
        if (session && session.environment) {
            listeners.emit(SESSION_STARTED_EVENT_KEY, session);
        } else {
            session = null;
            listeners.emit(SESSION_ENDED_EVENT_KEY);
        }
    });
}

function matchesNoCachePath(path) {
    return NO_CACHE_PATHS.some(function(matchPath) {
        return path.indexOf(matchPath) > -1;
    });
}

var cache = (function() {
    var cachedItems = {};
    return {
        get: function(key) {
            var value = cachedItems[key];
            console.info((value) ? "[json cache] hit" : "[json cache] miss", key);
            return (value) ? JSON.parse(value) : null;
        },
        set: function(key, response) {
            if (!matchesNoCachePath(key)) {
                console.info("[json cache] caching",key);
                cachedItems[key] = JSON.stringify(response);
            } else {
                console.warn("[json cache] do not cache", key);
            }
        },
        clear: function(key) {
            // clear everything, this is now a fetch cache. Very simple, hard to screw up.
            cachedItems = {};
        },
        reset: function() {
            cachedItems = {};
        }
    };
})();

function getHeaders() {
    var headers = {'Content-Type': 'application/json'};
    if (session && session.sessionToken) {
        headers['Bridge-Session'] = session.sessionToken;
    }
    return headers;
}
function postInt(url, data) {
    if (!data) {
        data = "{}";
    } else if (typeof data !== 'string') {
        data = JSON.stringify(data);
    }
    return $.ajax({
        method: 'POST',
        url: url,
        headers: getHeaders(),
        data: data,
        type: "application/json",
        dataType: "json"
    });
}
function getInt(url) {
    return $.ajax({
        method: 'GET',
        url: url,
        headers: getHeaders(),
        type: "application/json",
        dataType: "json"
    });
}
function deleteInt(url) {
    return $.ajax({
        method: 'DELETE',
        url: url,
        headers: getHeaders(),
        type: "application/json",
        dataType: "json"
    });
}

function reloadPageWhenSessionLost(response) {
    if (response.status === 401) {
        storeService.remove(SESSION_KEY);
        window.location.reload();
    }
    return response;
}
function makeSessionWaitingPromise(httpAction, func) {
    if (session && session.sessionToken) {
        return func().catch(reloadPageWhenSessionLost);
    }
    console.info("[queuing]", httpAction);
    return new Promise(function(resolve, reject) {
        listeners.once(SESSION_STARTED_EVENT_KEY, resolve);
    }).then(func).catch(reloadPageWhenSessionLost);
}
function get(path) {
    if (cache.get(path)) {
        return Promise.resolve(cache.get(path));
    } else {
        return makeSessionWaitingPromise("GET " + path, function() {
            return getInt(config.host[session.environment] + path).then(function(response) {
                cache.set(path, response);
                return response;
            });
        });
    }
}
function post(path, body) {
    cache.clear(path);
    return makeSessionWaitingPromise("POST " + path, function() {
        return postInt(config.host[session.environment] + path, body);
    });
}
function del(path) {
    cache.clear(path);
    return makeSessionWaitingPromise("DEL " + path, function() {
        return deleteInt(config.host[session.environment] + path);
    });
}
/**
 * If we ever get back a 401, the UI isn't in sync with reality, sign the
 * user out. So this is called from error handler, as well as being available
 * from serverService.
 * @returns {Promise}
 */
function signOut() {
    var env = session.environment;
    postInt(config.host[env] + config.signOut);
    cache.reset();
    session = null;
    storeService.remove(SESSION_KEY);
    listeners.emit(SESSION_ENDED_EVENT_KEY);
}
function isSupportedUser() {
    return this.roles.some(function(role) {
        return ["developer","researcher","admin"].indexOf(role) > -1;
    });
}
function cacheParticipantName(response) {
    if (response && response.id) {
        var name = transforms.formatName(response);
        cache.set(response.id+':name', {name:name,externalId:response.externalId});
    }
    return response;
}

module.exports = {
    isAuthenticated: function() {
        return (session !== null);
    },
    signIn: function(studyName, env, data) {
        var request = Promise.resolve(postInt(config.host[env] + config.signIn, data));
        request.then(function(sess) {
            sess.isSupportedUser = isSupportedUser;
            if (sess.isSupportedUser()) {
                sess.studyName = studyName;
                sess.studyId = data.study;
                session = sess;
                storeService.set(SESSION_KEY, session);
                listeners.emit(SESSION_STARTED_EVENT_KEY, sess);
            }
            return sess;
        });
        return request;
    },
    getStudyList: function(env) {
        var request = Promise.resolve(getInt(config.host[env] + config.getStudyList));
        request.then(function(response) {
            return response.items.sort(utils.makeFieldSorter("name"));
        });
        return request;
    },
    signOut: signOut,
    requestResetPassword: function(env, data) {
        return Promise.resolve(postInt(config.host[env] + config.requestResetPassword, data));
    },
    getStudy: function() {
        return get(config.getCurrentStudy);
    },
    getStudyPublicKey: function() {
        return get(config.getStudyPublicKey);
    },
    saveStudy: function(study, isAdmin) {
        var url = (isAdmin) ? (config.getStudy + study.identifier) : config.getCurrentStudy;
        return post(url, study).then(function(response) {
            study.version = response.version;
            return response;
        });
    },
    createSynapseProject: function(synapseUserId) {
        return post(config.getCurrentStudy + "/synapseProject", [synapseUserId]);
    },
    getMostRecentStudyConsent: function(guid) {
        return get(config.subpopulations + "/" + guid + "/consents/recent");
    },
    getStudyConsent: function(guid, createdOn) {
        return get(config.subpopulations + "/" + guid + "/consents/" + createdOn);
    },
    saveStudyConsent: function(guid, consent) {
        return post(config.subpopulations + "/" + guid + "/consents", consent);
    },
    publishStudyConsent: function(guid, createdOn) {
        return post(config.subpopulations + "/" + guid + "/consents/" + createdOn + "/publish");
    },
    getConsentHistory: function(guid) {
        return get(config.subpopulations + "/" + guid + "/consents");
    },
    emailRoster: function() {
        return post(config.users + '/emailParticipantRoster');
    },
    getSurveys: function() {
        return get(config.surveys);
    },
    getPublishedSurveys: function() {
        return get(config.publishedSurveys);
    },
    getMostRecentlyPublishedSurvey: function(guid) {
        return get(config.survey + guid + '/revisions/published');
    },
    getSurveyAllRevisions: function(guid) {
        return get(config.survey + guid + '/revisions');
    },
    getSurvey: function(guid, createdOn) {
        return get(config.survey+guid+'/revisions/'+createdOn);
    },
    getSurveyMostRecent: function(guid) {
        return get(config.survey + guid + '/revisions/recent');
    },
    createSurvey: function(survey) {
        return post(config.surveys, survey);
    },
    publishSurvey: function(guid, createdOn) {
        return post(config.survey + guid + '/revisions/' + createdOn + '/publish');
    },
    versionSurvey: function(guid, createdOn) {
        return post(config.survey + guid + '/revisions/' + createdOn + '/version');
    },
    updateSurvey: function(survey) {
        var createdString = new Date(survey.createdOn).toISOString();
        var url = config.survey + survey.guid + '/revisions/' + createdString;
        return post(url, survey);
    },
    deleteSurvey: function(survey, physical) {
        var queryString = transforms.queryString({physical:(physical === true)});
        var createdString = new Date(survey.createdOn).toISOString();
        var url = config.survey + survey.guid + '/revisions/' + createdString + queryString;
        return del(url);
    },
    getAllUploadSchemas: function() {
        return get(config.schemas);
    },
    getMostRecentUploadSchema: function(identifier) {
        return get(config.schemas + "/" + identifier + '/recent');
    },
    getUploadSchemaAllRevisions: function(identifier) {
        return get(config.schemas + "/" + identifier);
    },
    getUploadSchema: function(identifier, revision) {
        return get(config.schemas + "/" + identifier + "/revisions/" + revision);
    },
    createUploadSchema: function(schema) {
        return post(config.schemasV4, schema).then(function(response) {
            schema.version = response.version;
            return response;
        });
    },
    updateUploadSchema: function(schema) {
        var path = config.schemasV4 + "/" + encodeURIComponent(schema.schemaId) + 
            "/revisions/" + encodeURIComponent(schema.revision);
        return post(path, schema).then(function(response) {
            schema.version = response.version;
            return response;
        });
    },
    deleteSchema: function(schemaId) {
        return del(config.getStudy+session.studyId+"/uploadschemas/"+schemaId);
    },
    deleteSchemaRevision: function(schema) {
        return del(config.schemas + "/" + schema.schemaId + "/revisions/" + schema.revision);
    },
    getSchedulePlans: function() {
        return get(config.schemaPlans);
    },
    getSchedulePlan: function(guid) {
        return get(config.schemaPlans + "/" + guid);
    },
    createSchedulePlan: function(plan) {
        return post(config.schemaPlans, plan).then(function(newPlan) {
            plan.guid = newPlan.guid;
            plan.version = newPlan.version;
            return newPlan;
        });
    },
    saveSchedulePlan: function(plan) {
        var path = (plan.guid) ? 
            (config.schemaPlans + "/" + plan.guid) :
            config.schemaPlans;
        return post(path, plan).then(function(newPlan) {
            plan.guid = newPlan.guid;
            plan.version = newPlan.version;
            return newPlan;
        });
    },
    deleteSchedulePlan: function(guid) {
        return del(config.schemaPlans + "/" + guid);
    },
    getAllSubpopulations: function() {
        return get(config.subpopulations);
    },
    getSubpopulation: function(guid) {
        return get(config.subpopulations + "/" + guid);
    },
    createSubpopulation: function(subpop) {
        return post(config.subpopulations, subpop);
    },
    updateSubpopulation: function(subpop) {
        var path = config.subpopulations + "/" + subpop.guid;
        return post(path, subpop).then(function(response) {
            subpop.version = response.version;
            return response;
        });
    },
    deleteSubpopulation: function(guid) {
        return del(config.subpopulations + "/" + guid);
    },
    verifyEmail: function() {
        return post(config.verifyEmail);
    },
    emailStatus: function() {
        return get(config.emailStatus);
    },
    getCacheKeys: function() {
        return get(config.cache);
    },
    deleteCacheKey: function(cacheKey) {
        return del(config.cache+"/"+encodeURIComponent(cacheKey));
    },
    getParticipants: function(offsetBy, pageSize, emailFilter, startDate, endDate) {
        var queryString = transforms.queryString({
            offsetBy: offsetBy, pageSize: pageSize, emailFilter: emailFilter,
            startDate: startDate, endDate: endDate
        });
        return get(config.participants+queryString);
    },
    getParticipant: function(id) {
        return get(config.participants+"/"+id).then(cacheParticipantName);
    },
    getParticipantName: function(id) {
        var name = cache.get(id+':name');
        if (name) {
            return Promise.resolve(name);
        } else {
            return get(config.participants+"/"+id).then(cacheParticipantName)
                .then(function() {
                    return Promise.resolve(cache.get(id+':name'));
                });
        }
    },
    getParticipantRequestInfo: function(id) {
        return get(config.participants+"/"+id+"/requestInfo");
    },
    getParticipantNotifications: function(id) {
        return get(config.participants+"/"+id+"/notifications");
    },
    sendUserNotification: function(id, message) {
        return post(config.participants+"/"+id+"/sendNotification", message);
    },
    sendTopicNotification: function(guid, message) {
        return post(config.topics+"/"+guid+"/sendNotification", message);
    },
    createParticipant: function(participant) {
        return post(config.participants+"?verifyEmail=false", participant);
    },
    updateParticipant: function(participant) {
        cache.clear(participant.id+':name');
        return post(config.participants+"/"+participant.id, participant);
    },
    deleteParticipant: function(id) {
        cache.clear(id+':name');
        return del(config.users + '/' + id);
    },
    signOutUser: function(id) {
        return post(config.participants+"/"+id+"/signOut");  
    },
    requestResetPasswordUser: function(id) {
        return post(config.participants+"/"+id+"/requestResetPassword");
    },
    resendConsentAgreement: function(id, subpopGuid) {
        return post(config.participants+"/"+id+"/consents/" + subpopGuid + "/resendConsent");
    },  
    resendEmailVerification: function(id) {
        return post(config.participants+"/"+id+"/resendEmailVerification");
    },
    getExternalIds: function(params) {
        return get(config.externalIds + transforms.queryString(params || {}));
    },
    addExternalIds: function(identifiers) {
        return post(config.externalIds, identifiers);
    },
    getSession: function() {
        if (session) {
            return Promise.resolve(session);
        } else {
            return new Promise(function(resolve, reject) {
                listeners.once(SESSION_STARTED_EVENT_KEY, resolve);
            });
        }
    },
    getStudyReports: function() {
        return get(config.reports+transforms.queryString({"type":"study"}));
    },
    getStudyReport: function(identifier, startDate, endDate) {
        var queryString = transforms.queryString({startDate: startDate, endDate: endDate});
        return get(config.reports + "/" + identifier + queryString);
    },
    addStudyReport: function(identifier, report) {
        return post(config.reports + "/" + identifier, report);
    },
    deleteStudyReport: function(identifier) {
        return del(config.reports + "/" + identifier);
    },
    deleteStudyReportRecord: function(identifier, date) {
        return del(config.reports + "/" + identifier + '/' + date);
    },
    getStudyReportIndex: function(identifier) {
        return get(config.reports + "/" + identifier + "/index");
    },
    updateStudyReportIndex: function(index) {
        return post(config.reports + "/" + index.identifier + "/index", index);
    },
    getParticipantReports: function() {
        return get(config.reports+transforms.queryString({"type":"participant"}));
    },
    getParticipantUploads: function(userId, startTime, endTime) {
        var queryString = transforms.queryString({startTime: startTime, endTime: endTime});
        return get(config.participants + '/' + userId + '/uploads' + queryString);
    },
    getParticipantUploadStatus: function(uploadId) {
        return get(config.uploadstatuses + '/' + uploadId);
    },
    getParticipantReport: function(userId, identifier, startDate, endDate) {
        var queryString = transforms.queryString({startDate: startDate, endDate: endDate});
        return get(config.participants + '/' + userId + '/reports/' + identifier + queryString);
    },
    addParticipantReport: function(userId, identifier, report) {
        return post(config.participants + '/' + userId + '/reports/' + identifier, report);
    },
    deleteParticipantReport: function(identifier, userId) {
        return del(config.participants + '/' + userId + '/reports/' + identifier);
    },
    deleteParticipantReportRecord: function(userId, identifier, date) {
        return del(config.participants + '/' + userId + '/reports/' + identifier + '/' + date);
    },
    getParticipantActivities: function(userId, activityGuid, params) {
        var queryString = transforms.queryString(params);
        return get(config.participants + '/' + userId + '/activities/' + activityGuid + queryString);
    },
    deleteParticipantActivities: function(userId) {
        return del(config.participants + '/' + userId + '/activities');
    },
    withdrawParticipantFromStudy: function(userId, reason) {
        return post(config.participants + '/' + userId + '/consents/withdraw', reason);
    },
    getAllTopics: function() {
        return get(config.topics);
    },
    getTopic: function(guid) {
        return get(config.topics + "/" + guid);
    },
    createTopic: function(topic) {
        return post(config.topics, topic);
    },
    updateTopic: function(topic) {
        return post(config.topics + "/" + topic.guid, topic);
    },
    deleteTopic: function(guid) {
        return del(config.topics + "/" + guid);
    },
    getTaskDefinitions: function() {
        return get(config.compoundactivitydefinitions);
    },
    createTaskDefinition: function(task) {
        return post(config.compoundactivitydefinitions, task);
    },
    getTaskDefinition: function(taskId) {
        return get(config.compoundactivitydefinitions + "/" + encodeURIComponent(taskId));
    },
    updateTaskDefinition: function(task) {
        return post(config.compoundactivitydefinitions + "/" + encodeURIComponent(task.taskId), task);
    },
    deleteTaskDefinition: function(taskId) {
        return del(config.compoundactivitydefinitions + "/" + encodeURIComponent(taskId));
    },
    addSessionStartListener: function(listener) {
        if (typeof listener !== "function") {
            throw Error("Session listener not a function");
        }
        listeners.addEventListener(SESSION_STARTED_EVENT_KEY, listener);
    },
    addSessionEndListener: function(listener) {
        if (typeof listener !== "function") {
            throw Error("Session listener not a function");
        }
        listeners.addEventListener(SESSION_ENDED_EVENT_KEY, listener);
    }
};