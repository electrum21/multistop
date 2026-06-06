import { Dispatch, SetStateAction, useState } from 'react'
import { StopList, Stop } from './StopList'

type Props = {
  departureTime: string
  setDepartureTime: (s: string) => void
  routingPreference: string
  setRoutingPreference: (s: string) => void
  transitModes: string[]
  setTransitModes: Dispatch<SetStateAction<string[]>>
  stops: Stop[]
  setStops: Dispatch<SetStateAction<Stop[]>>
  error: string | null
  loading: boolean
  onPlan: () => void
}

export default function PlanForm({ departureTime, setDepartureTime, routingPreference, setRoutingPreference, transitModes, setTransitModes, stops, setStops, error, loading, onPlan }: Props) {
  const [placeError, setPlaceError] = useState<string | null>(null)
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
        aria-label={`${mode.charAt(0) + mode.slice(1).toLowerCase()} transit mode${isSelected ? ' (selected)' : ''}`}
        aria-pressed={isSelected}
      >
        {isSelected && <svg className="w-3 h-3 shrink-0" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        {mode.charAt(0) + mode.slice(1).toLowerCase()}
      </button>
    )
  })

  return (
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
        <StopList stops={stops} onChange={setStops} onError={msg => setPlaceError(msg)} />
      </div>
      {error && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400 border border-red-100 dark:border-red-900 rounded-lg px-3 py-2">{error}</div>}
      {placeError && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400 border border-red-100 dark:border-red-900 rounded-lg px-3 py-2">{placeError}</div>}
      <button onClick={() => onPlan()} disabled={loading}
        className="w-full py-2.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium rounded-xl disabled:opacity-40 hover:bg-gray-700 dark:hover:bg-gray-300 transition-colors">
        {loading ? <><i className="fa-solid fa-spinner fa-spin mr-1" />Finding route…</> : <><i className="fa-solid fa-route mr-1" />Plan route <i className="fa-solid fa-arrow-right ml-1" /></>}
      </button>
    </div>
  )
}
