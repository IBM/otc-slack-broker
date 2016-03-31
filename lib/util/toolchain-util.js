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
 log4js = require("log4js"),
 nconf = require("nconf"),
 _ = require('underscore'),
 request = require("request"),
 tiamUtil = require("../util/tiam-util")
;

var logger = log4js.getLogger("otc-slack-broker"),
	logBasePath = "lib.util.toolchain-util"
;

var otc_api_url = nconf.get("services:otc-api");

var serviceNames = {};


exports.getToolchainName = getToolchainName;
exports.getServiceName = getServiceName;

function getToolchainName(toolchainId, toolchainCredentials, callback) {
	var logPrefix = "[" + logBasePath + ".getToolchainName] ";
	
	tiamUtil.getCredentials(toolchainCredentials, null, function(err, credentials) {
		if (err) {
			logger.error(logPrefix + "No credentials obtained from TIAM : " + err);
			return callback(null, toolchainId);
		}
		return getToolchainName_(toolchainId, credentials, function(err, toolchainName) {
			if (err && err != 401) {
				return callback(null, toolchainId);
			} if (err && err === 401) {
				// TIAM credentials may be stale. Let's retry with a new TIAM
				logger.debug(logPrefix + "Use new TIAM credentials to invoke otc-api");
				return tiamUtil.getCredentials(toolchainCredentials, {refresh: true}, function(err, credentials) {
					if (err) {
						logger.error(logPrefix + "No credentials obtained from TIAM : " + err);
						return callback(null, toolchainId);
					}
					return getToolchainName_(toolchainId, credentials, function(err, toolchainName) {
						if (err) {
							return callback(null, toolchainId);							
						} else {
							return callback(null, toolchainName);
						}
					});
				});
			} else {
				return callback(null, toolchainName);
			}
			
		});
	});
}

function getToolchainName_(toolchainId, credentials, callback) {
	var logPrefix = "[" + logBasePath + ".getToolchainName_] ";
	var options = {};
	options.url = otc_api_url + "/toolchains/" + toolchainId;
	options.headers = {"Authorization" : "Basic " + credentials};
	options.json = true;
	
	logger.debug(logPrefix + "Invoking otc-api to find toolchain name for " + toolchainId);
	request.get(options, function(error, response, body) {
		if (error) {
			logger.error(logPrefix + "Error while getting " + options.url + ":" + error);
			return callback(error);
		} 
		if (response.statusCode == 200) {
			if (body.items.length > 0) {
				return callback(null, body.items[0].name);
			} else {
				logger.error(logPrefix + "No toolchain found at " + options.url + " - no items returned");
				return callback(404);
			}
		} else {
			return callback(response.statusCode);
		}
	});
}

function getServiceName(serviceId, toolchainCredentials, callback) {
	var logPrefix = "[" + logBasePath + ".getServiceName]";
	
	// Put some naive caching here as the number of service is not that much !
	if (!serviceNames[serviceId]) {
		tiamUtil.getCredentials(toolchainCredentials, null, function(err, credentials) {
			if (err) {
				logger.error(logPrefix + "No credentials obtained from TIAM");
				return callback(null, serviceId);
			}
			getServiceName_(serviceId, credentials, function(err, serviceName) {
				if (err && err != 401) {
					return callback(null, serviceId);
				} else if (err && err === 401) {
					// Credentials may have been expired - Let's try again
					return tiamUtil.getCredentials(toolchainCredentials, {refresh: true}, function(err, credentials) {
						if (err) {
							logger.error(logPrefix + "No credentials obtained from TIAM");
							return callback(null, serviceId);
						}
						return getServiceName_(serviceId, credentials, function(err, serviceName) {
							if (err) {
								return callback(null, serviceId);
							} else {
								return callback(null, serviceName);
							}
						});
					});					
				} else {
					return callback(null, serviceName);
				}
			});
		});
	} else {
		// Found in the internal cache
		callback(null, serviceNames[serviceId]);
	}
}

function getServiceName_(serviceId, credentials, callback) {
	var logPrefix = "[" + logBasePath + ".getServiceName]";
	
	var options = {};
	options.url = otc_api_url + "/services";
	options.headers = {"Authorization" : "Basic " + credentials};
	options.json = true;
	request.get(options, function(error, response, body) {
		if (error) {
			logger.error(logPrefix + "Error while getting " + options.url + ":" + error);
			return callback(error);
		}
		if (response.statusCode == 200) {
			 var service = _.find(body.resources, function(resource) {return resource.entity.unique_id == serviceId});
			 if (service && service.metadata && service.metadata.displayName) {
				 var serviceName = service.metadata.displayName;
				 logger.debug(logPrefix + "Service name fetched from otc-api for serviceId:" + serviceId);
				 serviceNames[serviceId] = serviceName;
				 return callback(null, serviceName);
			 } else {
				 return callback(404);
			 }
		} else {
			return callback(response.statusCode);
		}
	});				
}