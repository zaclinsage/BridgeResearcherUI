var ko = require('knockout');
require('knockout-postbox');
var utils = require('../../utils');
var bind = require('../../binder');
var storeService = require('../../services/store_service');

var pageSize = 25;

/**
 * @params loadingFunc - the function to call to load resources. The function takes the parameters 
 *      offsetBy, pageSize.
 * @params pageKey - a key to make the pagination on this table unique from other pagination on 
 *      the screen
 * @params top - mark one of the pagers as the top pager, and only that pager will take responsibility
 *      for calling for the first page of records. Also, search is hidden for the bottom control.
 */
module.exports = function(params) {
    var self = this;
    self.top = params.top;
    var pageKey = params.pageKey;
    var loadingFunc = params.loadingFunc;
    var query = storeService.restoreQuery(pageKey);
    var offsetBy = query.offsetBy;

    bind(self)
        .obs('emailFilter', query.emailFilter)
        .obs('startDate', query.startDate)
        .obs('endDate', query.endDate)
        .obs('offsetBy', offsetBy)
        .obs('pageSize', pageSize)
        .obs('totalRecords')
        .obs('totalPages')
        .obs('currentPage', Math.round((offsetBy || 0)/pageSize))
        .obs('searchLoading', false)
        .obs('showLoader', false);
    
    self.doEmailSearch = function(vm, event) {
        if (event.keyCode === 13) {
            self.searchLoadingObs(true);
            wrappedLoadingFunc(Math.round(self.currentPageObs()));
        }
    };
    self.doCalSearch = function() {
        self.searchLoadingObs(true);
        wrappedLoadingFunc(Math.round(self.currentPageObs()));
    };
    self.previousPage = function(vm, event) {
        var page = self.currentPageObs() -1;
        if (page >= 0) {
            self.showLoaderObs(true);
            wrappedLoadingFunc(page*pageSize);
        }
    };
    self.nextPage = function(vm, event) {
        var page = self.currentPageObs() +1;
        if (page <= self.totalPagesObs()-1) {
            self.showLoaderObs(true);
            wrappedLoadingFunc(page*pageSize);
        }
    };
    self.thisPage = function() {
        wrappedLoadingFunc(self.currentPageObs()*pageSize);
    };
    self.firstPage = function(vm, event) {
        self.showLoaderObs(true);
        wrappedLoadingFunc(0, vm, event);
    };
    self.lastPage = function(vm, event) {
        self.showLoaderObs(true);
        wrappedLoadingFunc((self.totalPagesObs()-1)*pageSize);
    };
    
    // Postbox allows multiple instances of a paging control to stay in sync above
    // and below the table. The 'top' control is responsible for kicking off the 
    // first page of records.
    ko.postbox.subscribe(pageKey+'-recordsPaged', updateModel);
    ko.postbox.subscribe(pageKey+'-refresh', self.thisPage);

    function wrappedLoadingFunc(offsetBy, vm, event) {
        var emailFilter = self.emailFilterObs();
        var startDate = self.startDateObs();
        var endDate = self.endDateObs();
        storeService.persistQuery(pageKey, {emailFilter: emailFilter, 
            startDate: startDate, endDate: endDate, offsetBy: offsetBy});

        loadingFunc(offsetBy, pageSize, emailFilter, startDate, endDate).then(function(response) {
            ko.postbox.publish(pageKey+'-recordsPaged', response);
            updateModel(response);
            self.searchLoadingObs(false);
            self.showLoaderObs(false);
        }).catch(utils.failureHandler());
    }

    function updateModel(response) {
        // If you're not a researcher, it can happen this gets called without a response.
        if (response) {
            self.offsetByObs(response.offsetBy);
            self.pageSizeObs(response.pageSize);
            self.totalRecordsObs(response.total);
            self.emailFilterObs(response.emailFilter);
            self.startDateObs(response.startDate);
            self.endDateObs(response.endDate);
            self.currentPageObs(Math.round(response.offsetBy/response.pageSize));
            self.totalPagesObs( Math.ceil(response.total/response.pageSize) );
        }
    }
    if (params.top) {
        wrappedLoadingFunc(offsetBy);
    }
};