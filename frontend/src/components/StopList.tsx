import { useRef } from 'react'
import { PlaceAutocomplete, ResolvedPlace } from './PlaceAutocomplete'

export interface Stop {
  id: number
  name: string
  place: ResolvedPlace | null
  stayMinutes: number
}

const LEG_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']

interface Props {
  stops: Stop[]
  onChange: (stops: Stop[]) => void
}

export function StopList({ stops, onChange }: Props) {
  const inputRefs = useRef<Record<number, HTMLDivElement | null>>({})

  function update(id: number, patch: Partial<Stop>) {
    onChange(stops.map(s => s.id === id ? { ...s, ...patch } : s))
  }

  function remove(id: number) {
    if (stops.length <= 2) return
    onChange(stops.filter(s => s.id !== id))
  }

  function addStop() {
    const newStop: Stop = {
      id: Date.now(),
      name: '',
      place: null,
      stayMinutes: 30,
    }
    // Insert before last stop (destination)
    const next = [...stops]
    next.splice(next.length - 1, 0, newStop)
    onChange(next)
  }

  // Focus next input after selecting a place
  function focusNext(idx: number) {
    if (idx < stops.length - 1) {
      const nextId = stops[idx + 1].id
      const wrap = inputRefs.current[nextId]
      wrap?.querySelector('input')?.focus()
    }
  }

  return (
    <div className="flex flex-col">
      {stops.map((stop, idx) => {
        const isFirst = idx === 0
        const isLast  = idx === stops.length - 1
        const color   = LEG_COLORS[idx % LEG_COLORS.length]

        return (
          <div key={stop.id}>
            {/* ── Stop row ── */}
            <div className="flex items-center gap-2 py-1">
              {/* Coloured dot */}
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: color }}
              />

              {/* Autocomplete input */}
              <div
                className="flex-1"
                ref={el => { inputRefs.current[stop.id] = el }}
              >
                <PlaceAutocomplete
                  value={stop.name}
                  resolvedPlace={stop.place}
                  placeholder={isFirst ? 'Origin' : isLast ? 'Destination' : 'Waypoint'}
                  onChange={(name, place) => update(stop.id, { name, place })}
                  onCommit={() => focusNext(idx)}
                />
              </div>

              {/* Remove button (not for origin) */}
              {!isFirst ? (
                <button
                  onClick={() => remove(stop.id)}
                  className="text-gray-300 hover:text-red-400 transition-colors text-lg leading-none px-1"
                  aria-label="Remove stop"
                >
                  ×
                </button>
              ) : (
                <div className="w-6" />
              )}
            </div>

            {/* ── Connector + stay duration (between stops, not after last) ── */}
            {!isLast && (
              <div className="flex items-center gap-2 pl-0.5">
                {/* Vertical line */}
                <div className="flex flex-col items-center w-2.5 flex-shrink-0">
                  <div className="w-px flex-1 min-h-[20px]" style={{ background: `${color}50` }} />
                </div>

                {/* Stay duration pill */}
                <div className="flex items-center gap-1.5 py-1 pl-2 text-xs text-gray-400">
                  <span>Stay:</span>
                  <input
                    type="number"
                    min={0}
                    max={480}
                    value={stop.stayMinutes}
                    onChange={e => update(stop.id, { stayMinutes: Number(e.target.value) })}
                    className="w-12 text-center py-0.5 px-1 border border-gray-200 rounded-md bg-gray-50 text-gray-700 text-xs outline-none focus:border-gray-400"
                  />
                  <span>min</span>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Add waypoint */}
      <button
        onClick={addStop}
        className="mt-2 flex items-center gap-1.5 text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 hover:text-gray-600 transition-colors w-full"
      >
        <span className="text-base leading-none">+</span>
        Add waypoint
      </button>
    </div>
  )
}
