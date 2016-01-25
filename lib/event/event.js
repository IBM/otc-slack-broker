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
.post("/toolchain/:tid/service_instances/:sid/lifecycle_events", incomingToolchainLifecycleEvent)
.post("/:source/service_instances/:sid", incomingEvent)
.post("/accept", incomingEventFromMessageStore)
;

module.exports = r;

var catalog = {
		"pipeline": require("./pipeline"),
		"github" : require("./github"),
		"toolchain": require("./toolchain")
}

function incomingToolchainLifecycleEvent(req, res) {
	var logPrefix = "[" + logBasePath + ".incomingToolchainLifecycleEvent] ";
	var toolchainId = req.params.tid,
		serviceInstanceId = req.params.sid
	;
	logger.debug(logPrefix + "Toolchain Event received");	
	return processEvent(req, res, "toolchain", serviceInstanceId, toolchainId, req.body);
}	

function incomingEvent(req, res) {
	var logPrefix = "[" + logBasePath + ".incomingEvent] ";
	var source = req.params.source,
		serviceInstanceId = req.params.sid
	;
	logger.debug(logPrefix + "Event received");	
	// Retrieve the toolchain idS and nameS here - a service may be bound to multiple toolchains	
	return processEvent(req, res, source, serviceInstanceId, null, req.body);
	
}

function incomingEventFromMessageStore(req, res) {
	var logPrefix = "[" + logBasePath + ".incomingEventFromMessageStore] ";
	var source = req.body.service_id,
		serviceInstanceId = req.body.instance_id,
		toolchainId = req.body.toolchain_id
	;
	logger.debug(logPrefix + "Event received");	
	return processEvent(req, res, source, serviceInstanceId, toolchainId, req.body.payload);
}


function processEvent(req, res, source, serviceInstanceId, toolchainId, payload) {
	var logPrefix = "[" + logBasePath + ".processEvent] ";
	var db = req.servicesDb;
	
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
			var translator = catalog[source]; 
			if (!translator) {
				logger.warning(logPrefix + "No event to slack message translator found for " + source);
				message = {};
				message.username = source;
				message.text = JSON.stringify(payload);
			} else {
				// TODO Toolchain id & label passed to the translator
				// TODO Services label and dashboard_url (parameters) provided to the translator
				message = translator(payload);
			}
								
			// Find the api_token out of the serviceInstance record
			var api_token = body.parameters.api_token;

			// Find the channel_id out of the serviceInstance record instance_id parameters
			// and add it to the message object
			message.channel = body.instance_id; 
			
			//console.log(JSON.stringify(message));

			logger.debug(logPrefix + "Posting Slack Message to channel " + message.channel);	
			
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


