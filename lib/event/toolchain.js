/**
 * Licensed Materials - Property of IBM
 * (c) Copyright IBM Corporation 2015, 2016. All Rights Reserved.
 *
 * Note to U.S. Government Users Restricted Rights:
 * Use, duplication or disclosure restricted by GSA ADP Schedule
 * Contract with IBM Corp.
 */
"use strict";

var
	log4js = require("log4js"),
	nconf = require('nconf'),
	async = require("async"),
	_ = require('underscore'),
	tiamUtil = require("../util/tiam-util"),
	toolchainUtil = require("../util/toolchain-util")
;

var logger = log4js.getLogger("otc-slack-broker"),
logBasePath = "lib.event.toolchain"
;

module.exports = function(requestId, event, toolchainCredentials, callback) {
	var logPrefix = "[" + logBasePath + "]";

	logger.info(logPrefix + "[" + requestId + "] Toolchain - " + event.toolchain_guid + " - Event " + event.event);

	if (event.event == "bind") {
		createMessageForBindOrUnbind(event, toolchainCredentials, callback);
	} else if (event.event == "unbind") {
		createMessageForBindOrUnbind(event, toolchainCredentials, callback);		
	} else if (event.event == "provision") {
		createMessageForProvision(event, toolchainCredentials, callback);
	} else {
		// Default
		var message = {};
		message.username = "Open Tool Chain";
		message.icon_url = nconf.get("icons:toolchain");
		message.text = "Event Payload received:" + JSON.stringify(event);
		callback(null, message);
	}	
	
}

function createMessageForBindOrUnbind(event, toolchainCredentials, callback) {
	var logPrefix = "[" + logBasePath + ".createMessageForBindOrUnbind]";
	
	async.parallel({
		toolchainName: function(asyncCallback) {
			toolchainUtil.getToolchainName(event.toolchain_guid, toolchainCredentials, asyncCallback);
		},
		userName: function(asyncCallback) {
			if (event.user_info) {
				asyncCallback(null, event.user_info.user_name);
			} else {
				asyncCallback();
			}
		}
	}, function(err, results) {
		if (err) {
			callback(err);
		} else {
			var message = {};
			message.username = "Toolchain '" + results.toolchainName + "'";
			message.icon_url = nconf.get("icons:toolchain");
			
			message.text = "";

			async.eachSeries(event.services, function(service, eachCallback) {
				toolchainUtil.getServiceName(service.service_id, toolchainCredentials, function(err, serviceName) {
					if (err) {
						eachCallback(err)
					} else {
						var text = "Service " + serviceName;
						// We should use the label of service if any
						if (service.parameters && service.parameters.label) {
							var label = service.parameters.label;
							var dashboard_url;
							if (event.event!="unbind") {
								dashboard_url = service.dashboard_url;
							}
							if (dashboard_url) {
								text += " *<" + dashboard_url + "|'" + label + "'>*";
							} else {
								text += " *'";
								text += label;
								text += "'*"
							}
						}
						
						if (event.event=="bind") {
							// Define the sentence according to toolchain binding status state
							var toolchain_binding = service.toolchain_binding;
							var toolchain_binding_status;
							if (toolchain_binding) {
								toolchain_binding_status = toolchain_binding.status;
							}
							var toolchain_binding_status_state;
							if (toolchain_binding_status) {
								toolchain_binding_status_state = toolchain_binding_status.state;
							}
							if (toolchain_binding_status_state == "new") {
								text += " is *about to be bound* to";
							} else if (toolchain_binding_status_state == "configuring") {
								text += " is *being bound* to";
							} else {
								// Default
								text += " has been *bound* to";
							}
						} else {
							text += " has been *unbound* from";					
						}
						text += " toolchain *<";
						text += nconf.get("services:otc_ui") + "/toolchains/" + event.toolchain_guid;
						text += "|'" + results.toolchainName + "'>*";
						
						if (results.userName) {
							text += " by " + results.userName;
						}
						
						if (event.event=="bind" && service.status) {
							text += " and is *";
							if (service.status.state == "error") {
								text += "in error";								
							} else {
								text += service.status.state;
							}
							text +="*";
						}
						
						text += "\n";
						message.text += text;
						
						eachCallback(null);											
					}
				});
			}, function(err) {
				if (err) {
					callback(err);
				} else {
					callback(null, message);									
				}
			});
		}
	});
}

function createMessageForProvision(event, toolchainCredentials, callback) {
	var logPrefix = "[" + logBasePath + ".createMessageForBindOrUnbind]";
	
	async.parallel({
		toolchainName: function(asyncCallback) {
			toolchainUtil.getToolchainName(event.toolchain_guid, toolchainCredentials, asyncCallback);
		},
		userName: function(asyncCallback) {
			if (event.user_info) {
				asyncCallback(null, event.user_info.user_name);
			} else {
				asyncCallback();
			}
		}
	}, function(err, results) {
		if (err) {
			callback(err);
		} else {
			var message = {};
			message.username = "Toolchain '" + results.toolchainName + "'";
			message.icon_url = nconf.get("icons:toolchain");
			
			message.text = "";
			
			async.eachSeries(event.services, function(service, eachCallback) {
				toolchainUtil.getServiceName(service.service_id, toolchainCredentials, function(err, serviceName) {
					if (err) {
						eachCallback(err)
					} else {
						var text = "Service " + serviceName;
						// We should use the label of service if any
						if (service.parameters && service.parameters.label) {
							var label = service.parameters.label;
							var dashboard_url = service.dashboard_url;
							if (dashboard_url) {
								text += " *<" + dashboard_url + "|'" + label + "'>*";
							} else {
								text += " *'";
								text += label;
								text += "'*";
							}
						}

						text += " in toolchain *<";
						text += nconf.get("services:otc_ui") + "/toolchains/" + event.toolchain_guid;
						text += "|'" + results.toolchainName + "'>*";

						if (service.state) {
							if (service.state.status == "new") {
								text += " is about to be *provisioned*";								
							} else if (service.state.status == "configuring") {
								text += " is *configuring*";								
							} else if (service.state.status == "configured") {
								text += " has been *configured*";								
							} else if (service.state.status == "error") {
								text += " is in *error*";								
							} else {
								text += " has been *provisioned*";								
							}
						} else {
							text += " has been *updated*"
						}
						
						if (results.userName) {
							text += " by " + results.userName;
						}
						
						text += "\n";
						message.text += text;
						
						eachCallback(null);											
					}
				});
			}, function(err) {
				if (err) {
					callback(err);
				} else {
					callback(null, message);									
				}
			});
		}
	});
}