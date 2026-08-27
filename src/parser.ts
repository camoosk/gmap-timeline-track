import type { LatLng, TimelineData, TimelineEvent } from './types'

type Raw = Record<string, any>

function parseLatLng(value: unknown): LatLng | null {
  if (typeof value !== 'string') return null
  const match = value.match(/(-?\d+(?:\.\d+)?)\s*[°,]\s*(-?\d+(?:\.\d+)?)/)
  if (!match) return null
  return { lat: Number(match[1]), lng: Number(match[2]) }
}

function point(value: unknown, time?: string): LatLng | null {
  const p = parseLatLng(value)
  return p ? { ...p, time } : null
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
      const points = [point(activity.start?.latLng, start), point(activity.end?.latLng, end)].filter(Boolean) as LatLng[]
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
      const p = point(candidate.placeLocation?.latLng, start)
      events.push({
        id: `visit-${index}`,
        start, end, kind: 'visit', points: p ? [p] : [],
        placeId: candidate.placeId,
        semanticType: candidate.semanticType,
        probability: Number(candidate.probability) || Number(visit.probability) || undefined,
      })
    }

    if (Array.isArray(segment.timelinePath) && segment.timelinePath.length) {
      const points = segment.timelinePath.map((x: Raw) => point(x.point, x.time)).filter(Boolean) as LatLng[]
      if (points.length) events.push({ id: `path-${index}`, start, end, kind: 'path', points })
    }
  })

  events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
  return { events, start: events[0]?.start ?? '', end: events.at(-1)?.end ?? '' }
}
