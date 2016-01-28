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
	log4js = require("log4js")
;

var logger = log4js.getLogger("otc-slack-broker"),
	logPrefix = "[lib.util.toolchain-util]"
;

exports.getToolchainName = getToolchainName;

function getToolchainName(toolchainId, authorization, callback) {
	callback(null, toolchainId);				
}