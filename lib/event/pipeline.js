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
	async = require("async"),
	nconf = require('nconf'),
	_ = require('underscore'),
	request = require("request"),
	tiamUtil = require("../util/tiam-util"),
	pipelineUtil = require("../util/pipeline-util")
;

var logger = log4js.getLogger("otc-slack-broker"),
	logBasePath = "lib.event.pipeline"
;

var successColor = "#00B198";
var failedColor = "#f04e36";
var abortedColor = "#f18f27";

module.exports = function(requestId, event, toolchainCredentials, callback) {
	var logPrefix = "[" + logBasePath + "] ";

	var pipelineId;
	if (event.pipeline) {
		pipelineId = event.pipeline.id; 
	}
	var stageName;
	if (event.stage) {
		stageName = event.stage.name;
	}
	
	logger.info(logPrefix + "[" + requestId + "]Pipeline " + pipelineId + " - Event " + event.event + " : " + stageName);
	
	if (event.event == "stageStarted") {
		createMessageForStageStarted(event, toolchainCredentials, callback);
	} else if (event.event == "stageCompleted") {
		createMessageForStageCompleted(event, toolchainCredentials, callback);
	} else if (event.event == "jobStarted") {
		createMessageForJobStarted(event, toolchainCredentials, callback);
	} else if (event.event == "jobCompleted") {
		createMessageForJobCompleted(event, toolchainCredentials, callback);
	} else {
		// Default !
		logger.info(logPrefix + "Slack Message Structure created for Pipeline " + pipelineId + " - Event " + event.event + " : " + stageName);			
		callback(null, {username: "Pipeline", text: JSON.stringify(event)});
	}
}

function formatDurationWords(duration) {
    var durationString = "";
    // DurationFormatUtils.formatDurationWords(duration, true, true);
    var x = Math.floor(duration / 1000);
    var seconds = x % 60
    x = Math.floor(x/60);
    var minutes = x % 60
    x = Math.floor(x/60);
    var hours = x % 24
    x = Math.floor(x/24);
    var days = x
    if (days > 0) {
		durationString += days;
    	if (days > 1) {
    		durationString += " days";
    	} else {
    		durationString += " day";
    	}
    }	
    if (hours > 0) {
    	durationString += " ";
    	durationString += hours;    	
    	if (hours > 1) {
    		durationString += " hours";
    	} else {
    		durationString += " hour";
    	}
    }
    if (minutes > 0) {
    	durationString += " ";
    	durationString += minutes;    	
    	if (minutes > 1) {
    		durationString += " minutes";
    	} else {
    		durationString += " minute";
    	}
    }
    if (seconds > 0) {
    	durationString += " ";
    	durationString += seconds;    	
    	if (seconds > 1) {
    		durationString += " seconds";
    	} else {
    		durationString += " second";
    	}
    }    
    if (durationString.length == 0) {
    	durationString = "0 second";
    }
    return durationString;
}

function getJobExecutionUrl(dashboard_url, pipeline, stage, job, jobExecution) {
	if (dashboard_url) {
		var url = dashboard_url + "/"; 
		url += stage.id;
		url += "/";
		url += job.id;
		if (jobExecution) {
			url += "/";
			url += jobExecution.jobExecutionId;		
		}
		return url;
	} else {
		var url = "http://undefined/pipelines"
		url += "/" + pipeline.id;
		url += "/";
		url += stage.id;
		url += "/";
		url += job.id;
		if (jobExecution) {
			url += "/";
			url += jobExecution.jobExecutionId;		
		}
		return url;
	}
}

function getPreTextForStage(dashboard_url, event, statusText) {
    var executionUrl = "";
	if (!_.isEmpty(event.execution.jobExecutions)) {
		// Just use the first jobExecution to compute the URL
		var jobExecution = event.execution.jobExecutions[0];
		var job = _.findWhere(event.stage.jobs, {"id": jobExecution.jobId});
		if (!_.isUndefined(job) && _.isString(jobExecution.jobId) && (jobExecution.jobId.length > 0)) {        				
			executionUrl = getJobExecutionUrl(dashboard_url, event.pipeline, event.stage, job, jobExecution);
		}
	}
	
    var pretext = "Stage *'" + event.stage.name + "'* #" + event.execution.number + " has _*<" + executionUrl + "|" + statusText + ">*_";
	return pretext;
}

