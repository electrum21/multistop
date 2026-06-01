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

interface Props { result: RouteResult | null; highlightedLeg?: number | null; highlightedStep?: { leg: number; stepIndex: number } | null; theme?: 'light' | 'dark' }

// Singapore LRT lines reported as TRAM by Google — treat them as SUBWAY
const LRT_LINES = new Set(['PG', 'SK', 'BP'])
function normaliseMode(mode: string, line?: string): string {
  if (mode?.toUpperCase() === 'TRAM' && line && LRT_LINES.has(line.toUpperCase())) return 'SUBWAY'
  return mode
}

function modeColor(mode: string): string {
  return MODE_COLORS[mode?.toUpperCase()] ?? DEFAULT_COLOR
}

// FA unicode chars for use inside Leaflet HTML popup strings
function modeIcon(mode: string): string {
  switch (mode?.toUpperCase()) {
    case 'SUBWAY': return '\u{f239}'  // fa-train-subway
    case 'BUS':    return '\u{f207}'  // fa-bus
    case 'WALK':   return '\u{f554}'  // fa-person-walking
    case 'TRAM':   return '\u{e68b}'  // fa-train-tram
    case 'FERRY':  return '\u{e4ea}'  // fa-ferry
    default:       return '\u{f207}'  // fa-bus
  }
}

// FA icon element for React rendering
function ModeIconEl({ mode }: { mode: string }) {
  switch (mode?.toUpperCase()) {
    case 'SUBWAY': return <i className="fa-solid fa-train-subway" />
    case 'BUS':    return <i className="fa-solid fa-bus" />
    case 'WALK':   return <i className="fa-solid fa-person-walking" />
    case 'TRAM':   return <i className="fa-solid fa-train-tram" />
    case 'FERRY':  return <i className="fa-solid fa-ferry" />
    default:       return <i className="fa-solid fa-bus" />
  }
}

function modeLabel(mode: string, line?: string) {
  if (mode?.toUpperCase() === 'TRAM' && line === 'Sentosa Express') return 'Monorail'
  switch (mode?.toUpperCase()) {
    case 'SUBWAY': return 'Train'
    case 'BUS': return 'Bus'
    case 'WALK': return 'Walk'
    case 'TRAM': return 'Tram'
    case 'FERRY': return 'Ferry'
    default: return mode ?? 'Transit'
  }
}

