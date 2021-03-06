require('../css/main');
require('../lib/toastr.min');
require('../lib/dragula.min');

require('./bindings');
require('./bindings/semantic');
require('../lib/jquery.scrollTo');
require('./bindings/dragula');
require('./components');
var ko = require('knockout');
require('knockout-postbox');
var director = require('director');
var root = require('./root');
var serverService = require('./services/server_service');

var GUID_CREATEDON = ['guid','createdOn'];
var GUID = ['guid'];
var ID = ['id'];
var SCHEMAID_REVISION = ['schemaId','revision'];
var SCHEMAID = ['schemaId'];
var TASKID = ['taskId'];
var USERID = ['userId'];
var USERID_IDENTIFIER = ['userId','identifier'];
var USERID_GUID = ['userId','guid'];

function namedParams(fields, args) {
    return (fields || []).reduce(function(params, name, i) {
        params[name] = decodeURIComponent(args[i]); 
        return params;
    }, {});
}
function routeTo(routeName, fields) {
    return function() {
        var params = namedParams(fields, arguments);
        root.changeView(routeName, params);
    };
}
function redirectTo(response) {
    router.setRoute('/participants/' + response.items[0].id);
}
function redirectToParticipant(externalId) {
    serverService.getParticipants(0,5,"+"+externalId+"@").then(redirectTo);
}

var router = new director.Router();
router.param('guid', /([^\/]*)/);
router.param('createdOn', /([^\/]*)/);
router.on('/settings/general', routeTo('general'));
router.on('/settings/email', routeTo('email'));
router.on('/settings/eligibility', routeTo('eligibility'));
router.on('/settings/data_groups', routeTo('data_groups'));
router.on('/settings/password_policy', routeTo('password_policy'));
router.on('/settings/user_attributes', routeTo('user_attributes'));
router.on('/settings/synapse', routeTo('synapse'));
router.on('/task_identifiers', routeTo('task_identifiers'));
router.on('/email_templates', routeTo('verify_email'));
router.on('/email_templates/verify_email', routeTo('verify_email'));
router.on('/email_templates/reset_password', routeTo('reset_password'));
router.on('/external_ids', routeTo('external_ids'));
router.on('/subpopulations/:guid/consents/history', routeTo('subpopulation_history', GUID));
router.on('/subpopulations/:guid/consents/download', routeTo('subpopulation_download', GUID));
router.on('/subpopulations/:guid/consents/:createdOn', routeTo('subpopulation_editor', GUID_CREATEDON));
router.on('/subpopulations/:guid', routeTo('subpopulation', GUID));
router.on('/subpopulations', routeTo('subpopulations'));
router.on('/reports/:identifier', routeTo('report', ID));
router.on('/reports', routeTo('reports'));
router.on('/surveys', routeTo('surveys'));
router.on('/surveys/:guid/:createdOn/versions', routeTo('survey_versions', GUID_CREATEDON));
router.on('/surveys/:guid/:createdOn/schema', routeTo('survey_schema', GUID_CREATEDON));
router.on('/surveys/:guid/:createdOn', routeTo('survey', GUID_CREATEDON));
router.on('/surveys/:guid', routeTo('survey', GUID));
router.on('/schemas', routeTo('schemas'));
router.on('/schemas/:schemaId', routeTo('schema', SCHEMAID));
router.on('/schemas/:schemaId/versions', routeTo('schema_versions', SCHEMAID));
router.on('/schemas/:schemaId/versions/:revision', routeTo('schema', SCHEMAID_REVISION));
router.on('/schedules', routeTo('schedules'));
router.on('/scheduleplans', routeTo('scheduleplans'));
router.on('/scheduleplans/:guid', routeTo('scheduleplan', GUID));
router.on('/participants/:userId/reports/:identifier', routeTo('participant_report', USERID_IDENTIFIER));
router.on('/participants/:userId/activities/:guid', routeTo('participant_activity', USERID_GUID));
router.on('/participants/:userId/activities', routeTo('participant_activities', USERID));
router.on('/participants/:userId/consents', routeTo('participant_consents', USERID));
router.on('/participants/:userId/notifications', routeTo('participant_notifications', USERID));
router.on('/participants/:userId/reports', routeTo('participant_reports', USERID));
router.on('/participants/:userId/uploads', routeTo('participant_uploads', USERID));
router.on('/participants/:userId', routeTo('participant_general', USERID));
router.on('/participants/:userId/requestInfo', routeTo('participant_request_info', USERID));
router.on('/participants', routeTo('participants'));
router.on('/tasks', routeTo('tasks'));
router.on('/tasks/:taskId', routeTo('task', TASKID));
router.on('/topics/:guid', routeTo('topic', GUID));
router.on('/topics', routeTo('topics'));
router.on('/enrollees/:externalId', redirectToParticipant);
router.on('/enrollees', routeTo('enrollees'));
router.on('/admin/info', routeTo('admin_info'));
router.on('/admin/cache', routeTo('admin_cache'));

router.configure({
    notfound: routeTo('not_found'),
    'on': [ko.postbox.reset, function() {
        root.sidePanelObs('navigation'); 
    }]
});
router.init();
