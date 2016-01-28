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
	tiamClient = require("../client/tiam-client")
;

var logger = log4js.getLogger("otc-slack-broker"),
	logBasePath = "lib.util.tiam-util"
;


exports.getUserName = getUserName;

function getUserName(userid, authorization, callback) {
	var logPrefix = "[" + logBasePath + ".getUserName]";
	if (authorization) {
        var bearerPrefix = authorization.substring(0,6);

        if (bearerPrefix == 'Bearer') {
        	authorization = authorization.substring(7);
        }

        // TODO 
        // how to retrieve the username for a given userid !!
        
        tiamClient.getWhoami(authorization, function(err, r) {
            if (err) {
            	// Error in the whoami - just provide the uid
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