/**
 * Licensed Materials - Property of IBM
 * (c) Copyright IBM Corporation 2015, 2015. All Rights Reserved.
 *
 * Note to U.S. Government Users Restricted Rights:
 * Use, duplication or disclosure restricted by GSA ADP Schedule
 * Contract with IBM Corp.
 */
var nconf = require('nconf'),
    request = require("request"),
    path = require('path'),
    Q = require('q'),
    tiamUtils = require('./tiamTestUtils.js'),
    // testCommon = require('test-common'),
    Slack = require('slack-node'),
    _ = require('underscore'),
    test = require('tape')
;

nconf.env("__");

if (process.env.NODE_ENV) {
    nconf.file('node_env', 'config/' + process.env.NODE_ENV + '.json');
}
nconf.file('test', path.join(__dirname, '..', 'config', 'dev.json'));

// Load in the user information.
nconf.file('testUtils', path.join(__dirname, '..', 'config', 'testUtils.json'));

var header = {
    authorization: "Basic Y2Y6",
    accept: "application/json"
};

var defaultHeaders = {
    'Accept': 'application/json,text/json',
    'Content-Type': 'application/json'
};

var mockServiceInstanceId = "tape" + new Date().getTime();
var mockToolchainId = "c234adsf-111";

var header = {};
var authenticationTokens = [];
var mockUserArray = [];

var slack_channel = {};
slack_channel.name = "tape_bot" + new Date().valueOf();
slack_channel.topic = "Slack Channel for Tape Test of OTC-Slack-Broker";

var slack = new Slack(nconf.get("slack-token"));

test('Slack Broker - Test Setup', function (t) {
    mockUserArray = nconf.get('userArray');

    t.plan(mockUserArray.length * 2);

    for(var i = 0; i < mockUserArray.length; i++) (function(i) {
        tiamUtils.authenticateTestUserWithTIAM (function(accessToken) {
            tiamUtils.getProfile (accessToken, function(err, profile) {
                t.equal(err, null, 'Was authenticate test user with TIAM successful?');
                authenticationTokens[i] = accessToken;
                if(typeof authenticationTokens[0] !== 'undefined' && i === 0) {
                    header.Authorization = authenticationTokens[0];
                }
                t.pass('Authentication succeeded for mock user: ' + mockUserArray[i].testusername);
            });
        }, i);
    } (i));
});

// Authentication testing
test('Slack Broker - Test Authentication', function (t) {
    t.plan(4);

    var url = nconf.get('url') + '/slack-broker/api/v1/service_instances/' + mockServiceInstanceId;
    var body = {
        'service_id': 'slack',
        'organization_guid': nconf.get('test_app_org_guid')
    };
    var auth = {
        'Authorization': ''
    };

    putRequest(url, {header: null, body: JSON.stringify(body)})
        .then(function(resultNoHeader) {
            t.equal(resultNoHeader.statusCode, 401, 'did the authentication request with no Auth header fail?');

            putRequest(url, {header: auth, body: JSON.stringify(body)})
                .then(function(resultNoToken) {
                    t.equal(resultNoToken.statusCode, 401, 'did the authentication request with an empty Auth header fail?');
                });
                auth.Authorization = 'token';
                putRequest(url, {header: auth, body: JSON.stringify(body)})
                    .then(function(resultNoBearer) {
                        t.equal(resultNoBearer.statusCode, 401, 'did the authentication request with no bearer in the Auth header fail?');
                    });
                    auth.Authorization = 'BEARER token';
                    putRequest(url, {header: auth, body: JSON.stringify(body)})
                    .then(function(resultInvalidToken) {
                        t.equal(resultInvalidToken.statusCode, 401, 'did the authentication request an invalid token in the Auth header fail?');
                    });
    });
});

test('Slack Broker - Test PUT instance', function (t) {
    t.plan(5);

    var url = nconf.get('url') + '/slack-broker/api/v1/service_instances/' + mockServiceInstanceId;
    var body = {};

    putRequest(url, {header: header, body: null})
        .then(function(resultNoBody) {
            t.equal(resultNoBody.statusCode, 400, 'did the put instance call with no body fail?');
            body.service_id = 'slack';

            putRequest(url, {header: header, body: JSON.stringify(body)})
                .then(function(resultNoOrg) {
                    t.equal(resultNoOrg.statusCode, 400, 'did the put instance call with no service id fail?');
                    body.organization_guid = nconf.get('test_app_org_guid');
                                        
                    body.parameters = {
                    	api_token: nconf.get("slack-token"),
                    	channel_name: slack_channel.name.replace("bot", "bis"),
                    	channel_topic: slack_channel.topic
                    }
                    
                    //t.comment(slack_channel.name);
                    
                    putRequest(url, {header: header, body: JSON.stringify(body)})
                        .then(function(results) {
                            t.equal(results.statusCode, 200, 'did the put instance call succeed?');
                            t.ok(results.body.instance_id, 'did the put instance call return an instance_id?');
                            slack_channel.id = results.body.instance_id;
                            
                            //t.comment("channel.id is " + slack_channel.id);
                            
                            // Ensure Slack Channel has been created
                            slack.api("channels.info", {channel: slack_channel.id}, function(err, response) {
                            	if (err) {
                            		t.end(err)
                            	} else if (!response.ok) {
                            		t.fail(response.error);
                            	} else {
                                	t.ok(response.ok, 'did the slack channel got created appropriately?')                            		
                            	}
                            });                            
                        });
                });
    });
});

