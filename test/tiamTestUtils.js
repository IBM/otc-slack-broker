/**
 * Licensed Materials - Property of IBM
 * (c) Copyright IBM Corporation 2015. All Rights Reserved.
 *
 * Note to U.S. Government Users Restricted Rights:
 * Use, duplication or disclosure restricted by GSA ADP Schedule
 * Contract with IBM Corp.
 */
'use strict';

var nconf = require('nconf'),
request = require('request'),
path = require('path'),
tiamClient = require('../lib/middleware/tiam-client')
;

var authenticateTestUserWithTIAM = function(callback, index) {
    var userArray = nconf.get('userArray');
    var userInfo = typeof(index) == 'undefined' ? userArray[0] : userArray[index];
    var loginUrl = nconf.get('uaa:fetchTokenURL');
    var username = userInfo.testusername;
    var password = userInfo.testpassword;
    var authHeader = nconf.get('auth-header');

    var formData = {
        'grant_type': 'password',
        'username': username,
        'password': password
    };
    var basicAuth = 'Basic ' + authHeader;

    var headers = {
        'Authorization': basicAuth,
        'Accept': 'application/json'
    };
    var that = this;
    /* see https://github.com/request/request#requestoptions-callback for API */
    request.post(
        {
            url: loginUrl,
            headers: headers,
            form: formData
        }, function (err, result, body) {
            if (err) {
                console.error('Failed to connect to UAA. ' +
                    'Cause: ', err);
                throw new Error(err);
            }
            body = JSON.parse(body);
            that.accessToken = 'Bearer ' + body.access_token;
            callback(that.accessToken);
        }
    );
};

module.exports = {

    accessToken: undefined,

    authenticateTestUserWithTIAM: authenticateTestUserWithTIAM,

    getProfile: function(accessToken, callback) {
        var bearerPrefix = accessToken.substring(0,6);

        if (bearerPrefix == 'Bearer') {
            accessToken = accessToken.substring(7);
        }

        tiamClient.getWhoami(accessToken, function(err, r) {
            if (err) {
                return callback(err, r);
            }

            callback(null, r);
        });
    }
};
