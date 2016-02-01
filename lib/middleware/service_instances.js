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
 r = express.Router(),
 request = require("request"),
 _ = require("underscore"),
 slackClient = require("../client/slack-client")
;

var logger = log4js.getLogger("otc-slack-broker"),
 	logBasePath = "lib.middleware.service_instances";

r
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
		organizationId = req.body.organization_guid;
	
	// req.body (from external request) is not the same as body (response from Cloudant dB).
	if(!req.body.service_id) {
		return res.status(400).json({ "description": "Error: service_id is a required parameter." });
	}
	if(!organizationId) {
		return res.status(400).json({ "description": "Error: organization_guid is a required parameter." });
	}
	if(!isValidOrganization(organizationId, req.user.organizations)) {
		return res.status(403).json({ "description": "Error: User is not part of the organization." });
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
			// TODO instance_id = serviceInstanceId ?
			return createOrUpdateServiceInstance_(res, req, db, serviceInstanceId, organizationId, parametersData)
		} else {
			/**
			*	The service instance exists but the parameters needs an update.
			**/
			// unique instance_id from the Cloudant DB also known as the service instance ID (sid)
			// var instanceId = body.instance_id;
			return createOrUpdateServiceInstance_(res, req, db, serviceInstanceId, organizationId, parametersData)
		}
	});
}

function createOrUpdateServiceInstance_(res, req, db, serviceInstanceId, organizationId, parametersData) {
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
				return res.status(400).json({ "description": "Error: Slack API key not valid." });
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
					
					return doServiceUpdate(res, req, db, serviceInstanceId, parameters, channel.id, organizationId, dashboardUrl, channel.newly_created);							
				}
			});
		});
	} else {
		return res.status(400).json({ "description": "Error: Slack API key not valid." });
		// Creation of uncommplete service instance
		// return doServiceUpdate(res, req, db, serviceInstanceId, parameters, "n/a", organizationId, "https://slack.com");
	}	
}

