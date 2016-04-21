/**
 * Licensed Materials - Property of IBM
 * (c) Copyright IBM Corporation 2015, 2016. All Rights Reserved.
 *
 * Note to U.S. Government Users Restricted Rights:
 * Use, duplication or disclosure restricted by GSA ADP Schedule
 * Contract with IBM Corp.
 */
var 
	async = require('async'),
	nconf = require('nconf'),
    path = require('path'),
    Q = require('q'),
    request = require("request"),
	slackClient = require("../lib/client/slack-client"),
    Slack = require('slack-node'),
    test = require('tape'),
    _ = require('underscore')
;

nconf.env("__");

if (process.env.NODE_ENV) {
    nconf.file('node_env', 'config/' + process.env.NODE_ENV + '.json');
}
nconf.file('test', path.join(__dirname, '..', 'config', 'dev.json'));

// Load in the user information.
nconf.file('testUtils', path.join(__dirname, '..', 'config', 'testUtils.json'));

var defaultHeaders = {
    'Accept': 'application/json,text/json',
    'Content-Type': 'application/json'
};

var mockServiceInstanceId = "tape" + new Date().getTime();
var mockToolchainId = "2e538e2e-b01a-45f1-8a4d-97311ce8ec0b";

var tiamCredentials = {};

var header = {};
var organization_guid = "some uuid";

var slack_channel = {};
var now = new Date();
slack_channel.name = "tape_bot" + (now.getFullYear() - 2000) + pad(now.getMonth()) + pad(now.getDate()) + "-";
slack_channel.name += pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
//slack_channel.topic = "Slack Channel for Tape Test of OTC-Slack-Broker";

var event_endpoints = {};

var slack = new Slack(nconf.get("slack-token"));

var nock;

var nockMode = false;
var app = require('../app');
var server;

test('Slack Broker - Setup', function(t) {
	if (nockMode) {
		t.comment("Doing Nock mode ops");
		nock = require("nock");
		//nock.recorder.rec({dont_print: true, output_objects: true});	
		
		// Configure Nock endpoints
		// TIAM Nocks
		nocks = nock.load(__dirname + "/nocks/tiamNocks.json");
		nocks.forEach(function(nock) {
			// Add Scope filtering for TIAM_URL
			console.log(nock);
		});
		// OTC-API Nock
		nocks = nock.load(__dirname + "/nocks/otcApiNocks.json");
		nocks.forEach(function(nock) {
			// Add Scope filtering to OTC API
			console.log(nock);
		});
		
		// Start the server
	    t.plan(2);
	    app.configureMiddleware(function(err) {
	        if (!err) {
	            server = app.server.listen(nconf.get('PORT'), 'localhost', function(err) {
	                if (err) {
	                    console.error('error occurred while starting server: ' + JSON.stringify(err));
	                    t.fail('server didnt start listening');
	                    return;
	                }
	                console.log('server started on port ' + nconf.get('PORT'));
	                t.pass('server started listening');
	            });
	        }
	        t.notOk(err, 'Did the server start without an error?');
	    });		
	} else {
	    t.plan(1);
		t.end();		
	}
});


