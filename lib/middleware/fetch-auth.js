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
	log4js = require('log4js'),
	tiamClient = require('../client/tiam-client');

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
module.exports = function() {
	var logPrefix = '[' + logBasePath + '] ';

	return function(req, res, next) {
		var authHeader = req.header('Authorization');

		if (authHeader) {
			// Split header and grab values from it.
			var authHeaderParts = authHeader.split(/\s+/);
			var authPrefix = authHeaderParts[0];
			var authValue = authHeaderParts[1];

			if (String(authPrefix).toLowerCase() === 'bearer') {
				isAuthenticated(authValue, function(err, statusCode, userInfo) {
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

// Note: Brokers implementing this check should ideally reference an auth-cache.
function isAuthenticated(bearerToken, callback) {
	var logPrefix = '[' + logBasePath + '.isAuthenticated] ';

    if(!bearerToken) {
        logger.error(logPrefix + 'Looking up the user profile failed due to an ' +
                    'undefined bearer token.');
        return callback({'error' : 'There was an error authenticating.'}, 500, null);
    }

	return tiamClient.getWhoami(bearerToken, function(err, r) {
        if (err) {
            logger.error(logPrefix + 'Looking up the user profile from ' +
                'TIAM failed with the following error: ' + JSON.stringify(err));
            return callback(err, r, null);
        }

        if(!r.whoami_lease_expiry) {
            logger.error(logPrefix + 'Unable to find the bearer token lease expiry from TIAM.');
            return callback({'error' : 'There was an error authenticating.'}, 500, null);
        }

        var maxAge = r.whoami_lease_expiry - new Date().valueOf();
        if(maxAge < 0) {
            logger.error(logPrefix + 'The entry returned from TIAM has expired.');
            return callback({'error' : 'There was an error authenticating.'}, 500, null);
        }

        return callback(null, 200, r);
    });
}