test('Slack Broker - Test PUT update instance w/o parameters', function (t) {
    t.plan(1);

    var body = {
        'service_id': 'slack',
        'organization_guid': nconf.get('test_app_org_guid'),
        'parameters' : ''
    };

    var url = nconf.get('url') + '/slack-broker/api/v1/service_instances/' + mockServiceInstanceId;
    putRequest(url, {header: header, body: JSON.stringify(body)})
        .then(function(resultFromPut) {
            t.equal(resultFromPut.statusCode, 400, 'did the put instance call failed?');
    });
});

test('Slack Broker - Test PATCH update instance with channel_name', function (t) {
    t.plan(3);
	
    var body = {
        'service_id': 'slack',
        'organization_guid': nconf.get('test_app_org_guid'),
        'parameters' : {
        	channel_name: slack_channel.name        	
        }
    };

    var url = nconf.get('url') + '/slack-broker/api/v1/service_instances/' + mockServiceInstanceId;
    patchRequest(url, {header: header, body: JSON.stringify(body)})
        .then(function(resultFromPatch) {
        	//t.comment(JSON.stringify(resultFromPatch));
            t.equal(resultFromPatch.statusCode, 200, 'did the patch instance call succeed?');
            //t.comment(JSON.stringify(slack_channel));
            t.notEqual(resultFromPatch.body.instance_id, slack_channel.id, 'did the put instance call return the appropriate channel id?');
            slack_channel.id_bis = slack_channel.id; 
            slack_channel.id = resultFromPatch.body.instance_id;
            // Ensure Slack Channel has been created
            slack.api("channels.info", {channel: slack_channel.id}, function(err, response) {
            	if (err) {
            		t.end(err);
            	} else if (!response.ok) {
            		t.fail(response.error);
            	} else {
                	t.ok(response.ok, 'did the slack channel got created appropriately?')                            		
            	}
            });                            
    });    				
});

test('Slack Broker - Test PUT update instance with channel_id (archived channel)', function (t) {
    t.plan(3);

    // archive the channel
    slack.api("channels.archive", {channel: slack_channel.id}, function(error, response) {
    	if (error) {
    		t.end(error)
    	} else {
    		if (!response.ok) {
    			t.fail(response.error);
    		} else {
    		    var body = {
		            'service_id': 'slack',
		            'organization_guid': nconf.get('test_app_org_guid'),
		            'parameters' : {
		            	api_token: nconf.get("slack-token"),
		            	channel_id: slack_channel.id        	
		            }
		        };

		        var url = nconf.get('url') + '/slack-broker/api/v1/service_instances/' + mockServiceInstanceId;
		        putRequest(url, {header: header, body: JSON.stringify(body)})
		            .then(function(resultFromPut) {
		                t.equal(resultFromPut.statusCode, 200, 'did the put instance call succeed?');
		                t.equal(resultFromPut.body.instance_id, slack_channel.id, 'did the put instance call return the appropriate channel id?');
                        // Ensure Slack Channel has been created
                        slack.api("channels.info", {channel: slack_channel.id}, function(err, response) {
                        	if (err) {
                        		t.end(err);
                        	} else if (!response.ok) {
                        		t.fail(response.error);
                        	} else {
                            	t.ok(!response.channel.is_archived, 'did the slack channel get unarchived?');
                        	}
                        });                            
		        });    			
    		}
    	}
    });
    
});


test('Slack Broker - Test PUT update instance w/ an invalid org id', function (t) {
    t.plan(2);

    var body = {
        'service_id': 'slack'
    };

    var url = nconf.get('url') + '/slack-broker/api/v1/service_instances/' + mockServiceInstanceId;
    putRequest(url, {header: header, body: JSON.stringify(body)})
        .then(function(resultFromPut) {
            t.equal(resultFromPut.statusCode, 400, 'did the put instance call fail with no organization_guid?');
            body.organization_guid = 'invalid';
            putRequest(url, {header: header, body: JSON.stringify(body)})
                .then(function(resultFromUpdate) {
                   t.equal(resultFromUpdate.statusCode, 403, 'did the put instance call fail when the user is not part of the orginization?');
                });
    });
});


