# gpx-route-inspector

Find the shortest closed circuit that will visit all paths from a series of connected GPX files.

## Instructions

1. `git clone --recursive git@github.com:lukekarrys/gpx-route-inspector.git`
1. `npm install`
1. `cd gpx-route-inspector`
1. `cd postman_problems`
1. Run [`postman_problems` install instructions](https://github.com/brooksandrew/postman_problems/tree/4e384767371e8d67a901712adf56deb9e3c79bf4#id2)
1. `cd ..`
1. `./cli.js --gpx examples/santan/routes --start 'GOLDMINE|END' --type gpx`

## Output

[San Tan Mountain Regional Park](./examples/santan/output.geojson)

## TODO

- [ ] Port `postman_problems` to JavaScript
- [ ] Handle GPX files with overlapping sections
