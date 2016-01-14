var
 express = require("express"),
 log4js = require("log4js"),
 nconf = require("nconf"),
 r = express.Router(),
 request = require("request"),
 _ = require("underscore"),
 slackUtils = require("../middleware/slack-utils")
;

var logger = log4js.getLogger("otc-slack-broker"),
 	logBasePath = "lib.event.event";

r
.post("/:source/service_instances/:sid", incomingEvent);

module.exports = r;

var catalog = {
		"pipeline": require("./pipeline"),
		"github" : githubEventToSlackMessage,
		"toolchain": toolchainEventToSlackMessage
}

function incomingEvent(req, res) {
	var logPrefix = "[" + logBasePath + ".incomingEvent] ";
	var db = req.servicesDb,
		source = req.params.source,
		serviceInstanceId = req.params.sid
	;
	
	
	// Find the serviceInstance record
	db.get(serviceInstanceId, null, function(err, body) {
		if(err && err.statusCode !== 404) {
			logger.error(logPrefix + "Retrieving the service instance with" +
				" ID: " + serviceInstanceId + " failed with the following" +
				" error: " + err.toString());
			res.status(500).json({ "description": err.toString() });
			return;
		} else if(err && err.statusCode === 404) {
			res.status(400).json({"description": err.toString()});
			return;
		} else {
			// According to :source value, we will route to the appropriate event to slack message translator
			// If the :source is not known, warning in the log and generic message in the channel
			// The output of 
			// retrieve the channel
			var message;
			console.log(source);
			var translator = catalog[source]; 
			if (!translator) {
				logger.warning(logPrefix + "");
				message = {};
				message.text = JSON.stringify(req.body);
			} else {
				message = translator(req.body);
			}
								
			// Find the api_token out of the serviceInstance record
			var api_token = body.parameters.api_token;

			// Find the channel_id out of the serviceInstance record instance_id parameters
			// and add it to the message object
			message.channel = body.instance_id; 
			
			//console.log(JSON.stringify(message));
			
			slackUtils.postMessage(api_token, message, function(err, response) {
				if (err) {
					res.status(500).json({ "description" : err.toString() });	
					return;
				} else if (response.error) {
					res.status(400).json({ "description" : "Error - " + response.error});
					return;
				} else {
					res.status(204).json({});
					return;
				}
			});			
		}
	});
}

function githubEventToSlackMessage(event) {
	return { text: "Slack Message from Github"};
}

function toolchainEventToSlackMessage(event) {
	return { text: "Slack Message to tool"};
}


