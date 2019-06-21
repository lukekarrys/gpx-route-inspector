const { promisify } = require('util')
const _ = require('lodash')
const fs = require('fs')
const path = require('path')
const readFile = promisify(fs.readFile)
const xml2js = require('xml2js')
const parseXmlString = promisify(xml2js.parseString)
const geoDistance = require('node-geo-distance').vincentySync
const turf = require('@turf/turf')
const routeInspector = require('./route-inspector')
const package = require('./package.json')

const INTERSECTION_THRESHOLD = 35 // in meters
const SHARED_TRAILHEAD_THRESHOLD = 50 // in meters
const START_POSITION_SEPARATOR = '|'
const NEARBY_POINT_INDICES = [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5]
const CREATOR = `${package.name}@${package.version}`

const readFiles = files =>
  Promise.all(files.map(file => readFile(file, 'utf-8')))

const gpxToPoints = (file, fileData) =>
  file.gpx.trk[0].trkseg[0].trkpt.map((point, index, points) => {
    const name = path.basename(fileData.name, path.extname(fileData.name))
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

const gpxDistance = (point1, point2) =>
  geoDistance(
    {
      latitude: point1.lat,
      longitude: point1.lon
    },
    {
      latitude: point2.lat,
      longitude: point2.lon
    }
  )

const trackDistance = points =>
  points.reduce((acc, point, index) => {
    const next = points[index + 1]
    return acc + (next == null ? 0 : +gpxDistance(point, next))
  }, 0)

const trackAeg = points =>
  points.reduce((acc, point, index) => {
    const next = points[index + 1]
    return (
      acc + (next == null || next.ele <= point.ele ? 0 : next.ele - point.ele)
    )
  }, 0)

const findClosestDifferingTrailPoint = (points, point) =>
  points.reduce(
    (acc, p) => {
      const distance = +gpxDistance(p, point)
      if (distance < acc.distance && p.name !== point.name) {
        return { point: p, distance }
      }
      return acc
    },
    { point: null, distance: Number.POSITIVE_INFINITY }
  )

module.exports = async ({
  type = 'gpx',
  filePaths,
  names,
  start,
  name = names.join(', '),
  description = `The shortest route that visits all the edges of ${names.join(
    ', '
  )}`
}) => {
  const gpxFiles = await readFiles(filePaths)
  const gpxTrails = await Promise.all(gpxFiles.map(f => parseXmlString(f)))

  const trailsPoints = gpxTrails.map((gpxData, index) =>
    gpxToPoints(gpxData, { name: filePaths[index] })
  )

  const trailEndpoints = _.flatten(
    trailsPoints.map(points => [_.first(points), _.last(points)])
  )

  const vertices = []
  for (let point of trailEndpoints) {
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
      distance: trackDistance(edge),
      aeg: trackAeg(edge)
    }
  })

  // Find the id of the vertex that matches the passed in start parameter
  const startVertex = fullVertices.find(vertex => {
    const [startName, startPosition = 'START'] = start.split(
      START_POSITION_SEPARATOR
    )
    return vertex.endpoints.find(
      e =>
        e.name === startName &&
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
