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
var mockToolchainId = "06178d7e-cf36-4a80-ad82-8c9f428f3ea9";

var header = {};
var organization_guid = null;
var authenticationTokens = [];
var mockUserArray = [];

var slack_channel = {};
var now = new Date();
slack_channel.name = "tape_bot" + (now.getFullYear() - 2000) + "" + now.getMonth() + "" + now.getDate() + "-";
slack_channel.name += now.getHours() + "" + now.getMinutes() + "" + now.getSeconds();
//slack_channel.topic = "Slack Channel for Tape Test of OTC-Slack-Broker";

var event_endpoints = {};

var mockUserArray = nconf.get('userArray');

var slack = new Slack(nconf.get("slack-token"));

test('Slack Broker - Test Setup', function (t) {

    t.plan(mockUserArray.length * 2);

    for(var i = 0; i < mockUserArray.length; i++) (function(i) {
        tiamUtils.authenticateTestUserWithTIAM (function(accessToken) {
            tiamUtils.getProfile (accessToken, function(err, profile) {
                t.equal(err, null, 'Was authenticate test user with TIAM successful?');
                authenticationTokens[i] = accessToken;
                if(typeof authenticationTokens[0] !== 'undefined' && i === 0) {
                    header.Authorization = authenticationTokens[0];
                    organization_guid = mockUserArray[i].organization_guid;
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
        'organization_guid': organization_guid
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
                    body.organization_guid = organization_guid;
                                        
                    body.parameters = {
                    	api_token: nconf.get("slack-token"),
                    	channel_name: slack_channel.name.replace("bot", "bis"),
                    	//channel_topic: slack_channel.topic
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
        'organization_guid': organization_guid,
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


test('Slack Broker - Test PUT bind instance to toolchain', function (t) {
    t.plan(2);

    var url = nconf.get('url') + '/slack-broker/api/v1/service_instances/' + mockServiceInstanceId + '/toolchains/'+ mockToolchainId;
    putRequest(url, {header: header})
        .then(function(resultsFromBind) {
            t.equal(resultsFromBind.statusCode, 200, 'did the bind instance to toolchain call succeed?');
            //t.comment(JSON.stringify(resultsFromBind));
            if (_.isString(resultsFromBind.body.toolchain_lifecycle_webhook_url)) {
                t.ok(resultsFromBind.body.toolchain_lifecycle_webhook_url, 'did the toolchain_lifecycle_webhook_url value returned and valid ?');
                event_endpoints.toolchain_lifecycle_webhook_url = resultsFromBind.body.toolchain_lifecycle_webhook_url;
            } else {
                t.notOk(resultsFromBind.body.toolchain_lifecycle_webhook_url, 'is not a valid returned url for toolchain_lifecycle_webhook_url ?');            	
            }
    });
});

test('Slack Broker - Test Messaging Store Like Event', function (t) {
	t.plan(1);
	
	// Message Store Event endpoint
	var messagingEndpoint = nconf.get('url') + '/slack-broker/api/v1/messaging/accept';

	// Simulate a Pipeline event
	var message_store_pipeline_event = require("./ms_pipeline_stage_started");
	message_store_pipeline_event.toolchain_id = mockToolchainId;
	message_store_pipeline_event.instance_id = mockServiceInstanceId;
	
    postRequest(messagingEndpoint, {header: header, body: JSON.stringify(message_store_pipeline_event)})
        .then(function(resultFromPost) {
            t.equal(resultFromPost.statusCode, 204, 'did the message store like event sending call succeed?');
        });	
	
});

test('Slack Broker - Test Toolchain Lifecycle Bind Event', function (t) {
	t.plan(1);
	
	var lifecycle_event = {
			"toolchain_guid": "c2c18129-cac8-4368-a27e-46b5bd75284c",
			"event": "bind",
			"services": [{
				"_id": "acbc82b3-4053-4218-9f20-6d8a0c82e3dfslack",
				"uuid": "39a9cc32-0525-4f84-bb09-18242b3beedfservice8",
				"service_id": "slack",
				"description": "Coordinate your project and collaborate with project members on Slack",
				"url": "http://localhost:3900/slack-broker/api",
				"tags": ["culture",
				"deliver",
				"productivity"],
				"dashboard_url": "https://jauninb.slack.com/messages/channel-test-ui",
				"parameters": {
					"api_token": "xoxp-13948444357-13953293954-13959136117-fb748ccba5",
					"channel_name": "channel-test-ui",
					"label": "#channel-test-ui"
				},
				"organization_guid": "8d34d127-d3db-43cd-808b-134b388f1646"
			},
			{
				"_id": "acbc82b3-4053-4218-9f20-6d8a0c82e3dfslack...",
				"uuid": "39a9cc32-0525-4f84-bb09-18242b3beedfservice8..",
				"service_id": "slack",
				"description": "Coordinate your project and collaborate with project members on Slack",
				"url": "http://localhost:3900/slack-broker/api",
				"tags": ["culture",
				"deliver",
				"productivity"],
				"dashboard_url": "https://jauninb.slack.com/messages/channel-test-ui",
				"parameters": {
					"api_token": "xoxp-13948444357-13953293954-13959136117-fb748ccba5",
					"channel_name": "channel-test-ui-2",
					"label": "#channel-test-ui-2"
				},
				"organization_guid": "8d34d127-d3db-43cd-808b-134b388f1646"
			}]
		};
	
	// Simulate a Toolchain Lifecycle event
    postRequest(event_endpoints.toolchain_lifecycle_webhook_url, {header: header, body: JSON.stringify(lifecycle_event)})
        .then(function(resultFromPost) {
            t.equal(resultFromPost.statusCode, 204, 'did the toolchain lifecycle event sending call succeed?');
        });	
	
});

test('Slack Broker - Test Toolchain Lifecycle Provision Event', function (t) {
	t.plan(1);
	
	var lifecycle_event = {
			"toolchain_guid": "36b128ee-c679-4d67-b1f0-cf8f2ce8b4dc",
			"event": "provision",
			"services": [{
				"instance_id": "2858ead1-cb15-4916-91f3-5b3da4c5a5b6",
				"parameters": {
					"api_token": "xoxp-13948444357-13953293954-13959136117-fb748ccba5",
					"channel_name": "bjntest-19-bis",
					"label": "#bjntest-19-bis"
				},
				"organization_guid": "8d34d127-d3db-43cd-808b-134b388f1646",
				"state": {
					"status": "configured"
				},
				"dashboard_url": "https://jauninb.slack.com/messages/channel-bjntest-19",
				"service_id": "slack",
				"url": "https://otc-slack-broker.stage1.ng.bluemix.net/slack-broker/api",
				"_id": "acbc82b3-4053-4218-9f20-6d8a0c82e3dfslack",
				"metadata": {
					"parameters": {
						"api_token": {
							"title": "Slack API authentication token",
							"description": "Type your API authentication token. You can find your token in the Web API section of the Slack API website.",
							"type": "string",
							"required": "true"
						},
						"channel_name": {
							"title": "Slack channel",
							"description": "Type the name of the Slack channel to post messages to. If you want messages to be posted to a new channel, type a new name. Slack will create the channel and invite you to it.",
							"type": "string",
							"required": "true"
						}
					}
				},
				"toolchain_binding": {
					"status": "configured",
					"webhook_id": "c4b9d4da39d5c8d7259086e76520b4b0"
				}
			}]
		};
	
	// Simulate a Toolchain Lifecycle event
    postRequest(event_endpoints.toolchain_lifecycle_webhook_url, {header: header, body: JSON.stringify(lifecycle_event)})
        .then(function(resultFromPost) {
            t.equal(resultFromPost.statusCode, 204, 'did the toolchain lifecycle event sending call succeed?');
        });	
	
});

test('Slack Broker - Test Toolchain Lifecycle Unbind Event', function (t) {
	t.plan(1);
	
	var lifecycle_event = {
			"toolchain_guid": "c2c18129-cac8-4368-a27e-46b5bd75284c",
			"event": "unbind",
			"services": [{
				"_id": "acbc82b3-4053-4218-9f20-6d8a0c82e3dfslack",
				"uuid": "39a9cc32-0525-4f84-bb09-18242b3beedfservice8",
				"service_id": "slack",
				"description": "Coordinate your project and collaborate with project members on Slack",
				"url": "http://localhost:3900/slack-broker/api",
				"tags": ["culture",
				"deliver",
				"productivity"],
				"dashboard_url": "https://jauninb.slack.com/messages/channel-test-ui",
				"parameters": {
					"api_token": "xoxp-13948444357-13953293954-13959136117-fb748ccba5",
					"channel_name": "channel-test-ui",
					"label": "#channel-test-ui"
				},
				"organization_guid": "8d34d127-d3db-43cd-808b-134b388f1646"
			}]
		};
	
	// Simulate a Toolchain Lifecycle event
    postRequest(event_endpoints.toolchain_lifecycle_webhook_url, {header: header, body: JSON.stringify(lifecycle_event)})
        .then(function(resultFromPost) {
            t.equal(resultFromPost.statusCode, 204, 'did the toolchain lifecycle event sending call succeed?');
        });	
	
});

test('Slack Broker - Test Bad Event payload', function (t) {
	t.plan(3);
	
	// Message Store Event endpoint
	var messagingEndpoint = nconf.get('url') + '/slack-broker/api/v1/messaging/accept';

	// Simulate a Pipeline event
	// Empry Payload
	var event = {};
    postRequest(messagingEndpoint, {header: header, body: JSON.stringify(event)})
    .then(function(resultFromPost) {
        t.equal(resultFromPost.statusCode, 400, 'did the bad event payload (1) sending call failed?');
    });	
	
    // Minimal payload 2
    event.service_id = "n/a";
    event.toolchain_id = mockToolchainId;
    event.instance_id = mockServiceInstanceId;
    event.payload = {};
    postRequest(messagingEndpoint, {header: header, body: JSON.stringify(event)})
    .then(function(resultFromPost) {
        t.equal(resultFromPost.statusCode, 204, 'did the bad event payload (2) sending call succeed?');
    });	

    // Minimal payload 3
    event.service_id = "pipeline";
    event.payload.pipeline = {};
    event.payload.pipeline.event="n/a";
    postRequest(messagingEndpoint, {header: header, body: JSON.stringify(event)})
    .then(function(resultFromPost) {
        t.equal(resultFromPost.statusCode, 204, 'did the bad event payload (3) sending call succeed?');
    });	
    
});


test('Slack Broker - Test PUT update instance with channel_id (archived channel)', function (t) {
    t.plan(3);

    // archive the channel
    slack.api("channels.archive", {channel: slack_channel.id_bis}, function(error, response) {
    	if (error) {
    		t.end(error)
    	} else {
    		if (!response.ok) {
    			t.fail(response.error);
    		} else {
    		    var body = {
		            'service_id': 'slack',
		            'organization_guid': organization_guid,
		            'parameters' : {
		            	api_token: nconf.get("slack-token"),
		            	channel_id: slack_channel.id_bis        	
		            }
		        };

		        var url = nconf.get('url') + '/slack-broker/api/v1/service_instances/' + mockServiceInstanceId;
		        putRequest(url, {header: header, body: JSON.stringify(body)})
		            .then(function(resultFromPut) {
		                t.equal(resultFromPut.statusCode, 200, 'did the put instance call succeed?');
		                t.equal(resultFromPut.body.instance_id, slack_channel.id_bis, 'did the put instance call return the appropriate channel id?');
                        // Ensure Slack Channel has been created
                        slack.api("channels.info", {channel: slack_channel.id_bis}, function(err, response) {
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

test('Slack Broker - Test DELETE instance', function (t) {
    t.plan(1);

    var url = nconf.get('url') + '/slack-broker/api/v1/service_instances/' + mockServiceInstanceId;
    delRequest(url, {header: header})
        .then(function(resultsFromDel) {
            t.equal(resultsFromDel.statusCode, 204, 'did the delete instance call succeed?');
    });
});


// Unbind tests, the service instance will still remain in the DB
test('Slack Broker - Test DELETE unbind instance from toolchain w/ other org', function (t) {
    t.plan(5);

    var body = {
        'service_id': 'slack',
        'organization_guid': organization_guid,
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
                    t.equal(resultsFromBind.statusCode, 200, 'did the bind instance to toolchain call succeed?');

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


test('Slack Broker - Test DELETE unbind instance from toolchain', function (t) {
    t.plan(5);

    var body = {
        'service_id': 'slack',
        'organization_guid': organization_guid,
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
                    t.equal(resultsFromBind.statusCode, 200, 'did the bind instance to toolchain call succeed?');

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

function postRequest(url, options) {
    var params = initializeRequestParams(url, options);

    var post = Q.nbind(request.post, this);
    return post(params.uri, {body: params.body, headers: params.headers})
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
