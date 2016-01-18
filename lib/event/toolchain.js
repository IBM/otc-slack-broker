'use strict';

var
	nconf = require('nconf'),
	_ = require('underscore')
;

module.exports = function(event) {
	var message = {};
	
	// TODO Name of the toolchain
	message.username = "Open Tool Chain";

	// DevOps Service icon
	message.icon_url = "https://hub.jazz.net/api/v1/composition/graphics/header/bluemix-logo.png";

	var attachment = {};
	attachment.user_name = "Toolchain XXX";
	// TODO must correspond to the toolchain icon for slack
	attachment.icon_url = "";

	// TODO Tool binded/unbinded
	attachment.title = "Tool Y added in the toolchain XXX";
	attachment.title_link = "link to dashboard_url";
	
	message.text = JSON.stringify(event);
	
	
	return message;
}