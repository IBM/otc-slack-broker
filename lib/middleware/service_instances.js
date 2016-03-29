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
 nanoDocUpdater = require("nano-doc-updater"),
 nconf = require("nconf"),
 request = require("request"),
 _ = require("underscore"),
 slackClient = require("../client/slack-client"),
 checkOtcApiAuth = require("./check-otc-api-auth")
;

var logger = log4js.getLogger("otc-slack-broker"),
 	logBasePath = "lib.middleware.service_instances";

var r = express.Router();
r
.use(checkOtcApiAuth)
.put("/:sid", createOrUpdateServiceInstance)
.put("/:sid/toolchains/:tid", bindServiceInstanceToToolchain)
.patch("/:sid", patchServiceInstance)
.delete("/:sid", unbindServiceInstance)
.delete("/:sid/toolchains", unbindServiceInstanceFromAllToolchains)
.delete("/:sid/toolchains/:tid", unbindServiceInstanceFromToolchain)
;

module.exports = r;

/**
*	Checks if the service instance already exists. If one does,
*	and the parameters (i.e. list title) needs an update, then the value
*	is updated. If the parameters are not updated, a check is done to
*	update the remaining parameters, e.g. toolchains associated with
*	the service instance. Otherwise, no instance exists so
*	a list is created along with an instance.
*
*	Note: If a list title is changed outside the instance in the
*	service itself, then the parameters and title can be out of sync.
**/
function createOrUpdateServiceInstance (req, res) {
	var logPrefix = "[" + logBasePath + ".createOrUpdateServiceInstance] ";
	var db = req.servicesDb,
		serviceInstanceId = req.params.sid,
		parametersData = req.body.parameters,
		organizationId = req.body.organization_guid,
		serviceCredentials = req.body.service_credentials;

	logger.info(logPrefix + "Provisionning the service instance with ID: " + serviceInstanceId 
			+ " using parameters:" + JSON.stringify(parametersData));
	
	// req.body (from external request) is not the same as body (response from Cloudant dB).
	if(!req.body.service_id) {
		return res.status(400).json({ "description": "Error: service_id is a required parameter." });
	}
	
	if(!organizationId) {
		return res.status(400).json({ "description": "Error: organization_guid is a required parameter." });
	}

	db.get(serviceInstanceId, null, function(err, body) {
		if(err && err.statusCode !== 404) {
			logger.error(logPrefix + "Retrieving the service instance with" +
				" ID: " + serviceInstanceId + " failed with the following" +
				" error: " + err.toString());

			res.status(500).json({ "description": err.toString() });
			return;
		} else if(err && err.statusCode === 404) {
			/**
			*	The service instance does not exist, create
			*	one
			**/
			if(!serviceCredentials) {
				return res.status(400).json({ "description": "Error: service_credentials is a required parameter." });
			}
			return createOrUpdateServiceInstance_(res, req, db, serviceInstanceId, organizationId, serviceCredentials, parametersData)
		} else {
			/**
			*	The service instance exists but the parameters needs an update.
			**/
			if(!serviceCredentials) {
				// ensure serviceCredentials is there
				serviceCredentials = body.service_credentials;
			}
			return createOrUpdateServiceInstance_(res, req, db, serviceInstanceId, organizationId, serviceCredentials, parametersData)
		}
	});
}

function createOrUpdateServiceInstance_(res, req, db, serviceInstanceId, organizationId, serviceCredentials, parametersData) {
	var logPrefix = "[" + logBasePath + ".createOrUpdateServiceInstance_] ";
	var api_token;
	var channel_id;
	var channel_name;
	var channel_topic;
	var channel_purpose;
	if (parametersData) {
		api_token = parametersData.api_token;
		channel_id = parametersData.channel_id;
		channel_name = parametersData.channel_name;
		channel_topic = parametersData.channel_topic;
		channel_purpose = parametersData.channel_purpose;
	}
	var parameters = {};
	if (api_token) {
		slackClient.getSlackUser(api_token, function (err, user) {
			if (err) {
				logger.error(logPrefix + "Error getting slack user : Slack API token not valid.");
				return res.status(400).json({ "description": "Error: Slack API token not valid." });
			}
			parameters.api_token = api_token;
			
			slackClient.getOrCreateSlackChannel(api_token, user, channel_id, channel_name, channel_topic, channel_purpose, function (err, channel) {
				if (err) {
					logger.error(logPrefix + "Error getting or creating slack channel : " + err.toString());
					return res.status(400).json({ "description": "Error: Unable to find or create Slack Channel (" + err.toString() + ")" });							
				} else {
					var dashboardUrl = user.url + "messages/" + channel.name;
					parameters.channel_name = channel.name;
					parameters.label = "#" + channel.name;
					
					return doServiceUpdate(res, req, db, serviceInstanceId, serviceCredentials, parameters, channel.id, organizationId, dashboardUrl, channel.newly_created);							
				}
			});
		});
	} else {
		return res.status(400).json({ "description": "Error: No Slack API token provided." });
		// Creation of uncommplete service instance
		// return doServiceUpdate(res, req, db, serviceInstanceId, parameters, "n/a", organizationId, "https://slack.com");
	}	
}

