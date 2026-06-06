import { useState, useEffect, useMemo, useRef } from 'react'
import { Stop } from './components/StopList'
import { TransitMap } from './components/TransitMap'
import { Timeline } from './components/Timeline'
import { Favourites, Favourite, saveFavourite } from './components/Favourites'
import { useGoogleMaps } from './hooks/useGoogleMaps'
import PlanForm from './components/PlanForm'
import { generateUUID, getStorageItem, setStorageItem } from './utils'
import type { RouteResult, RouteLeg } from './types'
import TabBar from './components/TabBar'
import ThemeToggle from './components/ThemeToggle'
import SaveModal from './components/SaveModal'
import { useRoutePlanning } from './hooks/useRoutePlanning'

// ━━━ Constants ━━━
const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? ''
const SHEET_FULL_HEIGHT_VH = 88
const SHEET_PEEK_HEIGHT_VH = 42
const SHEET_MAX_CLAMP = 0.93
const SHEET_MIN_CLAMP = 0.2
const DRAG_THRESHOLD_PX = 40
const SHEET_TRANSITION_MS = 350
const ERROR_DISMISS_TIMEOUT_MS = 6000

let stopCounter = 10
function makeStop(stayMinutes = 0): Stop {
  return { id: stopCounter++, name: '', place: null, stayMinutes }
}

