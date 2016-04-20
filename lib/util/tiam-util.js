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
	request = require("request"),
	lruCache = require('lru-cache')
;

var tiamUrl = nconf.get("TIAM_URL");

var logger = log4js.getLogger("otc-slack-broker"),
	logBasePath = "lib.util.tiam-util"
;

var cache = lruCache();


exports.getCredentials = getCredentials;
exports.introspectCredentials = introspectCredentials;

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
                return callback(400, body.error);
            case 401:
            	logger.debug(logPrefix + 'Introspect basic credentials failed. Status code:' + res.statusCode + ', Error: ' + body.error);
                return callback(401, body.error);
            case 500:
            	logger.error(logPrefix + 'Introspect basic credentials failed. Status code:' + res.statusCode + ', Error: ' + body.error);
                return callback(500, body.error);
            default:
                logger.error(logPrefix + 'Introspect basic credentials failed due to an internal ' +
                            'server error. Status code:' + res.statusCode + ', Error: ' + body.error);
                return callback(500, body.error);
        }
    });	
}
