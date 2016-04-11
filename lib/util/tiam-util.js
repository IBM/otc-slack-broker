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
	nconf = require("nconf"),
	log4js = require("log4js"),
	TIAMClient = require("node-tiam-client"),
	request = require("request"),
	lruCache = require('lru-cache')
;

var tiamUrl = nconf.get("TIAM_URL");

var	tiamClient = new TIAMClient(tiamUrl, nconf.get("TIAM_CLIENT_ID"), nconf.get("TIAM_CLIENT_SECRET"));

var logger = log4js.getLogger("otc-slack-broker"),
	logBasePath = "lib.util.tiam-util"
;

var cache = lruCache();


exports.getUserName = getUserName;
exports.getCredentials = getCredentials;
exports.introspectCredentials = introspectCredentials;
exports.getServiceData = getServiceData;
exports.setServiceData = setServiceData;

function getUserName(userid, authorization, callback) {
	var logPrefix = "[" + logBasePath + ".getUserName]";
	if (authorization) {
        var bearerPrefix = authorization.substring(0,6);
        if (bearerPrefix.toLowerCase() == 'bearer') {
        	authorization = authorization.substring(7);
        } else {
        	logger.warn(logPrefix + "Type of authorization is not a bearer: " + bearerPrefix);
        	return callback(null, userid);
        }

        // TODO 
        // how to retrieve the username for a given userid !!
        
        tiamClient.getWhoami(authorization, function(err, r) {
            if (err) {
            	// Error in the whoami - just provide the uid
            	logger.warn(logPrefix + "Unable to find username for userid " + userid + " - Error:" + err);
            	return callback(null, userid);
            }
            // TODO Using cache somewhere !
            //console.log(r);
            if (!userid || userid == null) {
            	callback(null, r.user_name)
            } else {
                if (r.user_id == userid) {
                	callback(null, r.user_name);
                } else {
                	logger.warn(logPrefix + "Unable to find username for userid " + userid + " given the bearer token provided");
                	callback(null, userid);
                }            	
            }
        });
	} else {
    	logger.warn(logPrefix + "Unable to find username for userid " + userid + " w/o authoriation token");
		callback(null, userid);				
	}
}

var getCredentialsUrl = tiamUrl + '/service/manage/credentials';

function getCredentials(authorizationCredentials, options, callback) {
	var logPrefix = "[" + logBasePath + ".getCredentials] ";

	var cacheKey = "get:" + authorizationCredentials;
	var url = getCredentialsUrl;
	if (options) {
		if (options.target) {
			url = url + '?target=' + options.target;
			cacheKey = cacheKey + ":" + options.target;
		}
		if (options.toolchain) {
			if (options.target) {
				url = url + '&';
			} else {
				url = url + '?';				
			}
			url = url + 'toolchain=' + options.toolchain;			
			cacheKey = cacheKey + ":" + options.target;
		}
	}
	
	if (!options || options.refresh != true) {
		var credentials = cache.get(cacheKey);
		if (credentials) {
			logger.debug(logPrefix + "Using cached TIAM credentials");
			return callback(null, credentials);
		}
	}
	
	// Create a new credentials using TIAM Service
    var options = {
	        url: url,
	        headers: {
	            Authorization: 'Basic ' + authorizationCredentials
	        },
	        json: true
    };
    
    request.post(options, function(error, res, body) {
        if (error) {
            logger.error(logPrefix + "Error while calling to TIAM service.");
            return callback(500);
        }
        switch (res.statusCode) {
            case 201:
            	// Set the credentials in the cache undefinitively
    			logger.debug(logPrefix + "Set new TIAM credentials in cache");
            	cache.set(cacheKey, body.target_credentials);
                return callback(null, body.target_credentials);
            case 401:
                return callback(401);
            case 500:
                return callback(500);
            default:
                logger.error(logPrefix + 'Introspect basic credentials failed due to an internal ' +
                            'server error. Status code:' + res.statusCode + ', Error: ' + body.error);
                return callback(body.error, 500);
        }
    });	
}

