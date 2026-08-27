import { StrictMode, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import L from 'leaflet'
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import './styles.css'
import { parseTimeline } from './parser'
import type { TimelineData, TimelineEvent } from './types'

function FitMap({ events }: { events: TimelineEvent[] }) {
  const map = useMap()
  useMemo(() => {
    const points = events.flatMap(e => e.points)
    if (points.length) map.fitBounds(L.latLngBounds(points.map(p => [p.lat, p.lng] as [number, number])), { padding: [30, 30] })
  }, [events, map])
  return null
}

function App() {
  const [data, setData] = useState<TimelineData | null>(null)
  const [date, setDate] = useState('')
  const [playing, setPlaying] = useState(false)
  const [cursor, setCursor] = useState(0)

  const days = useMemo(() => data ? [...new Set(data.events.map(e => e.start.slice(0, 10)))].sort() : [], [data])
  const selected = useMemo(() => data ? data.events.filter(e => !date || e.start.slice(0, 10) === date) : [], [data, date])
  const playbackPoints = useMemo(() => selected.flatMap(e => e.points), [selected])

  const visiblePoints = playing ? playbackPoints.slice(0, Math.max(1, cursor + 1)) : playbackPoints
  const mapCenter: [number, number] = visiblePoints[0] ? [visiblePoints[0].lat, visiblePoints[0].lng] : [-6.2, 106.8167]

  const importFile = async (file?: File) => {
    if (!file) return
    try {
      const json = JSON.parse(await file.text())
      const parsed = parseTimeline(json)
      setData(parsed)
      setDate(parsed.start ? parsed.start.slice(0, 10) : '')
      setCursor(0)
      setPlaying(false)
    } catch {
      alert('File JSON tidak valid atau bukan export Google Maps Timeline.')
    }
  }

  const togglePlay = () => {
    if (!playbackPoints.length) return
    if (cursor >= playbackPoints.length - 1) setCursor(0)
    setPlaying(v => !v)
  }

  useMemo(() => {
    if (!playing) return
    const id = window.setInterval(() => setCursor(c => {
      if (c >= playbackPoints.length - 1) { setPlaying(false); return c }
      return c + 1
    }), 120)
    return () => window.clearInterval(id)
  }, [playing, playbackPoints.length])

  return <div className="app">
    <header>
      <div><h1>GMap Timeline Track</h1><p>Visualisasi dan playback Google Maps Timeline — data tetap di browser.</p></div>
      <label className="upload">Import Timeline JSON<input type="file" accept="application/json,.json" onChange={e => importFile(e.target.files?.[0])} /></label>
    </header>
    {!data ? <main className="empty"><div className="drop"><h2>Masukkan data Timeline Anda</h2><p>Pilih file export Google Maps Timeline JSON untuk mulai.</p><label className="primary">Pilih file JSON<input type="file" accept="application/json,.json" onChange={e => importFile(e.target.files?.[0])} /></label></div></main> : <>
      <section className="toolbar">
        <select value={date} onChange={e => { setDate(e.target.value); setCursor(0); setPlaying(false) }}><option value="">Semua tanggal</option>{days.map(d => <option key={d} value={d}>{new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { dateStyle: 'full' })}</option>)}</select>
        <button onClick={togglePlay}>{playing ? '❚❚ Pause' : '▶ Play perjalanan'}</button>
        <span className="count">{selected.length} segmen · {Math.round(selected.reduce((n,e) => n + (e.distanceMeters ?? 0), 0) / 100) / 10} km perjalanan</span>
      </section>
      <main className="content">
        <section className="map"><MapContainer center={mapCenter} zoom={13} scrollWheelZoom><TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><FitMap events={selected} />{selected.map(e => e.points.length > 1 && <Polyline key={e.id} positions={e.points.map(p => [p.lat, p.lng] as [number, number])} />)}{visiblePoints.map((p, i) => <CircleMarker key={i} center={[p.lat, p.lng]} radius={i === visiblePoints.length - 1 ? 8 : 2} />)}</MapContainer></section>
        <aside className="panel"><div className="playhead"><div className="playtime">{visiblePoints.at(-1)?.time ? new Date(visiblePoints.at(-1)!.time!).toLocaleString('id-ID') : 'Siap diputar'}</div><input type="range" min="0" max={Math.max(0, playbackPoints.length - 1)} value={Math.min(cursor, Math.max(0, playbackPoints.length - 1))} onChange={e => { setCursor(Number(e.target.value)); setPlaying(false) }} /></div><h3>Aktivitas</h3><div className="events">{selected.map(e => <div className="event" key={e.id}><div className="dot"/><div><strong>{e.kind === 'trip' ? e.activityType ?? 'Perjalanan' : e.kind === 'visit' ? (e.semanticType ?? 'Kunjungan') : 'Jejak lokasi'}</strong><small>{new Date(e.start).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} — {new Date(e.end).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</small>{e.distanceMeters ? <small>{(e.distanceMeters / 1000).toFixed(2)} km</small> : null}</div></div>)}</div></aside>
      </main>
    </>}
  </div>
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
