import type { LatLng, TimelineData, TimelineEvent } from './types'

type Raw = Record<string, any>

function parseLatLng(value: unknown): { lat: number; lng: number } | null {
  if (typeof value === 'string') {
    // Google Timeline commonly exports values like: "-6.5293994°, 106.7964321°"
    const match = value.match(/(-?\d+(?:\.\d+)?)\s*°?\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*°?/) 
    if (match) return { lat: Number(match[1]), lng: Number(match[2]) }

    // Also accept geo:lat,lng and whitespace-separated coordinates.
    const geo = value.match(/geo:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i)
    if (geo) return { lat: Number(geo[1]), lng: Number(geo[2]) }
  }

  if (value && typeof value === 'object') {
    const v = value as Raw
    const lat = Number(v.lat ?? v.latitude ?? v.Latitude)
    const lng = Number(v.lng ?? v.lon ?? v.longitude ?? v.Longitude)
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
  }

  return null
}

function point(value: unknown, time?: string): LatLng | null {
  const p = parseLatLng(value)
  if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return null
  return { ...p, time }
}

export function parseTimeline(input: unknown): TimelineData {
  const root = input as Raw
  const segments: Raw[] = Array.isArray(root?.semanticSegments) ? root.semanticSegments : []
  const events: TimelineEvent[] = []

  segments.forEach((segment, index) => {
    const start = segment.startTime
    const end = segment.endTime
    if (!start || !end) return

    if (segment.activity) {
      const activity = segment.activity as Raw
      const points = [
        point(activity.start?.latLng ?? activity.start?.LatLng, start),
        point(activity.end?.latLng ?? activity.end?.LatLng, end),
      ].filter(Boolean) as LatLng[]

      events.push({
        id: `trip-${index}`,
        start, end, kind: 'trip', points,
        distanceMeters: Number(activity.distanceMeters) || undefined,
        activityType: activity.topCandidate?.type,
        probability: Number(activity.topCandidate?.probability) || undefined,
      })
    }

    if (segment.visit) {
      const visit = segment.visit as Raw
      const candidate = visit.topCandidate ?? {}
      const p = point(candidate.placeLocation?.latLng ?? candidate.placeLocation?.LatLng, start)
      events.push({
        id: `visit-${index}`,
        start, end, kind: 'visit', points: p ? [p] : [],
        placeId: candidate.placeId,
        semanticType: candidate.semanticType,
        probability: Number(candidate.probability) || Number(visit.probability) || undefined,
      })
    }

    if (Array.isArray(segment.timelinePath) && segment.timelinePath.length) {
      const points = segment.timelinePath
        .map((x: Raw) => point(x.point ?? x.latLng ?? x.LatLng, x.time ?? x.timestamp ?? start))
        .filter(Boolean) as LatLng[]

      if (points.length) events.push({ id: `path-${index}`, start, end, kind: 'path', points })
    }
  })

  events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
  return { events, start: events[0]?.start ?? '', end: events.at(-1)?.end ?? '' }
}
