import { useState, useRef } from 'react'
import { Stop } from './StopList'

export interface Favourite {
  id: string
  label: string
  stops: Stop[]
  departureTime: string
  routingPreference: string
  transitModes: string[]
  savedAt: number
}

const KEY = 'ms_favourites'

export function loadFavourites(): Favourite[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}

export function saveFavourite(fav: Favourite) {
  const existing = loadFavourites().filter(f => f.id !== fav.id)
  localStorage.setItem(KEY, JSON.stringify([fav, ...existing]))
}

export function deleteFavourite(id: string) {
  localStorage.setItem(KEY, JSON.stringify(loadFavourites().filter(f => f.id !== id)))
}

function saveOrder(favs: Favourite[]) {
  localStorage.setItem(KEY, JSON.stringify(favs))
}

interface Props {
  onRun: (fav: Favourite) => void
}

export function Favourites({ onRun }: Props) {
  const [favs, setFavs] = useState<Favourite[]>(loadFavourites)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const dragIdx = useRef<number | null>(null)

  function refresh() { setFavs(loadFavourites()) }

  function handleDelete(id: string) {
    deleteFavourite(id)
    refresh()
  }

  function handleRenameStart(fav: Favourite) {
    setEditingId(fav.id)
    setEditLabel(fav.label)
  }

  function handleRenameCommit(fav: Favourite) {
    const updated = { ...fav, label: editLabel.trim() || fav.label }
    saveFavourite(updated)
    setEditingId(null)
    refresh()
  }

  function handleDragStart(idx: number) {
    dragIdx.current = idx
  }

  function handleDragEnter(idx: number) {
    if (dragIdx.current === null || dragIdx.current === idx) return
    setDragOverIdx(idx)
    const reordered = [...favs]
    const [moved] = reordered.splice(dragIdx.current, 1)
    reordered.splice(idx, 0, moved)
    dragIdx.current = idx
    setFavs(reordered)
  }

  function handleDragEnd() {
    dragIdx.current = null
    setDragOverIdx(null)
    saveOrder(favs)
  }

  const stopNames = (fav: Favourite) => fav.stops.map(s => s.name).filter(Boolean)

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
      {favs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-300 dark:text-gray-600">
          <i className="fa-regular fa-bookmark text-4xl" />
          <span className="text-sm">No saved trips yet</span>
        </div>
      )}

      {favs.map((fav, idx) => {
        const names = stopNames(fav)
        const isDragOver = dragOverIdx === idx
        return (
          <div
            key={fav.id}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragEnter={() => handleDragEnter(idx)}
            onDragEnd={handleDragEnd}
            onDragOver={e => e.preventDefault()}
            className={[
              'bg-gray-50 dark:bg-gray-800 border rounded-xl px-4 py-3 flex items-start gap-3 transition-all cursor-grab active:cursor-grabbing select-none',
              isDragOver
                ? 'border-blue-400 dark:border-blue-500 shadow-md scale-[1.01]'
                : 'border-gray-100 dark:border-gray-700',
            ].join(' ')}
          >
            {/* Drag handle + bookmark stacked */}
            <div className="flex flex-col items-center gap-2 flex-shrink-0">
              <div className="flex flex-col gap-[3px] opacity-30">
                {[0,1,2].map(i => <div key={i} className="w-3.5 h-px bg-gray-500 dark:bg-gray-400 rounded-full" />)}
              </div>
              <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                <i className="fa-solid fa-bookmark text-blue-500 dark:text-blue-400 text-xs" />
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {editingId === fav.id ? (
                <input
                  autoFocus
                  value={editLabel}
                  onChange={e => setEditLabel(e.target.value)}
                  onBlur={() => handleRenameCommit(fav)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRenameCommit(fav); if (e.key === 'Escape') setEditingId(null) }}
                  className="w-full text-sm font-medium bg-white dark:bg-gray-700 border border-blue-400 rounded px-2 py-0.5 outline-none dark:text-gray-100"
                />
              ) : (
                <div
                  className="text-sm font-medium dark:text-gray-100 truncate cursor-pointer hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                  onClick={() => handleRenameStart(fav)}
                  title="Click to rename"
                >
                  {fav.label}
                </div>
              )}

              {/* Stop list preview */}
              <div className="mt-1 flex flex-col gap-0.5">
                {names.map((name, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                    <span className="w-3.5 h-3.5 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-[9px] font-bold text-gray-500 dark:text-gray-300 flex-shrink-0">
                      {i + 1}
                    </span>
                    <span className="truncate">{name}</span>
                  </div>
                ))}
              </div>

              {/* Meta */}
              <div className="mt-1.5 text-xs text-gray-300 dark:text-gray-600">
                {new Date(fav.savedAt).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-1.5 flex-shrink-0">
              <button
                onClick={() => onRun(fav)}
                className="flex items-center justify-center px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white text-xs font-medium rounded-lg transition-colors"
              >
                <i className="fa-solid fa-play text-[10px]" />
              </button>
              <button
                onClick={() => handleDelete(fav.id)}
                className="flex items-center justify-center px-2.5 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs rounded-lg transition-colors"
              >
                <i className="fa-solid fa-trash text-[10px]" />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}