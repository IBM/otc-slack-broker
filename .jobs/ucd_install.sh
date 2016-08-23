#!/bin/sh

usage () {
    cat <<USAGE
NAME

$(basename $0) - Prepares the environment for an OpenToolchain Component's install.

SYNOPSIS

export JML_FILE=\${p:localPath}/sl-tools/VMconfigs/\${p:configFile}
export IAAS_LOCATION=\${p:localPath}/sl-tools/bin/iaas

$(basename $0)

ENVIRONMENT VARIABLES

    JML_FILE
        The location of a JML configuration file.  If this is run from within a
        UCD component process, consider:

        \${p:localPath}/sl-tools/VMconfigs/\${p:configFile}

    IAAS_LOCATION
        The location of the iaas utility for reading JML values and running
        internal provisioning APIs.  If this is run from within a UCD component process, consider:

        \${p:localPath}/sl-tools/bin/iaas
USAGE
}

iaas_get () {
    iaas_get_key=$1; shift

    if ! "$IAAS_LOCATION" -j -c "$JML_FILE" get-env-param -f -p "$iaas_get_key"; then
	echo "$iaas_get_key: Could not fetch JML property" >&2
	return 1
    fi
}

if [ "$JML_FILE" ]; then
    echo "JML_FILE=$JML_FILE"
else
    echo "JML_FILE: Expected envvar not specified!" >&2
    usage >&2
    exit 1
fi

if [ "$IAAS_LOCATION" ]; then
    echo "IAAS_LOCATION=$IAAS_LOCATION"
else
    echo "IAAS_LOCATION: Expected envvar not specified!" >&2
    usage >&2
    exit 1
fi

set -x

# Configure the deploy script
#
export CF_APP="otc-slack-broker"
export DOMAIN=$(iaas_get bluemix_env_domain)
export ENV=$(iaas_get bluemix_env_name)
export ROUTE="otc-slack-broker"
export TEST_URL_PATH="/status"

# Configure the actual app
#
export CF_SERVICES="otc-db:$CLOUDANT_SERVICE_NAME:$CLOUDANT_SERVICE_PLAN"

export app_url="https://$ROUTE.$DOMAIN"

export app_BUILD_NUMBER="$(<.pipeline_build_id)" 
export app_LOG4J_LEVEL="$SERVICE_LOG_LEVEL"
export app_SECGRP="$DATA_LABELING"

# Configuration for logmet
export app_log4js_logmet_enabled="true"
export app_log4js_logmet_component="otc-slack-broker"
export app_log4js_logmet_logging_token="$(iaas_get otc_logging_token)"
export app_log4js_logmet_space_id="$(iaas_get otc_logging_space_id)"
export app_log4js_logmet_logging_host="$(iaas_get otc_logging_logstash_host)"
export app_log4js_logmet_logging_port="$(iaas_get otc_logging_logstash_port)"

# Configuration for qradar syslog appender
export app_log4js_syslog_appender_enabled=false
qradar_host="$(iaas_get qradar_isie_ip)"
if [ "$qradar_host" -a "$qradar_host" != 1.1.1.1 ]; then
    export app_log4js_syslog_appender_enabled=true
    export app_log4js_syslog_appender_useUdpSyslog=true
    export app_log4js_syslog_appender_host="$qradar_host"
    export app_log4js_syslog_appender_port="$(iaas_get otc_qradar_udp_port)"
    export app_log4js_syslog_appender_product="otc-slack-broker"
fi

# Configuration to connect to the otc-status app
export app_otc_status="https://otc-status.$DOMAIN"

# Environment variables dedicated to slack broker defined using export app_<variable>
export app_TIAM_CLIENT_ID=slack
export app_TIAM_URL="https://devops-api.$DOMAIN/v1/identity"
export app_icons__github=https://assets-cdn.github.com/images/modules/logos_page/GitHub-Mark.png
export app_icons__pipeline=http://blade-resources.mybluemix.net/pipeline.png
export app_icons__toolchain=http://blade-resources.mybluemix.net/toolchain-32.png
export app_services__otc_api=https://otc-api.$DOMAIN/api/v1
export app_services__otc_ui=https://dev-console.$DOMAIN/devops
export app_services__slack_api=https://slack.com/api

export app_ENABLE_NEW_RELIC="$ENABLE_NEW_RELIC"
export app_NEW_RELIC_APP_NAME="$CF_APP-$ENV"
export app_NEW_RELIC_LICENSE_KEY="$NEW_RELIC_LICENSE_KEY"

# TO BE REFINED
export app_OTC_API_BROKER_SECRET=LIyBrsboF3KLeWKNlpR21wLwoXGYI4Tw51bHgJPsK1rDjZFqPT

chmod u+x "$(dirname "$0")/../otc-cf-deploy/deploy"
"$_" "$@"

