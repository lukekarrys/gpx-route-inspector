#!/usr/bin/env bash

./cli.js --gpx examples/santan/routes --start 'GOLDMINE|END' --type geojson > examples/santan/output.geojson
./cli.js --gpx examples/santan/routes --start 'GOLDMINE|END' --type gpx > examples/santan/output.gpx
./cli.js --gpx examples/usery/routes --start 'PASS-MOUNTAIN' --type geojson > examples/usery/output.geojson
./cli.js --gpx examples/usery/routes --start 'PASS-MOUNTAIN' --type gpx > examples/usery/output.gpx