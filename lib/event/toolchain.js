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

module.exports = function(event, authorization, callback) {
	var logPrefix = "[" + logBasePath + "]";

	logger.info(logPrefix + "Toolchain - " + event.toolchain_guid + " - Event " + event.event);

	if (event.event == "bind") {
		createMessageForBindOrUnbind(event, authorization, callback);
	} else if (event.event == "unbind") {
		createMessageForBindOrUnbind(event, authorization, callback);		
	} else if (event.event == "provision") {
		createMessageForProvision(event, authorization, callback);
	} else {
		// Default
		var message = {};
		message.username = "Open Tool Chain";
		message.icon_url = nconf.get("icons:toolchain");
		message.text = "Event Payload received:" + JSON.stringify(event);
		callback(null, message);
	}	
	
}

function createMessageForBindOrUnbind(event, authorization, callback) {
	var logPrefix = "[" + logBasePath + ".createMessageForBindOrUnbind]";
	
	async.parallel({
		toolchainName: function(asyncCallback) {
			toolchainUtil.getToolchainName(event.toolchain_guid, authorization, asyncCallback);
		},
		userName: function(asyncCallback) {
			tiamUtil.getUserName(null, authorization, asyncCallback);
		}
	}, function(err, results) {
		if (err) {
			callback(err);
		} else {
			var message = {};
			
			// Get Toolchain name
			message.username = "Toolchain " + results.toolchainName;
			message.icon_url = nconf.get("icons:toolchain");
			
			message.text = "";
			message.link_names = 1;
			async.eachSeries(event.services, function(service, eachCallback) {
				toolchainUtil.getServiceName(service.service_id, authorization, function(err, serviceName) {
					if (err) {
						eachCallback(err)
					} else {
						var text = "Service " + serviceName;
						// We should use the label of service if any
						if (service.parameters && service.parameters.label) {
							text += " " + service.parameters.label;
						}
						
						// TODO Status of the binding should be find from the binding_status information
						text += " has been"
						if (event.event=="bind") {
							text += " *bound* to";
						} else {
							text += " *unbound* from";					
						}
						text += " toolchain  <";
						text += nconf.get("services:otc-ui") + "/toolchains/" + event.toolchain_guid;
						text += "|" + results.toolchainName + ">";
						
						text += " by " + results.userName;
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

function createMessageForProvision(event, authorization, callback) {
	// TODO
	var message = {};
	message.username = "Open Tool Chain";
	message.icon_url = nconf.get("icons:toolchain");
	message.text = "Provision Event received:" + JSON.stringify(event);
	callback(null, message);
}