var introspectCredentialsUrl = tiamUrl + '/service/manage/introspect?credentials=';
// Cache userData for 1 hour
var maxAge = 1000* 60 * 60;
function introspectCredentials(authorizationCredentials, credentials, options, callback) {
	var logPrefix = "[" + logBasePath + ".introspectCredentials] ";

	logger.debug(logPrefix + "Introspect credentials");
	
	var cacheKey = "introspect:" + authorizationCredentials + ":" + credentials;
	if (!options || options.refresh != true) {
		var userData = cache.get(cacheKey);
		if (userData) {
			logger.debug(logPrefix + "Using cached userData for given credentials");
			return callback(null, userData);
		}
	}
	
	// Introspect credentials to obtain userData using TIAM Service
    var options = {
        url: introspectCredentialsUrl + credentials,
        headers: {
            Authorization: 'Basic ' + authorizationCredentials
        },
        json: true
    };
    
    request.get(options, function(error, res, body) {
        if (error) {
            logger.error(logPrefix + "Error while calling to TIAM service.");
            return callback(500);
        }
        switch (res.statusCode) {
            case 200:
            	// Set the userData for 1 hour
    			logger.debug(logPrefix + "Set UserData in cache");
            	cache.set(cacheKey, body, maxAge);
                return callback(null, body);
            case 400:
            	logger.error(logPrefix + 'Introspect basic credentials failed. Status code:' + res.statusCode + ', Error: ' + body.error);
                return callback(400);
            case 401:
            	logger.error(logPrefix + 'Introspect basic credentials failed. Status code:' + res.statusCode + ', Error: ' + body.error);
                return callback(401);
            case 500:
            	logger.error(logPrefix + 'Introspect basic credentials failed. Status code:' + res.statusCode + ', Error: ' + body.error);
                return callback(500);
            default:
                logger.error(logPrefix + 'Introspect basic credentials failed due to an internal ' +
                            'server error. Status code:' + res.statusCode + ', Error: ' + body.error);
                return callback(500, body.error);
        }
    });	
}

var serviceDataUrl = tiamUrl + '/service/data/v1';
function getServiceData(serviceCredentials, callback) {
	var logPrefix = "[" + logBasePath + ".getServiceData] ";

    var options = {
        url: serviceDataUrl,
        headers: {
            Authorization: 'Basic ' + serviceCredentials
        },
        json: true
    };
    
    request.get(options, function(error, res, body) {
        if (error) {
            logger.error(logPrefix + "Error while access to TIAM Data Service. " + error);
            return callback(500);
        }
        switch (res.statusCode) {
            case 200:
                return callback(null, body);
            case 401:
                return callback(401);
            case 404:
                return callback(404);
            case 500:
                return callback(500);
            default:
                logger.error(logPrefix + 'Access to TIAM Data Service failed due to an internal ' +
                            'server error. Status code:' + res.statusCode + ', Error: ' + body.error);
                return callback(500, body.error);
        }
    });	
	
}

function setServiceData(serviceCredentials, data, callback) {
	var logPrefix = "[" + logBasePath + ".setServiceData] ";

    var options = {
        url: serviceDataUrl,
        headers: {
            Authorization: 'Basic ' + serviceCredentials,
        },
        body: data,
        json: true
    };
    
    request.post(options, function(error, res, body) {
        if (error) {
            logger.error(logPrefix + "Error while access to TIAM Data Service. " + error);
            return callback(500);
        }
        switch (res.statusCode) {
            case 201:
                return callback();
            case 204:
                return callback();
            case 401:
                return callback(401);
            case 415:
                return callback(415);
            case 500:
                return callback(500);
            default:
                logger.error(logPrefix + 'Access to TIAM Data Service failed due to an internal ' +
                            'server error. Status code:' + res.statusCode + ', Error: ' + body.error);
                return callback(500, body.error);
        }
    });	
	
}
