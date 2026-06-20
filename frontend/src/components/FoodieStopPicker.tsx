import { useState, useEffect, useRef, useCallback } from 'react'
import L from 'leaflet'
import { ResolvedPlace } from './PlaceAutocomplete'

export interface FoodPlace {
  placeId: string
  name: string
  lat: number
  lng: number
  formattedAddress: string
  rating?: number
  userRatingsTotal?: number
  priceLevel?: number
  photoUrl?: string
  openNow?: boolean
}

interface Props {
  origin: ResolvedPlace | null
  destination: ResolvedPlace | null
  departureTime: string
  onSelect: (place: FoodPlace) => void
}

const CUISINES = [
  { label: 'Any cuisine', value: 'any', keyword: '' },
  { label: 'Chinese', value: 'chinese', keyword: 'chinese food' },
  { label: 'Japanese', value: 'japanese', keyword: 'japanese restaurant' },
  { label: 'Korean', value: 'korean', keyword: 'korean restaurant' },
  { label: 'Western', value: 'western', keyword: 'western food' },
  { label: 'Indian', value: 'indian', keyword: 'indian restaurant' },
  { label: 'Thai', value: 'thai', keyword: 'thai food' },
  { label: 'Italian', value: 'italian', keyword: 'italian restaurant' },
  { label: 'Mexican', value: 'mexican', keyword: 'mexican food' },
  { label: 'Vietnamese', value: 'vietnamese', keyword: 'vietnamese food' },
  { label: 'Malay', value: 'malay', keyword: 'malay food' },
  { label: 'Vegetarian', value: 'vegetarian', keyword: 'vegetarian vegan' },
]

const MIN_RADIUS_M = 300
const MAX_RADIUS_M = 5000
const DEFAULT_RADIUS_M = 1500

function midpoint(a: ResolvedPlace, b: ResolvedPlace) {
  return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 }
}

/** Parse a datetime-local string into a Date, or null. */
function parseDeparture(s: string): Date | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

/** Check if a place is open at the given Date using Places Detail hours periods. */
function isOpenAt(periods: google.maps.places.PlaceOpeningHoursPeriod[], dt: Date): boolean {
  const day = dt.getDay()
  const hhmm = dt.getHours() * 100 + dt.getMinutes()

  for (const p of periods) {
    if (p.open.day !== day) continue
    const openTime = p.open.hours! * 100 + p.open.minutes!
    if (!p.close) return true
    const closeDay = p.close.day
    const closeTime = p.close.hours! * 100 + p.close.minutes!

    if (closeDay === day) {
      if (hhmm >= openTime && hhmm < closeTime) return true
    } else {
      if (hhmm >= openTime) return true
    }
  }
  return false
}

function formatRadius(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)} km` : `${m} m`
}

/** Small embedded Leaflet map with a draggable pin and an adjustable radius circle. */
function FoodieRadiusMap({
  center, radius, onCenterChange,
}: {
  center: { lat: number; lng: number }
  radius: number
  onCenterChange: (c: { lat: number; lng: number }) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const circleRef = useRef<L.Circle | null>(null)
  const isDark = document.documentElement.classList.contains('dark')

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView([center.lat, center.lng], 14)
    mapRef.current = map

    L.tileLayer(
      `https://{s}.basemaps.cartocdn.com/${isDark ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`,
      { maxZoom: 19 }
    ).addTo(map)

    const pinIcon = L.divIcon({
      html: `<svg width="28" height="38" viewBox="0 0 32 43" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 1C8.82 1 3 6.82 3 14c0 9.25 13 27 13 27S29 23.25 29 14C29 6.82 23.18 1 16 1z"
          fill="#F59E0B" stroke="#ffffff" stroke-width="2"/>
        <text x="16" y="18" text-anchor="middle" dominant-baseline="middle" font-size="13"
          font-family="system-ui, sans-serif" fill="#ffffff">🍴</text>
      </svg>`,
      className: '',
      iconSize: [28, 38],
      iconAnchor: [14, 38],
    })

    const marker = L.marker([center.lat, center.lng], { icon: pinIcon, draggable: true }).addTo(map)
    marker.on('drag', () => {
      const ll = marker.getLatLng()
      circleRef.current?.setLatLng(ll)
    })
    marker.on('dragend', () => {
      const ll = marker.getLatLng()
      onCenterChange({ lat: ll.lat, lng: ll.lng })
    })
    markerRef.current = marker

    const circle = L.circle([center.lat, center.lng], {
      radius,
      color: '#F59E0B',
      weight: 1.5,
      fillColor: '#F59E0B',
      fillOpacity: 0.12,
    }).addTo(map)
    circleRef.current = circle

    // Click anywhere on map to move the pin
    map.on('click', (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng)
      circle.setLatLng(e.latlng)
      onCenterChange({ lat: e.latlng.lat, lng: e.latlng.lng })
    })

    return () => { map.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep circle radius in sync with slider
  useEffect(() => {
    circleRef.current?.setRadius(radius)
  }, [radius])

  // Recenter map+pin if the external center prop changes (e.g. route changed)
  useEffect(() => {
    if (!mapRef.current || !markerRef.current || !circleRef.current) return
    const current = markerRef.current.getLatLng()
    if (Math.abs(current.lat - center.lat) > 1e-6 || Math.abs(current.lng - center.lng) > 1e-6) {
      markerRef.current.setLatLng([center.lat, center.lng])
      circleRef.current.setLatLng([center.lat, center.lng])
      mapRef.current.setView([center.lat, center.lng], mapRef.current.getZoom())
    }
  }, [center.lat, center.lng])

  return <div ref={containerRef} className="w-full h-full rounded-lg" />
}

