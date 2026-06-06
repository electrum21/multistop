import { useState, useEffect, useMemo, useRef } from 'react'
import { StopList, Stop } from './components/StopList'
import { TransitMap } from './components/TransitMap'
import { Timeline } from './components/Timeline'
import { Favourites, Favourite, saveFavourite } from './components/Favourites'
import { useGoogleMaps } from './hooks/useGoogleMaps'

const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? ''

let stopCounter = 10
function makeStop(stayMinutes = 0): Stop {
  return { id: stopCounter++, name: '', place: null, stayMinutes }
}

type Tab = 'plan' | 'timeline' | 'favourites'

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') ?? 'light'
  })
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('theme', theme)
  }, [theme])

  useGoogleMaps(GOOGLE_MAPS_KEY)

  const [stops, setStops] = useState<Stop[]>([makeStop(0), makeStop(0)])
  const [departureTime, setDepartureTime] = useState(() => {
    const d = new Date()
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  })
  const [tab, setTab] = useState<Tab>('plan')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedOptions, setSelectedOptions] = useState<number[]>([])
  const [highlightedLeg, setHighlightedLeg] = useState<number | null>(null)
  const [highlightedStep, setHighlightedStep] = useState<{ leg: number; stepIndex: number } | null>(null)
  const [routingPreference, setRoutingPreference] = useState('')
  const [transitModes, setTransitModes] = useState<string[]>([])

  // Mobile sheet: 'full' = tall, 'peek' = short (map visible)
  const [sheetFull, setSheetFull] = useState(true)
  const sheetRef = useRef<HTMLDivElement>(null)
  const dragStartY = useRef<number | null>(null)
  const dragStartFull = useRef(true)

  async function planRoute(overrides?: { stops: Stop[], departureTime: string, routingPreference: string, transitModes: string[] }) {
    const _stops = overrides?.stops ?? stops
    const _departureTime = overrides?.departureTime ?? departureTime
    const _routingPreference = overrides?.routingPreference ?? routingPreference
    const _transitModes = overrides?.transitModes ?? transitModes

    const filled = _stops.filter(s => s.name.trim())
    if (filled.length < 2) { setError('Enter at least an origin and destination.'); return }
    const emptyWaypoints = _stops.slice(1, -1).map((s, i) => ({ s, idx: i + 1 })).filter(({ s }) => !s.name.trim())
    if (emptyWaypoints.length > 0) { setError(`Please fill in or remove: ${emptyWaypoints.map(({ idx }) => `waypoint ${idx}`).join(', ')}.`); return }
    if (!_stops[0].name.trim()) { setError('Please enter an origin.'); return }
    if (!_stops[_stops.length - 1].name.trim()) { setError('Please enter a destination.'); return }
    setLoading(true); setError(null)
    try {
      const payload = {
        departureTime: _departureTime, optimiseOrder: false,
        routingPreference: _routingPreference || null, transitModes: _transitModes,
        stops: _stops.map(s => ({ name: s.name, lat: s.place?.lat ?? null, lng: s.place?.lng ?? null, stayMinutes: s.stayMinutes })),
      }
      const resp = await fetch('/api/transit/route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!resp.ok) { const err = await resp.json().catch(() => ({})); throw new Error(err.error ?? `HTTP ${resp.status}`) }
      const data = await resp.json()
      setResult(data)
      setSelectedOptions(data.legs.map(() => 0))
      localStorage.setItem('ms_stops', JSON.stringify(_stops))
      localStorage.setItem('ms_result', JSON.stringify(data))
      setTab('timeline')
      setSheetFull(false) // collapse to show map with route
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function runFavourite(fav: Favourite) {
    const now = new Date()
    const nowStr = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    setStops(fav.stops)
    setDepartureTime(nowStr)
    setRoutingPreference(fav.routingPreference)
    setTransitModes(fav.transitModes)
    planRoute({ stops: fav.stops, departureTime: nowStr, routingPreference: fav.routingPreference, transitModes: fav.transitModes })
  }

  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [saveLabel, setSaveLabel] = useState('')

  function handleSave() {
    setSaveLabel(stops.map(s => s.name).filter(Boolean).join(' → '))
    setSaveModalOpen(true)
  }

  function handleSaveConfirm() {
    const defaultLabel = stops.map(s => s.name).filter(Boolean).join(' → ')
    saveFavourite({
      id: crypto.randomUUID(),
      label: saveLabel.trim() || defaultLabel,
      stops,
      departureTime,
      routingPreference,
      transitModes,
      savedAt: Date.now(),
    })
    setSaveModalOpen(false)
  }

  function selectOption(legIndex: number, optionIndex: number) {
    setSelectedOptions(prev => { const next = [...prev]; next[legIndex] = optionIndex; return next })
  }

  const activeResult = useMemo(() => {
    if (!result) return null
    return { ...result, legs: result.legs.map((leg: any, i: number) => { const sel = selectedOptions[i] ?? 0; return sel === 0 ? leg : (leg.alternatives?.[sel] ?? leg) }) }
  }, [result, selectedOptions])

  // Drag handlers
  function handleDragStart(clientY: number) {
    dragStartY.current = clientY
    dragStartFull.current = sheetFull
  }
  function handleDragEnd(clientY: number) {
    if (dragStartY.current === null) return
    const delta = dragStartY.current - clientY
    if (Math.abs(delta) > 40) setSheetFull(delta > 0)
    else setSheetFull(dragStartFull.current) // snap back
    dragStartY.current = null
    if (sheetRef.current) sheetRef.current.style.height = ''
  }

  // Shared form JSX (no inner component — just inline JSX)
  const modeButtons = ['BUS', 'TRAIN'].map(mode => {
    const isSelected = transitModes.includes(mode)
    return (
      <button
        key={mode}
        onClick={() => setTransitModes(prev => prev.includes(mode) ? prev.filter(m => m !== mode) : [...prev, mode])}
        className={[
          'flex-1 h-[38px] text-xs rounded-lg border transition-all duration-150 flex items-center justify-center gap-1.5 font-medium',
          isSelected
            ? 'bg-blue-600 text-white border-blue-600 shadow-sm dark:bg-blue-500 dark:border-blue-500'
            : 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700',
        ].join(' ')}
      >
        {isSelected && <svg className="w-3 h-3 shrink-0" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        {mode.charAt(0) + mode.slice(1).toLowerCase()}
      </button>
    )
  })

  const planForm = (
    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
      <div>
        <label className="font-identity block text-sm uppercase tracking-wide text-gray-400 mb-2">Departure Time</label>
        <input type="datetime-local" value={departureTime} onChange={e => setDepartureTime(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 dark:text-gray-100 outline-none focus:border-gray-400 focus:bg-white dark:focus:bg-gray-700 transition-colors" />
      </div>
      <div className="flex items-end gap-3">
        <div className="flex-1 min-w-0">
          <label className="font-identity block text-sm font-medium uppercase tracking-wide text-gray-400 mb-2">Route Preference</label>
          <select value={routingPreference} onChange={e => setRoutingPreference(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 dark:text-gray-100 outline-none">
            <option value="">Best route</option>
            <option value="FEWER_TRANSFERS">Fewer transfers</option>
            <option value="LESS_WALKING">Less walking</option>
          </select>
        </div>
        <div className="flex-1 min-w-0">
          <label className="font-identity block text-sm font-medium uppercase tracking-wide text-gray-400 mb-2">Modes</label>
          <div className="flex gap-2">{modeButtons}</div>
        </div>
      </div>
      <div>
        <label className="font-identity block text-sm font-medium uppercase tracking-wide text-gray-400 mb-2">Stops</label>
        <StopList stops={stops} onChange={setStops} />
      </div>
      {error && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400 border border-red-100 dark:border-red-900 rounded-lg px-3 py-2">{error}</div>}
      <button onClick={() => planRoute()} disabled={loading}
        className="w-full py-2.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium rounded-xl disabled:opacity-40 hover:bg-gray-700 dark:hover:bg-gray-300 transition-colors">
        {loading ? <><i className="fa-solid fa-spinner fa-spin mr-1" />Finding route…</> : <><i className="fa-solid fa-route mr-1" />Plan route <i className="fa-solid fa-arrow-right ml-1" /></>}
      </button>
    </div>
  )

  const timelineContent = result
    ? <Timeline result={result} selectedOptions={selectedOptions} onSelectOption={selectOption}
        highlightedLeg={highlightedLeg} onHighlightLeg={setHighlightedLeg}
        highlightedStep={highlightedStep} onHighlightStep={setHighlightedStep} onSave={handleSave} />
    : <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-600 text-sm">Plan a route to see the timeline</div>

  const tabBar = (
    <div className="font-identity flex px-5 pt-3 pb-0 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
      {([
        { id: 'plan'       as Tab, label: 'Plan',     icon: 'fa-regular fa-map' },
        { id: 'timeline'   as Tab, label: 'Timeline', icon: 'fa-regular fa-clock' },
        { id: 'favourites' as Tab, label: 'Saved',    icon: 'fa-regular fa-bookmark' },
      ]).map(({ id, label, icon }) => (
        <button key={id} onClick={() => { setTab(id); setSheetFull(true) }}
          className={['flex-1 flex items-center justify-center gap-1.5 py-1.5 text-sm rounded-t-md border-b-2 transition-colors',
            tab === id ? 'border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100 font-medium' : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300',
          ].join(' ')}>
          <i className={icon} />
          {label}
        </button>
      ))}
    </div>
  )

  const themeToggle = (
    <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
      <button onClick={() => setTheme('light')} className={theme === 'light' ? 'bg-white rounded-md px-2 py-1 shadow-sm' : 'px-2 py-1 opacity-40'} aria-label="Light mode">
        <i className="fa-solid fa-sun text-amber-400 text-sm" />
      </button>
      <button onClick={() => setTheme('dark')} className={theme === 'dark' ? 'bg-white dark:bg-gray-700 rounded-md px-2 py-1 shadow-sm' : 'px-2 py-1 opacity-40'} aria-label="Dark mode">
        <i className="fa-solid fa-moon text-indigo-400 text-sm" />
      </button>
    </div>
  )

  const mapEmptyState = !result && (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-400 pointer-events-none">
      <i className="fa-regular fa-map text-5xl text-gray-300 dark:text-gray-600" />
      <span className="text-sm">Your route will appear here</span>
    </div>
  )

  const saveModal = saveModalOpen && (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSaveModalOpen(false)} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-sm p-5 flex flex-col gap-4">
        <h2 className="font-identity text-base font-medium dark:text-gray-100">Save trip</h2>
        <input
          autoFocus
          type="text"
          value={saveLabel}
          onChange={e => setSaveLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSaveConfirm(); if (e.key === 'Escape') setSaveModalOpen(false) }}
          placeholder="Trip name"
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 dark:text-gray-100 outline-none focus:border-blue-400 focus:bg-white dark:focus:bg-gray-700 transition-colors"
        />
        <div className="flex gap-2">
          <button
            onClick={() => setSaveModalOpen(false)}
            className="flex-1 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveConfirm}
            className="flex-1 py-2 text-sm rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-medium hover:bg-gray-700 dark:hover:bg-gray-300 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="h-screen overflow-hidden">
      {/* ══ DESKTOP (md+) ══════════════════════════════════════════════════════ */}
      <div className="hidden md:flex h-full overflow-hidden">
        <div className="w-96 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800 flex flex-col overflow-hidden flex-shrink-0">
          <div className="px-5 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
            <div className="flex items-center justify-between">
              <h1 className="font-identity text-2xl dark:text-gray-100">MULTISTOP</h1>
              {themeToggle}
            </div>
          </div>
          {tabBar}
          {tab === 'plan' ? planForm : tab === 'timeline' ? <div className="flex flex-col flex-1 overflow-hidden">{timelineContent}</div> : <div className="flex flex-col flex-1 overflow-hidden"><Favourites onRun={runFavourite} /></div>}
        </div>
        <div className="flex-1 relative">
          <TransitMap result={activeResult} highlightedLeg={highlightedLeg} highlightedStep={highlightedStep} theme={theme} />
          {mapEmptyState}
        </div>
      </div>

      {/* ══ MOBILE (below md) ══════════════════════════════════════════════════ */}
      <div className="flex md:hidden h-full overflow-hidden relative">

        {/* Full-screen map */}
        <div className="absolute inset-0">
          <TransitMap result={activeResult} highlightedLeg={highlightedLeg} highlightedStep={highlightedStep} theme={theme} />
          {mapEmptyState}
        </div>

        {/* Top-right controls only — avoids clashing with Leaflet zoom (top-left) */}
        <div className="absolute top-0 right-0 z-30 flex items-center gap-2 px-3 pt-10 pb-2 pointer-events-none">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-0.5 pointer-events-auto">{themeToggle}</div>
          {result && !sheetFull && (
            <button onClick={() => { setSheetFull(true); setTab('timeline') }}
              className="bg-blue-600 text-white rounded-2xl shadow-lg px-3 py-2 text-xs font-semibold flex items-center gap-1.5 pointer-events-auto">
              <i className="fa-solid fa-list-ul text-xs" /> Directions
            </button>
          )}
        </div>

        {/* Bottom sheet */}
        <div
          ref={sheetRef}
          className="absolute left-0 right-0 bottom-0 z-20 bg-white dark:bg-gray-900 rounded-t-3xl flex flex-col"
          style={{
            height: sheetFull ? '88vh' : '42vh',
            transition: 'height 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
            boxShadow: '0 -4px 32px rgba(0,0,0,0.15)',
          }}
        >
          {/* Drag handle row — logo lives here, doesn't float over the map */}
          <div
            className="flex-shrink-0 flex items-center justify-between px-4 pt-3 pb-1 cursor-grab active:cursor-grabbing touch-none select-none"
            onPointerDown={e => {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
              handleDragStart(e.clientY)
            }}
            onPointerMove={e => {
              if (dragStartY.current === null) return
              const delta = dragStartY.current - e.clientY
              const baseH = dragStartFull.current ? 0.88 : 0.42
              const raw = baseH + delta / window.innerHeight
              const clamped = Math.min(0.93, Math.max(0.2, raw))
              if (sheetRef.current) {
                sheetRef.current.style.transition = 'none'
                sheetRef.current.style.height = `${clamped * 100}vh`
              }
            }}
            onPointerUp={e => {
              if (sheetRef.current) sheetRef.current.style.transition = 'height 0.35s cubic-bezier(0.32, 0.72, 0, 1)'
              handleDragEnd(e.clientY)
            }}
            onPointerCancel={e => {
              if (sheetRef.current) sheetRef.current.style.transition = 'height 0.35s cubic-bezier(0.32, 0.72, 0, 1)'
              handleDragEnd(e.clientY)
            }}
          >
            <h1 className="font-identity text-base leading-none dark:text-gray-100 tracking-wide">MULTISTOP</h1>
            <div className="w-10 h-1 rounded-full bg-gray-200 dark:bg-gray-700" />
            {/* Spacer to balance logo */}
            <div className="w-16" />
          </div>

          {tabBar}

          <div className="flex-1 flex flex-col overflow-hidden">
            {tab === 'plan' ? planForm : tab === 'timeline' ? timelineContent : <Favourites onRun={runFavourite} />}
          </div>
        </div>
      </div>
      {saveModal}
    </div>
  )
}