/**
*	Handles updating the service instance with the new properties.
**/
function doServiceUpdate (res, req, db, serviceInstanceId, serviceCredentials, parametersData, instanceId, organizationId, dashboardUrl, channel_newly_created) {
	var logPrefix = "[" + logBasePath + ".doServiceUpdate] ";
	
	if (channel_newly_created) {
	} else {
		channel_newly_created = false;
	}
	
	return nanoDocUpdater()
		.db(db)
		.id(serviceInstanceId)
		.existingDoc(null)
		.newDoc(_.extend(
			{
				type: "service_instance",
				parameters: parametersData,
				instance_id: instanceId,
				dashboard_url: dashboardUrl,
				organization_guid: organizationId,
				service_credentials: serviceCredentials,
				channel_newly_created: channel_newly_created
			},
			{
				toolchain_ids: []
			}
		))
		.shouldUpdate(function (published, proposed) {
			return published.type !== proposed.type ||
				   published.parameters !== proposed.parameters ||
				   published.instance_id !== proposed.instance_id ||
				   published.dashboard_url !== proposed.dashboard_url ||
				   published.channel_newly_created !== proposed.channel_newly_created ||
				   published.service_credentials !== proposed.service_credentials ||
				   published.organization_guid !== proposed.organization_guid;
		})
		.update(function (err) {
				if (err) {
					logger.error(logPrefix + "Updating the service instance with" +
						" ID: " + serviceInstanceId + " and parameters: " + parametersData +
						" failed with the following error: " + err.toString());

		            if(err.statusCode === 404) {
		                return res.status(404).json({ "description": err.toString() });
		            }

					return res.status(500).json({ "description": err.toString() });
				}

				logger.debug(logPrefix + "Updating the service instance with" +
						" ID: " + serviceInstanceId + " and parameters: " + JSON.stringify(parametersData) + 
						"  done");

				return res.json({
					instance_id: instanceId,
					dashboard_url: dashboardUrl,
					parameters: parametersData,
					organization_guid: organizationId
				});
			}
		);
}


