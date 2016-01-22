/*******************************************************************************
 * Licensed Materials - Property of IBM
 * (c) Copyright IBM Corporation 2015. All Rights Reserved.
 *
 * Note to U.S. Government Users Restricted Rights:
 * Use, duplication or disclosure restricted by GSA ADP Schedule
 * Contract with IBM Corp.
 *******************************************************************************/
"use strict";

var nconf = require("nconf"),
    request = require('request'),
    log4js = require("log4js");

var logger = log4js.getLogger("otc-slack-broker"),
    logBasePath = "lib.middleware.tiam-client";

exports.getWhoami = function(token, callback) {
    var logPrefix = "[" + logBasePath + ".getWhoami] ";

    if(!token) {
        logger.error(logPrefix + "Error while calling to TIAM service. Token is not defined.");
        return callback("Error authenticating the request, missing token", 500);
    }

    var TIAM_URL = nconf.get("TIAM_URL"),
        TIAM_CLIENT_ID = nconf.get("TIAM_CLIENT_ID"),
        TIAM_CLIENT_SECRET = nconf.get("TIAM_CLIENT_SECRET"),
        BASE64_CREDENTIALS = new Buffer(TIAM_CLIENT_ID + ":" + TIAM_CLIENT_SECRET).toString('base64');

    var options = {
        url: TIAM_URL + '/whoami?type=bearer&token=' + token,
        headers: {
            Authorization: 'Basic ' + BASE64_CREDENTIALS
        },
        json: true
    };

    request(options, function(error, res, body) {
        var isOk = res && res.statusCode === 200;

        if (error) {
            logger.error(logPrefix + "Error while calling to TIAM service.");
            return callback("Error making request call", 500);
        }

        switch (res.statusCode) {
            case 200:
                if(!body.whoami_lease_expiry) {
                    logger.error(logPrefix + "Unable to find the bearer token lease expiry from TIAM.");
                    return callback({"error" : "There was an error authenticating."}, 500);
                }
                return callback(null, body);
            case 400 :
                logger.error(logPrefix + 'Looking up the TIAM failed due to an invalid ' +
                            'request. This may be due to a malformed token or incorrect ' +
                            'consumer id/secret. Error: ' + body.error);
                return callback(body.error, 500);
            case 401:
                logger.error(logPrefix + 'Looking up the TIAM failed due to an unauthorized ' +
                            'request. Error: ' + body.error);
                return callback(body.error, 401);
            case 403:
                logger.error(logPrefix + 'Looking up the TIAM failed due to a forbidden ' +
                            'request. Error: ' + body.error);
                return callback(body.error, 403);
            case 404:
                logger.error(logPrefix + 'Looking up the TIAM failed due to an invalid ' +
                            'request that is not found. Error: ' + body.error);
                return callback(body.error, 404);
            case 500:
                logger.error(logPrefix + 'Looking up the TIAM failed due to an internal ' +
                            'server error. Error: ' + body.error);
                return callback(body.error, 500);
            default:
                logger.error(logPrefix + 'Looking up the TIAM failed due to an internal ' +
                            'server error. Error: ' + body.error);
                return callback(body.error, 500);
        }
    });
};