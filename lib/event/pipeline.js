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
	nconf = require('nconf'),
	_ = require('underscore')
;

var logger = log4js.getLogger("otc-slack-broker"),
logPrefix = "[lib.event.pipeline]";

var successColor = "#00B198";
var failedColor = "#f04e36";
var abortedColor = "#f18f27";

module.exports = function(event) {

	logger.debug(logPrefix + "Event " + JSON.stringify(event));
	
	var stageEvent = true;

	if (event.event == "stageStarted") {
		return  getMessageForStageStarted(event);
	} else if (event.event == "stageCompleted") {
		return getMessageForStageCompleted(event);
	} else if (event.event == "jobStarted") {
		return  getMessageForJobStarted(event);
	} else if (event.event == "jobCompleted") {
		return getMessageForJobCompleted(event);
	}
	
	// Default !
	return {username: "Pipeline", text: JSON.stringify(event)};

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
    return durationString;
}

function getJobExecutionUrl(pipeline, stage, job, jobExecution) {
	// TODO - Ensure that the URL will be reachable according to the configuration ?
	// ie reachable thru proxy ?
	var url = nconf.get("services:pipeline-ui");
	url += pipeline.id;
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

function getProjectName(pipeline) {
	// Invocation de otc-api pour retrouver le nom de la pipeline et le dashboard de la pipeline!
	// Il va donc s'agir d'une promise avec un callback sur
	// TODO
	return "Pipeline Name";
}

function getPreTextForStage(event, statusText) {
    var executionUrl = "";
	if (!_.isEmpty(event.execution.jobExecutions)) {
		// Just use the first jobExecution to compute the URL
		var jobExecution = event.execution.jobExecutions[0];
			var job = _.findWhere(event.stage.jobs, {"id": jobExecution.jobId});
			if (!_.isUndefined(job) && _.isString(jobExecution.jobId) && (jobExecution.jobId.length > 0)) {        				
				executionUrl = getJobExecutionUrl(event.pipeline, event.stage, job, jobExecution);
			}
	}
	
    // TODO executionUrl = getStageExecutionUrl(project, stage, execution);
    var pretext = "Stage *'" + event.stage.name + "'* #" + event.execution.number + " has _*<" + executionUrl + "|" + statusText + ">*_";
	return pretext;
}

function getStringForInput(event) {
	var inputString = "";
	if (!_.isEmpty(event.execution.inputs)) {
        _.map(event.execution.inputs, function(input) {
        	// TODO
            //inputString += getInputString(revisionCommandFactoryManager, stageExecutionFactory, project, stage, inputRevision);
        	inputString += input.revisionId;
        	inputString += ", ";
        });
    }
	return inputString;
}

function getStringForRequestor(event) {
	var requestedBy = event.execution.requestedBy;
	if (requestedBy == null || requestedBy == "") {
		requestedBy = "pipeline";
	}
	return requestedBy;
}

function getMessageForStageStarted(event) {
	var message = {};
	
	message.username = getProjectName(event.pipeline);
	
	// TODO must correspond to the pipeline icon for slack
	message.icon_url = nconf.get("icons:pipeline");
	
    // Pretext & statusColor
	var statusColor;
    var statusText = "STARTED";
    var pretext = getPreTextForStage(event, "STARTED");

	// Text for the event
	var requestedBy = getStringForRequestor(event);

	var inputString = getStringForInput(event);
	if (inputString.length > 0) {
		inputString = "\nInput: " + inputString;
	}

	var startedString = "";
	if (event.execution.createdAt != null) {
        startedString += "\nStarted: " + new Date(event.execution.createdAt).toUTCString();
        // TODO getDateTimeString(createdAt);			
	}

    var text = "Triggered by _*" + requestedBy + "*_"  + inputString + startedString;
    
	var attachment = {};
    attachment.pretext = pretext;
    //attachment.color = statusColor;
    attachment.text = text;
    
    //attachment.author_name = "pipeline";
    //attachment.author_icon = "pipeline icon"
    
    attachment.mrkdwn_in = ["pretext", "text"];

    // attachment needs to be stringify in order to be processed
    message.attachments = JSON.stringify([attachment]);
    
    return message;

}

function getMessageForStageCompleted(event) {
	var message = {};
	
	message.username = getProjectName(event.pipeline);
	
	// TODO must correspond to the pipeline icon for slack
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
    
    var pretext = getPreTextForStage(event, statusText);

	// Text for the event
	var requestedBy = getStringForRequestor(event);

	var inputString = getStringForInput(event);
	if (inputString.length > 0) {
		inputString = "\nInput: " + inputString;
	}

	var startedString = "";
	if (event.execution.createdAt != null) {
        startedString += "\nStarted: " + new Date(event.execution.createdAt).toUTCString();
        // TODO getDateTimeString(createdAt);			
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
                    	jobStatusText = "succeeded";
                    } else {
                    	jobStatusText = "failed";
                    }
                    var jobExecutionUrl = getJobExecutionUrl(event.pipeline, event.stage, job, jobExecution);
                    jobStatuses += "\nJob *'" + jobName + "'* has _*<" + jobExecutionUrl + "|" + jobStatusText + ">*_";
    			}
    		})
    	}
    }
	
    var text = "Triggered by _*" + requestedBy + "*_"  + inputString + startedString + durationString + jobStatuses;
    
	var attachment = {};
    attachment.pretext = pretext;
    attachment.color = statusColor;
    attachment.text = text;
    
    //attachment.author_name = "pipeline";
    //attachment.author_icon = "pipeline icon"
    
    attachment.mrkdwn_in = ["pretext", "text"];

    // attachment needs to be stringify in order to be processed
    message.attachments = JSON.stringify([attachment]);
    
    return message;

}

