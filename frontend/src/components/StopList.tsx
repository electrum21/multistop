import { useRef, useState } from 'react'
import { PlaceAutocomplete, ResolvedPlace } from './PlaceAutocomplete'
import { LEG_COLORS } from '../constants'

export interface Stop {
  id: number
  name: string
  place: ResolvedPlace | null
  stayMinutes: number
}

interface Props {
  stops: Stop[]
  onChange: (stops: Stop[]) => void
}

export function StopList({ stops, onChange }: Props) {
  const inputRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const dragIdx = useRef<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  function update(id: number, patch: Partial<Stop>) {
    onChange(stops.map(s => s.id === id ? { ...s, ...patch } : s))
  }

  function remove(id: number) {
    if (stops.length <= 2) return
    onChange(stops.filter(s => s.id !== id))
  }

  const MAX_STOPS = 5

  function addStop() {
    if (stops.length >= MAX_STOPS) return
    const newStop: Stop = { id: Date.now(), name: '', place: null, stayMinutes: 0 }
    onChange([...stops, newStop])
  }

  function focusNext(idx: number) {
    if (idx < stops.length - 1) {
      const nextId = stops[idx + 1].id
      inputRefs.current[nextId]?.querySelector('input')?.focus()
    }
  }

  function onDragStart(idx: number) {
    dragIdx.current = idx
  }

  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    setDragOverIdx(idx)
  }

  function onDrop(toIdx: number) {
    const fromIdx = dragIdx.current
    if (fromIdx === null || fromIdx === toIdx) return
    const next = [...stops]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    onChange(next)
    dragIdx.current = null
    setDragOverIdx(null)
  }

  function onDragEnd() {
    dragIdx.current = null
    setDragOverIdx(null)
  }

  return (
    <div className="flex flex-col">
      {stops.map((stop, idx) => {
        const isFirst = idx === 0
        const isLast = idx === stops.length - 1
        const color = LEG_COLORS[idx % LEG_COLORS.length]

        return (
          <div
            key={stop.id}
            draggable
            onDragStart={() => onDragStart(idx)}
            onDragOver={e => onDragOver(e, idx)}
            onDrop={() => onDrop(idx)}
            onDragEnd={onDragEnd}
            className={dragOverIdx === idx ? 'opacity-50' : ''}
          >
            <div className="flex items-center gap-2 py-1">
              {/* Drag handle */}
              <div className="cursor-grab text-gray-300 dark:text-gray-600 hover:text-gray-400 select-none px-0.5 text-sm leading-none">
                ⠿
              </div>

              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: color }}
              />

              <div className="flex-1" ref={el => { inputRefs.current[stop.id] = el }}>
                <PlaceAutocomplete
                  value={stop.name}
                  resolvedPlace={stop.place}
                  placeholder={isFirst ? 'Origin' : isLast ? 'Destination' : 'Waypoint'}
                  onChange={(name, place) => update(stop.id, { name, place })}
                  onCommit={() => focusNext(idx)}
                />
              </div>

              {!isFirst ? (
                <button
                  onClick={() => remove(stop.id)}
                  className="text-gray-300 dark:text-gray-600 hover:text-red-400 dark:hover:text-red-500 transition-colors text-lg leading-none px-1"
                  aria-label="Remove stop"
                >
                  ×
                </button>
              ) : (
                <div className="w-6" />
              )}
            </div>

            {/* Stay — only for waypoints (not origin, not destination) */}
            {!isFirst && !isLast && (
              <div className="flex items-center gap-2 pl-0.5">
                <div className="flex flex-col items-center w-2.5 flex-shrink-0">
                  <div className="w-px flex-1 min-h-[20px]" style={{ background: `${color}50` }} />
                </div>
                <div className="flex items-center gap-1.5 py-1 pl-2 text-xs text-gray-400 dark:text-gray-500">
                  <span>Stay:</span>
                  <input
                    type="number"
                    min={0}
                    max={480}
                    value={stop.stayMinutes}
                    onChange={e => update(stop.id, { stayMinutes: Number(e.target.value) })}
                    className="w-12 text-center py-0.5 px-1 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs outline-none focus:border-gray-400 dark:focus:border-gray-500"
                  />
                  <span>min</span>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {stops.length < MAX_STOPS && (
        <button
          onClick={addStop}
          className="mt-2 flex items-center gap-1.5 text-sm text-gray-400 dark:text-gray-500 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-colors w-full"
        >
          <span className="text-base leading-none">+</span>
          Add waypoint
        </button>
      )}
    </div>
  )
}