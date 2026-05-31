import { useState, useEffect, useMemo } from 'react'
import { StopList, Stop } from './components/StopList'
import { TransitMap } from './components/TransitMap'
import { Timeline } from './components/Timeline'
import { useGoogleMaps } from './hooks/useGoogleMaps'

const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? ''

let stopCounter = 10
function makeStop(stayMinutes = 0): Stop {
  return { id: stopCounter++, name: '', place: null, stayMinutes }
}

type Tab = 'plan' | 'timeline'

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') ?? 'light'
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('theme', theme)
  }, [theme])

  const mapsReady = useGoogleMaps(GOOGLE_MAPS_KEY)

  const [stops, setStops] = useState<Stop[]>([
    makeStop(0),
    makeStop(0),
  ])
  const [departureTime, setDepartureTime] = useState(() => {
    const d = new Date()
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  })
  const [tab, setTab] = useState<Tab>('plan')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  // selectedOptions[i] = which alternative index is selected for leg i
  const [selectedOptions, setSelectedOptions] = useState<number[]>([])
  // highlightedLeg = index of the leg currently highlighted on the map (null = none)
  const [highlightedLeg, setHighlightedLeg] = useState<number | null>(null)
  const [routingPreference, setRoutingPreference] = useState<string>('')
  const [transitModes, setTransitModes] = useState<string[]>([])

  async function planRoute() {
    const filled = stops.filter(s => s.name.trim())
    if (filled.length < 2) { setError('Enter at least an origin and destination.'); return }

    // Check for empty waypoints (stops in the middle that have no name)
    const emptyWaypoints = stops
      .slice(1, -1) // only intermediates
      .map((s, i) => ({ s, idx: i + 1 }))
      .filter(({ s }) => !s.name.trim())

    if (emptyWaypoints.length > 0) {
      const labels = emptyWaypoints.map(({ idx }) => `waypoint ${idx}`)
      setError(`Please fill in or remove: ${labels.join(', ')}.`)
      return
    }

    if (!stops[0].name.trim()) { setError('Please enter an origin.'); return }
    if (!stops[stops.length - 1].name.trim()) { setError('Please enter a destination.'); return }

    setLoading(true); setError(null)
    try {
      const payload = {
        departureTime,
        optimiseOrder: false,
        routingPreference: routingPreference || null,
        transitModes,
        stops: stops.map(s => ({
          name: s.name,
          lat: s.place?.lat  ?? null,
          lng: s.place?.lng  ?? null,
          stayMinutes: s.stayMinutes,
        })),
      }
      const resp = await fetch('/api/transit/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        throw new Error(err.error ?? `HTTP ${resp.status}`)
      }
      const data = await resp.json()
      setResult(data)
      setSelectedOptions(data.legs.map(() => 0))
      setTab('timeline')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function selectOption(legIndex: number, optionIndex: number) {
    setSelectedOptions(prev => {
      const next = [...prev]
      next[legIndex] = optionIndex
      return next
    })
  }

  const activeResult = useMemo(() => {
    if (!result) return null
    return {
      ...result,
      legs: result.legs.map((leg: any, i: number) => {
        const sel = selectedOptions[i] ?? 0
        return sel === 0 ? leg : (leg.alternatives?.[sel] ?? leg)
      }),
    }
  }, [result, selectedOptions])

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Left panel ── */}
      <div className="w-96 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800 flex flex-col overflow-hidden flex-shrink-0">

        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h1 className="font-identity text-2xl dark:text-gray-100">MULTISTOP</h1>
            <div className="flex items-center gap-1 bg-gray-300 dark:bg-gray-800 rounded-lg p-0.5">
              <button onClick={() => setTheme('light')} className={theme === 'light' ? 'bg-white rounded-md px-2 py-1 shadow-sm' : 'px-2 py-1 opacity-40'}>
                ☀️
              </button>
              <button onClick={() => setTheme('dark')} className={theme === 'dark' ? 'bg-white rounded-md px-2 py-1 shadow-sm' : 'px-2 py-1 opacity-40'}>
                🌙
              </button>
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="font-identity flex gap-1 px-5 pt-3 pb-0 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          {(['plan', 'timeline'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={[
                'px-3 py-1.5 text-m rounded-t-md capitalize border-b-2 transition-colors',
                tab === t
                  ? 'border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100 font-medium'
                  : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300',
              ].join(' ')}
            >
              {t}
              {t === 'timeline' && result && (
                <span className="ml-1.5 bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5 text-xs">
                  {result.legs.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Plan tab */}
        {tab === 'plan' && (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            <div>
              <label className="font-identity block text-sm font-large uppercase tracking-wide text-gray-400 mb-2">
                Departure Time
              </label>
              <input
                type="datetime-local"
                value={departureTime}
                onChange={e => setDepartureTime(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 dark:text-gray-100 outline-none focus:border-gray-400 focus:bg-white dark:focus:bg-gray-700 transition-colors"
              />
            </div>
            <div>
              <label className="font-identity block text-sm font-medium uppercase tracking-wide text-gray-400 mb-2">
                Route Preference
              </label>
              <select
                value={routingPreference}
                onChange={e => setRoutingPreference(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 dark:text-gray-100 outline-none"
              >
                <option value="">Best route</option>
                <option value="FEWER_TRANSFERS">Fewer transfers</option>
                <option value="LESS_WALKING">Less walking</option>
              </select>
            </div>

            <div>
              <label className="font-identity block text-sm font-medium uppercase tracking-wide text-gray-400 mb-2">
                Transport modes
              </label>
              <div className="flex flex-wrap gap-2">
                {['BUS', 'TRAIN', 'TRAM', 'RAIL'].map(mode => (
                  <button
                    key={mode}
                    onClick={() => setTransitModes(prev =>
                      prev.includes(mode) ? prev.filter(m => m !== mode) : [...prev, mode]
                    )}
                    className={[
                      'px-3 py-1 text-xs rounded-lg border transition-colors',
                      transitModes.includes(mode)
                        ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100'
                        : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700',
                    ].join(' ')}
                  >
                    {mode.charAt(0) + mode.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="font-identity block text-sm font-medium uppercase tracking-wide text-gray-400 mb-2">
                Stops
              </label>
              <StopList stops={stops} onChange={setStops} />
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400 border border-red-100 dark:border-red-900 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              onClick={planRoute}
              disabled={loading}
              className="w-full py-2.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium rounded-xl disabled:opacity-40 hover:bg-gray-700 dark:hover:bg-gray-300 transition-colors"
            >
              {loading ? 'Finding route…' : 'Plan route →'}
            </button>
          </div>
        )}

        {/* Timeline tab */}
        {tab === 'timeline' && (
          result
            ? <Timeline
                result={result}
                selectedOptions={selectedOptions}
                onSelectOption={selectOption}
                highlightedLeg={highlightedLeg}
                onHighlightLeg={setHighlightedLeg}
              />
            : (
              <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-600 text-sm">
                Plan a route to see the timeline
              </div>
            )
        )}
      </div>

      {/* ── Right: Map ── */}
      <div className="flex-1 relative">
        <TransitMap result={activeResult} highlightedLeg={highlightedLeg} theme={theme} />
        {!result && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-400 pointer-events-none">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true">
              <path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3V7z"/>
              <path d="M9 4v13M15 7v13"/>
            </svg>
            <span className="text-sm">Your route will appear here</span>
          </div>
        )}
      </div>
    </div>
  )
}