#!/usr/bin/env bash

EXAMPLE=$1
START=$2
TYPE=${3:-"gpx"}

nodemon --exec "DEBUG=gpx-route-inspector ./cli.js --gpx examples/$EXAMPLE/routes --start '$START' --type $TYPE > examples/$EXAMPLE/output.$TYPE" -e "js json gpx" --ignore examples/$EXAMPLE/output.gpx