test('Slack Broker - Test PUT bind instance to toolchain', function (t) {
    t.plan(2);

    var url = nconf.get('url') + '/slack-broker/api/v1/service_instances/' + mockServiceInstanceId + '/toolchains/'+ mockToolchainId;
    putRequest(url, {header: header})
        .then(function(resultsFromBind) {
        	if (resultsFromBind.statusCode == 200) {
                t.equal(resultsFromBind.statusCode, 200, 'did the bind instance to toolchain call succeed?');
                //t.comment(JSON.stringify(resultsFromBind));
                if (_.isString(resultsFromBind.body.toolchain_lifecycle_webhook_url)) {
                    t.ok(resultsFromBind.body.toolchain_lifecycle_webhook_url, 'did the toolchain_lifecycle_webhook_url value returned and valid ?');            	
                } else {
                    t.notOk(resultsFromBind.body.toolchain_lifecycle_webhook_url, 'is not a valid returned url for toolchain_lifecycle_webhook_url ?');            	
                }        		
        	} else {
                t.equal(resultsFromBind.statusCode, 204, 'did the bind instance to toolchain call succeed (204)?');
                t.equal(resultsFromBind.statusCode, 204, 'did the bind instance to toolchain call succeed (204)?');
        	}
    });
});

/*
 * TODO Workaround comme seulement un user valide pour l'instant
test('Slack Broker - Test PUT bind instance to toolchain w/ other org', function (t) {
    t.plan(1);
    var auth = {
        'Authorization': authenticationTokens[1]
    };

    var url = nconf.get('url') + '/slack-broker/api/v1/service_instances/' + mockServiceInstanceId + '/toolchains/'+ mockToolchainId;
    putRequest(url, {header: auth})
        .then(function(resultsFromBind) {
            t.equal(resultsFromBind.statusCode, 403, 'did the instance with other org fail to bind to toolchain?');
    });
});


test('Slack Broker - Test DELETE instance w/ other org', function (t) {
    t.plan(1);
    var auth = {
        'Authorization': authenticationTokens[1]
    };

    var url = nconf.get('url') + '/slack-broker/api/v1/service_instances/' + mockServiceInstanceId;
    delRequest(url, {header: auth})
        .then(function(resultsFromDel) {
            t.equal(resultsFromDel.statusCode, 403, 'did the instance with other org fail to delete?');
    });
});
*/

test('Slack Broker - Test DELETE instance', function (t) {
    t.plan(1);

    var url = nconf.get('url') + '/slack-broker/api/v1/service_instances/' + mockServiceInstanceId;
    delRequest(url, {header: header})
        .then(function(resultsFromDel) {
            t.equal(resultsFromDel.statusCode, 204, 'did the delete instance call succeed?');
    });
});


// Unbind tests, the service instance will still remain in the DB
/* TODO Workaround comme un seul userid valide!
test('Slack Broker - Test DELETE unbind instance from toolchain w/ other org', function (t) {
    t.plan(5);

    var body = {
        'service_id': 'slack',
        'organization_guid': nconf.get('test_app_org_guid'),
        'parameters' : {
        	api_token: nconf.get("slack-token"),
        	channel_id: slack_channel.id        	
        }
    };
    var auth = {
        'Authorization': authenticationTokens[1]
    };

    var url = nconf.get('url') + '/slack-broker/api/v1/service_instances/' + mockServiceInstanceId;
    putRequest(url, {header: header, body: JSON.stringify(body)})
        .then(function(resultFromPut) {
            t.equal(resultFromPut.statusCode, 200, 'did the put instance call succeed?');
            t.ok(resultFromPut.body.instance_id, 'did the put instance call return an instance_id?');

            putRequest(url + '/toolchains/'+ mockToolchainId, {header: header})
                .then(function(resultsFromBind) {
                    t.equal(resultsFromBind.statusCode, 204, 'did the bind instance to toolchain call succeed?');

                    delRequest(url + '/toolchains/'+ mockToolchainId, {header: auth})
                        .then(function(resultsFromDel) {
                            t.equal(resultsFromDel.statusCode, 403, 'did the unbind instance call with other org fail?');

                            delRequest(url, {header: header})
                                .then(function(resultsFromDel) {
                                    t.equal(resultsFromDel.statusCode, 204, 'did the delete instance call succeed?');
                            });
                    });
            });
    });
});
*/

