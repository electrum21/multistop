import { useState } from 'react'
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
  const mapsReady = useGoogleMaps(GOOGLE_MAPS_KEY)

  const [stops, setStops] = useState<Stop[]>([
    makeStop(0),
    makeStop(45),
    makeStop(0),
  ])
  const [departureTime, setDepartureTime] = useState(() => {
    const d = new Date()
    d.setHours(18, 30, 0, 0)
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  })
  const [tab, setTab] = useState<Tab>('plan')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  // selectedOptions[i] = which alternative index is selected for leg i
  const [selectedOptions, setSelectedOptions] = useState<number[]>([])

  async function planRoute() {
    const filled = stops.filter(s => s.name.trim())
    // if (filled.length < 2) { setError('Enter at least an origin and destination.'); return }
    setLoading(true); setError(null)
    try {
      const payload = {
        departureTime,
        optimiseOrder: false,
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

  // Build the "active" result — swap each leg for the selected alternative
  const activeResult = result ? {
    ...result,
    legs: result.legs.map((leg: any, i: number) => {
      const sel = selectedOptions[i] ?? 0
      return sel === 0 ? leg : (leg.alternatives?.[sel] ?? leg)
    }),
  } : null

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Left panel ── */}
      <div className="w-96 bg-white border-r border-gray-100 flex flex-col overflow-hidden flex-shrink-0">

        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
          <h1 className="font-medium text-sm">🚌 Transit Router</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {mapsReady ? 'Places autocomplete active' : 'Set VITE_GOOGLE_MAPS_API_KEY in .env.local'}
          </p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 px-5 pt-3 pb-0 border-b border-gray-100 flex-shrink-0">
          {(['plan', 'timeline'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={[
                'px-3 py-1.5 text-xs rounded-t-md capitalize border-b-2 transition-colors',
                tab === t
                  ? 'border-gray-900 text-gray-900 font-medium'
                  : 'border-transparent text-gray-400 hover:text-gray-600',
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
              <label className="block text-xs font-medium uppercase tracking-wide text-gray-400 mb-2">
                Departure time
              </label>
              <input
                type="datetime-local"
                value={departureTime}
                onChange={e => setDepartureTime(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 outline-none focus:border-gray-400 focus:bg-white transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-gray-400 mb-2">
                Stops
              </label>
              <StopList stops={stops} onChange={setStops} />
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              onClick={planRoute}
              disabled={loading}
              className="w-full py-2.5 bg-gray-900 text-white text-sm font-medium rounded-xl disabled:opacity-40 hover:bg-gray-700 transition-colors"
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
              />
            : (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                Plan a route to see the timeline
              </div>
            )
        )}
      </div>

      {/* ── Right: Map ── */}
      <div className="flex-1 relative">
        <TransitMap result={activeResult} />
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