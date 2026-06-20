import { Dispatch, SetStateAction, useState } from 'react'
import { StopList, Stop } from './StopList'
import { FoodieStopPicker, FoodPlace } from './FoodieStopPicker'

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
  const [foodieMode, setFoodieMode] = useState(false)
  const [foodStopId, setFoodStopId] = useState<number | null>(null)

  const origin = stops[0]?.place ?? null
  const destination = stops[stops.length - 1]?.place ?? null

  function handleSelectFoodPlace(food: FoodPlace) {
    const newStop: Stop = {
      id: Date.now(),
      name: food.name,
      place: {
        placeId: food.placeId,
        name: food.name,
        lat: food.lat,
        lng: food.lng,
        formattedAddress: food.formattedAddress,
      },
      stayMinutes: 30,
    }

    if (foodStopId != null) {
      // Replace the previously inserted food stop (e.g. user picked a different option)
      setStops(prev => prev.map(s => s.id === foodStopId ? { ...newStop, id: foodStopId } : s))
      setFoodStopId(foodStopId)
    } else {
      // Insert just before the destination (last stop)
      setStops(prev => [...prev.slice(0, -1), newStop, prev[prev.length - 1]])
      setFoodStopId(newStop.id)
    }
  }

  function toggleFoodieMode() {
    setFoodieMode(prev => {
      const next = !prev
      // If turning off, remove the inserted food stop
      if (!next && foodStopId != null) {
        setStops(s => s.filter(st => st.id !== foodStopId))
        setFoodStopId(null)
      }
      return next
    })
  }

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
        <StopList stops={stops} onChange={s => {
          // If the food stop was removed by the user, clear our tracking id
          if (foodStopId != null && !s.find(st => st.id === foodStopId)) setFoodStopId(null)
          setStops(s)
        }} onError={msg => setPlaceError(msg)} />
      </div>

      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30 p-3">
        <button
          onClick={toggleFoodieMode}
          className="w-full flex items-center justify-between"
          aria-pressed={foodieMode}
        >
          <span className="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-100">
            <i className="fa-solid fa-utensils text-amber-500" /> Foodie Mode
          </span>
          <span className={[
            'w-9 h-5 rounded-full relative transition-colors flex-shrink-0',
            foodieMode ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600',
          ].join(' ')}>
            <span className={[
              'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform',
              foodieMode ? 'translate-x-4' : '',
            ].join(' ')} />
          </span>
        </button>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Add a stop along the way for good food
        </p>
        {foodieMode && (
          <div className="mt-3">
            <FoodieStopPicker origin={origin} destination={destination} departureTime={departureTime} onSelect={handleSelectFoodPlace} />
          </div>
        )}
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