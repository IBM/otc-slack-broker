var
 express = require("express"),
 log4js = require("log4js"),
 nconf = require("nconf"),
 r = express.Router(),
 request = require("request"),
 _ = require("underscore")
;

var logger = log4js.getLogger("otc-slack-broker"),
 	logBasePath = "lib.middleware.event";

r
.post(":source/service_instances/:sid", incomingEvent);

module.exports = r;

var catalog = {
		"pipeline": pipelineEventToSlackMessage,
		"github" : githubEventToSlackMessage,
		"toolchain": toolchainEventToSlackMessage
}

function incomingEvent(req, res) {
	// According to :source value, we will route to the appropriate event to slack message translator
	// If the :source is not known, warning in the log and generic message in the channel
	// The output of 
	// retrieve the channel
}

function pipelineEventToSlackMessage(event) {
	return {text: "Slack Message from Pipeline"};
}

function githubEventToSlackMessage(event) {
	return { text: "Slack Message from Github"};
}

function toolchainEventToSlackMessage(event) {
	return { text: "Slack Message to tool"};
}

}