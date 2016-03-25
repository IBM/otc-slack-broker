/**
 * Licensed Materials - Property of IBM
 * (c) Copyright IBM Corporation 2015, 2015. All Rights Reserved.
 *
 * Note to U.S. Government Users Restricted Rights:
 * Use, duplication or disclosure restricted by GSA ADP Schedule
 * Contract with IBM Corp.
 */
"use strict";
var
 nconf = require("nconf"),
 log4js = require("log4js")
;

//Configuration for logging
log4js.configure("./config/log4js.json", {
    reloadSecs: 30
});

var logger = log4js.getLogger("slack-broker"),
 	logBasePath = "index";

//Configuration for nconf
populateNconfSync();

//require new relic before any middleware (especially express).
if (nconf.get('ENABLE_NEW_RELIC')) {
    require('newrelic');
    logger.info('New Relic enabled');
}

var
 async = require("async"),
 express = require("express"),
 util = require("util"),
 nano = require("nano"),
 _ = require("underscore"),
 nanoDocUpdater = require("nano-doc-updater"),
 bodyParser = require("body-parser"),
 fetchAuthMiddleware = require("./lib/middleware/fetch-auth"),
 HttpsAgent = require("agentkeepalive").HttpsAgent,
 
 TIAMClient = require("node-tiam-client"),

 path = require("path"),
 url = require("url")
;

// Swgager (temporary until within pipeline stage/job)
var swaggerUiMiddleware = require("swagger-ui-middleware"),
otcSlackBrokerSwaggerSpecFile = path.join(__dirname, "/spec", "otc-slack-broker-swagger-spec.json"),
otcSlackBrokerSwaggerSpec = require(otcSlackBrokerSwaggerSpecFile);

async.auto({
    validateOptions: function (callback) {
    	validateConfSync();
        callback();
    },
    createDb: [ "validateOptions", function (callback) {
        createDb(callback);
    }],
    initializeDb: [ "createDb", function (callback, r) {
    	initOrUpdateDesign(r.createDb, callback);
    }],
    configureApp: ["initializeDb", function(callback, r) {
		configureAppSync(r.initializeDb);	        	
    }]
}, function (err/*, r*/) {
    if (err) {
        util.log("An error occurred during setup: " + err.toString());
        process.exit(1);
    }
});


function populateNconfSync() {
	/* Load up configuration.
	   - ENVVARs override...
	   - Whatever's in the VCAP_SERVICES envvar (parsed as json) which overrides...
	   - config/${NODE_ENV}.json which overrides...
	   - config/dev.json.
	*/
	nconf.env("__");

	var overrides = {};

	if (process.env.VCAP_SERVICES)
		overrides._vcap_services = JSON.parse(process.env.VCAP_SERVICES);

	if (process.env.VCAP_APPLICATION)
		overrides._vcap_application = JSON.parse(process.env.VCAP_APPLICATION);

	if (Object.getOwnPropertyNames(nconf.overrides).length !== 0) {
		nconf.overrides(overrides);
	}

	if (process.env.NODE_ENV)
		nconf.file("node_env", "config/" + process.env.NODE_ENV + ".json");

	nconf.file("default", "config/dev.json");
}

function validateConfSync() {
	/* Make sure that important bits of VCAP_SERVICES and VCAP_APPLICATION are defined. */
	if (!nconf.get("_vcap_application:application_uris:0")) {
		util.log(
			"Could not figure out the app uri. Either run this on Bluemix or point a config file containing at least the following: \n\n" +
			JSON.stringify({ _vcap_application: { application_uris: [ "hostname.com" ] } })
		);
		process.exit(1);
	}

	if (!nconf.get("_vcap_services:cloudantNoSQLDB:0:credentials:url")) {
		util.log(
			"Could not figure out the database server url. Either run this on Bluemix or point a config file containing at least the following: \n\n" +
			JSON.stringify({ _vcap_services: { cloudantNoSQLDB: [ { credentials: { url: "https://url" } } ] } })
		);
		process.exit(1);
	}
}

