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
				var toolchain_binding_status;
				if (service.toolchain_binding && service.toolchain_binding.status) {
					toolchain_binding_status = service.toolchain_binding.status;						
				}
				// The bind event should only inform Slack users for configured or error state (either for service status or toolchain_binding status)
				if (event.event=="bind") {
					if (service.status && service.status.state != "configured" && service.status.state != "error") {
						return eachCallback(null);						
					}
					if (toolchain_binding_status.state != "configured" && toolchain_binding_status.state != "error") {
						return eachCallback(null);
					}
				}
				
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
							if (toolchain_binding_status.state == "new") {
								text += " is *about to be bound* to";
							} else if (toolchain_binding_status.state == "configuring") {
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
					// Message has to be sent only if there is some text content
					if (message.text.length > 0) {
						callback(null, message);									
					} else {
						callback(null, null);
					}
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
				// The provision event should only inform Slack users for configured or error service state
				// and with toolchain_binding status == configured
				// => This means an update to a service configuration
				if (service.status && service.status.state != "configured" && service.status.state != "error") {
					return eachCallback(null);						
				}
				var toolchain_binding_status;
				if (service.toolchain_binding && service.toolchain_binding.status) {
					toolchain_binding_status = service.toolchain_binding.status;						
				}
				if (toolchain_binding_status.state != "configured") {
					// This is not an update to the service's configuration
					return eachCallback(null);
				}
				
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

						if (service.status) {
							if (service.status.state == "new") {
								text += " is about to be *provisioned*";								
							} else if (service.status.state == "configuring") {
								text += " is *configuring*";								
							} else if (service.status.state == "configured") {
								text += " has been *configured*";								
							} else if (service.status.state == "error") {
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
					// Message has to be sent only if there is some text content
					if (message.text.length > 0) {
						callback(null, message);									
					} else {
						callback(null, null);
					}
				}
			});
		}
	});
}