test('Slack Broker - Test Channel Name Validation', function (t) {
	t.plan(6);
	t.equals(slackClient.validateChannelName("####test"), "test");
	t.equals(slackClient.validateChannelName("123456789012345678901234567890"), "123456789012345678901", "Was channel name length ok ?");
	t.equals(slackClient.validateChannelName("   ABCDEF  "), "-abcdef-", "Was channel name with leading and trailing space ok");
	t.equals(slackClient.validateChannelName("abcd___efgh  ijkl--"), "abcd_efgh-ijkl-", "Was channel name with multiple _ or - ok");	
	t.equals(slackClient.validateChannelName("abcd###efgh"), "abcd_efgh", "Was channel name with multiple # in the middle ok");	
	t.equals(slackClient.validateChannelName("a&b'c-dàeçf"), "a_b_c-d_e_f", "Was channel name with non word of hyphen caracter ok");	
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
    
    // Security Model since Public-beta
    header.Authorization = "Basic " + new Buffer(nconf.get("TIAM_CLIENT_ID") + ":" + nconf.get("OTC_API_BROKER_SECRET")).toString('base64');
    
    async.series([
        function(callback) {
            putRequest(url, {header: null, body: JSON.stringify(body)})
            .then(function(resultNoHeader) {
                t.equal(resultNoHeader.statusCode, 401, 'did the authentication request with no Auth header failed?');
                callback();
            });
        },
        function(callback) {
            putRequest(url, {header: {"Authorization": "Bearer something"}, body: JSON.stringify(body)})
            .then(function(resultNoHeader) {
                t.equal(resultNoHeader.statusCode, 401, 'did the authentication request with a Bearer token header failed?');
                callback();
            });        	
        },
        function(callback) {
            putRequest(url, {header: auth, body: JSON.stringify(body)})
            .then(function(resultNoToken) {
                t.equal(resultNoToken.statusCode, 401, 'did the authentication request with an empty Auth header failed?');
                callback();
            });
        },
        function(callback) {
            auth.Authorization = 'basic';
            putRequest(url, {header: auth, body: JSON.stringify(body)})
            .then(function(resultNoBearer) {
                t.equal(resultNoBearer.statusCode, 401, 'did the authentication request with no basic creads in the Auth basic header failed?');
                callback();
            });        	
        }
	], function(err, results) {
   		if (err) {
   			t.fail(err);
   		} else {
   			t.end();
   		}
	});
});


test("Slack Broker - Create Test TIAM Creds", function(t) {
	t.plan(3);
	var tiamHeader = {};
	tiamHeader.Authorization = "Basic " + new Buffer(nconf.get("test-tiam-id") + ":" + nconf.get("test-tiam-secret")).toString('base64');
	// Create a service credentials
	var url = nconf.get("TIAM_URL") + '/service/manage/slack/' + mockServiceInstanceId;
	//t.comment(url);
    postRequest(url, {header: tiamHeader})
	    .then(function(result) {
	    	t.notEqual(result.body.service_credentials, undefined, "service credentials created ?");
	    	tiamCredentials.service_credentials = result.body.service_credentials;
	    });        		
    
    // Create a toolchain credentials
    url = url + "/" + mockToolchainId;
    postRequest(url, {header: tiamHeader})
    .then(function(result) {
    	t.notEqual(result.body.toolchain_credentials, undefined, "toolchain credentials created ?");
    	tiamCredentials.toolchain_credentials = result.body.toolchain_credentials;
    });        		
    
    // Create an target_credentials credentials to access the slack serviceid and toolchain
    url = nconf.get("TIAM_URL") + '/service/manage/credentials?target=' + mockServiceInstanceId + '&toolchain=' + mockToolchainId;
    postRequest(url, {header: tiamHeader})
    .then(function(result) {
    	t.notEqual(result.body.target_credentials, undefined, "target_credentials created ?");
    	tiamCredentials.target_credentials = result.body.target_credentials;
    });        		
    
});

