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
 async = require("async"),
 bodyParser = require("body-parser"),
 express = require("express"),
 https = require('https'),
 HttpsAgent = require("agentkeepalive").HttpsAgent,
 nano = require("nano"),
 nanoDocUpdater = require("nano-doc-updater"),
 nconf = require("nconf"),
 log4js = require("log4js"),
 path = require("path"),
 url = require("url"),
 util = require("util"),
 _ = require("underscore")
;

// Swgager (temporary until within pipeline stage/job)
var swaggerUiMiddleware = require("swagger-ui-middleware"),
otcSlackBrokerSwaggerSpecFile = path.join(__dirname, "/spec", "otc-slack-broker-swagger-spec.json"),
otcSlackBrokerSwaggerSpec = require(otcSlackBrokerSwaggerSpecFile);

var logger = log4js.getLogger("otc-slack-broker"),
 	logBasePath = "index";

/* 
 * Method used to configure all the middleware before starting the server.
 */
exports.configureMiddleware = function(externalCallback) {
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
			callback();
	    }]
	}, function (err/*, r*/) {
	    if (err) {
	        util.log("An error occurred during setup: " + err.toString());
	        process.exit(1);
	    }
	    externalCallback(err);
	});
}

/*
 * Export app so that servers can be listened to from it.
*/
var app = express();
exports.server = app;

// enable connection pooling
https.globalAgent.keepAlive = true;

function validateConfSync() {
	/* Make sure that important bits of VCAP_SERVICES are defined. */
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
	
	app
	// If a request comes in that appears to be http, reject it.
	.use(function (req, res, next) {
	  if (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'] !== 'https') {
	    return res.status(403).send('https required');
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

	/*
	.get("/slack-broker", function (req, res) {
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
	*/

	// OTC lifecycle operations (i.e. provision, bind, unprovision, unbind)
	.use("/slack-broker/api/v1/service_instances", require("./lib/middleware/service_instances"))
	
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
    // All routes (implemented or not) are handled by the code above.
	.use(function (req, res, next) {
        logger.debug(logPrefix + "The route does not exist.");
        var errorObject = {};
        errorObject.errorMessage = "Route doesn't exist";
        return res.status(404).json(errorObject);
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