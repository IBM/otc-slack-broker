/**
 * Licensed Materials - Property of IBM
 * (c) Copyright IBM Corporation 2015, 2015. All Rights Reserved.
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
 slackUtils = require("./slack-utils")
;

var logger = log4js.getLogger("slack-broker"),
 	logBasePath = "lib.middleware.service_instances";

r
.put("/:sid", createOrUpdateServiceInstance)
.put("/:sid/toolchains/:tid", bindServiceInstanceToToolchain)
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
	if (parametersData) {
		api_token = parametersData.api_token;
		channel_id = parametersData.channel_id;
		channel_name = parametersData.channel_name;
		channel_topic = parametersData.channel_topic;
	}
	var parameters = {};
	if (api_token) {
		slackUtils.getSlackUser(api_token, function (err, user) {
			if (err) {
				res.status(400).json({ "description": "Error: Slack API key not valid." });
			}
			parameters.api_token = api_token;
			slackUtils.getOrCreateSlackChannel(api_token, user, channel_id, channel_name, channel_topic, function (err, channel) {
				if (err) {
					logger.error(logPrefix + "Error getting or creating slack channel : " + err.toString());
					res.status(400).json({ "description": "Error: Unable to find or create Slack Channel (" + err.toString() + ")" });							
				} else {
					var dashboardUrl = user.url + "messages/" + channel.name;
					parameters.channel_name = channel.name;
					// TODO invitation des autres membres du projets
					return doServiceUpdate(res, req, db, serviceInstanceId, parameters, channel.id, organizationId, dashboardUrl);							
				}
			});
		});
	} else {
		// Creation Service non complet
		// On utilise serviceInstanceId comme instance_id
		return doServiceUpdate(res, req, db, serviceInstanceId, parameters, "n/a", organizationId, "https://slack.com");
	}	
}

/**
*	Handles updating the service instance with the new properties.
**/
function doServiceUpdate (res, req, db, serviceInstanceId, parametersData, instanceId, organizationId, dashboardUrl) {
	var logPrefix = "[" + logBasePath + ".doServiceUpdate] ";

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
				organization_guid: organizationId
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
				   published.organization_guid !== proposed.organization_guid;
		})
		.update(function (err) {
				if (err) {
					logger.error(logPrefix + "Updating the service instance with" +
						" ID: " + serviceInstanceId + " and parameters: " + parametersData +
						" failed with the following error: " + err.toString());

					res.status(500).json({ "description": err.toString() });
				}

				return res.json({
					instance_id: instanceId,
					dashboard_url: dashboardUrl,
					parameters: parametersData,
					organization_guid: organizationId
				});
			}
		);
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
		return published;
	})
	.update(function (err) {
		if (err) {
			logger.error(logPrefix + "Binding the service instance with" +
				" ID: " + serviceInstanceId + " to toolchain ID: " + toolchainId +
				" failed with the following error: " + err.toString());

			res.status(500).json({ "description": err });
		}
		else if(!isOrg) {
			return res.status(403).json({ "description": "Error: User is not part of the organization." });
		}

		return res.status(204).end();
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
			request.del({
					uri: body.dashboard_url
				}, function(err, reqRes, body) {
					if(err) {
						logger.error(logPrefix + "Unbinding the service instance with" +
							" ID: " + serviceInstanceId + " failed with the following" +
							" error: " + err.toString());

						res.status(500).json({ "description": err.toString() });
						return;
					}

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