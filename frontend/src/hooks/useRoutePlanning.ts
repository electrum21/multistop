import { useState } from 'react'
import type { RouteResult } from '../types'
import type { Stop } from '../components/StopList'
import { setStorageItem, inSingaporeStrict } from '../utils'

type PlanArgs = { stops: Stop[]; departureTime: string; routingPreference: string; transitModes: string[] }

export function useRoutePlanning() {
  const [result, setResult] = useState<RouteResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedOptions, setSelectedOptions] = useState<number[]>([])

  function validateStops(stops: Stop[], departureTime: string): string | null {
    const filled = stops.filter(s => s.name.trim())
    if (filled.length < 2) return 'Enter at least an origin and destination.'
    const emptyWaypoints = stops.slice(1, -1).map((s, i) => ({ s, idx: i + 1 })).filter(({ s }) => !s.name.trim())
    if (emptyWaypoints.length > 0) return `Please fill in or remove: ${emptyWaypoints.map(({ idx }) => `waypoint ${idx}`).join(', ')}.`
    if (!stops[0].name.trim()) return 'Please enter an origin.'
    if (!stops[stops.length - 1].name.trim()) return 'Please enter a destination.'
    // validate lat/lng if provided
    for (const s of stops) {
      if (s.place) {
        const lat = s.place.lat
        const lng = s.place.lng
        if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) return 'Invalid stop coordinates.'
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return 'Stop coordinates out of range.'
        if (!inSingaporeStrict(lat, lng)) return 'All stops must be within Singapore.'
      }
    }
    // simple duplicate check by name+coords
    const seen = new Set<string>()
    for (const s of stops) {
      const key = `${s.name.trim().toLowerCase()}|${s.place?.lat ?? ''}|${s.place?.lng ?? ''}`
      if (seen.has(key)) return 'Duplicate stops detected.'
      seen.add(key)
    }
    if (!departureTime) return 'Please select a departure time.'
    return null
  }

  async function planRoute(overrides?: PlanArgs) {
    const _stops = overrides?.stops ?? []
    const _departureTime = overrides?.departureTime ?? ''
    const _routingPreference = overrides?.routingPreference ?? ''
    const _transitModes = overrides?.transitModes ?? []

    const validation = validateStops(_stops, _departureTime)
    if (validation) { setError(validation); return }

    setLoading(true); setError(null)
    try {
      const payload = {
        departureTime: _departureTime, optimiseOrder: false,
        routingPreference: _routingPreference || null, transitModes: _transitModes,
        stops: _stops.map(s => ({ name: s.name, lat: s.place?.lat ?? null, lng: s.place?.lng ?? null, stayMinutes: s.stayMinutes })),
      }
      const resp = await fetch('/api/transit/route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!resp.ok) {
        let errMsg = `HTTP ${resp.status}`
        try { const err = await resp.json(); errMsg = err.error ?? errMsg } catch { errMsg = 'Server error. Please try again.' }
        throw new Error(errMsg)
      }
      const data: RouteResult = await resp.json()
      setResult(data)
      setSelectedOptions(data.legs.map(() => 0))
      setStorageItem('ms_stops', JSON.stringify(_stops))
      setStorageItem('ms_result', JSON.stringify(data))
    } catch (e: any) {
      setError(e?.message ?? 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  function selectOption(legIndex: number, optionIndex: number) {
    setSelectedOptions(prev => { const next = [...prev]; next[legIndex] = optionIndex; return next })
  }

  return { result, loading, error, planRoute, selectedOptions, selectOption, setError, setResult }
}