function patchServiceInstance(req, res /*, next*/) {
    var logPrefix = "[" + logBasePath + ".patchServiceInstance] ";

    var db = req.servicesDb,
        serviceInstanceId = req.params.sid,		
        parametersData = req.body.parameters
    ;

	logger.info(logPrefix + "Patching the service instance with ID: " + serviceInstanceId
			+ " using parameters:" + JSON.stringify(parametersData));

    var patchParameters = {};
    
    // What can be patched for Slack ?
    // dashboard_url (read only)
    // parameters.label (read-only)
    // parameters.api_token (writable)
    if (parametersData.api_token) {
    	patchParameters.api_token = parametersData.api_token; 
    }
    // parameters.channel_id (writable)
    if (parametersData.channel_id) {
    	patchParameters.channel_id = parametersData.channel_id; 
    }
    // parameters.channel_name (writable)
    if (parametersData.channel_name) {
    	patchParameters.channel_name = parametersData.channel_name; 
    }
    // parameters.channel_topic (writable?)
    if (parametersData.channel_topic) {
    	patchParameters.channel_topic = parametersData.channel_topic; 
    }
    // parameters.channel_purpose (writable?)
    if (parametersData.channel_purpose) {
    	patchParameters.channel_purpose = parametersData.channel_purpose; 
    }
    
    db.get(serviceInstanceId, null, function(err, body) {
        if (err && err.statusCode === 404) {
            logger.error(logPrefix + "Service instance with" +
                " ID: " + serviceInstanceId + " was not found");
            return res.status(404).json({ "description": err.toString() });
        } else if (err) {
            logger.error(logPrefix + "Retrieving the service instance with" +
                " ID: " + serviceInstanceId + " failed with the following" +
                " error: " + err.toString());

            return res.status(500).json({ "description": err.toString() });
        }

        var organizationId;
        if (req.body.organization_guid) {
        	// New organization
        	organizationId =req.body.organization_guid; 
        } else {
        	organizationId= body.organization_guid
        }

    	// previous channel was created ?
    	var channel_newly_created = body.channel_newly_created;
    	
        // New api_token ?
        var api_token = body.parameters.api_token;
        if (patchParameters.api_token && patchParameters.api_token != body.parameters.api_token) {
        	api_token = patchParameters.api_token;
        }
    	var parameters = {};
		slackClient.getSlackUser(api_token, function (err, user) {
			if (err) {
				logger.error(logPrefix + "Error getting slack user : Slack API token not valid.");
				return res.status(400).json({ "description": "Error: Slack API token not valid." });
			}
			parameters.api_token = api_token;
			var channel_id;
			var channel_name;
			var channel_topic;
			var channel_purpose;
			if (patchParameters.channel_name && patchParameters.channel_name != body.parameters.channel_name) {
				// New channel name 
				channel_name = patchParameters.channel_name;
				if (patchParameters.channel_topic) {
					channel_topic = patchParameters.channel_topic;
				}
				if (patchParameters.channel_purpose) {
					channel_purpose = patchParameters.channel_purpose;
				}
				// As this is a new channel name, forget about the previous status
				channel_newly_created = false;
			} else {
				// New channel id
				if (patchParameters.channel_id && patchParameters.channel_id != body.instance_id)  {
					// new channel id
					channel_id = patchParameters.channel_id;
					// As this is a new channel, forget about the previous status
					channel_newly_created = false;
				} else {
					channel_id = body.instance_id;
				}
			}

			slackClient.getOrCreateSlackChannel(api_token, user, channel_id, channel_name, channel_topic, channel_purpose, function (err, channel) {
				if (err) {
					logger.error(logPrefix + "Error getting or creating slack channel : " + JSON.stringify(err));
					return res.status(400).json({ "description": "Error: Unable to find or create Slack Channel (" + JSON.stringify(err) + ")" });							
				} else {
					var dashboardUrl = user.url + "messages/" + channel.name;
					parameters.channel_name = channel.name;
					parameters.label = "#" + channel.name;
					
					if (channel.newly_created) {
						if (body.toolchain_ids && body.toolchain_ids.length > 0) {
							// Use the "first" toolchain binded in order to set topic and purpose
							var id = body.toolchain_ids[0].id;
							var creds = body.toolchain_ids[0].credentials;
							changeChannelTopicAndPurpose(api_token, channel.id, id, creds, req.header("Authorization"));							
						}
					}
					
		            return nanoDocUpdater()
	                .db(db)
	                .id(serviceInstanceId)
	                .existingDoc(null)
	                .newDoc(_.extend(body, 
	                		{
	                			instance_id: channel.id,
	                			dashboard_url: dashboardUrl,
	                			organization_guid: organizationId,
	                			parameters: parameters,
	                			channel_newly_created : channel.newly_created
	                		}))
	                .shouldCreate(false)
	                .shouldUpdate(function (published, proposed) {
	                    var shouldUpdate = 
	                    	published.instance_id !== proposed.instance_id ||
	                    	published.dashboard_url != proposed.dashboard_url ||
	                    	published.organization_guid != proposed.organization_guid ||
	                    	published.parameters !== proposed.parameters ||
	                    	published.channel_newly_created != proposed.channel_newly_created
	                    ;
	                    return shouldUpdate;
	                })
					.merge(function (exist, proposed) {
						var merged = exist;
						merged.instance_id = proposed.instance_id;
						merged.dashboard_url = proposed.dashboard_url;
						merged.parameters.api_token = proposed.parameters.api_token;
						merged.parameters.channel_name = proposed.parameters.channel_name;
						merged.parameters.label = proposed.parameters.label;
						merged.organization_guid = proposed.organization_guid;
						merged.channel_newly_created = proposed.channel_newly_created;
						return merged;
					})	                
	                .update(function (err) {
                        if (err) {
                            logger.error(logPrefix + "Patching the service instance with" +
                                " ID: " + serviceInstanceId + " and parameters: " + parametersData +
                                " failed with the following error: " + err.toString());

		 		            if(err.statusCode === 404) {
				                return res.status(404).json({ "description": err.toString() });
				            }

                           	return res.status(500).json({ "description": err.toString() });
                        } else {
            				return res.json({
            					instance_id: channel.id,
            					dashboard_url: dashboardUrl,
            					parameters: parameters,
            					organization_guid: organizationId
            				});
	
                        }

	                });

				}
			});
		});
    });
}