test('Slack Broker - Test DELETE unbind instance from toolchain', function (t) {
    t.plan(5);

    var body = {
        'service_id': 'slack',
        'organization_guid': nconf.get('test_app_org_guid'),
        'parameters' : {
        	api_token: nconf.get("slack-token"),
        	channel_id: slack_channel.id        	
        }
    };

    var url = nconf.get('url') + '/slack-broker/api/v1/service_instances/' + mockServiceInstanceId;
    putRequest(url, {header: header, body: JSON.stringify(body)})
        .then(function(resultFromPut) {
            t.equal(resultFromPut.statusCode, 200, 'did the put instance call succeed?');
            t.ok(resultFromPut.body.instance_id, 'did the put instance call return an instance_id?');

            putRequest(url + '/toolchains/'+ mockToolchainId, {header: header})
                .then(function(resultsFromBind) {
                    t.equal(resultsFromBind.statusCode, 204, 'did the bind instance to toolchain call succeed?');

                    delRequest(url + '/toolchains/'+ mockToolchainId, {header: header})
                        .then(function(resultsFromDel) {
                            t.equal(resultsFromDel.statusCode, 204, 'did the unbind instance call succeed?');

                            delRequest(url, {header: header})
                                .then(function(resultsFromDel) {
                                    t.equal(resultsFromDel.statusCode, 204, 'did the delete instance call succeed?');
                            });
                    });
            });
    });
});

test('Slack Broker - Archive Test Slack Channel', function(t) {
	// This is only to have a kind of cleanup
	t.plan(2);
    slack.api("channels.archive", {channel: slack_channel.id}, function(err, response) {
    	if (err) {
    		t.end(err);
    	} else if (!response.ok) {
    		t.fail(response.error);
    	} else {
        	t.ok(response.ok, 'did the slack channel get archived for deletion?');
    	}
    });                            
    slack.api("channels.archive", {channel: slack_channel.id_bis}, function(err, response) {
    	if (err) {
    		t.end(err);
    	} else if (!response.ok) {
    		t.fail(response.error);
    	} else {
        	t.ok(response.ok, 'did the slack channel get archived for deletion?');
    	}
    });                            
});

// Monitoring endpoints
test('Slack Broker - Test GET status', function (t) {
    t.plan(1);

    var url = nconf.get('url') + '/status';
    getRequest(url, {header: null})
        .then(function(results) {
            t.equal(results.statusCode, 200, 'did the get status call succeed?');
    });
});

test('Slack Broker - Test GET version', function (t) {
    t.plan(1);

    var url = nconf.get('url') + '/version';
    getRequest(url, {header: null})
        .then(function(results) {
            // Try to get the build number from the pipeline environment variables, otherwise the value is undefined.
            var buildID = process.env.BUILD_NUMBER;
            if(buildID) {
                t.equal(JSON.parse(results.body).build, buildID, 'did the get version call succeed?');
            } else {
                t.equal(results.statusCode, 200, 'did the get version call succeed?');
            }
    });
});


// Utility functions

function initializeRequestParams(url, options) {

    var outputObject = {};
    outputObject.headers = JSON.parse(JSON.stringify(defaultHeaders)); //clone without reference

    var header = options.header;

    for(var key in header)  {
        outputObject.headers[key] = header[key];
    }

    if (options.body !== null)    {

        outputObject.json = true;

        outputObject.body = options.body;
    }

    var params = request.initParams(url, outputObject);
    return params;
}

function delRequest(url, options) {
    var params = initializeRequestParams(url, options);

    var del = Q.nbind(request.del, this);
    return del(params.uri, {headers: params.headers})
        .then(function(res) {
            if(res[1]) {
                   return {
                    "statusCode": res[0].statusCode,
                    "body": JSON.parse(res[1])
                };
            } else {
                return {
                    "statusCode": res[0].statusCode
                };
            }
        });
}

function getRequest(url, options) {
    var params = initializeRequestParams(url, options);

    var get = Q.nbind(request.get, this);
    return get(params.uri, {headers: params.headers})
        .then(function(res) {
            if(res[1]) {
                // The /status endpoint doesn't return JSON so
                // the body isn't parsed.
                return {
                    "statusCode": res[0].statusCode,
                    "body": res[1]
                };
            } else {
                return {
                    "statusCode": res[0].statusCode
                };
            }
        });
}

function putRequest(url, options) {
    var params = initializeRequestParams(url, options);

    var put = Q.nbind(request.put, this);
    return put(params.uri, {body: params.body, headers: params.headers})
        .then(function(res) {
            if(res[1]) {
                   return {
                    "statusCode": res[0].statusCode,
                    "body": JSON.parse(res[1])
                };
            } else {
                return {
                    "statusCode": res[0].statusCode
                };
            }
        });
}

function patchRequest(url, options) {
    var params = initializeRequestParams(url, options);

    var patch = Q.nbind(request.patch, this);
    return patch(params.uri, {body: params.body, headers: params.headers})
        .then(function(res) {
            if(res[1]) {
                   return {
                    "statusCode": res[0].statusCode,
                    "body": JSON.parse(res[1])
                };
            } else {
                return {
                    "statusCode": res[0].statusCode
                };
            }
        });
}