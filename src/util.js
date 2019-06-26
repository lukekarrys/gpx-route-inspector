const geoDistance = require('node-geo-distance').vincentySync

const gpxDistance = (point1, point2) =>
  +geoDistance(
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
    return acc + (next == null ? 0 : gpxDistance(point, next))
  }, 0)

const trackAeg = points =>
  points.reduce((acc, point, index) => {
    const next = points[index + 1]
    return (
      acc + (next == null || next.ele <= point.ele ? 0 : next.ele - point.ele)
    )
  }, 0)

module.exports = {
  gpxDistance,
  trackDistance,
  trackAeg
}
