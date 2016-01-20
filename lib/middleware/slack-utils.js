/**
 * Licensed Materials - Property of IBM
 * (c) Copyright IBM Corporation 2016. All Rights Reserved.
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
module.exports.postMessage = postMessage;


var slack_url = nconf.get("services:slack-api");

function getSlackLibrary(slack_api_token) {
	var slack = new Slack(slack_api_token);
	if (slack_url) {
		slack.url = slack_url;
	}
	return slack;
}

function getSlackUser(slack_api_token, callback) {
	var logPrefix = "[" + logBasePath + ".getSlackChannel] ";
	var slack = getSlackLibrary(slack_api_token);
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

function getOrCreateSlackChannel(slack_api_token, user, channel_id, channel_name, channel_topic, channel_purpose, callback) {
	var logPrefix = "[" + logBasePath + ".getOrCreateSlackChannel] ";

	if(!channel_id && !channel_name) {
		logger.error(logPrefix + "parameters' channel information (id or name) not provided");
		return callback({ description:"channel information (id or name) not provided"});
	}

    var slack = getSlackLibrary(slack_api_token);

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
            		slack.api("channels.setTopic", {channel: slack_channel.id, topic: channel_topic}, function(err, response){
            			if (err) {
            				callback(err);
            			} else if (response.ok) {
            				if (channel_purpose) {
            				    slack.api("channels.setPurpose",{channel: slack_channel.id, purpose: channel_purpose}, function(err, response) {
            				        if(err) {
                        				callback(err);
            				        } else if(response.ok){
                    					callback(null, slack_channel);
            				        } else {
                        				callback(response.error);
            				        }
            				    });
            				} else {
            					callback(null, slack_channel);
            				}
            			} else {
            				callback(response.error);
            			}
            		})
            	} else {
	            	callback(null, response.channel);
            	}
            } else if (response.error == "name_taken"){
            	// Channel name is already existing so try to reuse it !
            	slack.api("channels.list", function(err, response) {
        			if (err) {
        				callback(err);
        			} else if (response.ok) {
        				logger.debug(logPrefix + "Searching for '" + channel_name + "'");
        				var slack_channel = _.findWhere(response.channels, {name: channel_name});
        				if (!slack_channel) {
        					logger.error(logPrefix + "Slack channel with name '" + channel_name + "' existing but not found in channel list.");
        					callback("Error: Slack channel with name '" + channel_name + "' existing but not found in channel list.");
        				} else {
        					logger.debug("Yeah - we found the channel ! " + JSON.stringify(slack_channel));
            				callback(null, slack_channel);        					
        				}
        			} else {
        				callback(response.error);
        			}            		
            	});
            } else {
            	callback(response.error);
	    	}    		
    	});
    }
}

function postMessage(slack_api_token, message, callback) {
	var slack = getSlackLibrary(slack_api_token);
    slack.api("chat.postMessage", message, function (err, response) {
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