function getStringForInput(pipelineInfo, event, toolchainCredentials, callback) {
	var logPrefix = "[" + logBasePath + ".getStringForInput] ";
	
	var 
		dashboard_url = pipelineInfo.dashboard_url,
		api_url = pipelineInfo.api_url
	;
	
	if (!_.isEmpty(event.execution.inputs)) {
        async.map(event.execution.inputs, function(input, asyncCallback) {
        	pipelineUtil.getPipelineStageInput(api_url, event.pipeline.id, event.execution.stageId, input.inputId, toolchainCredentials, function(err, stageInput) {
        		logger.debug(logPrefix + JSON.stringify(stageInput));
        		if (err) {
        			// log error for stage input retrieval
        			logger.error(logPrefix + "Error while searching for stageInput of stage " + event.execution.stageId + " in pipeline " + event.pipeline.id + ":" + err.toString());
        			return asyncCallback();
        		} 
        		if (stageInput && stageInput.type == "scm" && stageInput.scmSource.type == "GitHub") {
        			// We only deal with GitHub scm here
        			// url contains .git at the end - remove it to compute the url according to the branch
        			var scmUrl = stageInput.scmSource.url;
        			if (scmUrl.endsWith(".git")) {
        				scmUrl = scmUrl.substring(0, scmUrl.length - 4);
        			}
        			var inputString = "_*<" + scmUrl + "/tree/" + stageInput.scmSource.branch + "|";
        			inputString += stageInput.scmSource.url + " [" + stageInput.scmSource.branch + "]>*_";
            		return asyncCallback(null, inputString);
        		}
        		if (stageInput && stageInput.type == "job") {
        			// The input here is the output of another job/stage
        			// retrieve the job name and use the revision id
        			pipelineUtil.getPipelineStageJob(api_url, event.pipeline.id, stageInput.stageId, stageInput.jobId, toolchainCredentials, function(err, job) {
        				if (err) {
                			logger.error(logPrefix + "Error while searching for stage information for stage " + stageInput.stageId + " in pipeline " + event.pipeline.id + ":" + err.toString());
                			return asyncCallback();
        				}
        				// <dashboard_url>/<stageId>/<jobId>/<input.revision>/artifacts
            			var inputString = "_*<" + dashboard_url + "/" + stageInput.stageId + "/" + stageInput.jobId + "/" + input.revisionId + "/artifacts |";
            			inputString += job.componentName + " " + input.revisionId + ">*_";
                		return asyncCallback(null, inputString);
        			});
        		} else {
        			// log no stage input
        			logger.debug(logPrefix + "No stageInput processable found for stageInput of stage " + event.execution.stageId + " in pipeline " + event.pipeline.id);
            		return asyncCallback();
        		}
        	});
        }, function(err, results) {
        	if (err) {
    			logger.error(logPrefix + "Error while creating string for stage inputs:" + err.toString());
        		return callback(err);
        	}
        	var result = "";
        	_.each(results, function(input, index) {
        		if (input) {
        			if (result.length > 0) {
        				result += ", ";
        			}
        			result += input;
        		}
        	});
        	callback(null, result);
        });		
    } else {
    	callback();
    }
}



function getRequestor(event, toolchainCredentials, callback) {
	var requestedBy = event.execution.requestedBy;
	if (requestedBy) {
		if (requestedBy == null || requestedBy == "") {
			callback(null, "pipeline");
		} else {
			// Use the user_info in the event for the requestor information
			if (event.user_info) {
				callback(null, event.user_info.user_name);
			} else {
				callback(null, requestedBy);
			}
		}
	} else {
		callback(null, "pipeline");
	}
}

function createMessageForStageStarted(event, toolchainCredentials, callback) {
	var logPrefix = "[" + logBasePath + ".createMessageForStageStarted] ";

	async.auto({
		pipelineInfo: function(asyncCallback) {
			pipelineUtil.getPipelineInfo(event.pipeline.id, toolchainCredentials, asyncCallback);
		},
		inputString: ["pipelineInfo", function(asyncCallback, r) {
			getStringForInput(r.pipelineInfo, event, toolchainCredentials, asyncCallback);
		}],
		requestedBy: function(asyncCallback) {
			getRequestor(event, toolchainCredentials, asyncCallback);
		}
	}, function(err, results) {
		if (err) {
			callback(err);
		} else {
			var message = {};

			message.username = "Pipeline '" + results.pipelineInfo.label + "'";
			message.icon_url = nconf.get("icons:pipeline");
			
		    // Pretext & statusColor
			var statusColor;
		    var statusText = "STARTED";
		    var pretext = getPreTextForStage(results.pipelineInfo.dashboard_url, event, "STARTED");

			var inputString = results.inputString;
			if (inputString && inputString.length > 0) {
				inputString = "\nInput: " + inputString;
			}

			var startedString = "";
			if (event.execution.createdAt != null) {
		        startedString += "\nStarted: " + new Date(event.execution.createdAt).toUTCString();
			}
		    
		    var text = "Triggered by _*" + results.requestedBy + "*_"  + inputString + startedString;
		    
			var attachment = {};
			attachment.fallback = "Stage '" + event.stage.name + "' #" + event.execution.number + " " + statusText;
		    attachment.pretext = pretext;
		    //attachment.color = statusColor;
		    attachment.text = text;
		    
		    attachment.mrkdwn_in = ["pretext", "text"];

		    // attachment needs to be stringify in order to be processed
		    message.attachments = JSON.stringify([attachment]);
		    
		    callback(null, message);
		}
	});
}

