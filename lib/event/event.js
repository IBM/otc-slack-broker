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
 slackClient = require("../client/slack-client"),
 tiamUtil = require("../util/tiam-util")
;

var logger = log4js.getLogger("otc-slack-broker"),
 	logBasePath = "lib.event.event";

r
.post("/toolchains/:tid/service_instances/:sid/lifecycle_events", incomingToolchainLifecycleEvent, getServiceInstance, checkCredentials, processEvent)
//.post("/:source/service_instances/:sid", incomingEvent)
.post("/accept", incomingEventFromMessageStore, getServiceInstance, checkCredentials, processEvent)
;

module.exports = r;

var catalog = {
		"pipeline": require("./pipeline"),
		"github" : require("./github"),
		"toolchain": require("./toolchain")
}
var defaultTranslator = translate;

function incomingToolchainLifecycleEvent(req, res, next) {
	var logPrefix = "[" + logBasePath + ".incomingToolchainLifecycleEvent] ";
	var toolchainId = req.params.tid,
		serviceInstanceId = req.params.sid
	;
	// We are currenlty not doing anything when receiving notification from otc-api anymore
	// because this is now coming from LMS to post to slack message
	// However we should use this endpoint for the functionnal part later on
	// and also local dev or dev-test environment because LMS is not in place in this kind of test
	//
	if (process.env.NODE_ENV == "local-dev" || process.env.NODE_ENV == "dev-test") {
		var incomingEvent = {};
		incomingEvent.source = "toolchain";
		incomingEvent.serviceInstanceId = serviceInstanceId;
		incomingEvent.toolchainId = toolchainId;
		incomingEvent.payload = req.body;
		req.incomingEvent = incomingEvent;
		
		next();
		
		//return processEvent(req, res, , serviceInstanceId, toolchainId, req.body, req.header("Authorization"));
	} else {
		res.status(204).json({});
	}
	
}	

function incomingEventFromMessageStore(req, res, next) {
	var logPrefix = "[" + logBasePath + ".incomingEventFromMessageStore] ";
	var source = req.body.service_id,
		serviceInstanceId = req.body.instance_id,
		toolchainId = req.body.toolchain_id
	;

	var incomingEvent = {};
	incomingEvent.source = source;
	incomingEvent.serviceInstanceId = serviceInstanceId;
	incomingEvent.toolchainId = toolchainId;
	incomingEvent.payload = req.body.payload;
	req.incomingEvent = incomingEvent;
	
	next();
	
	// return processEvent(req, res, source, serviceInstanceId, toolchainId, req.body.payload, req.header("Authorization"));
}

function getServiceInstance(req, res, next) {
	var source = req.incomingEvent.source;
	var serviceInstanceId = req.incomingEvent.serviceInstanceId;
	var toolchainId = req.incomingEvent.toolchainId;
	
	if (!source || !serviceInstanceId || !toolchainId) {
		return res.status(400).json({ "description": "Error: no service_id, instance_id or toolchain_id for the incoming event."});
	}
	
	// Find the serviceInstance record
	var db = req.servicesDb;
	db.get(serviceInstanceId, null, function(err, body) {
		if(err && err.statusCode !== 404) {
			logger.error(logPrefix + "Retrieving the service instance with" +
				" ID: " + serviceInstanceId + " failed with the following" +
				" error: " + err.toString());
			return res.status(500).json({ "description": err.toString() });
		} else if(err && err.statusCode === 404) {
			logger.error(logPrefix + "Service instance with" +
					" ID: " + serviceInstanceId + " not found");
			return res.status(400).json({"description": "no service instance found for id " + serviceInstanceId});
		} else {
			req.serviceInstance = body;
			next();
		}
	});
}

