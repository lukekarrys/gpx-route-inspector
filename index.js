const { promisify } = require('util')
const _ = require('lodash')
const fs = require('fs')
const path = require('path')
const readFile = promisify(fs.readFile)
const xml2js = require('xml2js')
const parseXmlString = promisify(xml2js.parseString)
const turf = require('@turf/turf')
const routeInspector = require('./route-inspector')
const package = require('./package.json')
const debug = require('debug')(package.name)
const util = require('./util')

const INTERSECTION_THRESHOLD = 35 // in meters
const SHARED_TRAILHEAD_THRESHOLD = 60 // in meters
const START_POSITION_SEPARATOR = '|'
const NEARBY_POINT_INDICES = [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5]
const CREATOR = `${package.name}@${package.version}`

const basenameNoExt = f => path.basename(f, path.extname(f))

const readFiles = files =>
  Promise.all(files.map(file => readFile(file, 'utf-8')))

const gpxToPoints = (file, fileName) =>
  file.gpx.trk[0].trkseg[0].trkpt.map((point, index, points) => {
    const name = basenameNoExt(fileName)
    return {
      name,
      index: index + 1,
      total: points.length,
      id: `${name}-${index + 1}/${points.length}`,
      lat: +point.$.lat,
      lon: +point.$.lon,
      ele: +point.ele[0]
    }
  })

const renameGpxPoints = (points, newName) =>
  points.map((p, index) => {
    const name = `${p.name}${newName}`
    return {
      ...p,
      name,
      index: index + 1,
      total: points.length,
      id: `${name}-${index + 1}/${points.length}`
    }
  })

const findClosestDifferingTrailPoint = (points, point) =>
  points.reduce(
    (acc, p) => {
      const distance = util.gpxDistance(p, point)
      if (distance < acc.distance && p.id !== point.id) {
        return { point: p, distance }
      }
      return acc
    },
    { point: null, distance: Number.POSITIVE_INFINITY }
  )

const getEndpoints = arr => [_.first(arr), _.last(arr)]