function createMessageForStageCompleted(event, toolchainCredentials, callback) {
	var logPrefix = "[" + logBasePath + ".createMessageForStageCompleted] ";
	async.auto({
		pipelineInfo: function(asyncCallback) {
			pipelineUtil.getPipelineInfo(event.pipeline.id, toolchainCredentials, asyncCallback);
		},
		inputString: ["pipelineInfo", function(asyncCallback, r) {
			getStringForInput(r.pipelineInfo, event, toolchainCredentials, asyncCallback);
		}],
		requestedBy: function(asyncCallback) {
			getRequestor(event, toolchainCredentials, asyncCallback);
		}
	}, function(err, results) {
		if (err) {
			callback(err);
		} else {
			var message = {};
			message.username = "Pipeline '" + results.pipelineInfo.label + "'";
			message.icon_url = nconf.get("icons:pipeline");
			
		    // Pretext & statusColor
			var statusColor;
		    var statusText;
		    if (event.execution.successful) {
		    	statusText = "PASSED";
		    	statusColor = successColor;
		    } else {
		    	statusText = "FAILED";
		    	statusColor = failedColor;
		    }
		    var pretext = getPreTextForStage(results.pipelineInfo.dashboard_url, event, statusText);
		
			var inputString = results.inputString;
			if (inputString && inputString.length > 0) {
				inputString = "\nInput: " + inputString;
			}
		
			var startedString = "";
			if (event.execution.createdAt != null) {
		        startedString += "\nStarted: " + new Date(event.execution.createdAt).toUTCString();
			}
		
			var durationString = "";
			if (event.execution.createdAt != null && event.execution.completedAt != null) {
		        var duration = event.execution.completedAt - event.execution.createdAt;
		        durationString = "\nDuration: " + formatDurationWords(duration);
		    }
		
			var jobStatuses = "";
		    if (!event.execution.successful) {
		    	if (!_.isEmpty(event.execution.jobExecutions)) {
		    		_.map(event.execution.jobExecutions, function(jobExecution) {
		    			var job = _.findWhere(event.stage.jobs, {"id": jobExecution.jobId});
		    			if (!_.isUndefined(job) && _.isString(jobExecution.jobId) && (jobExecution.jobId.length > 0)) {        				
		                    var jobName = job.componentName;
		                    var jobStatusText;
		                    if (_.isUndefined(jobExecution.successful) || _.isNull(jobExecution.successful)) {
		                    	jobStatusText ="not completed"; 
		                    } else if (jobExecution.successful) {
		                    	jobStatusText = "passed";
		                    } else {
		                    	jobStatusText = "failed";
		                    }
		                    var jobExecutionUrl = getJobExecutionUrl(results.pipelineInfo.dashboard_url, event.pipeline, event.stage, job, jobExecution);
		                    jobStatuses += "\nJob *'" + jobName + "'* has _*<" + jobExecutionUrl + "|" + jobStatusText + ">*_";
		    			}
		    		})
		    	}
		    }
			
		    var text = "Triggered by _*" + results.requestedBy + "*_"  + inputString + startedString + durationString + jobStatuses;
		    
			var attachment = {};
			attachment.fallback = "Stage '" + event.stage.name + "' #" + event.execution.number + " " + statusText;
		    attachment.pretext = pretext;
		    attachment.color = statusColor;
		    attachment.text = text;
		    
		    //attachment.author_name = "pipeline";
		    //attachment.author_icon = "pipeline icon"
		    
		    attachment.mrkdwn_in = ["pretext", "text"];
		
		    // attachment needs to be stringify in order to be processed
		    message.attachments = JSON.stringify([attachment]);
		    
		    callback(null, message);
		}
	});

}

