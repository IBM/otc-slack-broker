/**
 * Licensed Materials - Property of IBM
 * (c) Copyright IBM Corporation 2015. All Rights Reserved.
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
	logBasePath = 'lib.middleware.fetch-auth';

/*
 * Uses the access token from the Authorization request header to
 * fetch a user's profile.  If the Authorization header is missing
 * or invalid, the fetch will fail.
 *
 * The profile is tacked onto the request as req.user and will be
 * referenced throughout the API calls.
 */
module.exports = function(tiamClient) {
	var logPrefix = '[' + logBasePath + '] ';
	
	return function(req, res, next) {
		var authHeader = req.header('Authorization');

		if (authHeader) {
			// Split header and grab values from it.
			var authHeaderParts = authHeader.split(/\s+/);
			var authPrefix = authHeaderParts[0];
			var authValue = authHeaderParts[1];

			if (String(authPrefix).toLowerCase() === 'bearer') {
				// Note: Brokers implementing this check should ideally reference an auth-cache.
				tiamClient.isAuthenticated(authValue, function(err, statusCode, userInfo) {
					if(statusCode === 200) {
						req.user = userInfo;
						return next();
					} else {
						return res.status(statusCode).json(err);
					}
				});
			} else {
                return res.status(401).json({ message: 'An invalid authorization header was passed in. Get one from ' + nconf.get('uaa:fetchTokenURL') });
            }
		} else {
			return res.status(401).json({ message: 'An invalid authorization header was passed in. Get one from ' + nconf.get('uaa:fetchTokenURL') });
		}
	};
};