export function FoodieStopPicker({ origin, destination, departureTime, onSelect }: Props) {
  const [cuisine, setCuisine] = useState('any')
  const [cuisineOpen, setCuisineOpen] = useState(false)
  const [candidates, setCandidates] = useState<FoodPlace[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [radius, setRadius] = useState(DEFAULT_RADIUS_M)
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null)
  const svcRef = useRef<google.maps.places.PlacesService | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Reset pin to route midpoint whenever origin/destination changes
  useEffect(() => {
    if (origin && destination) setCenter(midpoint(origin, destination))
    else setCenter(null)
  }, [origin?.placeId, destination?.placeId])

  function getService() {
    if (!window.google?.maps?.places) return null
    if (!svcRef.current) {
      svcRef.current = new google.maps.places.PlacesService(document.createElement('div'))
    }
    return svcRef.current
  }

  function fetchDetail(svc: google.maps.places.PlacesService, placeId: string): Promise<google.maps.places.PlaceResult | null> {
    return new Promise(resolve => {
      svc.getDetails({ placeId, fields: ['opening_hours'] }, (result, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK) resolve(result)
        else resolve(null)
      })
    })
  }

  const search = useCallback(async (cuisineValue: string, searchCenter: { lat: number; lng: number }, searchRadius: number) => {
    const svc = getService()
    if (!svc) { setError('Google Maps not ready yet'); return }

    const opt = CUISINES.find(c => c.value === cuisineValue) ?? CUISINES[0]
    const departAt = parseDeparture(departureTime)

    setLoading(true)
    setError(null)
    setCandidates([])
    setSelectedId(null)

    const request: google.maps.places.PlaceSearchRequest = {
      location: searchCenter,
      radius: searchRadius,
      type: 'restaurant',
      ...(opt.keyword ? { keyword: opt.keyword } : {}),
    }

    svc.nearbySearch(request, async (results, status) => {
      if (status !== google.maps.places.PlacesServiceStatus.OK || !results || results.length === 0) {
        setLoading(false)
        setError('No food places found in this area. Try widening the radius or a different cuisine.')
        return
      }

      const prereranked = results
        .filter(r => r.geometry?.location)
        .sort((a, b) => {
          const score = (x: google.maps.places.PlaceResult) =>
            (x.rating ?? 0) + Math.min(x.user_ratings_total ?? 0, 500) / 2000
          return score(b) - score(a)
        })
        .slice(0, 20)

      let filtered: google.maps.places.PlaceResult[]
      if (departAt) {
        const withDetails = await Promise.all(
          prereranked.map(async r => {
            const detail = await fetchDetail(svc, r.place_id!)
            const periods = detail?.opening_hours?.periods
            const open = periods ? isOpenAt(periods, departAt) : true
            return { r, open }
          })
        )
        filtered = withDetails.filter(x => x.open).map(x => x.r)
        if (filtered.length === 0) {
          setLoading(false)
          setError('No places appear to be open at your departure time. Try a different cuisine, time, or area.')
          return
        }
      } else {
        filtered = prereranked
      }

      const final = filtered.slice(0, 10).map<FoodPlace>(r => ({
        placeId: r.place_id!,
        name: r.name ?? 'Unnamed place',
        lat: r.geometry!.location!.lat(),
        lng: r.geometry!.location!.lng(),
        formattedAddress: r.vicinity ?? '',
        rating: r.rating,
        userRatingsTotal: r.user_ratings_total,
        priceLevel: r.price_level,
        photoUrl: r.photos?.[0]?.getUrl?.({ maxWidth: 200, maxHeight: 200 }),
        openNow: r.opening_hours?.open_now,
      }))

      setCandidates(final)
      setLoading(false)
    })
  }, [departureTime])

  // Debounce search trigger on center/radius/cuisine changes
  useEffect(() => {
    if (!center) { setCandidates([]); setError(null); return }
    const t = setTimeout(() => search(cuisine, center, radius), 350)
    return () => clearTimeout(t)
  }, [center?.lat, center?.lng, radius, cuisine, search])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setCuisineOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selectedCuisine = CUISINES.find(c => c.value === cuisine) ?? CUISINES[0]

  if (!origin || !destination || !center) {
    return (
      <div className="text-xs text-gray-400 dark:text-gray-500 italic px-1">
        Set an origin and destination to find a food stop along the way.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Radius map */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="font-identity text-sm font-medium uppercase tracking-wide text-gray-400">Search area</label>
          <span className="text-xs text-gray-400 dark:text-gray-500">{formatRadius(radius)} radius</span>
        </div>
        <div className="h-44 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
          <FoodieRadiusMap center={center} radius={radius} onCenterChange={setCenter} />
        </div>
        <input
          type="range"
          min={MIN_RADIUS_M}
          max={MAX_RADIUS_M}
          step={100}
          value={radius}
          onChange={e => setRadius(Number(e.target.value))}
          className="w-full mt-2 accent-amber-500"
        />
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
          Drag the pin or tap the map to move the search area; use the slider to resize it.
        </p>
      </div>

      {/* Custom cuisine dropdown */}
      <div>
        <label className="font-identity block text-sm font-medium uppercase tracking-wide text-gray-400 mb-2">Cuisine</label>
        <div ref={dropdownRef} className="relative">
          <button
            onClick={() => setCuisineOpen(o => !o)}
            className="w-full flex items-center justify-between px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-100 outline-none focus:border-gray-400 dark:focus:border-gray-500 transition-colors"
          >
            <span>{selectedCuisine.label}</span>
            <i className={`fa-solid fa-chevron-down text-xs text-gray-400 transition-transform duration-150 ${cuisineOpen ? 'rotate-180' : ''}`} />
          </button>
          {cuisineOpen && (
            <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg overflow-hidden">
              <div className="max-h-48 overflow-y-auto">
                {CUISINES.map(c => (
                  <button
                    key={c.value}
                    onClick={() => { setCuisine(c.value); setCuisineOpen(false) }}
                    className={[
                      'w-full text-left px-3 py-2 text-sm transition-colors',
                      c.value === cuisine
                        ? 'bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 font-medium'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700',
                    ].join(' ')}
                  >
                    {c.label}
                    {c.value === cuisine && <i className="fa-solid fa-check text-xs ml-2" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {loading && (
        <div className="text-sm text-gray-400 dark:text-gray-500 flex items-center gap-2 px-1">
          <i className="fa-solid fa-spinner fa-spin" /> Finding food spots open at your departure time…
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400 border border-red-100 dark:border-red-900 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {!loading && candidates.length > 0 && (
        <>
          <div className="overflow-y-auto space-y-2 pr-0.5" style={{ maxHeight: '220px' }}>
            {candidates.map(c => (
              <button
                key={c.placeId}
                onClick={() => { setSelectedId(c.placeId); onSelect(c) }}
                className={[
                  'w-full text-left flex items-center gap-3 p-2.5 rounded-xl border transition-colors',
                  selectedId === c.placeId
                    ? 'border-amber-400 bg-amber-50 dark:bg-amber-950'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800',
                ].join(' ')}
              >
                {c.photoUrl ? (
                  <img src={c.photoUrl} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-amber-100 dark:bg-amber-900 flex items-center justify-center flex-shrink-0">
                    <i className="fa-solid fa-utensils text-amber-500" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{c.name}</div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 truncate">{c.formattedAddress}</div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {c.rating != null && (
                      <span className="flex items-center gap-0.5">
                        <i className="fa-solid fa-star text-amber-400" /> {c.rating.toFixed(1)}
                        {c.userRatingsTotal != null && <span className="text-gray-400 dark:text-gray-500">({c.userRatingsTotal})</span>}
                      </span>
                    )}
                    {c.priceLevel != null && <span>{'$'.repeat(Math.max(1, c.priceLevel))}</span>}
                    {c.openNow != null && (
                      <span className={c.openNow ? 'text-green-500' : 'text-red-400'}>
                        {c.openNow ? 'Open now' : 'Closed'}
                      </span>
                    )}
                  </div>
                </div>
                {selectedId === c.placeId && <i className="fa-solid fa-check text-amber-500 flex-shrink-0" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}