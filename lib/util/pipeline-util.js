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
 log4js = require("log4js"),
 nconf = require("nconf"),
 _ = require('underscore'),
 request = require("request"),
 tiamUtil = require("../util/tiam-util")
;

var logger = log4js.getLogger("otc-slack-broker"),
	logBasePath = "lib.util.pipeline-util"
;

var otc_api_url = nconf.get("services:otc_api");
var env_url = nconf.get("url");

exports.getPipelineInfo = getPipelineInfo;
exports.getPipelineStageInput = getPipelineStageInput;
exports.getPipelineStageJob = getPipelineStageJob

function getPipelineInfo(pipelineId, toolchainCredentials, callback) {	
	var logPrefix = "[" + logBasePath + ".getPipelineInfo] ";
	logger.debug(logPrefix + "Getting pipeline info for " + pipelineId);
	// The target is fabric which is the default
	tiamUtil.getCredentials(toolchainCredentials, null, function(err, credentials) {
		if (err) {
			logger.error(logPrefix + "No credentials obtained from TIAM : " + err);
			return callback(null, {label: pipelineId});
		}
		return getPipelineInfo_(pipelineId, credentials, function(err, pipelineInfo) {
			if (err && err != 401) {
				return callback(null, {label: pipelineId});
			} if (err && err === 401) {
				// TIAM credentials may be stale. Let's retry with a new TIAM
				logger.debug(logPrefix + "Use new TIAM credentials to invoke otc-api");
				return tiamUtil.getCredentials(toolchainCredentials, {refresh: true}, function(err, credentials) {
					if (err) {
						logger.error(logPrefix + "No credentials obtained from TIAM : " + err);
						return callback(null, {label: pipelineId});
					}
					return getPipelineInfo_(pipelineId, credentials, function(err, pipelineInfo) {
						if (err) {
							logger.error(logPrefix + "Failed to get pipeline info : " + err);
							return callback(null, {label: pipelineId});							
						} else {
							return callback(null, pipelineInfo);
						}
					});
				});
			} else {
				return callback(null, pipelineInfo);
			}
		});
	});
}

function getPipelineInfo_(pipelineId, credentials, callback) {
	var logPrefix = "[" + logBasePath + ".getPipelineInfo_] ";
	var options = {};
	options.url = otc_api_url + "/service_instances/" + pipelineId;
	options.headers = {"Authorization" : "Basic " + credentials};
	options.json = true;
	logger.debug(logPrefix + "Invoking otc-api to find pipeline info for " + pipelineId);
	request.get(options, function(error, response, body) {
		if (error) {
			logger.error(logPrefix + "Error while getting " + options.url + ":" + error);
			return callback(error);
		} else if (response.statusCode == 200) {
			var dashboard_url = body.dashboard_url;
			if (!dashboard_url.startsWith('http')) {
				// see https://hub.jazz.net/ccm09/web/projects/idsorg%20%7C%20One%20Ring%20Track%20and%20Plan#action=com.ibm.team.workitem.viewWorkItem&id=58417
				// make it an absolute url
				dashboard_url = env_url + dashboard_url;
			}
			return callback(null, {label: body.parameters.label, api_url: body.parameters.api_url, dashboard_url:dashboard_url});
		} else {
			return callback(response.statusCode);
		}
	});	
}

function getPipelineStageInput(api_url, pipelineId, stageId, inputId, toolchainCredentials, callback, retry) {
	var logPrefix = "[" + logBasePath + ".getPipelineStageInput] ";
	tiamUtil.getCredentials(toolchainCredentials, {refresh: retry, target: pipelineId}, function(err, credentials) {
		if (err) {
			logger.error(logPrefix + "No credentials obtained from TIAM : " + err);
			return callback();
		}
		var options = {};
		options.url = api_url + "/stages/" + stageId + "/inputs/" + inputId;
		options.headers = {"Authorization" : "Basic " + credentials};
		options.json = true;
		logger.debug(logPrefix + "Invoking pipeline-api to find input info for " + pipelineId +  ", stage " + stageId + " and input " + inputId);
		request.get(options, function(error, response, body) {
			if (error) {
				logger.error(logPrefix + "Error while getting " + options.url + ":" + error);
				return callback(error);
			} else if (response.statusCode == 200) {
				return callback(null, body);
			} else  if (response.statusCode == 401) {
				if (retry) {
					return callback(response.statusCode);					
				} else {
					return getPipelineStageInput(api_url, pipelineId, stageId, inputId, toolchainCredentials, callback, true);
				}
			} else {
				return callback(response.statusCode);									
			}
		});	
		
	});
}

//https://otc-pipeline-server.stage1.ng.bluemix.net/pipeline/pipelines/03adb2f3-b60f-418a-b451-6067f47cf1ef/stages/44db7260-be59-4465-b7e5-483402d80903/jobs/4c8e77ea-596d-411c-a8b7-60f7e6f1522c 
function getPipelineStageJob(api_url, pipelineId, stageId, jobId, toolchainCredentials, callback, retry) {
	var logPrefix = "[" + logBasePath + ".getPipelineStageJob] ";
	tiamUtil.getCredentials(toolchainCredentials, {refresh: retry, target: pipelineId}, function(err, credentials) {
		if (err) {
			logger.error(logPrefix + "No credentials obtained from TIAM : " + err);
			return callback();
		}
		var options = {};
		options.url = api_url + "/stages/" + stageId + "/jobs/" + jobId;
		options.headers = {"Authorization" : "Basic " + credentials};
		options.json = true;
		logger.debug(logPrefix + "Invoking pipeline-api to find job info for " + pipelineId +  ", stage " + stageId + " and job " + jobId);
		request.get(options, function(error, response, body) {
			if (error) {
				logger.error(logPrefix + "Error while getting " + options.url + ":" + error);
				return callback(error);
			} else if (response.statusCode == 200) {
				return callback(null, body);
			} else  if (response.statusCode == 401) {
				if (retry) {
					return callback(response.statusCode);					
				} else {
					return getPipelineStageJob(api_url, pipelineId, stageId, jobId, toolchainCredentials, callback, true);
				}
			} else {
				return callback(response.statusCode);									
			}
		});			
	});
}
	