/**
*	Handles updating the service instance with the new properties.
**/
function doServiceUpdate (res, req, db, serviceInstanceId, parametersData, instanceId, organizationId, dashboardUrl, channel_newly_created) {
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
				channel_newly_created: channel_newly_created
			},
			{
				toolchain_ids: []
				// TODO
				//pipeline_and_webhook_ids: []
			}
		))
		.shouldUpdate(function (published, proposed) {
			return published.type !== proposed.type ||
				   published.parameters !== proposed.parameters ||
				   published.instance_id !== proposed.instance_id ||
				   published.dashboard_url !== proposed.dashboard_url ||
				   published.channel_newly_created !== proposed.channel_newly_created ||
				   published.organization_guid !== proposed.organization_guid;
		})
		.update(function (err) {
				if (err) {
					logger.error(logPrefix + "Updating the service instance with" +
						" ID: " + serviceInstanceId + " and parameters: " + parametersData +
						" failed with the following error: " + err.toString());

					res.status(500).json({ "description": err.toString() });
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


// TODO https://hub.jazz.net/ccm09/resource/itemName/com.ibm.team.workitem.WorkItem/52307
function patchServiceInstance(req, res /*, next*/) {
    var logPrefix = "[" + logBasePath + ".patchServiceInstance]";

    var db = req.servicesDb,
        serviceInstanceId = req.params.sid,		
        parametersData = req.body.parameters
    ;
        
    var patchParameters = {};
    
    // What can be patched for Slack ?
    // dashboard_url (read only)
    // parameters.label (read-only)
    // parameters.api_key (writable)
    if (parametersData.api_key) {
    	patchParameters.api_key = parametersData.api_key; 
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
    	if(!isValidOrganization(organizationId, req.user.organizations)) {
    		return res.status(403).json({ "description": "Error: User is not part of the organization." });
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
				return res.status(400).json({ "description": "Error: Slack API key not valid." });
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
					
					if (channel_newly_created || channel.newly_created) {
						if (body.toolchain_ids && body.toolchain_ids.length > 0) {
							// Use the "first" toolchain binded in order to set topic and purpose
							changeChannelTopicAndPurpose(api_token, channel.id, body.toolchain_ids[0], req.header("Authorization"));							
						}
					}
					
					return doServiceUpdate(res, req, db, serviceInstanceId, parameters, channel.id, organizationId, dashboardUrl, channel_newly_created || channel.newly_created);							
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
	isOrg;
	
	var updatedDocument;
	
	return nanoDocUpdater()
	.db(db)
	.id(serviceInstanceId)
	.existingDoc(null)
	.newDoc(null)
	.shouldUpdate(function (published) {
		isOrg = isValidOrganization(published.organization_guid, req.user.organizations);

		return (published.toolchain_ids.indexOf(toolchainId) === -1 && isOrg);
	})
	.merge(function (published) {
		published.toolchain_ids.push(toolchainId);
		updatedDocument = published;
		return published;
	})
	.update(function (err) {
		if (err) {
			logger.error(logPrefix + "Binding the service instance with" +
				" ID: " + serviceInstanceId + " to toolchain ID: " + toolchainId +
				" failed with the following error: " + err.toString());

			return res.status(500).json({ "description": err });
		}
		else if(!isOrg) {
			return res.status(403).json({ "description": "Error: User is not part of the organization." });
		}

		// Change the topic and purpose if the channel was created by the Slack Broker
		if (updatedDocument.channel_newly_created) {
			changeChannelTopicAndPurpose(updatedDocument.parameters.api_token, updatedDocument.instance_id, toolchainId, req.header("Authorization"));
		}
		
		// TODO Invite all project members
		

		// TODO
		//registerPipelineWebhooks(req);
		
		
		logger.debug(logPrefix + "Binding the service instance with" +
				" ID: " + serviceInstanceId + " to toolchain ID: " + toolchainId +
				" done");
		
		// Provide the notification url for the toolchain lifecycle event
		var toolchain_lifecycle_webhook_url = nconf.get("PROTOCOL") + "://" + nconf.get("_vcap_application:application_uris:0")
			+ "/slack-broker/api/v1/messaging/toolchains/"
			+ toolchainId + "/service_instances/" + serviceInstanceId + "/lifecycle_events";
		
		return res.json({toolchain_lifecycle_webhook_url: toolchain_lifecycle_webhook_url}).status(200);			

	});
}

/**
*	Removes the service instance and the list from the service.
**/
function unbindServiceInstance (req, res/*, next*/) {
	var logPrefix = "[" + logBasePath + ".unbindServiceInstance] ";
	var db = req.servicesDb,
	serviceInstanceId = req.params.sid,
	isOrg;

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
				isOrg = isValidOrganization(published.organization_guid, req.user.organizations);

				return (!published._deleted && isOrg);
			})
			.merge(function (published) {
				
				// TODO
				//unregisterPipelineWebhooks(req, published.pipeline_and_webhook_ids);
				//published.pipeline_and_webhook_ids = [];

				return _.extend({ _deleted: true }, published);
			})
			.update(function (err) {
				if (err) {
					logger.error(logPrefix + "Removing the service instance with ID: " +
						serviceInstanceId + " failed with the following error: " + err.toString());
					return res.status(500).json({ "description": "Could not delete service instance: " + err.toString() });
				}
				else if(!isOrg) {
					return res.status(403).json({ "description": "Error: User is not part of the organization." });
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
	toolchainId = req.params.tid,
	isOrg;

	return nanoDocUpdater()
	.db(db)
	.id(serviceInstanceId)
	.existingDoc(null)
	.newDoc(null)
	.shouldUpdate(function (published) {
		isOrg = isValidOrganization(published.organization_guid, req.user.organizations);

		return (published.toolchain_ids.indexOf(toolchainId) !== -1 && isOrg);
	})
	.merge(function (published) {
		published.toolchain_ids = _.without(published.toolchain_ids, toolchainId);
		
		// TODO - Tradeoff as there is only one service instance bind to only one toolchain !
		//unregisterPipelineWebhooks(req, published.pipeline_and_webhook_ids);
		//published.pipeline_and_webhook_ids = [];
		
		return published;
	})
	.update(function (err) {
		if (err) {
			logger.error(logPrefix + "Unbinding the service instance with" +
				" ID: " + serviceInstanceId + " from toolchain ID: " + toolchainId +
				" failed with the following error: " + err.toString());

			return res.status(500).json({ "description": "Could not unbind service instance: " + err.toString() });
		}
		else if(!isOrg) {
			return res.status(403).json({ "description": "Error: User is not part of the organization." });
		}

		return res.status(204).json({});
	});
}

function unbindServiceInstanceFromAllToolchains (req, res/*, next*/) {
	var logPrefix = "[" + logBasePath + ".unbindServiceInstanceFromAllToolchains] ";
	var db = req.servicesDb,
	serviceInstanceId = req.params.sid;

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
		
		// TODO
		//unregisterPipelineWebhooks(req, published.pipeline_and_webhook_ids);
		//published.pipeline_and_webhook_ids = [];
		
		return published;
	})
	.update(function (err) {
		if (err) {
			logger.error(logPrefix + "Unbinding the service instance with" +
				" ID: " + serviceInstanceId + " from all toolchains" +
				" failed with the following error: " + err.toString());

			return res.status(500).json({ "description": "Could not unbind service instance: " + err.toString() });
		}

		res.status(204).json({});
	});
}

/**
* Note: Brokers implementing this check should ideally reference an auth-cache.
* @param orgToValidate - The organization_guid to check the user is a member of.
* @param usersOrgs - An array of organization_guids the user is actually a member of.
**/
function isValidOrganization (orgToValidate, usersOrgs) {

    if (orgToValidate && usersOrgs) {
        for (var i = 0; i < usersOrgs.length; i++) {
            if (usersOrgs[i].guid === orgToValidate) {
                return true;
            }
        }
    }

    return false;
}

function registerPipelineWebhooks(req) {
	var logPrefix = "[" + logBasePath + ".registerPipelineWebhooks] ";
	// Temporary - look if there is a pipeline tool in the toolchain
	// if yes, then create a webhook to be notified of event

	var db = req.servicesDb,
	serviceInstanceId = req.params.sid,
	toolchainId = req.params.tid;
	
	// Check if there is a pipeline tool in the toolchain
	var otc_api_url = nconf.get("services:otc-api");
	
	// sample
	//otc_api_url = "https://otc-api.stage1.ng.bluemix.net/api/v1";
	//toolchainId = "d301d909-0891-466c-aca9-653888e09a9a";
	
	var options = {};
	options.url = otc_api_url + "/toolchains/" + toolchainId + "/services";
	options.headers = {"Authorization" : req.header("Authorization")};
	options.json = true;
	//console.log(JSON.stringify(options));
	request.get(options, function(error, response, body) {
		if (error) {
			logger.error(logPrefix + "Error while getting " + options.url + ":" + error);
		} else if (response.statusCode == 200) {
			var pipeline_instances = _.where(response.body.services, {"service_id":"pipeline"});
			_.each(pipeline_instances, function (pipeline_instance) {
				logger.info(logPrefix + "Registering webhook for pipeline:" + pipeline_instance.instance_id + " - " + pipeline_instance.dashboard_url);
				// Enregistrement d'un webhook sur le webhook manager
				registerPipelineWebhook(req, pipeline_instance);
			});
		} else {
			logger.error(logPrefix + "Error while getting " + options.url + ":" + response.statusCode);			
		}
	});	
}

function registerPipelineWebhook(req, pipeline) {
	var logPrefix = "[" + logBasePath + ".registerPipelineWebhook] ";

	var db = req.servicesDb,
	serviceInstanceId = req.params.sid,
	toolchainId = req.params.tid;

	var url = nconf.get("services:otc-webhook-manager") + 
		"/webhook/" + pipeline.service_id + "/" + pipeline.instance_id + "/outgoing";
	
	var webhook_url = nconf.get("PROTOCOL") + "://" + nconf.get("_vcap_application:application_uris:0");
	webhook_url += "/slack-broker/unsecured/event/v1/pipeline/service_instances/" + serviceInstanceId;

	var webhook = {
		"label" : "temp webhook to slackbroker for pipeline " + pipeline.instance_id,
		"url" : webhook_url,
		"enabled" : true
	}
	
	var options = {};
	options.url = url;
	options.headers = {"Authorization" : req.header("Authorization")};
	options.body = webhook;
	options.json = true;
	
	request.post(options, function(error, response, body) {
		if (error) {
			logger.error(logPrefix + "Error while getting " + options.url + ":" + error);
		} else if (response.statusCode != 201) {
			logger.error(logPrefix + "Error while getting " + options.url + ":" + response.statusCode);			
		} else {
	   		 var tokens = response.headers.location.split("/");
			 var outgoing_webhook_id = tokens.pop();
			 if (outgoing_webhook_id.length==0) {
				 outgoing_webhook_id = tokens.pop();
			 }
			 // Save the outgoing webhook id for future removal
			 // add it to the record with toolchain id
			 var pipeline_and_webhook_id = {
					 "toolchain_id" : toolchainId,
					 "pipeline_id" : pipeline.instance_id,
					 "webhook_id" : outgoing_webhook_id
			 }
			logger.info(logPrefix + "Successfull creation of a Outgoing WebHook instance [" + outgoing_webhook_id + "] for pipeline " + pipeline.instance_id);
			 
			 // push this in the cloudant record for slack broker
			 return nanoDocUpdater()
				.db(db)
				.id(serviceInstanceId)
				.existingDoc(null)
				.newDoc(null)
				.shouldUpdate(function (published) {
					if (published) {
						return true;						
					} else {
						return false;
					}
				})
				.merge(function (published) {
					if (published) {
						published.pipeline_and_webhook_ids.push(pipeline_and_webhook_id);						
					}
					return published;
				})
				.update(function (err) {
					if (err) {
						logger.error(logPrefix + "Registering pipeline and webhook ids for slack broker instance " + serviceInstanceId + " failed with the following error: " + err.toString());
					}
				});
		}
	});
}


function unregisterPipelineWebhooks(req, pipeline_and_webhook_ids) {
	var logPrefix = "[" + logBasePath + ".unregisterPipelineWebhooks] ";
	logger.info(logPrefix + "unregister Pipeline Webhooks for " + JSON.stringify(pipeline_and_webhook_ids));					
	if (pipeline_and_webhook_ids) {
		_.each(pipeline_and_webhook_ids, function(pipeline_and_webhook_id) {
			logger.info(logPrefix + "Deleting webhook for " + JSON.stringify(pipeline_and_webhook_id));					
			var url = nconf.get("services:otc-webhook-manager") + 
			"/webhook/pipeline/" + pipeline_and_webhook_id.pipeline_id + "/outgoing/" + pipeline_and_webhook_id.webhook_id;
			
			var options = {};
			options.url = url;
			options.headers = {"Authorization" : req.header("Authorization")};
			
			request.del(options, function(error, response, body) {
				if (error) {
					logger.error(logPrefix + "Error while deleting " + options.url + ":" + error);
				} else if (response.statusCode != 204) {
					logger.error(logPrefix + "Error while deleting " + options.url + ":" + response.statusCode);
				} else {
					logger.info(logPrefix + "Successul delete of webhook " + options.url);					
				}
			});
		});
	}
}


function changeChannelTopicAndPurpose(api_token, channel_id, toolchainId, authorization) {
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