/*
	Assumption:  A service instance may only be bound to one toolchain at a time.

	If this is not the case, we should replace toolchain_id in docs with toolchain_ids
	and do a merge (adding the toolchain_id to the list) instead of clobbering the
	whole doc here.
*/
function bindServiceInstanceToToolchain (req, res/*, next*/) {
	var logPrefix = "[" + logBasePath + ".bindServiceInstanceToToolchain] ";

	var db = req.servicesDb,
	serviceInstanceId = req.params.sid,
	toolchainId = req.params.tid,
	toolchainCredentials = req.body.toolchain_credentials;

	logger.info(logPrefix + "Binding the service instance with" +
			" ID: " + serviceInstanceId + " to toolchain ID: " + toolchainId);
	
	if (!toolchainCredentials) {
		return res.status(400).json({ "description": "Error: toolchain_credentials is a required parameter." });
	}
	
	
	var updatedDocument;

	return nanoDocUpdater()
	.db(db)
	.id(serviceInstanceId)
	.existingDoc(null)
	.newDoc(null)
	.shouldUpdate(function (published) {
		// only update if no binding for a given toolchain
		var result = _.find(published.toolchain_ids, function(obj) {
			if (obj.id === toolchainId) {
				return true;
			}
		});
		return result == undefined;
	})
	.merge(function (published) {
		published.toolchain_ids.push({id: toolchainId, credentials: toolchainCredentials});
		updatedDocument = published;
		return published;
	})
	.update(function (err) {
		if (err) {
			logger.error(logPrefix + "Binding the service instance with" +
				" ID: " + serviceInstanceId + " to toolchain ID: " + toolchainId +
				" failed with the following error: " + err.toString());

            if(err.statusCode === 404) {
                return res.status(404).json({ "description": err.toString() });
            }

			return res.status(500).json({ "description": err });
		}

		// Change the topic and purpose if the channel was created by the Slack Broker
		if (updatedDocument.channel_newly_created) {
			changeChannelTopicAndPurpose(updatedDocument.parameters.api_token, updatedDocument.instance_id, toolchainId, toolchainCredentials, req.header("Authorization"));
		}
		
		// TODO Invite all project members

		logger.info(logPrefix + "Binding the service instance with" +
				" ID: " + serviceInstanceId + " to toolchain ID: " + toolchainId +
				" done");
		
		// Provide the notification url for the toolchain lifecycle event
		//var toolchain_lifecycle_webhook_url = nconf.get("PROTOCOL") + "://" + nconf.get("_vcap_application:application_uris:0")
		//	+ "/slack-broker/api/v1/messaging/toolchains/"
		//	+ toolchainId + "/service_instances/" + serviceInstanceId + "/lifecycle_events";
		//return res.json({toolchain_lifecycle_webhook_url: toolchain_lifecycle_webhook_url}).status(200);			
		
		return res.status(204).json({});			

	});
}

/**
*	Removes the service instance and the list from the service.
**/
function unbindServiceInstance (req, res/*, next*/) {
	var logPrefix = "[" + logBasePath + ".unbindServiceInstance] ";
	var db = req.servicesDb,
	serviceInstanceId = req.params.sid;

	logger.info(logPrefix + "Unbinding the service instance with" +
			" ID: " + serviceInstanceId);
	
	/**
	*	Find out the id of the list to remove.
	**/
	db.get(serviceInstanceId, null, function(err, body) {
		/**
		*	An error occurred during the request, or the service
		*	instance does not exist.
		**/
		if(err) {
			logger.error(logPrefix + "Retrieving the service instance with" +
				" ID: " + serviceInstanceId + " failed with the following" +
				" error: " + err.toString());

			res.status(500).json({ "description": err.toString() });
			return;
		} else {
			return nanoDocUpdater()
			.db(db)
			.id(serviceInstanceId)
			.existingDoc(null)
			.shouldCreate(false)
			.shouldUpdate(function (published) {
				return !published._deleted;
			})
			.merge(function (published) {
				delete published.service_credentials;
				published.toolchain_ids = [];
				return _.extend({ _deleted: true }, published);
			})
			.update(function (err) {
				if (err) {
					logger.error(logPrefix + "Removing the service instance with ID: " +
						serviceInstanceId + " failed with the following error: " + err.toString());
					
		            if(err.statusCode === 404) {
		                return res.status(404).json({ "description": err.toString() });
		            }

					return res.status(500).json({ "description": "Could not delete service instance: " + err.toString() });
				}

				return res.status(204).json({});
			});
		}
	});
}

