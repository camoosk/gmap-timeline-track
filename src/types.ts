export type LatLng = { lat: number; lng: number; time?: string }

export type TimelineEvent = {
  id: string
  start: string
  end: string
  kind: 'trip' | 'visit' | 'path'
  points: LatLng[]
  distanceMeters?: number
  activityType?: string
  placeId?: string
  semanticType?: string
  probability?: number
}

export type TimelineData = { events: TimelineEvent[]; start: string; end: string }
