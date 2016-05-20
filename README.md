# otc-slack-broker
Open Toolchain Broker for Slack.

Logging
-------

Logging for the Slack Broker is handled using log4js.
To configure the logging levels and output location, modify the config/log4js.json file.
The `request` filter will output Express requests.
The `otc-slack-broker` filter indicates any logging for this component.
Note: Environment variable LOG4J_LEVEL can be set to change the logging level for otc-slack-broker filter at runtime

This is an example log message of an event being handled:
`POST /slack-broker/api/v1/messaging/accept`

Documentation
-------------
Refer to the [swagger](https://otc-slack-broker.ng.bluemix.net/swagger/) for more information on the implemented endpoints.


LOCAL USAGE
-----------
    # Create a local config file from the provided template
    cp config/local-dev.json.template config/local-dev.json
    
    # Edit config/local-dev.json and update the following:
    - Replace CLOUDANT_URL with your Cloudant URL:
        https://<cloudant id>:<cloudant pw>@<cloudant id>.cloudant.com
    - Provide values for TIAM* properties:
        Contact Simon H for Stage1 values.
    - Update services:
        Use the URLs according to your environment (only services:slack is mandatory)


    # Tell the broker to use your local config
    export NODE_ENV=local-dev
    
    # Install the module dependencies
    npm install
    
    # Start the node app
    npm start
    
    # To run the tests, run:
    npm test
    
Dependencies
------------
The Slack Broker has the following dependencies:
- Cloudant
- TIAM

BUGS
----


CONTRIBUTORS
------------
Benoit Jaunin <jauninb@fr.ibm.com>
Jerome Lanneluc <jerome_lanneluc@fr.ibm.com>
