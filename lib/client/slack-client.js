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
module.exports.validateChannelName = validateChannelName;

var slack_url = nconf.get("services:slack_api");
if (slack_url) {
	// ensure final / is there
	if (slack_url.charAt(slack_url.length - 1) != '/') {
		slack_url += "/";
	}
} else {
    slack_url = "https://slack.com/api/";    	
}

function slackAPI(slack, method, options, callback, retry) {
	var logPrefix = "[" + logBasePath + ".slackAPI] ";
	slack.api(method, options, function (err, response) {
		if (retry && retry == 3/*retry 3 times max*/) {
			// give up and return error if any
			return callback(err, response);
		}
		if (err && err.status == 'fail' /*workaround for https://github.com/nodejs/node/issues/4161*/) {
			// wait 1s and retry
			retry = retry ? retry+1 : 1;
			logger.warning(logPrefix + "err.status == 'fail', retrying #" + retry);
			sleep(1);
			slackAPI(slack, method, options, callback, retry);
		} else {
			callback(err, response);
		}
	});
}

function sleep(s) {
	var e = new Date().getTime() + (s * 1000);
    while (new Date().getTime() <= e) {
      ;
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
    slackAPI(slack, "auth.test", function (err, response) {
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
    	slackAPI(slack, "channels.info", {channel: channel_id}, function (err, response) {
	        if (err) {
	            return callback(err);
	        } 
            if (response.ok) {
            	var channel = response.channel;
            	if (response.channel.is_archived) {
            		return unarchiveChannel(slack, channel, callback);
            	} else {
	            	return callback(null, channel);	            		
            	}
	        }
            if (response.error == "channel_not_found"){
            	// Let's see if it is a private channel
            	slackAPI(slack, "groups.info", {channel: channel_id}, function (err, response) {
            		if (err) {
            			return callback(err);
            		}
            		if (response.ok) {
            			var group = response.group;
            			if (group.is_archived) {
            				return unarchiveGroup(slack, group, callback);
            			} else {
            				return callback(null, group);
            			}
            		} else {
            			return callback(response.error);
            		}
            	});	            	
            } else {
               	callback(response.error);
            }
    	});
    } else {
    	// Let's try to create a new channel given the channel_name and topic
		logger.debug(logPrefix + "Trying to create channel'" + channel_name + "'");
    	slackAPI(slack, "channels.create", {name: channel_name}, function (err, response) {
	        if (err) {
	            callback(err);
	        } else if (response.ok) {
        		var slack_channel = response.channel;
        		slack_channel.newly_created = true;
        		logger.debug(logPrefix + "Slack channel '" + slack_channel.name + "' created - " + slack_channel.id);
    			// Workaround to have a topic and purpose indicating that this has been created by us
    			// Those topic will be update/changed when binding the service with a toolchain
    			if (!channel_topic) {
    				channel_topic = "Notifications from Bluemix DevOps Services";
    			}
    			if (!channel_purpose) {
    				channel_purpose = "Notifications from Bluemix DevOps Services";
    			}        		
            	if (channel_topic) {
            		logger.debug(logPrefix + "Setting topic for newly created slack channel " + slack_channel.id + " to " + channel_topic);            		
            		slackAPI(slack, "channels.setTopic", {channel: slack_channel.id, topic: channel_topic}, function(err, response){
            			if (err) {
            				callback(err);
            			} else if (response.ok) {
            				if (channel_purpose) {
                        		logger.debug(logPrefix + "Setting purpose for for newly created slack channel " + slack_channel.id + " to " + channel_purpose);      
            				    slackAPI(slack, "channels.setPurpose",{channel: slack_channel.id, purpose: channel_purpose}, function(err, response) {
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
            	var checked_channel_name = validateChannelName(channel_name);
				logger.debug(logPrefix + "Creation failed. Searching for Slack channel '" + checked_channel_name + "' [initial channel name='" + channel_name + "']");
            	slackAPI(slack, "channels.list", function(err, response) {
        			if (err) {
        				return callback(err);
        			}
        			if (response.ok) {
        				var slack_channel = _.findWhere(response.channels, {name: checked_channel_name});
        				if (!slack_channel) {
        					// Not found in public channel, let's search in private channel (ie groups)
        	            	slackAPI(slack, "groups.list", function(err, response) {
        	            		if (err) {
        	            			return callback(err);
        	            		}
        	            		if (response.ok) {
        	            			var group = _.findWhere(response.groups, {name: checked_channel_name});
        	            			if (group) {
        	            				if (group.is_archived) {
        	            					return unarchiveGroup(slack, group, callback)
        	            				} else {
        	            					return callback(null, group);
        	            				}
        	            			}
        	            		}
        	            		// Nothing found
	        					logger.error(logPrefix + "Slack channel with name '" + checked_channel_name + "' exists but is not accessible or found in channel list (either private or public).");
	        					callback("Slack channel with name '" + checked_channel_name + "' exists but is not accessible or found in channel list (either private or public).");
        	            	});
        				} else {
        					logger.debug(logPrefix + "Slack channel found ! " + JSON.stringify(slack_channel));
        	            	if (slack_channel.is_archived) {
        	            		return unarchiveChannel(slack, slack_channel, callback);
        	            	} else {
                				return callback(null, slack_channel);        					
        	            	}
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
	var logPrefix = "[" + logBasePath + ".updateChannelTopicAndPurpose] ";
	//console.log("slack_api_token:" + slack_api_token);
    var slack = getSlackLibrary(slack_api_token);
	logger.debug(logPrefix + "Setting topic for slack channel " + channel_id + " to " + channel_topic);            		
	slackAPI(slack, "channels.setTopic", {channel: channel_id, topic: channel_topic}, function(err, response){
		if (err) {
			callback(err);
		} else if (response.ok) {
			if (channel_purpose) {
        		logger.debug(logPrefix + "Setting purpose for slack channel " + channel_id + " to " + channel_purpose);            		
			    slackAPI(slack, "channels.setPurpose",{channel: channel_id, purpose: channel_purpose}, function(err, response) {
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
    slackAPI(slack, "chat.postMessage", message, function (err, response) {
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

function validateChannelName(channel_name) {
	if (channel_name) {
		// Channel name must be 21 characters or less
		var result = channel_name.substring(0, 21);
		
		// Channel names can only contain numbers, hyphens, and underscores
		// whitespace replaced by -
		result = result.replace(/ /g, "-");
		
		// Channel names can only contain lowercase letters
		result = result.toLowerCase();
		
		// Leading # are removed
		result = result.replace(/^#+/, "");
		
		// Non letter, number, hyphen or underscore replaced by an underscore
		result = result.replace(/[^A-Za-z0-9_\-]/g, "_");
				
		// Multiple - or _ are replaced by a single on
		result = result.replace(/-+/g, "-");
		result = result.replace(/_+/g, "_");
		
		return result;
	} else {
		return "";
	}
}

function unarchiveChannel(slack, channel, callback) {
	var logPrefix = "[" + logBasePath + ".unarchiveChannel] ";
	logger.debug(logPrefix + "Unarchiving channel " + channel.id + "");
	slackAPI(slack, "channels.unarchive", {channel: channel.id}, function (err, response) {
        if (err) {
            return callback(err);
        }
        if (response.ok) {
        	channel.is_archived = false;
        	return callback(null, channel);
        } else {
        	return callback(response.error);	            	            	
        }
	});
}

function unarchiveGroup(slack, group, callback) {
	var logPrefix = "[" + logBasePath + ".unarchiveGroup] ";
	logger.debug(logPrefix + "Unarchiving group " + group.id + "");
	slackAPI(slack, "groups.unarchive", {channel: group.id}, function (err, response) {
        if (err) {
            return callback(err);
        } 
        if (response.ok) {
        	group.is_archived = false;
        	return callback(null, group);
        } else {
        	return callback(response.error);	            	            	
        }
	});	            				
}