function createMessageForJobStarted(event, toolchainCredentials, callback) {
	var logPrefix = "[" + logBasePath + ".createMessageForJobStarted] ";
	async.parallel({
		pipelineInfo: function(asyncCallback) {
			pipelineUtil.getPipelineInfo(event.pipeline.id, toolchainCredentials, asyncCallback);
		},
		requestedBy: function(asyncCallback) {
			getRequestor(event, toolchainCredentials, asyncCallback);
		}
	}, function(err, results) {
		if (err) {
			callback(err);
		} else {
			var message = {};
			message.username = "Pipeline '" + results.pipelineInfo.label + "'";
			message.icon_url = nconf.get("icons:pipeline");

			var job = event.job;
			var jobExecution = _.findWhere(event.execution.jobExecutions, {"jobId": job.id});
				
			var preStatusText = " has ";
			var statusText; 
			if (jobExecution) {
				if (jobExecution.status == "OK") {
			        statusText = "STARTED";
				} if (jobExecution.status == "FAILED") {
					statusText = "FAILED";
				} else if (jobExecution.status == "CONFIGURING") {
					preStatusText = " has been "
					statusText = "CONFIGURED";
				} else if (jobExecution.status == "QUEUED") {
					preStatusText = " has been "
					statusText = "QUEUED";
				} else {
					statusText = jobExecution.status;
				}		
			}
		    var executionUrl = getJobExecutionUrl(results.pipelineInfo.dashboard_url, event.pipeline, event.stage, event.job, jobExecution);
		
		    var pretext = "Job *'" + event.job.componentName + "'* in Stage *'" + event.stage.name + "'* #" + event.execution.number + preStatusText + "_*<" + executionUrl + "|" + statusText + ">*_";
		
			// No start time for jobStarted event
		    var text = "Triggered by _*" + results.requestedBy + "*_";
		
			var attachment = {};
		    attachment.fallback = "Job '" + event.job.componentName + "' in Stage '" + event.stage.name + "' #" + event.execution.number + " " + statusText;			
		    attachment.pretext = pretext;
		    attachment.text = text;
		    attachment.mrkdwn_in = ["pretext", "text"];
		
		    // attachment needs to be stringify in order to be processed
		    message.attachments = JSON.stringify([attachment]);
		
		    callback(null, message);
		}
	});
	
}

function createMessageForJobCompleted(event, toolchainCredentials, callback) {
	var logPrefix = "[" + logBasePath + ".createMessageForJobCompleted] ";
	async.parallel({
		pipelineInfo: function(asyncCallback) {
			pipelineUtil.getPipelineInfo(event.pipeline.id, toolchainCredentials, asyncCallback);
		},
		requestedBy: function(asyncCallback) {
			getRequestor(event, toolchainCredentials, asyncCallback);
		}
	}, function(err, results) {
		if (err) {
			callback(err);
		} else {
			var message = {};
			message.username = "Pipeline '" + results.pipelineInfo.label + "'";
			message.icon_url = nconf.get("icons:pipeline");
		
			var job = event.job;
			var jobExecution = _.findWhere(event.execution.jobExecutions, {"jobId": job.id});
			
			var statusText; 
			var statusColor;
			if (jobExecution) {
			    if (jobExecution.successful) {
			    	statusText = "PASSED";
			    	statusColor = successColor;
			    } else {
			    	statusText = "FAILED";
			    	statusColor = failedColor;
			    }
				
			    if (jobExecution.status == "ABORTED") {
			        statusText = "ABORTED";
			        statusColor = abortedColor;
			    }		
			}
			
		    var executionUrl = getJobExecutionUrl(results.pipelineInfo.dashboard_url, event.pipeline, event.stage, event.job, jobExecution);
		
		    var pretext = "Job *'" + event.job.componentName + "'* in Stage *'" + event.stage.name + "'* #" + event.execution.number + " has _*<" + executionUrl + "|" + statusText + ">*_";
		
			var startedString = "";
			var durationString = "";
			if (jobExecution) {
				if (jobExecution.startTime != null) {
			        startedString += "\nStarted: " + new Date(jobExecution.startTime).toUTCString();
				}
				if (jobExecution.duration != null) {
			        durationString = "\nDuration: " + formatDurationWords(jobExecution.duration);
			    }
			}
		
		    var text = "Triggered by _*" + results.requestedBy + "*_"  + startedString + durationString;
		
			var attachment = {};
		    attachment.fallback = "Job '" + event.job.componentName + "' in Stage '" + event.stage.name + "' #" + event.execution.number + " " + statusText;			
		    attachment.color = statusColor;
		    attachment.pretext = pretext;
		    attachment.text = text;
		    attachment.mrkdwn_in = ["pretext", "text"];
		
		    // attachment needs to be stringify in order to be processed
		    message.attachments = JSON.stringify([attachment]);
		
		    callback(null, message);
		}
	});
	
}