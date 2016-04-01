/**
 * Licensed Materials - Property of IBM
 * (c) Copyright IBM Corporation 2016. All Rights Reserved.
 *
 * Note to U.S. Government Users Restricted Rights:
 * Use, duplication or disclosure restricted by GSA ADP Schedule
 * Contract with IBM Corp.
 */
'use strict';

var
	nconf = require('nconf'),
	util = require('util'),
	log4js = require('log4js')
;

var logger = log4js.getLogger("otc-slack-broker"),
	logBasePath = 'lib.middleware.check-otc-api-auth';

/*
 * Check the OTC API Auth - ie basic auth with id and broker secret in it
 */
module.exports = function checkOtcApiAuth(req, res, next) {
	var logPrefix = "[" + logBasePath + ".checkOtcApiAuth] ";
	// Check the Basic header of the request
	var authHeader = req.header('Authorization');
	if (authHeader) {
		// Split header and grab values from it.
		var authHeaderParts = authHeader.split(/\s+/);
		var authPrefix = String(authHeaderParts[0]).toLowerCase();
		var authValue = authHeaderParts[1];
		if (authPrefix === 'basic') {
			// Check if the id and secret are matching ours
			var id;
			var secret;
			try {
				var creds = new Buffer(authValue, 'base64').toString('ascii').split(":");
				id = creds[0];
				secret = creds[1];
			} catch (ex) {
			}
			logger.debug(logPrefix + "Basic Credentials service_id: " + id + ", expected: " + nconf.get("TIAM_CLIENT_ID"));
			logger.debug(logPrefix + "Basic Credentials broker_secret: " + secret + ", expected: " + nconf.get("OTC_API_BROKER_SECRET"));
			if (id != nconf.get("TIAM_CLIENT_ID") || secret != nconf.get("OTC_API_BROKER_SECRET")) {
				logger.debug(logPrefix + "Invalid Basic Credentials provided");
				return res.status(401).json({ message: 'An invalid authorization header was passed in.' });
			}
			return next();
		} else {
			// Any other cred are valid - temporary 
			return next();
		}
	}
	return res.status(401).json({ message: 'An invalid authorization header was passed in.' });
}
