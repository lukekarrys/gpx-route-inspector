#!/usr/bin/env bash

./src/cli.js --gpx examples/santan/routes --start 'GOLDMINE|END' --type geojson > examples/santan/output.geojson
./src/cli.js --gpx examples/santan/routes --start 'GOLDMINE|END' --type gpx > examples/santan/output.gpx
./src/cli.js --gpx examples/usery/routes --start 'PASS-MOUNTAIN' --type geojson > examples/usery/output.geojson
./src/cli.js --gpx examples/usery/routes --start 'PASS-MOUNTAIN' --type gpx > examples/usery/output.gpx