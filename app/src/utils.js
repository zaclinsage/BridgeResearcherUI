var ko = require('knockout');
var toastr = require('toastr');
var config = require('./config');

var GENERIC_ERROR = "A server error happened. We don't know what exactly. Please try again.";

toastr.options = config.toastr;

function is(obj, typeName) {
    return Object.prototype.toString.call(obj) === "[object "+typeName+"]";
}
/**
 * We have to determine this without a source object, because sometimes
 * observables must be set up before we have loaded the object from
 * the server. So fields that are to be array should be postfixed with
 * "[]", as in "elements[]".
 */
function nameInspector(string) {
    var isArray = /\[\]$/.test(string);
    var name = (isArray) ? string.match(/[^\[]*/)[0] : string;
    return {name: name, observerName: name+"Obs", isArray: isArray};
}
function isDefined(obj) {
    return (typeof obj !== "undefined");
}
function deleteUnusedProperties(object) {
    if (is(object, 'Array')) {
        for (var i=0; i < object.length; i++) {
            deleteUnusedProperties(object[i]);
        }
    } else if (is(object, 'Object')) {
        for (var prop in object) {
            if (typeof object[prop] === 'undefined' || object[prop] === "" || object[prop] === null) {
                delete object[prop];
            } else {
                deleteUnusedProperties(object[prop]);
            }
        }
    }
}
function makeOptionFinder(arrayOrObs) {
    return function(value) {
        var options = ko.unwrap(arrayOrObs);
        for (var i= 0; i < options.length; i++) {
            var option = options[i];
            if (option.value === value) {
                return option;
            }
        }
    };
}
function makeOptionLabelFinder(arrayOrObs) {
    return function(value) {
        var option = makeOptionFinder(arrayOrObs)(value);
        return option ? option.label : "";
    };
}

/**
 * Common utility methods for ViewModels.
 */
module.exports = {
    /**
     * Determine type of object
     * @param object - object to test
     * @param string - the type name to verify, e.g. 'Date' or 'Array'
     */
    is: is,
    /**
     * Is this variable defined?
     * @param object - the variable being tested
     */
    isDefined: isDefined,
    /**
     * f(x) = x
     * @param arg
     * @returns {*}
     */
    identity: function(arg) {
        return arg;
    },
    /**
     * Create a sort function that sorts an array of items by a specific field name
     * (must be a string, will be sorted ignoring case).Sort items by a property of each object (must be a string)
     * @param listener
     */
    makeFieldSorter: function(fieldName) {
        return function sorter(a,b) {
            return a[fieldName].toLowerCase().localeCompare(b[fieldName].toLowerCase());
        };
    },
    /**
     * A start handler called before a request to the server is made. All errors are cleared
     * and a loading indicator is shown. This is not done globally because some server requests
     * happen in the background and don't signal to the user that they are occurring.
     * @param vm
     * @param event
     */
    startHandler: function(vm, event) {
        event.target.classList.add("loading");
        toastr.clear();
    },
    /**
     * An Ajax success handler for a view model that supports the editing of a form.
     * Turns off the loading indicator on the button used to submit the form, and
     * clears error fields.
     * @param vm
     * @param event
     * @returns {Function}
     */
    successHandler: function(vm, event, message) {
        return function(response) {
            event.target.classList.remove("loading");
            if (message) {
                toastr.success(message);
            }
            return response;
        };
    },
    /**
     * An ajax failure handler for a view model that supports the editing of a form.
     * Turns off the loading indicator, shows a global error message if there is a message
     * observable.
     * @param vm
     * @param event
     * @returns {Function}
     */
    failureHandler: function(vm, event) {
        return function(response) {
            if (event){
                event.target.classList.remove("loading");
            }
            if (response.status === 412) {
                toastr.error('You do not appear to be either a developer or a researcher.');
            } else if (response instanceof Error) {
                toastr.error(response.message);
            } else if (response.responseJSON) {
                toastr.error(response.responseJSON.message);
            } else {
                toastr.error(GENERIC_ERROR);
            }
        };
    },
    /**
     * Create an observable for each field name provided.
     * @param vm
     * @param fields
     * @param [source] - if provided, values will be initialized from this object
     */
    observablesFor: function(vm, fields, source) {
        for (var i=0; i < fields.length; i++) {
            var insp = nameInspector(fields[i]);
            var value = (source) ? source[insp.name] : "";
            if (insp.isArray) {
                vm[insp.observerName] = ko.observableArray(value);
            } else {
                vm[insp.observerName] = ko.observable(value);
            }
        }
    },
    /**
     * Given a model object, update all the observables for each field name provided.
     * Will not attempt to copy if either the observable property or the property on
     * the object, as defined by field, do not exist.
     *
     * @param vm
     * @param object
     * @param fields
     */
    valuesToObservables: function(vm, object, fields) {
        for (var i=0; i < fields.length; i++) {
            var insp = nameInspector(fields[i]);

            var obs = vm[insp.observerName];
            var value = object[insp.name];
            if (isDefined(obs) && isDefined(value)) {
                obs(value);
            }
        }
    },
    /**
     * Copy all the values of all the observables (presumably updated) back to the model object.
     * @param vm
     * @param object
     * @param fields
     */
    observablesToObject: function(vm, object, fields) {
        for (var i=0; i < fields.length; i++) {
            var insp = nameInspector(fields[i]);

            // TODO: At one point you were checking that the model object had the property before
            // copying the observer back to it, but this prevents the UI from adding properties when the
            // model didn't initially have them. Disabling this, but may break something elsewhere.
            var obs = vm[insp.observerName];
            //var value = object[insp.name];
            //if (isDefined(obs) && isDefined(value)) {
            if (isDefined(obs)) {
                object[insp.name] = obs();
            }
        }
    },
    /**
     * Convert a date into a locale-appropriate string (browser-dependent).
     * @param date
     * @returns {string}
     */
    formatDateTime: function(date) {
        if (date) {
            return new Date(date).toLocaleString();
        }
        return "";
    },
    /**
     * Convert a ISO date string ("2010-01-01") to a browser-dependent, local
     * date string, adjusting for the time zone offset on that date, to compensate
     * for the fact that a date without a time is abstract and not expressed
     * relative to a time zone. Otherwise the browser may shift the date to a
     * different day when it localizes the time zone.
     * @param date
     * @returns {*}
     */
    formatDate: function(date) {
        if (date) {
            date = date.replace('T00:00:00.000Z','');
            // Get the declared offset of the local time on the date in question (accounts
            // for daylight savings at right time of year)
            var offset = new Date(date).toString().match(/GMT([^\s]*)/)[1];
            // If offset is +0600, on Safari this fails if you don't insert ':' as in: +06:00
            offset = offset.replace(/00$/,":00");
            // Now force date to a specific datetime, in local time at that time
            var localDate = date + "T00:00:00" + offset;
            // And return only the date portion of that date object
            return new Date(localDate).toLocaleDateString();
        }
        return "";
    },
    /**
     * Create a function that will remove items from a history table once we confirm they
     * are deleted. If we've deleted everything, go to the root view for this type of item.
     * This method assumes that the viewModel holds the row model in an "itemsObs" observable.
     *
     * @param vm
     *  a viewModel with an "itemObs" observable array of the model objects in the table
     * @param deletables
     *  an array of model objects to delete (associated to the rows of the table)
     * @param rootPath
     *  if all items are deleted, redirect to this view.
     * @returns {Function}
     *  a function to assign to the success handler of a promise
     */
    makeTableRowHandler: function(vm, deletables, rootPath) {
        return function() {
            deletables.forEach(function(deletable) {
                vm.itemsObs.remove(deletable);
            });
            if (vm.itemsObs().length === 0) {
                // Yes both. There are cases where 'rootPath' is just the current page.
                document.querySelector(".loading_status").textContent = "There are currently no items.";
                document.location = rootPath;
            }
        };
    },
    /**
     * Generic handler for pages which are loading a particular entity, that attemp to
     * deal with 404s by redirecting to a parent page.
     * @param vm
     * @param message
     * @param rootPath
     * @returns {Function}
     */
    notFoundHandler: function(vm, message, rootPath) {
        return function(response) {
            console.error(response);
            toastr.error((message) ? message : response.statusText);
            document.location = rootPath;
        };
    },
    /**
     * Given an array of option objects (with the properties "label" and "value"),
     * return a function that will return a specific option given a value.
     * @param options array or observableArray
     * @returns {Function}
     */
    makeOptionFinder: makeOptionFinder,
    /**
     * Given an array of option objects (with the properties "label" and "value"),
     * return a function that will return an option label given a value.
     * @param options array or observableArray
     * @returns {Function}
     */
    makeOptionLabelFinder: makeOptionLabelFinder,
    /**
     * Walk object and remove any properties that are set to null or an empty string.
     */
    deleteUnusedProperties: deleteUnusedProperties
};