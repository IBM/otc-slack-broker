###############################################################################
# Licensed Materials - Property of IBM
# (c) Copyright IBM Corporation 2015, 2015. All Rights Reserved.
#
# Note to U.S. Government Users Restricted Rights:
# Use, duplication or disclosure restricted by GSA ADP Schedule
# Contract with IBM Corp.
###############################################################################
#!/bin/bash -x

# Install 32-bit runtime to run 32-bit executables on 64-bit unix
sudo dpkg --add-architecture i386
sudo apt-get update
sudo apt-get -y install libc6:i386 libncurses5:i386 libstdc++6:i386

mkdir archive

# copy all message files (except translations) into archive, following the same folder structure
find . -type f | egrep -i "/[^_]+\.properties$" | xargs -i cp --parents {} archive
find . -type f | egrep -i "/.+_en\.json$" | xargs -i cp --parents {} archive

# Recursively check all .properties files
chmod u+x otc-deploy/tools/chkpli.exe
./otc-deploy/tools/chkpli.exe "archive/*.properties" -OS -S
