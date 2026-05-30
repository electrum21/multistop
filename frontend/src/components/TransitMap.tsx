import { useEffect, useRef } from 'react'
import L from 'leaflet'

// Transit mode colours (solid lines)
const MODE_COLORS: Record<string, string> = {
  SUBWAY: '#2563EB',  // blue
  BUS:    '#16A34A',  // green
  TRAM:   '#EA580C',  // orange
  FERRY:  '#0284C7',  // sky
}
const WALK_COLOR   = '#1F2937'  // near-black
const DEFAULT_COLOR = '#7C3AED' // purple fallback

interface LatLng { lat: number; lng: number }

interface StepDetail {
  instruction: string
  mode: string
  line: string
  durationSeconds: number
  polyline?: LatLng[]
}

interface LegData {
  legIndex: number
  from: string
  to: string
  departureTime: string
  arrivalTime: string
  durationMinutes: number
  mode: string
  line: string
  polyline: LatLng[]
  steps: StepDetail[]
}

interface StopData {
  name: string
  lat: number
  lng: number
  arrivalTime: string | null
  departureTime: string | null
  stay: number
}

interface RouteResult {
  departureTime: string
  arrivalTime: string
  totalDurationMinutes: number
  legs: LegData[]
  stops: StopData[]
}

interface Props { result: RouteResult | null }

function modeColor(mode: string): string {
  return MODE_COLORS[mode?.toUpperCase()] ?? DEFAULT_COLOR
}

function modeIcon(mode: string) {
  switch (mode?.toUpperCase()) {
    case 'SUBWAY': return '🚇'
    case 'BUS':    return '🚌'
    case 'WALK':   return '🚶'
    case 'TRAM':   return '🚊'
    case 'FERRY':  return '⛴️'
    default:       return '🚌'
  }
}

function modeLabel(mode: string) {
  switch (mode?.toUpperCase()) {
    case 'SUBWAY': return 'Subway'
    case 'BUS':    return 'Bus'
    case 'WALK':   return 'Walk'
    case 'TRAM':   return 'Tram'
    case 'FERRY':  return 'Ferry'
    default:       return mode ?? 'Transit'
  }
}

