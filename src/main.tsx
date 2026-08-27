import { StrictMode, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import L from 'leaflet'
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import './styles.css'
import { parseTimeline } from './parser'
import type { LatLng, TimelineData, TimelineEvent } from './types'

const playbackIcon = L.divIcon({
  className: 'playback-marker-wrapper',
  html: '<div class="playback-marker"><span></span></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
})

const visitIcon = L.divIcon({
  className: 'visit-marker-wrapper',
  html: '<div class="visit-marker"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

const tripStartIcon = L.divIcon({
  className: 'trip-start-wrapper',
  html: '<div class="trip-start-marker">A</div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
})

const tripEndIcon = L.divIcon({
  className: 'trip-end-wrapper',
  html: '<div class="trip-end-marker">B</div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
})

function FitMap({ points }: { points: LatLng[] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 1) map.setView([points[0].lat, points[0].lng], 15)
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points.map(p => [p.lat, p.lng] as [number, number])), { padding: [35, 35] })
  }, [points, map])
  return null
}

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '—'
}

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleDateString('id-ID', { dateStyle: 'full' }) : '—'
}

function distanceKm(events: TimelineEvent[]) {
  return events.reduce((total, event) => total + (event.distanceMeters ?? 0), 0) / 1000
}

function buildPlaybackPoints(events: TimelineEvent[]) {
  const points = events
    .flatMap(event => event.points)
    .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng))
    .map((point, index) => ({ ...point, time: point.time ?? events[Math.min(index, events.length - 1)]?.start }))
    .sort((a, b) => new Date(a.time ?? 0).getTime() - new Date(b.time ?? 0).getTime())

  const result: LatLng[] = []
  for (const point of points) {
    const previous = result[result.length - 1]
    if (!previous || previous.lat !== point.lat || previous.lng !== point.lng || previous.time !== point.time) result.push(point)
  }
  return result
}