module.exports = async ({
  type = 'gpx',
  filePaths,
  start,
  names = filePaths.map(basenameNoExt),
  name = names.join(', '),
  description = `The shortest route that visits all the edges of ${names.join(
    ', '
  )}`
}) => {
  if (!filePaths || filePaths.length === 0) {
    throw new Error('No gpx files')
  }

  if (
    !filePaths
      .map(basenameNoExt)
      .includes(start.split(START_POSITION_SEPARATOR)[0])
  ) {
    throw new Error('start option must be one of the files')
  }

  const gpxFiles = await readFiles(
    filePaths.filter(f => !path.basename(f).startsWith('_'))
  )
  const gpxTrails = await Promise.all(gpxFiles.map(f => parseXmlString(f)))

  const trailsPoints = gpxTrails.map((gpxData, index) =>
    gpxToPoints(gpxData, filePaths[index])
  )

  const trailEndpoints = []
  const allEndpoints = []
  for (let [index, points] of trailsPoints.entries()) {
    const [start, end] = getEndpoints(points)
    const isLoop = util.gpxDistance(start, end) < SHARED_TRAILHEAD_THRESHOLD

    if (isLoop) {
      // Cut a looped trail in half in case it doesnt intersect with anything else
      // so that we still traverse the whole thing
      const [firstHalf, secondHalf] = _.chunk(
        points,
        Math.ceil(points.length / 2)
      ).map((points, index, list) => {
        const sharedPoints =
          index === 1 ? [_.clone(_.last(list[0])), ...points] : points
        return renameGpxPoints(sharedPoints, `-SPLIT-${index + 1}`)
      })

      trailsPoints[index] = firstHalf
      trailsPoints.splice(index + 1, 0, secondHalf)

      trailEndpoints.push(getEndpoints(firstHalf))
      trailEndpoints.push(getEndpoints(secondHalf))
      allEndpoints.push(...getEndpoints(firstHalf))
      allEndpoints.push(...getEndpoints(secondHalf))
    } else {
      trailEndpoints.push([start, end])
      allEndpoints.push(...[start, end])
    }
  }

  debug(
    'Trails points',
    JSON.stringify(
      trailsPoints.map(t => `${t[0].name} -- ${t[0].total}`),
      null,
      2
    )
  )

  const vertices = []
  for (let point of allEndpoints) {
    const closest = findClosestDifferingTrailPoint(_.flatten(vertices), point)
    const clonedPoint = _.clone(point)

    if (closest.distance < SHARED_TRAILHEAD_THRESHOLD) {
      const index = vertices.findIndex(vertex =>
        vertex.some(v => v.id === closest.point.id)
      )
      vertices[index].push(clonedPoint)
    } else {
      vertices.push([clonedPoint])
    }
  }

  debug(
    'Vertices',
    JSON.stringify(vertices.map(v => v.map(v => v.id).join(',')), null, 2)
  )

  const flatVerticesEndpoints = _.flatten(vertices)

  const getVertexWithPoint = p => {
    return vertices.find(v =>
      v.find(e => e.id === `${p.name}-${p.index}/${p.total}`)
    )
  }

  const getClosestVertex = p => {
    const index = p.index / p.total < 0.5 ? 1 : p.total
    return getVertexWithPoint(Object.assign({}, p, { index }))
  }

  const getClosestEndpoints = p => {
    const vertex = getClosestVertex(p)
    return vertex || []
  }

  const edges = []
  let nextEdge = []
  for (let points of trailsPoints) {
    for (let [index, point] of points.entries()) {
      // The trail is starting
      if (!nextEdge.length) {
        nextEdge.push(point)
        continue
      }

      const nextPoint = points[index + 1]

      // The trail is ending
      if (nextPoint == null) {
        nextEdge.push(point)
        edges.push(nextEdge)
        nextEdge = []
        continue
      }

      const closestPoint = findClosestDifferingTrailPoint(
        flatVerticesEndpoints,
        point
      )

      // There could be multiple points from another trail within the threshold
      // so we skip marking an intersection if there is another point even closer
      // than this one.
      const closestNearPoint = _.minBy(
        NEARBY_POINT_INDICES.map(change => points[index + change])
          .filter(Boolean)
          .map(p => findClosestDifferingTrailPoint(flatVerticesEndpoints, p)),
        'distance'
      )

      // This checks whether the point shares an endpoint with the closestPoint
      // which can happen when two trails start from the same point and go in similar
      // directions. When this happens there can be a few points that are close
      // enough together to trigger an intersection but we know that if they emanated
      // from the same point, then we should ignore the intersection
      const closestEndpoint = getClosestEndpoints(point).find(
        endpoint => endpoint.id === closestPoint.point.id
      )

      if (
        closestPoint.distance < INTERSECTION_THRESHOLD &&
        closestPoint.distance < closestNearPoint.distance &&
        !closestEndpoint
      ) {
        // Update vertex with both points so we can get a shared name
        const sharedVertex = getVertexWithPoint(closestPoint.point)
        sharedVertex.push(point)

        nextEdge.push(point)
        edges.push(nextEdge)

        // Start next edge so they share a point
        nextEdge = []
        nextEdge.push(point)

        continue
      }

      nextEdge.push(point)
    }
  }

  const fullVertices = vertices.map(endpoints => {
    const center = turf.center(
      turf.featureCollection(endpoints.map(p => turf.point([p.lon, p.lat])))
    )
    return {
      id: _.sortBy(endpoints, 'id')
        .map(p => p.id)
        .join('-'),
      center: {
        lat: center.geometry.coordinates[1],
        lon: center.geometry.coordinates[0]
      },
      endpoints
    }
  })

  const fullEdges = edges.map(edge => {
    const [firstPoint, lastPoint] = [_.first(edge), _.last(edge)].map(p =>
      fullVertices.find(vertex =>
        vertex.endpoints.find(vertexPoint => vertexPoint.id === p.id)
      )
    )
    return {
      name: _.first(_.uniq(edge.map(e => e.name))),
      points: edge,
      start: firstPoint.id,
      end: lastPoint.id,
      distance: util.trackDistance(edge),
      aeg: util.trackAeg(edge)
    }
  })

  debug(
    'Edges',
    JSON.stringify(fullEdges.map(e => `${e.start} <---> ${e.end}`), null, 2)
  )

  // Find the id of the vertex that matches the passed in start parameter
  const startVertex = fullVertices.find(vertex => {
    const [startName, startPosition = 'START'] = start.split(
      START_POSITION_SEPARATOR
    )
    return vertex.endpoints.find(
      e =>
        (startName === e.name ||
          startName === e.name.replace('-SPLIT-1', '')) &&
        e.index === (startPosition === 'START' ? 1 : e.total)
    )
  }).id

  // Use the python module to turn the edges as a csv into the full list of segments to run
  const routes = await routeInspector(
    [
      ['from', 'to', 'id', 'distance', 'required'],
      ...fullEdges.map(e => [
        e.start,
        e.end,
        [e.start, e.end, e.name].join('--'),
        e.distance.toFixed(2),
        1
      ])
    ]
      .map(r => r.join(','))
      .join('\n'),
    startVertex
  )

  debug(
    'Routes',
    JSON.stringify(
      routes.map(r => `${r.start} --> ${r.end} -- ${r.distance}`),
      null,
      2
    )
  )

  const fullPoints = routes.reduce((acc, route) => {
    const edge = fullEdges.find(
      e =>
        (route.start === e.start || route.start === e.end) &&
        (route.end === e.end || route.end === e.start) &&
        route.name === e.name
    )
    return acc.concat(
      _[edge.start !== route.start ? 'reverse' : 'identity']([...edge.points])
    )
  }, [])

  debug('Full route', fullPoints.length)

  if (type === 'gpx' || !type) {
    return new xml2js.Builder().buildObject({
      gpx: {
        $: {
          xmlns: 'http://www.topografix.com/GPX/1/1',
          'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
          version: '1.1',
          'xsi:schemaLocation':
            'http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd',
          creator: CREATOR
        },
        metadata: [
          {
            name: [name],
            description: [description]
          }
        ],
        trk: [
          {
            trkseg: [
              {
                trkpt: fullPoints.map(point => ({
                  $: {
                    lon: point.lon,
                    lat: point.lat
                  },
                  ele: [point.ele],
                  name: []
                }))
              }
            ]
          }
        ]
      }
    })
  } else if (type == 'geojson') {
    return {
      type: 'LineString',
      coordinates: fullPoints.map(point => [point.lon, point.lat, point.ele])
    }
  }
}