function getMessageForJobStarted(event) {
	var message = {};
	
	message.username = getProjectName(event.pipeline);
	message.icon_url = nconf.get("icons:pipeline");

	var statusText; 
	if (event.job.status == "OK") {
        statusText = "STARTED";
	} if (event.job.status == "FAILED") {
		statusText = "FAILED";
	} else if (event.job.status == "CONFIGURING"){
		statusText = "been CONFIGURED";
	} else {
		statusText = event.job.status;
	}
    var executionUrl = getJobExecutionUrl(event.pipeline, event.stage, event.job, event.execution.jobExecutions[0]);

    var pretext = "Job *'" + event.job.componentName + "'* in Stage *'" + event.stage.name + "'* #" + event.execution.number + " has _*<" + executionUrl + "|" + statusText + ">*_";

	var requestedBy = getStringForRequestor(event);
    
	var startedString = "";
	if (event.execution.createdAt != null) {
        startedString += "\nStarted: " + new Date(event.execution.createdAt).toUTCString();
        // TODO getDateTimeString(createdAt);			
	}

    var text = "Triggered by _*" + requestedBy + "*_"  + startedString;

	var attachment = {};
    attachment.pretext = pretext;
    attachment.text = text;
    attachment.mrkdwn_in = ["pretext", "text"];

    // attachment needs to be stringify in order to be processed
    message.attachments = JSON.stringify([attachment]);

    return message;

	
}

function getMessageForJobCompleted(event) {
	var message = {};
	
	message.username = getProjectName(event.pipeline);
	message.icon_url = nconf.get("icons:pipeline");

	var statusText; 
	var statusColor;
    if (event.execution.successful) {
    	statusText = "PASSED";
    	statusColor = successColor;
    } else {
    	statusText = "FAILED";
    	statusColor = failedColor;
    }
	
    if (event.execution.status == "ABORTED") {
        statusText = "ABORTED";
        statusColor = abortedColor;
    }
	
    var executionUrl = getJobExecutionUrl(event.pipeline, event.stage, event.job, event.execution.jobExecutions[0]);

    var pretext = "Job *'" + event.job.componentName + "'* in Stage *'" + event.stage.name + "'* #" + event.execution.number + " has _*<" + executionUrl + "|" + statusText + ">*_";

	var requestedBy = getStringForRequestor(event);
    
	var startedString = "";
	if (event.execution.createdAt != null) {
        startedString += "\nStarted: " + new Date(event.execution.createdAt).toUTCString();
        // TODO getDateTimeString(createdAt);			
	}

	var durationString = "";
	if (event.execution.duration != null) {
        durationString = "\nDuration: " + formatDurationWords(event.execution.duration);
    }

    var text = "Triggered by _*" + requestedBy + "*_"  + startedString + durationString;

	var attachment = {};
    attachment.pretext = pretext;
    attachment.text = text;
    attachment.mrkdwn_in = ["pretext", "text"];

    // attachment needs to be stringify in order to be processed
    message.attachments = JSON.stringify([attachment]);

    return message;
	
}