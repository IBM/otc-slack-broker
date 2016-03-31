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
	lruCache = require('lru-cache'),
	tiamClient = new TIAMClient(nconf.get("TIAM_URL"), nconf.get("TIAM_CLIENT_ID"), nconf.get("TIAM_CLIENT_SECRET"))
;

var logger = log4js.getLogger("otc-slack-broker"),
	logBasePath = "lib.util.tiam-util"
;

var options =  {
		// TODO
    };

var cache = lruCache(options);


exports.getUserName = getUserName;
exports.getCredentials = getCredentials;

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

function getCredentials(authorizationCredentials, options, callback) {
	var logPrefix = "[" + logBasePath + ".getCredentials] ";

	var credentials = cache.get(authorizationCredentials);
	if (credentials && (!options || options.refresh != true)) {
		logger.info(logPrefix + "Using cached TIAM credentials");
		return callback(null, credentials);
	}
	// Create a new credentials using TIAM Service
	var url = nconf.get("TIAM_URL") + '/service/manage/credentials';
	if (options && options.target) {
		url = url + '?target=' + options.target;
	}
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
            	cache.set(authorizationCredentials, body.target_credentials);
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