function checkCredentials(req, res, next) {
	// Find toolchain credentials
	var toolchainId = req.incomingEvent.toolchainId;
	var toolchain_id = _.findWhere(req.serviceInstance.toolchain_ids, {id: toolchainId});
	if (toolchain_id) {
		req.toolchainCredentials = toolchain_id.credentials;
	}
	
	// Introspect credentials if basic authorization
	var authHeader = req.header('Authorization');
	if (authHeader) {
		// Split header and grab values from it.
		var authHeaderParts = authHeader.split(/\s+/);
		var authPrefix = String(authHeaderParts[0]).toLowerCase();
		var authValue = authHeaderParts[1];
		if (authPrefix === "basic") {
			// introspect credentials according to toolchain credentials
			if (!req.toolchainCredentials) {
	            return res.status(401).json({ message: 'No toolchainCredentials found'});
			}
			return tiamUtil.introspectCredentials(req.toolchainCredentials, authValue, null, function(err, userData) {
				if (err) {
					if (err == 401) {
			            return res.status(401).json({ message: 'An invalid authorization header was passed in'});						
					} else {
						return res.status(500).json({ message: 'Error while validating basic credentials'});
					}
				} else {
					next();
				}
			});
		}
	}
	// TODO This next() will be removed when only Basic allowed
	// it will be replaced by:
	// return res.status(401).json({ message: 'An invalid authorization header was passed in'});	
	next();
}

function processEvent(req, res, next) {
	var logPrefix = "[" + logBasePath + ".processEvent] ";
	
	var source = req.incomingEvent.source;
	var serviceInstanceId = req.incomingEvent.serviceInstanceId;
	var toolchainId = req.incomingEvent.toolchainId;
	var payload = req.incomingEvent.payload;
	var authorization = req.header("Authorization");
	
	var serviceInstance = req.serviceInstance;

	var toolchainCredentials = req.toolchainCredentials;

	// According to :source value, we will route to the appropriate event to slack message translator
	// If the :source is not known, warning in the log and generic message in the channel
	// The output of 
	// retrieve the channel
	var message;
	var translator = catalog[source]; 
	if (!translator) {
		logger.warn(logPrefix + "No event to slack message translator found for " + source + ".\nContent:" + JSON.stringify(req.body));
		res.status(204).json({});
	} else {
		// Add an internal correlator just to check/ensure/debug the message ordered (ie pipeline)
		var requestId = req.header("vcap_request_id");
		if (!requestId) {
			requestId = new Date().getTime();
		}
		
		logger.info(logPrefix + "[" + requestId + "]Event about to be processed - from '" + source + "' in toolchain '" + toolchainId + "' for Slack service instance id:" + serviceInstanceId);
		logger.debug(logPrefix + "[" + requestId + "] Event payload: " + JSON.stringify(payload));	

		
		translator(requestId, payload, toolchainCredentials, function (error, message) {
			if (error) {
				res.status(500).json({ "description" : error});
			} else {
				// Find the api_token out of the serviceInstance record
				var api_token = serviceInstance.parameters.api_token;

				// Find the channel_id out of the serviceInstance record instance_id parameters
				// and add it to the message object
				message.channel = serviceInstance.instance_id; 
				
				var channelName = serviceInstance.parameters.label;
				if (!channelName) {
					channelName = message.channel; 
				}

				logger.debug(logPrefix + "[" + requestId + "] Posting Slack Message to channel '" + channelName + "' for Event - from '" + source + "' in toolchain '" + toolchainId + "' for Slack service instance id:" + serviceInstanceId);
				
				slackClient.postMessage(api_token, message, function(err, response) {
					if (err) {
						res.status(500).json({ "description" : err.toString() });	
						return;
					} else if (response.error) {
						res.status(400).json({ "description" : "Error - " + response.error});
						return;
					} else {
						logger.debug(logPrefix + "[" + requestId + "] Slack Message to channel '" + channelName + "' sent for Event - from '" + source + "' in toolchain '" + toolchainId + "' for Slack service instance id:" + serviceInstanceId);
						res.status(204).json({});
						return;
					}
				});			
			}
		});					
	}
}

function translate(requestId, event, authorization, callback) {
	var message = {};
	message.username = "Unknow Event";
	message.text = JSON.stringify(event);
	callback(null, message);
}