function App() {
  const [data, setData] = useState<TimelineData | null>(null)
  const [date, setDate] = useState('')
  const [playing, setPlaying] = useState(false)
  const [cursor, setCursor] = useState(0)
  const [speed, setSpeed] = useState(1)

  const days = useMemo(() => data ? [...new Set(data.events.map(e => e.start.slice(0, 10)))].sort() : [], [data])
  const selected = useMemo(() => data ? data.events.filter(e => !date || e.start.slice(0, 10) === date) : [], [data, date])
  const routeEvents = useMemo(() => selected.filter(e => e.kind === 'path' && e.points.length > 0), [selected])
  const tripEvents = useMemo(() => selected.filter(e => e.kind === 'trip' && e.points.length > 0), [selected])
  const visits = useMemo(() => selected.filter(e => e.kind === 'visit' && e.points.length > 0), [selected])
  const playbackPoints = useMemo(() => buildPlaybackPoints(selected), [selected])
  const currentPoint = playbackPoints[Math.min(cursor, Math.max(0, playbackPoints.length - 1))]
  const trailPoints = playbackPoints.slice(0, Math.min(cursor + 1, playbackPoints.length))
  const allMapPoints = useMemo(() => selected.flatMap(e => e.points), [selected])

  useEffect(() => {
    setCursor(0)
    setPlaying(false)
  }, [date])

  useEffect(() => {
    if (!playing || playbackPoints.length < 2) return
    const id = window.setInterval(() => {
      setCursor(current => {
        if (current >= playbackPoints.length - 1) {
          setPlaying(false)
          return current
        }
        return current + 1
      })
    }, Math.max(40, 140 / speed))
    return () => window.clearInterval(id)
  }, [playing, playbackPoints.length, speed])

  const importFile = async (file?: File) => {
    if (!file) return
    try {
      const json = JSON.parse(await file.text())
      const parsed = parseTimeline(json)
      if (!parsed.events.length) throw new Error('empty')
      setData(parsed)
      setDate(parsed.start.slice(0, 10))
      setCursor(0)
      setPlaying(false)
    } catch {
      alert('File JSON tidak valid atau tidak berisi semanticSegments Timeline.')
    }
  }

  const togglePlay = () => {
    if (playbackPoints.length < 2) return
    if (cursor >= playbackPoints.length - 1) setCursor(0)
    setPlaying(value => !value)
  }

  return <div className="app">
    <header>
      <div><h1>GMap Timeline Track</h1><p>Visualisasi & playback Google Maps Timeline. Data diproses lokal di browser.</p></div>
      <label className="upload">Import JSON<input type="file" accept="application/json,.json" onChange={e => importFile(e.target.files?.[0])} /></label>
    </header>

    {!data ? <main className="empty"><div className="drop"><div className="pin">⌖</div><h2>Jelajahi perjalanan Anda</h2><p>Import file export Google Maps Timeline JSON untuk melihat rute, kunjungan, dan memutar perjalanan.</p><label className="primary">Pilih file JSON<input type="file" accept="application/json,.json" onChange={e => importFile(e.target.files?.[0])} /></label><small>Privasi: file tidak dikirim ke server aplikasi.</small></div></main> : <>
      <section className="toolbar">
        <select value={date} onChange={e => setDate(e.target.value)}><option value="">Semua tanggal</option>{days.map(d => <option key={d} value={d}>{formatDate(d + 'T00:00:00')}</option>)}</select>
        <button className="play" onClick={togglePlay} disabled={playbackPoints.length < 2}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
        <select className="speed" value={speed} onChange={e => setSpeed(Number(e.target.value))} aria-label="Kecepatan playback"><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select>
        <span className="count">{selected.length} segmen · {distanceKm(selected).toFixed(1)} km · {playbackPoints.length} titik</span>
      </section>

      <main className="content">
        <section className="map">
          <MapContainer center={allMapPoints[0] ? [allMapPoints[0].lat, allMapPoints[0].lng] : [-6.2, 106.8167]} zoom={13} scrollWheelZoom>
            <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <FitMap points={allMapPoints} />

            {routeEvents.map(event => <Polyline key={event.id} positions={event.points.map(p => [p.lat, p.lng] as [number, number])} pathOptions={{ weight: 4, opacity: 0.78 }} />)}
            {tripEvents.map(event => event.points.length > 1 && <Polyline key={event.id} positions={event.points.map(p => [p.lat, p.lng] as [number, number])} pathOptions={{ weight: 5, opacity: 0.58, dashArray: '8 7' }} />)}

            {tripEvents.map(event => event.points.length > 0 ? <Marker key={`${event.id}-start`} position={[event.points[0].lat, event.points[0].lng]} icon={tripStartIcon}>
              <Popup><b>{event.activityType ?? 'Perjalanan'}</b><br />Mulai: {formatTime(event.start)}<br />Jarak: {event.distanceMeters ? `${(event.distanceMeters / 1000).toFixed(2)} km` : '—'}</Popup>
            </Marker> : null)}

            {tripEvents.map(event => event.points.length > 1 ? <Marker key={`${event.id}-end`} position={[event.points[event.points.length - 1].lat, event.points[event.points.length - 1].lng]} icon={tripEndIcon}>
              <Popup><b>{event.activityType ?? 'Perjalanan'}</b><br />Selesai: {formatTime(event.end)}</Popup>
            </Marker> : null)}

            {visits.map(event => {
              const point = event.points[0]
              return <Marker key={event.id} position={[point.lat, point.lng]} icon={visitIcon}>
                <Popup><b>{event.semanticType ?? 'Kunjungan'}</b><br />{formatTime(event.start)} — {formatTime(event.end)}</Popup>
              </Marker>
            })}

            {!playing && playbackPoints.map((point, index) => index % Math.max(1, Math.floor(playbackPoints.length / 120)) === 0 ? <CircleMarker key={`${point.time}-${index}`} center={[point.lat, point.lng]} radius={2.5} pathOptions={{ opacity: 0.7, fillOpacity: 0.75 }} /> : null)}

            {currentPoint && <>
              <Polyline positions={trailPoints.map(p => [p.lat, p.lng] as [number, number])} pathOptions={{ weight: 7, opacity: 0.9 }} />
              <Marker position={[currentPoint.lat, currentPoint.lng]} icon={playbackIcon} zIndexOffset={1000}>
                <Popup><b>{playing ? 'Sedang diputar' : 'Posisi timeline'}</b><br />{currentPoint.time ? new Date(currentPoint.time).toLocaleString('id-ID') : '—'}</Popup>
              </Marker>
            </>}
          </MapContainer>
        </section>

        <aside className="panel">
          <div className="playhead">
            <div><b>{currentPoint?.time ? new Date(currentPoint.time).toLocaleString('id-ID') : 'Ready'}</b><span>{playing ? ' · Sedang diputar' : ''}</span></div>
            <input type="range" min="0" max={Math.max(0, playbackPoints.length - 1)} value={Math.min(cursor, Math.max(0, playbackPoints.length - 1))} onChange={e => { setCursor(Number(e.target.value)); setPlaying(false) }} />
          </div>
          <h3>Aktivitas</h3>
          <div className="events">
            {selected.map(event => <div className={`event ${currentPoint && event.start <= (currentPoint.time ?? '') && event.end >= (currentPoint.time ?? '') ? 'active' : ''}`} key={event.id}>
              <div className="dot" />
              <div><strong>{event.kind === 'trip' ? event.activityType ?? 'Perjalanan' : event.kind === 'visit' ? (event.semanticType ?? 'Kunjungan') : 'Jejak lokasi'}</strong><small>{formatTime(event.start)} — {formatTime(event.end)}</small>{event.distanceMeters ? <small>{(event.distanceMeters / 1000).toFixed(2)} km</small> : null}</div>
            </div>)}
          </div>
        </aside>
      </main>
    </>}
  </div>
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