function configureAppSync(db) {
	var logPrefix = "[" + logBasePath + ".configureAppSync] ";
	var app = express();

	var tiamClient = new TIAMClient(nconf.get("TIAM_URL"), nconf.get("TIAM_CLIENT_ID"), nconf.get("TIAM_CLIENT_SECRET"));
	
	app
	// If a request comes in that appears to be http, reject it.
	.use(function (req, res, next) {
	  if (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'] !== 'https') {
	    return res.status(501).send('https required');
	  }
	  next();
	})
	
	.use(log4js.connectLogger(log4js.getLogger("request"), {
	    format: ":method :url :status - :response-time ms"
	}))
	
	.use(bodyParser.json())
	.get("/status", function (req, res/*, next*/) {
        return res.status(200).send("The Slack Broker is running.");
    })
	
	.get("/version", function (req, res/*, next*/) {
        return res.status(200).send({build: process.env.BUILD_NUMBER});
    })
    
    .use("/swagger", swaggerUiMiddleware(
        _.extend(otcSlackBrokerSwaggerSpec, {
            "host": url.parse(nconf.get("url")).host
        }, {
            "schemes": nconf.get("schemes").split(",")
        })
    ))
    
	// Tack a handle to the Services Database to every request for use in the middleware.
	.use(function (req, res, next) {
		req.servicesDb = db;
		next();
	})

	// Temporary in order to have message coming from webhookmanager pipeline
	//.use("/slack-broker/unsecured/event/v1/", require("./lib/event/event"))

	.get("/slack-broker", function (req, res/*, next*/) {
		db.view("slack", "service_instances", function (err, r) {
			var page = "" +
			"<!-- DOCTYPE: html -->\n" +
			"<html><head><title>Slack Service</title></head><body>" +
			"<p>I'm doing nothing in particular.  Especially when it comes to these service_instances:</p>" +
			"<table border='1'>"+
			"<tr><th>Service Instance Id</th><th>Parameters</th><th>Toolchain</th></tr>"+
			_.pluck(r.rows, "value").map(function (serviceInstance) {
				return "" +
				"<tr>" +
				"<td>" +  serviceInstance._id + "</td>" +
				"<td><pre>" +  JSON.stringify(serviceInstance.parameters, null, " ") + "</pre></td>" +
				"<td>" +  serviceInstance.toolchain_ids.join(",") + "</td>" +
				"</tr>";
			}).join("") +
			"</table>" +
			"</body></html>";

			return res.send(page);
		});
	})

	// OTC lifecycle operations (i.e. provision, bind, unprovision, unbind)
	.use("/slack-broker/api/v1/service_instances", require("./lib/middleware/service_instances"))
	
    // Try to fetch the user profile from the Authorization header.
	.use(fetchAuthMiddleware(tiamClient))
	
	// Endpoint for the lifecycle messaging store and toolchain api lifecycle events
	.use("/slack-broker/api/v1/messaging", require("./lib/event/event"))

	//Handle errors
	.use(function(error, req, res, next) {
		if (error) {
			logger.error(logPrefix + "The application request failed with the" +
				" following error: " + error.toString());

			res.status(400).send(JSON.stringify(error, null, 3));
		}
		else {
			return next();
		}
	})
	.use(function (req, res, next) {
		logger.error(logPrefix + "Configuring application failed because route " +
			"does not exist.");

		return res.status(400).json({});
	})
	.listen(nconf.get("PORT"), function () {
		util.log("listening on port " + nconf.get("PORT"));
	})
	;
}

function createDb(callback) {
	var logPrefix = "[" + logBasePath + ".createDb] ";
	var DB_NAME = "slack_broker";
	var keepAliveAgent = new HttpsAgent({
		maxSockets: 50,
		maxKeepAliveRequests: 0,
		maxKeepAliveTime: 30000
	});
	var nanoObj = nano(
		nconf.get("_vcap_services:cloudantNoSQLDB:0:credentials:url"),
		{ requestDefaults: { agent: keepAliveAgent } }
	);

	nanoObj.db.create(DB_NAME, function (err/*, r*/) {
		if (err && err.error !== "file_exists") {
				logger.error(logPrefix + "Creating the database failed with the " +
					"following error: " + err.toString());

				return callback("Could not create db: " + err.toString());
			}

		callback(null, nanoObj.use(DB_NAME));
	});
}

function initOrUpdateDesign(db, callback) {
	var DESIGN_DOC_NAME = "_design/slack";
	/* If this was a real program, I'd probably isolate the design doc to its own source file.
	   sucks there's no way to turn off a global directive. */

	/* global emit */
	var DESIGN_DOC = {
		language: "javascript",
		version: 1,
		views: {
			service_instances: {
				map: function (doc) {
					if (doc.type === "service_instance") {
						emit(doc.id, doc);
					}
				}
			}
		}
	};

	return nanoDocUpdater()
	.db(db)
	.existingDoc(null)
	.newDoc(DESIGN_DOC)
	.id(DESIGN_DOC_NAME)
	.shouldUpdate(function (existing, newVer) {
		return !existing.version || existing.version < newVer.version;
	})
	.merge(null)
	.update(function(err) {
		callback(err, db);
	});
}