test('Slack Broker - Test PUT instance', function (t) {
    t.plan(6);

    var url = nconf.get('url') + '/slack-broker/api/v1/service_instances/' + mockServiceInstanceId;
    var body = {};
    
    async.series([
	    function(callback) {
	        putRequest(url, {header: header, body: null})
	        .then(function(resultNoBody) {
	            t.equal(resultNoBody.statusCode, 400, 'did the put instance call with no body fail?');
	            callback();
	        });
	    },
	    function(callback) {
            body.service_id = 'slack';
            putRequest(url, {header: header, body: JSON.stringify(body)})
            .then(function(resultNoOrg) {
                t.equal(resultNoOrg.statusCode, 400, 'did the put instance call with no service id fail?');
                callback();
            });	    	
	    },
	    function(callback) {
            body.service_credentials = tiamCredentials.service_credentials;
            putRequest(url, {header: header, body: JSON.stringify(body)})
            .then(function(resultNoOrg) {
                t.equal(resultNoOrg.statusCode, 400, 'did the put instance call with no service id fail?');
                callback();
            });	    	
	    },
	    function(callback) {
            body.organization_guid = organization_guid;
            body.parameters = {
            	api_token: nconf.get("slack-token"),
            	channel_name: slack_channel.name.replace("bot", "bis"),
            	//channel_topic: slack_channel.topic
            }
            putRequest(url, {header: header, body: JSON.stringify(body)})
            .then(function(results) {
                t.equal(results.statusCode, 200, 'did the put instance call succeed?');
                t.ok(results.body.instance_id, 'did the put instance call return an instance_id?');
                slack_channel.id = results.body.instance_id;
                callback();
            });
	    },
	    function(callback) {
            // Ensure Slack Channel has been created
            slack.api("channels.info", {channel: slack_channel.id}, function(err, response) {
            	if (err) {
            		callback(err)
            	} else if (!response.ok) {
            		t.fail(response.error);
            		callback();
            	} else {
                	t.ok(response.ok, 'did the slack channel got created appropriately?')
                	callback();
            	}
            });                            
	    }
	], function(err, results) {
   		if (err) {
   			t.fail(err);
   		} else {
   			t.end();
   		}
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
    
    // Sleep 3s to not overload Slack - Workaround but may lead to trouble in prod ?
    sleep(3);
	
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

test('Slack Broker - Test PATCH update instance with wrong api_key', function (t) {
    t.plan(1);
	
    var body = {
        'service_id': 'slack',
        'parameters' : {
        	api_token: "wrong" + nconf.get("slack-token")
        }
    };

    var url = nconf.get('url') + '/slack-broker/api/v1/service_instances/' + mockServiceInstanceId;
    patchRequest(url, {header: header, body: JSON.stringify(body)})
        .then(function(resultFromPatch) {
        	//t.comment(JSON.stringify(resultFromPatch));
            t.equal(resultFromPatch.statusCode, 400, 'did the patch instance with wrong api key failed ?');
            //t.comment("resultFromPatch.body=" + JSON.stringify(resultFromPatch.body));
    });    				
});


test('Slack Broker - Test PATCH unknown instance', function (t) {
    t.plan(1);
	
    var body = {
        'service_id': 'slack',
        'parameters' : {
        	api_token: nconf.get("slack-token")
        }
    };

    var url = nconf.get('url') + '/slack-broker/api/v1/service_instances/non_existent_id';
    patchRequest(url, {header: header, body: JSON.stringify(body)})
        .then(function(resultFromPatch) {
        	//t.comment(JSON.stringify(resultFromPatch));
            t.equal(resultFromPatch.statusCode, 404, 'did the patch for unknown instance failed ?');
            //t.comment("resultFromPatch.body=" + JSON.stringify(resultFromPatch.body));
    });    				
});

test('Slack Broker - Test PUT bind unknown instance to unknown toolchain', function (t) {
    t.plan(1);

    var url = nconf.get('url') + '/slack-broker/api/v1/service_instances/unknow_service/toolchains/unknow_toolchain';
    putRequest(url, {header: header, body: JSON.stringify({toolchain_credentials: tiamCredentials.toolchain_credentials})})
        .then(function(resultsFromBind) {
            t.equal(resultsFromBind.statusCode, 404, 'did the bind of unknow instance and unknow toolchain failed?');
        });
});

test('Slack Broker - Test PUT bind instance to toolchain', function (t) {
    t.plan(2);

    var url = nconf.get('url') + '/slack-broker/api/v1/service_instances/' + mockServiceInstanceId + '/toolchains/'+ mockToolchainId;
    putRequest(url, {header: header})
        .then(function(resultsFromBind) {
            t.equal(resultsFromBind.statusCode, 400, 'did the bind instance w/o toolchain_credentials failed?');
            putRequest(url, {header: header, body: JSON.stringify({toolchain_credentials: tiamCredentials.toolchain_credentials})})
            	.then(function(resultsFromBind) {
		            t.equal(resultsFromBind.statusCode, 204, 'did the bind instance to toolchain call succeed?');
		            /*if (resultsFromBind.statusCode == 200) {
		                if (_.isString(resultsFromBind.body.toolchain_lifecycle_webhook_url)) {
		                    t.ok(resultsFromBind.body.toolchain_lifecycle_webhook_url, 'did the toolchain_lifecycle_webhook_url value returned and valid for 200 status?');
		                    event_endpoints.toolchain_lifecycle_webhook_url = resultsFromBind.body.toolchain_lifecycle_webhook_url;
		                } else {
		                    t.notOk(resultsFromBind.body.toolchain_lifecycle_webhook_url, 'is not a valid returned url for toolchain_lifecycle_webhook_url ?');            	
		                }
		        	}*/
            	});
        });
});

test('Slack Broker - Test Pipeline Event arriving like Messaging Store', function (t) {
	t.plan(2);
	
	// Message Store Event endpoint
	var messagingEndpoint = nconf.get('url') + '/slack-broker/api/v1/messaging/accept';

	// Simulate a Pipeline event
	var message_store_pipeline_event = require("./data/event_lms_pipeline_stage_started");
	message_store_pipeline_event.toolchain_id = mockToolchainId;
	message_store_pipeline_event.instance_id = mockServiceInstanceId;
	
	var basicHeader = {Authorization: "Basic " + tiamCredentials.target_credentials};
    postRequest(messagingEndpoint, {header: basicHeader, body: JSON.stringify(message_store_pipeline_event)})
    .then(function(resultFromPost) {
        t.equal(resultFromPost.statusCode, 204, 'did the message store like event sending call succeed ?');
        // ensure the slack message has been posted
        getLastSlackMessages(function(err, result) {
        	if (err || !result) {
        		t.fail(err)
        	} else {
        		//t.comment(JSON.stringify(result));
        		// inspect the Slack messages (set purpose, topic message can have been mixed with the pipeline ones here)
        		var expectedUserName = "Pipeline '" + message_store_pipeline_event.payload.pipeline.id +"'";
        		t.notEqual(_.findWhere(result, {username: expectedUserName}), undefined, 'has the slack message been created successfully ?');
        	}
        });
    });
});


test('Slack Broker - Test Toolchain Lifecycle Events', function (t) {
	
	var events = [
	    require("./data/event_otc_broker_1_provisionning"),
	    require("./data/event_otc_broker_2_configuring"),
	    require("./data/event_otc_broker_3_configured"),	    
	    require("./data/event_otc_broker_4_unbind"),	    
	    require("./data/event_otc_broker_5_patch_1"),	    
	    require("./data/event_otc_broker_5_patch_2")	    
	];
	
	var expected_slack_messages = [
	    false, 
	    false,
	    true,
	    true,
	    false,
	    true	    
	];
	
	t.plan(events.length * 2);
	
	var messagingEndpoint = nconf.get('url') + '/slack-broker/api/v1/messaging/accept';
	
	var basicHeader = {Authorization: "Basic " + tiamCredentials.target_credentials};
	
	async.forEachOfSeries(events, function(event, index, callback) {
		event.toolchain_id = mockToolchainId;
		event.payload.toolchain_guid = mockToolchainId;
		event.instance_id = mockServiceInstanceId;

		postRequest(messagingEndpoint, {header: basicHeader, body: JSON.stringify(event)})
        .then(function(resultFromPost) {
            t.equal(resultFromPost.statusCode, 204, 'did the toolchain lifecycle event ' + index + ' sending call succeed?');
            
            // ensure the slack message has been posted
            getLastSlackMessages(function(err, result) {
            	if (err) {
            		t.fail("Error while retrieving Slack message:" + err);
            	} else {
                    if (expected_slack_messages[index]) {
                    	if (!result) {
                    		t.fail("Problem while retrieving Slack message: No message found");                        		
                    	} else {
                    		var expectedUserName = "Toolchain '" + event.payload.toolchain_guid +"'";
                    		if (result.length == 1 && result[0].username.startsWith("Toolchain")) {
                        		t.pass('did the slack message been created successfully for event ' + index + '?');                        		                    			
                    		} else {
                        		t.fail('did the slack message been created successfully for event ' + index + '?');                        		                    			
                    		}
                    	}
                    } else {
    	            	t.pass("Event is not expected to produce Slack Message");
                    }
            	}
                callback();
            });            	
        });			
	}, function(err) {
   		if (err) {
    		t.comment(err);
   			t.fail(err);
   		}
	});
	
});

test('Slack Broker - Test Bad Event payload', function (t) {
	t.plan(5);
	
	// Message Store Event endpoint
	var messagingEndpoint = nconf.get('url') + '/slack-broker/api/v1/messaging/accept';

	// Simulate a Pipeline event
	var event = {};
	
	var basicHeader = {Authorization: "Basic " + tiamCredentials.target_credentials};
	
	async.series([
	     function(callback) {
	    	// Empty Payload
    	    postRequest(messagingEndpoint, {header: basicHeader, body: JSON.stringify(event)})
    	    .then(function(resultFromPost) {
    	        t.equal(resultFromPost.statusCode, 400, 'did the bad event payload (1) sending call failed?');
    	        callback();
    	    });	
	     },
	     function(callback) {
    	    // Minimal payload 2
    	    event.service_id = "n/a";
    	    event.toolchain_id = mockToolchainId;
    	    event.instance_id = mockServiceInstanceId;
    	    event.payload = {};
    	    postRequest(messagingEndpoint, {header: basicHeader, body: JSON.stringify(event)})
    	    .then(function(resultFromPost) {
    	        t.equal(resultFromPost.statusCode, 204, 'did the bad event payload (2) sending call succeed?');
    	        getLastSlackMessages(function(err, result) {
    	        	if (err) {
                		t.comment(err);
    	        		t.fail(err)
    	        	} else {
    	        		// No message should been received as Slack broker can not find any configuration out of the message
    	        		t.equal(result, null, 'has no slack message been created for bad event payload (2) ?');
    	        	}
    	        	callback();
    	        });
    	    });	
	     },
	     function(callback) {
    	    // Minimal payload 3
    	    event.service_id = "pipeline";
    	    event.payload.pipeline = {};
    	    event.payload.pipeline.event="n/a";
    	    postRequest(messagingEndpoint, {header: basicHeader, body: JSON.stringify(event)})
    	    .then(function(resultFromPost) {
    	        t.equal(resultFromPost.statusCode, 204, 'did the bad event payload (3) sending call succeed?');
    	        getLastSlackMessages(function(err, result) {
    	        	if (err) {
                		t.comment(err);
    	        		t.fail(err)
    	        	} else {
    	        		// Simple message should have been created
    	        		t.notEqual(_.findWhere(result, {username: "Pipeline"}), undefined, 'did a generic slack message been created ?');
    	        	}
    	        	callback();
    	        });
    	    });	
	     }
	]);
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
		            'service_credentials': tiamCredentials.service_credentials,
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
    t.plan(1);

    var body = {
        'service_id': 'slack'
    };
    
    var url = nconf.get('url') + '/slack-broker/api/v1/service_instances/' + mockServiceInstanceId;
    putRequest(url, {header: header, body: JSON.stringify(body)})
        .then(function(resultFromPut) {
            t.equal(resultFromPut.statusCode, 400, 'did the put instance call fail with no organization_guid?');
    });
});


test('Slack Broker - Test DELETE instance', function (t) {
    t.plan(2);

    var url = nconf.get('url') + '/slack-broker/api/v1/service_instances/' + mockServiceInstanceId;
    delRequest(url, {header: header})
        .then(function(resultsFromDel) {
            t.equal(resultsFromDel.statusCode, 204, 'did the delete instance call succeed?');
    });
    
    url = nconf.get('url') + '/slack-broker/api/v1/service_instances/unknown_instance';
    delRequest(url, {header: header})
        .then(function(resultsFromDel) {
            t.equal(resultsFromDel.statusCode, 404, 'did the delete for an unknown instance failed?');
    });
    
});


test('Slack Broker - Test DELETE unbind instance from toolchain', function (t) {
    t.plan(1);
    var url = nconf.get('url') + '/slack-broker/api/v1/service_instances/unknow_service/toolchains/unknow_toolchain';
    delRequest(url, {header: header})
    	.then(function(resultsFromDel) {
    		t.equal(resultsFromDel.statusCode, 404, 'did the unbind for unkown instance failed?');
    	});
});

test('Slack Broker - Test DELETE unbind instance from toolchain', function (t) {
    t.plan(5);

    var body = {
        'service_id': 'slack',
        'organization_guid': organization_guid,
        'service_credentials': tiamCredentials.service_credentials,
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

            putRequest(url + '/toolchains/'+ mockToolchainId, {header: header, body: JSON.stringify({toolchain_credentials: tiamCredentials.toolchain_credentials})})
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

test("Slack Broker - Delete Test TIAM Creds", function(t) {
	t.plan(2);
	var tiamHeader = {};
	tiamHeader.Authorization = "Basic " + new Buffer(nconf.get("test-tiam-id") + ":" + nconf.get("test-tiam-secret")).toString('base64');
	
    // Delete a toolchain credentials
    var url = nconf.get("TIAM_URL") + '/service/manage/slack/' + mockServiceInstanceId + "/" + mockToolchainId;
    delRequest(url, {header: tiamHeader})
    .then(function(result) {
    	t.equal(result.statusCode, 204, "toolchain credentials deleted ?");
    	tiamCredentials.toolchain_credentials = null;
    });        		
	// Delete a service credentials
	url = nconf.get("TIAM_URL") + '/service/manage/slack/' + mockServiceInstanceId;
    delRequest(url, {header: tiamHeader})
	    .then(function(result) {
	    	t.equal(result.statusCode, 204, "service credentials deleted ?");
	    	tiamCredentials.service_credentials = null;
	    });        		
    
    
});


//Monitoring endpoints
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

test('Slack Broker - Teardown', function(t) {

	/* Nock Record related work
	var nockCalls = nock.recorder.play();
	
	// Keep a single nock instance by removing the headers.date property and call uniq
	nockCalls = _.uniq(nockCalls, false, function(nockCall) {
		// return a unique id for each object
		return nockCall.method + " " + nockCall.scope + nockCall.path + " " + nockCall.status;
	})
	
	var url =  require("url");
	var tiamUrl = url.parse(nconf.get("TIAM_URL"));
	// Only keep tiam and otc-api ones
	var tiamNocks = _.filter(nockCalls, function(nockCall) {
		var nockScopeUrl = url.parse(nockCall.scope); 
		return tiamUrl.hostname == nockScopeUrl.hostname;
	});
	var otcApiUrl = url.parse(nconf.get("services:otc_api"));
	var otcApiNocks = _.filter(nockCalls, function(nockCall) {
		var nockScopeUrl = url.parse(nockCall.scope); 
		return otcApiUrl.hostname == nockScopeUrl.hostname && otcApiUrl.port == nockScopeUrl.port;
	});	
	const fs = require('fs'); 
	fs.writeFileSync(__dirname + '/nocks/tiamNocks.json', JSON.stringify(tiamNocks));
	fs.writeFileSync(__dirname + '/nocks/otcApiNocks.json', JSON.stringify(otcApiNocks));
	
	*/
    t.plan(1);
	if (nockMode) {
		t.comment("Doing Nock mode ops");
	    server.close(function(err) {
	        t.notOk(err, 'did the server close?');
	        process.exit();
	    });
	} else {
		console.log("Real end");
		t.end();		
	}
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

var slackMessageLatestTimeRange;
function getLastSlackMessages(callback) {
	var options = {channel: slack_channel.id};
	if (slackMessageLatestTimeRange) {
		options.oldest = slackMessageLatestTimeRange; 
	}
	setTimeout(function() {
		// Let Slack a chance to be updated
		slack.api("channels.history", options, function(err, response) {
			if (err) {
				callback(err);
			} else if (!response.ok) {
				callback(response.error);
			} else {
				if (_.isEmpty(response.messages)) {
					callback(null, null);
				} else {
					// Messages came from younger to older
					slackMessageLatestTimeRange = response.messages[0].ts;
					//console.log("slackMessageLatestTimeRange:" + slackMessageLatestTimeRange);
					callback(null, response.messages);
				}
			}
		});	
	}, 2000);
}

function pad(n) {
    return (n < 10) ? ("0" + n) : ("" + n);
}

function sleep(s) {
    var e = new Date().getTime() + (s * 1000);
    while (new Date().getTime() <= e) {
      ;
    }
  }