function unbindServiceInstanceFromToolchain (req, res/*, next*/) {
	var logPrefix = "[" + logBasePath + ".unbindServiceInstanceFromToolchain] ";
	var db = req.servicesDb,
	serviceInstanceId = req.params.sid,
	toolchainId = req.params.tid;

	logger.info(logPrefix + "Unbinding the service instance with" +
			" ID: " + serviceInstanceId + " from toolchain ID: " + toolchainId);
	
	return nanoDocUpdater()
	.db(db)
	.id(serviceInstanceId)
	.existingDoc(null)
	.newDoc(null)
	.shouldUpdate(function (published) {
		var result = _.find(published.toolchain_ids, function(obj) {
			if (obj.id === toolchainId) {
				return true;
			}
		});
		return result !== undefined;
	})
	.merge(function (published) {
		published.toolchain_ids = _.reject(published.toolchain_ids, function(obj) {
			if (obj.id === toolchainId) {
				return true;
			}
		});
		return published;
	})
	.update(function (err) {
		if (err) {
			logger.error(logPrefix + "Unbinding the service instance with" +
				" ID: " + serviceInstanceId + " from toolchain ID: " + toolchainId +
				" failed with the following error: " + err.toString());

            if(err.statusCode === 404) {
                return res.status(404).json({ "description": err.toString() });
            }

			return res.status(500).json({ "description": "Could not unbind service instance: " + err.toString() });
		}

		return res.status(204).json({});
	});
}

function unbindServiceInstanceFromAllToolchains (req, res/*, next*/) {
	var logPrefix = "[" + logBasePath + ".unbindServiceInstanceFromAllToolchains] ";
	var db = req.servicesDb,
	serviceInstanceId = req.params.sid;

	logger.info(logPrefix + "Unbinding the service instance with" +
			" ID: " + serviceInstanceId + " from all toolchains");
	
	return nanoDocUpdater()
	.db(db)
	.id(serviceInstanceId)
	.existingDoc(null)
	.newDoc(null)
	.shouldUpdate(function (published) {
		return published.toolchain_ids.length > 0;
	})
	.merge(function (published) {
		published.toolchain_ids = [];
		return published;
	})
	.update(function (err) {
		if (err) {
			logger.error(logPrefix + "Unbinding the service instance with" +
				" ID: " + serviceInstanceId + " from all toolchains" +
				" failed with the following error: " + err.toString());

            if(err.statusCode === 404) {
                return res.status(404).json({ "description": err.toString() });
            }

			return res.status(500).json({ "description": "Could not unbind service instance: " + err.toString() });
		}

		res.status(204).json({});
	});
}

function changeChannelTopicAndPurpose(api_token, channel_id, toolchainId, toolchainCredentials, authorization) {
	var logPrefix = "[" + logBasePath + ".changeChannelTopicAndPurpose] ";
	
	// Find the toolchain information using otc-api
	var otc_api_url = nconf.get("services:otc-api");
	
	var options = {};
	options.url = otc_api_url + "/toolchains/" + toolchainId;
	options.headers = {"Authorization" : authorization};
	options.json = true;
	request.get(options, function(error, response, body) {
		if (error) {
			logger.error(logPrefix + "Error while getting " + options.url + ":" + error);
		} else if (response.statusCode == 200) {
			if (response.body.items.length > 0) {
				var toolchain = response.body.items[0];
				// Create a topic and purpose values
				var toolchain_ui_url = nconf.get("services:otc-ui") + "/toolchains/" + toolchainId;
				var topic = "Notifications from DevOps Services Toolchain *" + toolchain.name + "* (" + toolchain_ui_url + ")";
				var purpose = "This channel was created to handle notifications from DevOps Services Toolchain *" + toolchain.name + "* (" + toolchain_ui_url + ")";
				
				// Update the topic and purpose using slack helper
				slackClient.updateChannelTopicAndPurpose(api_token, channel_id, topic, purpose, function(err) {
					if (err) {
						logger.error(logPrefix + "Error while setting topic and purpose for channel " + channel_id + " - " + err);													
					}
				});
				
			} else {
				logger.error(logPrefix + "Error while getting " + options.url + " - no items for the toolchain returned");							
			}
		} else {
			logger.error(logPrefix + "Error while getting " + options.url + ":" + response.statusCode);			
		}
	});	
	
	
}
