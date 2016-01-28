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
logPrefix = "[lib.event.toolchain]";

module.exports = function(event, authorization, callback) {

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
			_.each(event.services, function(service) {
				message.text += "Service " + service.service_id;
				if (service.parameters && service.parameters.label) {
					message.text += " " + service.parameters.label;
				}
				message.text += " has been"
				if (event.event=="bind") {
					message.text += " *bound* to";
				} else {
					message.text += " *unbound* from";					
				}
				message.text += " toolchain  <";
				message.text += nconf.get("services:otc-ui") + "/toolchains/" + event.toolchain_guid;
				message.text += "|" + results.toolchainName + ">";
				
				message.text += " by " + results.userName;
				message.text += "\n";
			});
			callback(null, message);
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