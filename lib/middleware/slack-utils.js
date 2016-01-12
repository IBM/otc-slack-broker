/**
 * Licensed Materials - Property of IBM
 * (c) Copyright IBM Corporation 2015. All Rights Reserved.
 *
 * Note to U.S. Government Users Restricted Rights:
 * Use, duplication or disclosure restricted by GSA ADP Schedule
 * Contract with IBM Corp.
 */
"use strict";

var
 log4js = require("log4js"),
 nanoDocUpdater = require("nano-doc-updater"),
 nconf = require("nconf"),
 request = require("request"),
 _ = require("underscore"),
 Slack = require("slack-node")
;

var logger = log4js.getLogger("otc-slack-broker"),
 	logBasePath = "lib.middleware.slack-utils";

module.exports.getSlackUser = getSlackUser;
module.exports.getOrCreateSlackChannel = getOrCreateSlackChannel;

function getSlackUser(api_token, callback) {
	var logPrefix = "[" + logBasePath + ".getSlackChannel] ";
    var slack = new Slack(api_token);
    slack.api("auth.test", function (err, response) {
        if (err) {
            callback(err);
        } else {
            if (response.ok) {
            	delete response.ok;
            	callback(null, response);
            } else {
            	callback(response.error);
            }
        }
    });
}

function getOrCreateSlackChannel(api_token, user, channel_id, channel_name, channel_topic, callback) {
	var logPrefix = "[" + logBasePath + ".getOrCreateSlackChannel] ";

	if(!channel_id && !channel_name) {
		logger.error(logPrefix + "parameters' channel information (id or name) not provided");
		return callback({ description:"channel information (id or name) not provided"});
	}

    var slack = new Slack(api_token);

    if (channel_id) {
    	slack.api("channels.info", {channel: channel_id}, function (err, response) {
	        if (err) {
	            callback(err);
	        } else {
	            if (response.ok) {
	            	var channel = response.channel;
	            	if (response.channel.is_archived) {
	            		slack.api("channels.unarchive", {channel: channel_id}, function (err, response) {
	            	        if (err) {
	            	            callback(err);
	            	        } else {
	            	            if (response.ok) {
	            	            	channel.is_archived = false;
	            	            	callback(null, channel);
	            	            } else {
	            	            	callback(response.error);	            	            	
	            	            }
	            	        }
	            		});
	            	} else {
		            	callback(null, channel);	            		
	            	}
	            } else {
	            	callback(response.error);
	            }
	    	}
    	});
    } else {
    	// Let's try to create a new channel given the channel_name and topic
    	slack.api("channels.create", {name: channel_name}, function (err, response) {
	        if (err) {
	            callback(err);
	        } else if (response.ok) {
            	if (channel_topic) {
            		var slack_channel = response.channel;
            		slack.api("channels.setTopic", {channel: response.channel.id, topic: channel_topic}, function(err, response){
            			if (err) {
            				callback(err);
            			} else if (response.ok) {
            				callback(null, slack_channel);
            			} else {
            				callback(response.error);
            			}
            		})
            	} else {
	            	callback(null, response.channel);
            	}
            } else {
            	callback(response.error);
	    	}    		
    	});
    }
}
