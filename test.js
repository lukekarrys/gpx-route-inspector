const test = require('ava')
const fs = require('fs')
const { promisify } = require('util')
const path = require('path')
const gpxRouteInspector = require('./index')
const util = require('./util')

const readdirWithPath = async dir => {
  const files = await promisify(fs.readdir)(dir)
  return files.map(f => path.join(dir, f))
}

test('santan', async t => {
  const { coordinates } = await gpxRouteInspector({
    filePaths: await readdirWithPath(
      path.resolve(__dirname, 'examples', 'santan', 'routes')
    ),
    start: 'GOLDMINE|END',
    type: 'geojson'
  })

  const distance = util.trackDistance(
    coordinates.map(c => ({ lat: c[1], lon: c[0] }))
  )
  const aeg = util.trackAeg(coordinates.map(c => ({ ele: c[2] })))

  t.deepEqual(coordinates.length, 1190)
  t.deepEqual(distance.toFixed(3), '39208.974')
  t.deepEqual(aeg.toFixed(3), '740.190')
})

test('usery', async t => {
  const { coordinates } = await gpxRouteInspector({
    filePaths: await readdirWithPath(
      path.resolve(__dirname, 'examples', 'usery', 'routes')
    ),
    start: 'PASS-MOUNTAIN',
    type: 'geojson'
  })

  const distance = util.trackDistance(
    coordinates.map(c => ({ lat: c[1], lon: c[0] }))
  )
  const aeg = util.trackAeg(coordinates.map(c => ({ ele: c[2] })))

  t.deepEqual(coordinates.length, 1589)
  t.deepEqual(distance.toFixed(3), '66895.779')
  t.deepEqual(aeg.toFixed(3), '953.730')
})
