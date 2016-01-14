'use strict';

var
	nconf = require('nconf'),
	_ = require('underscore')
;

module.exports = function(event) {
	var successColor = "#00B198";
	var failedColor = "#f04e36";
	var abortedColor = "#f18f27";

	var stageEvent = true;

	if (event.event == "stageCompleted") {
		var message = {};
		
		message.username = getProjectName(event.pipeline);
		
		// TODO must correspond to the pipeline icon for slack
		// cf com.ibm.team.integration.pipeline.toolchain.capability.slack.icon
		var iconUrl = null;
		
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

		// Text for the event
		var requestedBy = event.execution.requestedBy;
		if (requestedBy == null || requestedBy == "") {
			requestedBy = "pipeline";
		}

		var inputString = "";
		if (!_.isEmpty(event.execution.inputs)) {
            inputString += "\nInput: ";
            _.map(event.execution.inputs, function(input) {
            	// TODO
                //inputString += getInputString(revisionCommandFactoryManager, stageExecutionFactory, project, stage, inputRevision);
            	inputString += input.revisionId;
            	inputString += ", ";
            });
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
	    attachment.mrkdwn_in = ["pretext", "text"];

	    // attachment needs to be stringify in order to be processed
	    message.attachments = JSON.stringify([attachment]);
	    
	    return message;
	} else if (event.event == "jobCompleted") {
		var message = {};
			
		message.username = getProjectName(event.pipeline);

		var statusText; 
		var statusColor; 
		if (event.task.successfull) {
			statusText = "SUCCEEDED";
			statusColor = successColor;
		} else {
			statusText = "FAILED";		
			statusColor = failedColor;
		}

		if (event.task.status == "ABORTED") {
            statusText = "ABORTED";
            statusColor = abortedColor;			
		}

		var job = null;
		var task = null;
        var executionUrl = getJobExecutionUrl(event.pipeline, event.stage, job, task);

        var pretext = "Job *'" + job.componentName + "'* in Stage *'" + event.stage.name + "'* #" + event.execution.nNumber + " has _*<" + executionUrl + "|" + statusText + ">*_";

		var requestedBy = event.execution.requestedBy;
		if (requestedBy == null || requestedBy == "") {
			requestedBy = "pipeline";
		}
        
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
	    attachment.color = statusColor;
	    attachment.text = text;
	    attachment.mrkdwn_in = ["pretext", "text"];

	    // attachment needs to be stringify in order to be processed
	    message.attachments = JSON.stringify([attachment]);

        return message;

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
	// TODO
	//String jazzHubUrl = JazzHubConfiguration.Properties.getJazzHubUrl();
    //executionLink = UriBuilder.fromPath(jazzHubUrl)
    //        .segment("pipeline", project.getOwner(), project.getShortProjectName(),
    //                stageId, jobId, jobExecutionId)
    //        .build();
	var url = nconf.get("services:pipeline-ui");
	url += pipeline.id;
	url += "/";
	url += stage.id;
	url += "/";
	url += job.id;
	url += "/";
	url += jobExecution.jobExecutionId;
	return url;
}

function getProjectName(pipeline) {
	// TODO
	return "TODO Project Name";
}