type Tab = 'plan' | 'timeline' | 'favourites'

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (getStorageItem('theme', 'light') as 'light' | 'dark')
  })
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    setStorageItem('theme', theme)
  }, [theme])

  // Route planning hook (encapsulates loading/error/result)
  const { result: hookResult, loading: hookLoading, error: hookError, planRoute: hookPlanRoute, selectedOptions: hookSelectedOptions, selectOption: hookSelectOption, setError: hookSetError, setResult: hookSetResult } = useRoutePlanning()

  useEffect(() => {
    if (hookError) {
      const timeout = setTimeout(() => hookSetError(null), ERROR_DISMISS_TIMEOUT_MS)
      return () => clearTimeout(timeout)
    }
  }, [hookError, hookSetError])

  useGoogleMaps(GOOGLE_MAPS_KEY)

  // Load persisted result and last-tab; stops and tab are initialised synchronously below
  useEffect(() => {
    try {
      const rawResult = getStorageItem('ms_result', '')
      if (rawResult) {
        try {
          const parsed = JSON.parse(rawResult)
          if (parsed) {
            hookSetResult(parsed)
          }
        } catch {}
      }
      const lastTab = getStorageItem('ms_lastTab', '') as Tab | ''
      if (lastTab === 'plan' || lastTab === 'timeline' || lastTab === 'favourites') {
        // setSheetFull when restoring timeline to ensure correct sheet state
        if (lastTab === 'timeline') setSheetFull(false)
      }
    } catch (e) {
      // non-fatal
    }
  }, [])

  const [stops, setStops] = useState<Stop[]>(() => {
    try {
      const raw = getStorageItem('ms_stops', '')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.length) return parsed
      }
    } catch {}
    return [makeStop(0), makeStop(0)]
  })
  const [departureTime, setDepartureTime] = useState(() => {
    const d = new Date()
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  })
  const [tab, setTab] = useState<Tab>(() => {
    try {
      const t = getStorageItem('ms_lastTab', '') as Tab | ''
      if (t === 'plan' || t === 'timeline' || t === 'favourites') return t
    } catch {}
    return 'plan'
  })

  // persist last active tab
  function handleSetTab(t: Tab) {
    setTab(t)
    try { setStorageItem('ms_lastTab', t) } catch {}
  }
  
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
    // delegate to hook and sync some UI state
    await hookPlanRoute(overrides ? { stops: overrides.stops, departureTime: overrides.departureTime, routingPreference: overrides.routingPreference, transitModes: overrides.transitModes } : { stops, departureTime, routingPreference, transitModes })
    handleSetTab('timeline')
    setSheetFull(false)
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
      id: generateUUID(),
      label: saveLabel.trim() || defaultLabel,
      stops,
      departureTime,
      routingPreference,
      transitModes,
      savedAt: Date.now(),
    })
    setSaveModalOpen(false)
  }

  // selection handled by route planning hook (`hookSelectOption`)

  const activeResult = useMemo<RouteResult | null>(() => {
    if (!hookResult) return null
    return { ...hookResult, legs: hookResult.legs.map((leg: RouteLeg, i: number) => { const sel = hookSelectedOptions[i] ?? 0; return sel === 0 ? leg : (leg.alternatives?.[sel] ?? leg) }) }
  }, [hookResult, hookSelectedOptions])

  // Drag handlers
  function handleDragStart(clientY: number) {
    dragStartY.current = clientY
    dragStartFull.current = sheetFull
  }
  function handleDragEnd(clientY: number) {
    if (dragStartY.current === null) return
    const delta = dragStartY.current - clientY
    if (Math.abs(delta) > DRAG_THRESHOLD_PX) setSheetFull(delta > 0)
    else setSheetFull(dragStartFull.current) // snap back
    dragStartY.current = null
    if (sheetRef.current) sheetRef.current.style.height = ''
  }

  // Shared form JSX (no inner component — just inline JSX)
  

  const timelineContent = hookResult
    ? <Timeline result={hookResult} selectedOptions={hookSelectedOptions} onSelectOption={hookSelectOption}
        highlightedLeg={highlightedLeg} onHighlightLeg={setHighlightedLeg}
        highlightedStep={highlightedStep} onHighlightStep={setHighlightedStep} onSave={handleSave} />
    : <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-600 text-sm">Plan a route to see the timeline</div>

  

  const mapEmptyState = !hookResult && (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-400 pointer-events-none">
      <i className="fa-regular fa-map text-5xl text-gray-300 dark:text-gray-600" />
      <span className="text-sm">Your route will appear here</span>
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
              <ThemeToggle theme={theme} setTheme={setTheme} />
            </div>
          </div>
          <TabBar tab={tab} setTab={handleSetTab} setSheetFull={setSheetFull} />
          {tab === 'plan' ? <PlanForm
            departureTime={departureTime}
            setDepartureTime={setDepartureTime}
            routingPreference={routingPreference}
            setRoutingPreference={setRoutingPreference}
            transitModes={transitModes}
            setTransitModes={setTransitModes}
            stops={stops}
            setStops={setStops}
            error={hookError}
            loading={hookLoading}
            onPlan={() => planRoute()}
          /> : tab === 'timeline' ? <div className="flex flex-col flex-1 overflow-hidden">{timelineContent}</div> : <div className="flex flex-col flex-1 overflow-hidden"><Favourites onRun={runFavourite} /></div>}
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
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-0.5 pointer-events-auto"><ThemeToggle theme={theme} setTheme={setTheme} /></div>
          {hookResult && !sheetFull && (
            <button onClick={() => { setSheetFull(true); handleSetTab('timeline') }}
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
            height: sheetFull ? `${SHEET_FULL_HEIGHT_VH}vh` : `${SHEET_PEEK_HEIGHT_VH}vh`,
            transition: `height ${SHEET_TRANSITION_MS / 1000}s cubic-bezier(0.32, 0.72, 0, 1)`,
            boxShadow: '0 -4px 32px rgba(0,0,0,0.15)',
          }}
        >
          {/* Drag handle row — logo lives here, doesn't float over the map */}
          <div
            className="flex-shrink-0 flex items-center justify-between px-4 pt-3 pb-1 cursor-grab active:cursor-grabbing touch-none select-none"
            role="slider"
            aria-label="Drag to expand or collapse route details"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={sheetFull ? 100 : 50}
            onPointerDown={e => {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
              handleDragStart(e.clientY)
            }}
            onPointerMove={e => {
              if (dragStartY.current === null) return
              const delta = dragStartY.current - e.clientY
              const baseH = dragStartFull.current ? SHEET_FULL_HEIGHT_VH / 100 : SHEET_PEEK_HEIGHT_VH / 100
              const raw = baseH + delta / window.innerHeight
              const clamped = Math.min(SHEET_MAX_CLAMP, Math.max(SHEET_MIN_CLAMP, raw))
              if (sheetRef.current) {
                sheetRef.current.style.transition = 'none'
                sheetRef.current.style.height = `${clamped * 100}vh`
              }
            }}
            onPointerUp={e => {
              if (sheetRef.current) sheetRef.current.style.transition = `height ${SHEET_TRANSITION_MS / 1000}s cubic-bezier(0.32, 0.72, 0, 1)`
              handleDragEnd(e.clientY)
            }}
            onPointerCancel={e => {
              if (sheetRef.current) sheetRef.current.style.transition = `height ${SHEET_TRANSITION_MS / 1000}s cubic-bezier(0.32, 0.72, 0, 1)`
              handleDragEnd(e.clientY)
            }}
          >
            <h1 className="font-identity text-base leading-none dark:text-gray-100 tracking-wide">MULTISTOP</h1>
            <div className="w-10 h-1 rounded-full bg-gray-200 dark:bg-gray-700" />
            {/* Spacer to balance logo */}
            <div className="w-16" />
          </div>

          <TabBar tab={tab} setTab={handleSetTab} setSheetFull={setSheetFull} />

          <div className="flex-1 flex flex-col overflow-hidden">
            {tab === 'plan' ? <PlanForm
              departureTime={departureTime}
              setDepartureTime={setDepartureTime}
              routingPreference={routingPreference}
              setRoutingPreference={setRoutingPreference}
              transitModes={transitModes}
              setTransitModes={setTransitModes}
              stops={stops}
              setStops={setStops}
              error={hookError}
              loading={hookLoading}
              onPlan={() => planRoute()}
            /> : tab === 'timeline' ? timelineContent : <Favourites onRun={runFavourite} />}
          </div>
        </div>
      </div>
      <SaveModal open={saveModalOpen} onClose={() => setSaveModalOpen(false)} label={saveLabel} setLabel={setSaveLabel} onConfirm={handleSaveConfirm} />
    </div>
  )
}