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
 	logBasePath = "lib.client.slack-client";

module.exports.getSlackUser = getSlackUser;
module.exports.getOrCreateSlackChannel = getOrCreateSlackChannel;
module.exports.postMessage = postMessage;
module.exports.updateChannelTopicAndPurpose = updateChannelTopicAndPurpose;

var slack_url = nconf.get("services:slack-api");
if (slack_url) {
	// ensure final / is there
	if (slack_url.charAt(slack_url.length - 1) != '/') {
		slack_url += "/";
	}
}

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
		logger.debug(logPrefix + "Using Slack channel " + channel_id + "");
    	slack.api("channels.info", {channel: channel_id}, function (err, response) {
	        if (err) {
	            callback(err);
	        } else {
	            if (response.ok) {
	            	var channel = response.channel;
	            	if (response.channel.is_archived) {
	        			logger.debug(logPrefix + "Unarchiving channel " + channel_id + "");
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
		logger.debug(logPrefix + "Trying to create channel'" + channel_name + "'");
    	slack.api("channels.create", {name: channel_name}, function (err, response) {
	        if (err) {
	            callback(err);
	        } else if (response.ok) {
        		var slack_channel = response.channel;
        		slack_channel.newly_created = true;
        		logger.debug(logPrefix + "Slack channel '" + slack_channel.name + "' created - " + slack_channel.id);
    			// Workaround to have a topic and purpose indicating that this has been created by us
    			// Those topic will be update/changed when binind the service with a toolchain
    			if (!channel_topic) {
    				channel_topic = "Notifications from Bluemix DevOps Services";
    			}
    			if (!channel_purpose) {
    				channel_purpose = "Notifications from Bluemix DevOps Services";
    			}        		
            	if (channel_topic) {
            		logger.debug(logPrefix + "Setting topic for newly created slack channel " + slack_channel.id + " to " + channel_topic);            		
            		slack.api("channels.setTopic", {channel: slack_channel.id, topic: channel_topic}, function(err, response){
            			if (err) {
            				callback(err);
            			} else if (response.ok) {
            				if (channel_purpose) {
                        		logger.debug(logPrefix + "Setting purpose for for newly created slack channel " + slack_channel.id + " to " + channel_purpose);      
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
	            	callback(null, slack_channel);
            	}
            } else if (response.error == "name_taken"){
            	// Channel name is already existing so try to reuse it !
				logger.debug(logPrefix + "Creation failed. Searching for Slack channel '" + channel_name + "'");
            	slack.api("channels.list", function(err, response) {
        			if (err) {
        				callback(err);
        			} else if (response.ok) {
        				var slack_channel = _.findWhere(response.channels, {name: channel_name});
        				if (!slack_channel) {
        					logger.error(logPrefix + "Slack channel with name '" + channel_name + "' existing but not accessible/not found in channel list.");
        					callback("Error: Slack channel with name '" + channel_name + "' existing but not accessible/not found in channel list.");
        				} else {
        					logger.debug("Slack channel found ! " + JSON.stringify(slack_channel));
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

function updateChannelTopicAndPurpose(slack_api_token, channel_id, channel_topic, channel_purpose, callback) {
	var logPrefix = "[" + logBasePath + ".getOrCreateSlackChannel] ";
	//console.log("slack_api_token:" + slack_api_token);
    var slack = getSlackLibrary(slack_api_token);
	logger.debug(logPrefix + "Setting topic for slack channel " + channel_id + " to " + channel_topic);            		
	slack.api("channels.setTopic", {channel: channel_id, topic: channel_topic}, function(err, response){
		if (err) {
			callback(err);
		} else if (response.ok) {
			if (channel_purpose) {
        		logger.debug(logPrefix + "Setting purpose for slack channel " + channel_id + " to " + channel_purpose);            		
			    slack.api("channels.setPurpose",{channel: channel_id, purpose: channel_purpose}, function(err, response) {
			        if(err) {
        				callback(err);
			        } else if(response.ok){
    					callback();
			        } else {
        				callback(response.error);
			        }
			    });
			} else {
				callback();
			}
		} else {
			callback(response.error);
		}
	});
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
