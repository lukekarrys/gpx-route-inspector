#!/usr/bin/env node

const { promisify } = require('util')
const fs = require('fs')
const path = require('path')
const routeInspector = require('./')

const readDir = promisify(fs.readdir)
const { gpx, start, name, description, type } = require('yargs-parser')(
  process.argv.slice(2),
  {
    array: ['gpx'],
    string: ['start', 'name', 'description', 'type']
  }
)

const FILE_EXT = '.gpx'

;(async () => {
  let gpxFiles = gpx

  if (gpx.length === 1) {
    try {
      gpxFiles = (await readDir(gpx[0]))
        .filter(f => path.extname(f) === FILE_EXT)
        .map(f => path.join(gpx[0], f))
    } catch (e) {
      if (e.code === 'ENOTDIR') {
        gpxFiles = gpx
      } else {
        throw e
      }
    }
  }

  let res = await routeInspector({
    filePaths: gpxFiles,
    start,
    name,
    description,
    type
  })

  if (typeof res == 'object') {
    res = JSON.stringify(res, null, 2)
  }

  console.log(res)
})()