export function TransitMap({ result }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<L.Map | null>(null)
  const layersRef    = useRef<L.Layer[]>([])

  // Initialise map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    mapRef.current = L.map(containerRef.current).setView([1.355, 103.82], 12)

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19,
    }).addTo(mapRef.current)

    return () => { mapRef.current?.remove(); mapRef.current = null }
  }, [])

  // Re-render layers whenever result changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    layersRef.current.forEach(l => map.removeLayer(l))
    layersRef.current = []

    if (!result) return

    const allLatLngs: L.LatLngTuple[] = []

    result.legs.forEach((leg) => {
      const hasStepPolylines = leg.steps?.some(s => s.polyline && s.polyline.length > 0)

      if (hasStepPolylines) {
        // Draw per-step polylines
        leg.steps.forEach((step) => {
          if (!step.polyline || step.polyline.length === 0) return
          const pts: L.LatLngTuple[] = step.polyline.map(p => [p.lat, p.lng])
          allLatLngs.push(...pts)

          const isWalk = step.mode?.toUpperCase() === 'WALK'
          const color = isWalk ? WALK_COLOR : modeColor(step.mode)
          const mins = Math.round(step.durationSeconds / 60)

          const polyline = L.polyline(pts, {
            color,
            weight: isWalk ? 3 : 5,
            opacity: isWalk ? 0.6 : 0.9,
            dashArray: isWalk ? '6, 8' : undefined,
            lineJoin: 'round',
            lineCap: 'round',
          })
            .bindPopup(`
              <div style="font-size:13px;line-height:1.6">
                <b>${modeIcon(step.mode)} ${modeLabel(step.mode)}${step.line ? ' · ' + step.line : ''}</b><br>
                ${step.instruction}<br>
                <span style="color:#888">${mins} min</span>
              </div>
            `)
            .addTo(map)

          layersRef.current.push(polyline)
        })
      } else {
        // Fallback: draw leg-level polyline
        const pts: L.LatLngTuple[] = leg.polyline.map(p => [p.lat, p.lng])
        allLatLngs.push(...pts)
        const isWalk = leg.mode?.toUpperCase() === 'WALK'
        const color = isWalk ? WALK_COLOR : modeColor(leg.mode)

        const polyline = L.polyline(pts, {
          color,
          weight: isWalk ? 3 : 5,
          opacity: isWalk ? 0.6 : 0.9,
          dashArray: isWalk ? '6, 8' : undefined,
          lineJoin: 'round',
        })
          .bindPopup(`
            <div style="font-size:13px;line-height:1.5">
              <b>${modeIcon(leg.mode)} ${leg.line}</b><br>
              ${leg.from} → ${leg.to}<br>
              <span style="color:#888">${leg.departureTime} – ${leg.arrivalTime} (${leg.durationMinutes} min)</span>
            </div>
          `)
          .addTo(map)

        layersRef.current.push(polyline)
      }
    })

    // Draw stop markers
    result.stops.forEach((stop, i) => {
      if (!stop.lat || !stop.lng) return
      const isFirst = i === 0
      const isLast = i === result.stops.length - 1
      const color = isFirst ? '#10B981' : isLast ? '#EF4444' : '#6B7280'
      const size = isFirst || isLast ? 16 : 12

      const icon = L.divIcon({
        html: `<div style="
          width:${size}px;height:${size}px;
          background:${color};
          border:2.5px solid white;
          border-radius:50%;
          box-shadow:0 1px 4px rgba(0,0,0,.3)
        "></div>`,
        className: '',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      })

      const stayInfo = stop.stay > 0
        ? `<br><span style="color:#888">Stay: ${stop.stay} min (${stop.arrivalTime} – ${stop.departureTime})</span>`
        : stop.arrivalTime
          ? `<br><span style="color:#888">Arrive: ${stop.arrivalTime}</span>`
          : ''

      const marker = L.marker([stop.lat, stop.lng], { icon })
        .bindPopup(`<div style="font-size:13px;line-height:1.5"><b>${stop.name}</b>${stayInfo}</div>`)
        .addTo(map)

      layersRef.current.push(marker)
    })

    if (allLatLngs.length) {
      map.fitBounds(L.latLngBounds(allLatLngs), { padding: [40, 40] })
    }
  }, [result])

  // Build legend entries from unique modes across all steps
  const legendEntries = result
    ? Array.from(
        new Map(
          result.legs.flatMap(leg =>
            (leg.steps && leg.steps.length > 0 ? leg.steps : [leg]).map(s => {
              const m = s.mode?.toUpperCase()
              const isWalk = m === 'WALK'
              return [m, {
                mode: m,
                color: isWalk ? WALK_COLOR : modeColor(m),
                dash: isWalk,
                label: modeLabel(m),
                icon: modeIcon(m),
              }]
            })
          )
        ).values()
      )
    : []

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />

      {/* Legend */}
      {result && legendEntries.length > 0 && (
        <div className="absolute top-3 right-3 bg-white border border-gray-100 rounded-xl p-3 z-50 min-w-[130px] shadow-sm">
          {legendEntries.map(({ mode, color, dash, label, icon }) => (
            <div key={mode} className="flex items-center gap-2 text-xs mb-1.5 last:mb-0">
              <svg width="20" height="8" viewBox="0 0 20 8" className="flex-shrink-0">
                <line
                  x1="0" y1="4" x2="20" y2="4"
                  stroke={color}
                  strokeWidth={dash ? 2 : 3}
                  strokeDasharray={dash ? '4,4' : undefined}
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-gray-600">{icon} {label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}