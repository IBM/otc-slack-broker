var nconf = require('nconf'),
    request = require("request"),
    async = require("async"),
    path = require('path'),
    Q = require('q')
    test = require('tape'),
	_ = require("underscore"),
	slackClient = require("../lib/client/slack-client")
;

test('Test1 - Test Setup', function (t) {
	
	t.plan(6);
	
	t.equals(slackClient.validateChannelName("####test"), "test");
	t.equals(slackClient.validateChannelName("123456789012345678901234567890"), "123456789012345678901", "Was channel name length ok ?");
	t.equals(slackClient.validateChannelName("   ABCDEF  "), "-abcdef-", "Was channel name with leading and trailing space ok");
	t.equals(slackClient.validateChannelName("abcd___efgh  ijkl--"), "abcd_efgh-ijkl-", "Was channel name with multiple _ or - ok");	
	t.equals(slackClient.validateChannelName("abcd###efgh"), "abcd_efgh", "Was channel name with multiple # in the middle ok");	
	t.equals(slackClient.validateChannelName("a&b'c-dàeçf"), "a_b_c-d_e_f", "Was channel name with non word of hyphen caracter ok");	
});