export function TransitMap({ result, highlightedLeg, highlightedStep, theme }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layersRef = useRef<L.Layer[]>([])
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  // Track polylines by leg index for highlight toggling
  const legPolylinesRef = useRef<Map<number, L.Polyline[]>>(new Map())
  // Track polylines by [leg][step] for step-level highlight
  const stepPolylinesRef = useRef<Map<string, L.Polyline>>(new Map())
  // Only auto-fit bounds when the route itself changes, not on re-renders
  const lastFitKeyRef = useRef<string | null>(null)

  // Initialise map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    mapRef.current = L.map(containerRef.current).setView([1.355, 103.82], 12)

    const isDark = document.documentElement.classList.contains('dark')
    tileLayerRef.current = L.tileLayer(
      `https://{s}.basemaps.cartocdn.com/${isDark ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`,
      {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 19,
      }
    ).addTo(mapRef.current)

    return () => { mapRef.current?.remove(); mapRef.current = null }
  }, [])

  // Swap tile layer when theme changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current)
    tileLayerRef.current = L.tileLayer(
      `https://{s}.basemaps.cartocdn.com/${theme === 'dark' ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`,
      {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 19,
      }
    ).addTo(map)
  }, [theme])

  // Style the Leaflet zoom control to match the current theme
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const styleId = 'leaflet-zoom-theme'
    let el = container.querySelector(`#${styleId}`) as HTMLStyleElement | null
    if (!el) {
      el = document.createElement('style')
      el.id = styleId
      container.appendChild(el)
    }
    if (theme === 'dark') {
      el.textContent = `
        .leaflet-bar a {
          background-color: #1f2937 !important;
          color: #ffffff !important;
          border-color: #374151 !important;
        }
        .leaflet-bar a:hover {
          background-color: #374151 !important;
        }
      `
    } else {
      el.textContent = `
        .leaflet-bar a {
          background-color: #ffffff !important;
          color: #000000 !important;
          border-color: #cccccc !important;
        }
        .leaflet-bar a:hover {
          background-color: #f4f4f4 !important;
        }
      `
    }
  }, [theme])

  // Re-render layers whenever result changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    layersRef.current.forEach(l => map.removeLayer(l))
    layersRef.current = []
    legPolylinesRef.current.clear()
    stepPolylinesRef.current.clear()

    if (!result) return

    const allLatLngs: L.LatLngTuple[] = []

    result.legs.forEach((leg, legIdx) => {
      const hasStepPolylines = leg.steps?.some(s => s.polyline && s.polyline.length > 0)
      const legPolylines: L.Polyline[] = []

      if (hasStepPolylines) {
        // Draw per-step polylines
        leg.steps.forEach((step, stepIdx) => {
          if (!step.polyline || step.polyline.length === 0) return
          const pts: L.LatLngTuple[] = step.polyline.map(p => [p.lat, p.lng])
          allLatLngs.push(...pts)

          const isWalk = step.mode?.toUpperCase() === 'WALK'
          const walkColor = theme === 'dark' ? '#ffffff' : '#111111'
          const effectiveMode = normaliseMode(step.mode, step.line)
          const color = isWalk ? walkColor : modeColor(effectiveMode)
          const mins = Math.round(step.durationSeconds / 60)

          const polyline = L.polyline(pts, {
            color,
            weight: isWalk ? 4 : 5,
            opacity: isWalk ? 0.7 : 0.9,
            dashArray: isWalk ? '0, 10' : undefined,
            lineCap: isWalk ? 'round' : 'round',
            lineJoin: 'round',
          })
            .bindPopup(`
              <div style="font-size:13px;line-height:1.6">
                <b>${modeIcon(effectiveMode)} ${modeLabel(effectiveMode)}${step.line ? ' · ' + step.line : ''}</b><br>
                ${step.instruction}<br>
                <span style="color:#888">${mins} min</span>
              </div>
            `)
            .addTo(map)

          ;(polyline.options as any)._baseWeight = isWalk ? 4 : 5
          ;(polyline.options as any)._baseOpacity = isWalk ? 0.7 : 0.9
          layersRef.current.push(polyline)
          legPolylines.push(polyline)
          stepPolylinesRef.current.set(`${legIdx}:${stepIdx}`, polyline)
        })
      } else {
        // Fallback: draw leg-level polyline
        const pts: L.LatLngTuple[] = leg.polyline.map(p => [p.lat, p.lng])
        allLatLngs.push(...pts)
        const isWalk = leg.mode?.toUpperCase() === 'WALK'
        const walkColor = theme === 'dark' ? '#ffffff' : '#111111'
        const effectiveMode = normaliseMode(leg.mode, leg.line)
        const color = isWalk ? walkColor : modeColor(effectiveMode)

        const polyline = L.polyline(pts, {
          color,
          weight: isWalk ? 4 : 5,
          opacity: isWalk ? 0.7 : 0.9,
          dashArray: isWalk ? '0, 10' : undefined,
          lineCap: isWalk ? 'round' : 'round',
          lineJoin: 'round',
        })
          .bindPopup(`
            <div style="font-size:13px;line-height:1.5">
              <b>${modeIcon(effectiveMode)} ${leg.line}</b><br>
              ${leg.from} → ${leg.to}<br>
              <span style="color:#888">${leg.departureTime} – ${leg.arrivalTime} (${leg.durationMinutes} min)</span>
            </div>
          `)
          .addTo(map)

        ;(polyline.options as any)._baseWeight = isWalk ? 4 : 5
        ;(polyline.options as any)._baseOpacity = isWalk ? 0.7 : 0.9
        layersRef.current.push(polyline)
        legPolylines.push(polyline)
      }

      legPolylinesRef.current.set(legIdx, legPolylines)
    })

    // Draw stop markers
    result.stops.forEach((stop, i) => {
      if (!stop.lat || !stop.lng) return
      const color = '#EF4444'
      const pinSize = 32
      const borderColor = '#ffffff'
      const label = String(i + 1)
      const fontSize = label.length > 1 ? 9 : 11

      const icon = L.divIcon({
        html: `<svg width="${pinSize}" height="${Math.round(pinSize * 1.35)}" viewBox="0 0 32 43" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 1C8.82 1 3 6.82 3 14c0 9.25 13 27 13 27S29 23.25 29 14C29 6.82 23.18 1 16 1z"
            fill="${color}" stroke="${borderColor}" stroke-width="2"/>
          <text x="16" y="18" text-anchor="middle" dominant-baseline="middle"
            font-size="${fontSize}" font-family="system-ui, sans-serif" font-weight="700"
            fill="${borderColor}">${label}</text>
        </svg>`,
        className: '',
        iconSize: [pinSize, Math.round(pinSize * 1.35)],
        iconAnchor: [pinSize / 2, Math.round(pinSize * 1.35)],
      })

      const stayInfo = stop.stay > 0
        ? `<br><span style="color:#888">Stay: ${stop.stay} min (${stop.arrivalTime} – ${stop.departureTime})</span>`
        : i === 0 && stop.departureTime
          ? `<br><span style="color:#888">Depart: ${stop.departureTime}</span>`
          : stop.arrivalTime
            ? `<br><span style="color:#888">Arrive: ${stop.arrivalTime}</span>`
            : ''

      const marker = L.marker([stop.lat, stop.lng], { icon })
        .bindPopup(`<div style="font-size:13px;line-height:1.5"><b>${stop.name}</b>${stayInfo}</div>`)
        .addTo(map)

      layersRef.current.push(marker)
    })

    if (allLatLngs.length) {
      // Build a stable key from the route's departure/arrival times so we only
      // re-fit when the actual route changes, not on every re-render caused by
      // highlightedLeg or selectedOptions changing the activeResult reference.
      const fitKey = result.departureTime + '_' + result.arrivalTime + '_' + result.legs.length
      if (fitKey !== lastFitKeyRef.current) {
        lastFitKeyRef.current = fitKey
        map.fitBounds(L.latLngBounds(allLatLngs), { padding: [40, 40] })
      }
    }
  }, [result, theme])

  // Apply / remove glow effect when highlightedLeg changes
  useEffect(() => {
    if (!result) return
    legPolylinesRef.current.forEach((polylines, legIdx) => {
      polylines.forEach(pl => {
        const el = (pl as any)._path as SVGPathElement | undefined
        if (!el) return
        if (highlightedLeg === legIdx) {
          // Bring to front and add glow filter
          pl.bringToFront()
          el.style.filter = 'drop-shadow(0 0 4px currentColor)'
          el.style.opacity = '1'
          pl.setStyle({ weight: 7, opacity: 1 })
        } else if (highlightedLeg !== null) {
          // Dim other legs
          el.style.filter = ''
          pl.setStyle({ weight: (pl.options as any)._baseWeight ?? pl.options.weight, opacity: 0.25 })
        } else {
          // Reset all
          el.style.filter = ''
          const opts = pl.options as any
          pl.setStyle({ weight: opts._baseWeight ?? opts.weight, opacity: opts._baseOpacity ?? opts.opacity })
        }
      })
    })
  }, [highlightedLeg, result])

  // Apply / remove step-level glow when highlightedStep changes
  useEffect(() => {
    if (!result) return
    stepPolylinesRef.current.forEach((pl, key) => {
      const [legStr, stepStr] = key.split(':')
      const isTarget = highlightedStep !== null
        && parseInt(legStr) === highlightedStep.leg
        && parseInt(stepStr) === highlightedStep.stepIndex
      const el = (pl as any)._path as SVGPathElement | undefined
      if (!el) return
      if (isTarget) {
        pl.bringToFront()
        el.style.filter = 'drop-shadow(0 0 6px currentColor)'
        pl.setStyle({ weight: 9, opacity: 1 })
      } else if (highlightedStep !== null) {
        // Dim every other step while one is hovered
        el.style.filter = ''
        pl.setStyle({ weight: (pl.options as any)._baseWeight ?? pl.options.weight, opacity: 0.2 })
      } else {
        // Reset
        el.style.filter = ''
        const opts = pl.options as any
        pl.setStyle({ weight: opts._baseWeight ?? opts.weight, opacity: opts._baseOpacity ?? opts.opacity })
      }
    })
  }, [highlightedStep, result])
  const legendEntries = result
    ? Array.from(
        new Map(
          result.legs.flatMap(leg =>
            (leg.steps && leg.steps.length > 0 ? leg.steps : [leg]).map(s => {
              const m = normaliseMode(s.mode, s.line)?.toUpperCase()
              const isWalk = m === 'WALK'
              const walkColor = theme === 'dark' ? '#ffffff' : '#111111'
              const label = modeLabel(m, s.line)
              const key = m + (s.line === 'Sentosa Express' ? '_monorail' : '')
              return [key, {
                mode: m,
                color: isWalk ? walkColor : modeColor(m),
                isWalk,
                label,
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
        <div className="absolute bottom-3 left-3 md:bottom-auto md:top-3 md:left-auto md:right-3 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl p-2.5 z-10 shadow-sm flex md:flex-col flex-row gap-x-3 flex-wrap">
          {legendEntries.map(({ mode, color, isWalk, label, icon }) => (
            <div key={mode} className="flex items-center gap-2 text-xs">
              <svg width="20" height="8" viewBox="0 0 20 8" className="flex-shrink-0">
                {isWalk ? (
                  /* Dots to match the map */
                  <>
                    <circle cx="2"  cy="4" r="1.8" fill={color} />
                    <circle cx="8"  cy="4" r="1.8" fill={color} />
                    <circle cx="14" cy="4" r="1.8" fill={color} />
                    <circle cx="20" cy="4" r="1.8" fill={color} />
                  </>
                ) : (
                  <line x1="0" y1="4" x2="20" y2="4" stroke={color} strokeWidth="3" strokeLinecap="round" />
                )}
              </svg>
              <span className="text-gray-600 dark:text-gray-300"><ModeIconEl mode={mode} /> {label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}