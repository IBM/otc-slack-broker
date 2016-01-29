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
logPrefix = "[lib.event.github]";

module.exports = function(requestId, event, authorization, callback) {
		
	// TODO event name needs to be retrieve elsewhere
	var event_name = event.name;
	
	var payload = event.payload;
	
	logger.debug(logPrefix + "Event " + event.name + ": " + JSON.stringify(event.payload));
	
	if (event_name == "issues") {
		return getMessageForIssuesEvent(payload);
	} else if (event_name == "issue_comment") {
		return getMessageForIssueCommentEvent(payload);
	} else if (event_name == "push") {
		return getMessageForPushEvent(payload);
	} else {
		var message = {};
		message.username = "Github thru OTC Messaging";
		message.icon_url = nconf.get("icons:github");
		message.text = "Unmanaged event:" + event_name;
		return message;		
	}
}


function getMessageForIssuesEvent(payload) {
	var message = {}
	message.username = getProjectName(payload);
	message.icon_url = nconf.get("icons:github");
	
    // Pretext
	var attachment = {};
	if (payload.action == "opened") {
		var pretext = getRepositoryText(payload) + " Issue";
		pretext += " created"
		pretext += " by _*<" + payload.issue.user.html_url + "|" + payload.issue.user.login +">*_";
		if (payload.issue.assignee != null) {
			pretext += " (assigned to _*<" + payload.issue.assignee.html_url + "|" + payload.issue.assignee.login +">*_)";			
		}
		attachment.pretext = pretext;
		attachment.color = "warning";
		attachment.title = "#" + payload.issue.number + " " + payload.issue.title;
		attachment.title_link = payload.issue.html_url;
		attachment.text = payload.issue.body;
        attachment.mrkdwn_in = ["pretext", "text"];
	} else {
		var text = getRepositoryText(payload) + " Issue";
		if (payload.action == "closed") {
			text += " closed:";
		} else if (payload.action == "reopened") {
			text += " re-opened:"
			attachment.color = "warning";
		} else {
			text += " ";
			text += payload.action;
			text += ":";
		}
		text += " _*<" + payload.issue.html_url + "| #" + payload.issue.number + " " + payload.issue.title + ">*_";
		text += " by _*<" + payload.issue.user.html_url + "|" + payload.issue.user.login +">*_";
		attachment.text = text;
        attachment.mrkdwn_in = ["text"];
	}
	
    // attachment needs to be stringify in order to be processed
    message.attachments = JSON.stringify([attachment]);
	
	return message;
}

function getMessageForIssueCommentEvent(payload) {
	var message = {}
	message.username = getProjectName(payload);
	message.icon_url = nconf.get("icons:github");
	
	var attachment = {};
	var pretext = getRepositoryText(payload);
	pretext +=" New comment on issue";
	pretext += " _*<" + payload.issue.html_url + "| #" + payload.issue.number + " " + payload.issue.title + ">*_";
	if (payload.issue.assignee != null) {
		pretext += " (assigned to _*<" + payload.issue.assignee.html_url + "|" + payload.issue.assignee.login +">*_)";			
	}
	attachment.pretext = pretext;
	attachment.color = "warning";

	attachment.title = "Comment by " + payload.comment.user.login;
	attachment.text = payload.comment.body;

    attachment.mrkdwn_in = ["pretext", "text"];

    // attachment needs to be stringify in order to be processed
    message.attachments = JSON.stringify([attachment]);
	
	return message;
}

function getMessageForPushEvent(payload) {
	var message = {}
	message.username = getProjectName(payload);
	message.icon_url = nconf.get("icons:github");
	
	var attachment = {};
	var pretext = getRepositoryText(payload);
	if (payload.commits.length > 1) {
		pretext += " _*<" + payload.compare + "|" + payload.commits.length + " new commits>*_ by " + payload.head_commit.author.name + ":";		
	} else {
		pretext += " 1 new commit by " + payload.head_commit.author.name + ":";
	}
	attachment.pretext = pretext;
	
	attachment.text = _.map(payload.commits, function(commit) {
		var commitText = " _*<" + commit.url + "|" + commit.id.substring(0,7) + ">*_:";
		commitText += " " + commit.message;
		commitText += " - " + commit.author.name;
		commitText += "\n";
		return commitText;
	}).join("");
	attachment.color = "#439FE0";

    attachment.mrkdwn_in = ["pretext", "text"];

    // attachment needs to be stringify in order to be processed
    message.attachments = JSON.stringify([attachment]);
    
	callback(null, message);
}


function getProjectName(payload) {
	// TODO
	return "Project/Toolchain including Github Tool";
}

function getRepositoryText(payload) {
	return "_*<" + payload.repository.html_url + "|[" + payload.repository.full_name + "]>*_";
}