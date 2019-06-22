const test = require('ava')
const fs = require('fs')
const { promisify } = require('util')
const path = require('path')
const gpxRouteInspector = require('./index')
const util = require('./util')

const testExample = async (name, start) => {
  const dir = path.resolve(__dirname, 'examples', name, 'routes')
  const filePaths = (await promisify(fs.readdir)(dir)).map(f =>
    path.join(dir, f)
  )
  const { coordinates } = await gpxRouteInspector({
    filePaths,
    start,
    type: 'geojson'
  })
  return {
    coordinates,
    distance: util.trackDistance(
      coordinates.map(c => ({ lat: c[1], lon: c[0] }))
    ),
    aeg: util.trackAeg(coordinates.map(c => ({ ele: c[2] })))
  }
}

test('santan', async t => {
  const { coordinates, aeg, distance } = await testExample(
    'santan',
    'GOLDMINE|END'
  )

  t.deepEqual(coordinates.length, 1190)
  t.deepEqual(distance.toFixed(3), '39208.974')
  t.deepEqual(aeg.toFixed(3), '740.190')
})

test('usery', async t => {
  const { coordinates, aeg, distance } = await testExample(
    'usery',
    'PASS-MOUNTAIN'
  )

  t.deepEqual(coordinates.length, 1589)
  t.deepEqual(distance.toFixed(3), '66895.779')
  t.deepEqual(aeg.toFixed(3), '953.730')
})
