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
	_ = require('underscore')
;

var logger = log4js.getLogger("otc-slack-broker"),
logPrefix = "[lib.event.toolchain]";

module.exports = function(event, authorization, callback) {
	
	logger.debug(logPrefix + "Event " + JSON.stringify(event));
	
	var message = {};
	
	// TODO Name of the toolchain
	message.username = "Open Tool Chain";

	// DevOps Service icon
	message.icon_url = nconf.get("icons:toolchain");

	var attachment = {};
	attachment.user_name = "Toolchain XXX";
	// TODO must correspond to the toolchain icon for slack
	attachment.icon_url = "";

	// TODO Tool binded/unbinded
	attachment.title = "Tool Y added in the toolchain XXX";
	attachment.title_link = "link to dashboard_url";
	
	message.text = JSON.stringify(event);
	
	
	callback(null, message);
}