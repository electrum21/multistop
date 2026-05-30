import { useEffect, useRef, useState, useCallback, KeyboardEvent } from 'react'

export interface ResolvedPlace {
  placeId: string
  name: string
  lat: number
  lng: number
  formattedAddress: string
}

interface Prediction {
  placeId: string
  mainText: string
  secondaryText: string
  isTransit: boolean
}

interface Props {
  value: string
  resolvedPlace: ResolvedPlace | null
  placeholder?: string
  countryCode?: string
  onChange: (name: string, place: ResolvedPlace | null) => void
  disabled?: boolean
  className?: string
  onCommit?: () => void
}

function useDebounce<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  const timer = useRef<ReturnType<typeof setTimeout>>()
  return useCallback((...args: Parameters<T>) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => fn(...args), delay)
  }, [fn, delay]) as T
}

export function PlaceAutocomplete({
  value, resolvedPlace, placeholder, countryCode = 'sg',
  onChange, disabled, className, onCommit,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const svcRef = useRef<google.maps.places.AutocompleteService | null>(null)
  const gcRef = useRef<google.maps.Geocoder | null>(null)

  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const [loading, setLoading] = useState(false)

  function getServices() {
    if (!window.google?.maps?.places) return null
    if (!svcRef.current) svcRef.current = new google.maps.places.AutocompleteService()
    if (!gcRef.current) gcRef.current = new google.maps.Geocoder()
    return { svc: svcRef.current, gc: gcRef.current }
  }

  const fetchPredictions = useDebounce((input: string) => {
    const services = getServices()
    if (!services || input.length < 2) { setPredictions([]); setOpen(false); return }

    setLoading(true)
    services.svc.getPlacePredictions(
      {
        input,
        componentRestrictions: { country: countryCode },
        types: ['establishment', 'geocode'],
      },
      (results, status) => {
        setLoading(false)
        if (status !== google.maps.places.PlacesServiceStatus.OK || !results) {
          setPredictions([]); setOpen(false); return
        }
        const mapped: Prediction[] = results.map(r => ({
          placeId: r.place_id,
          mainText: r.structured_formatting?.main_text ?? r.description,
          secondaryText: r.structured_formatting?.secondary_text ?? '',
          isTransit: /mrt|lrt|station|bus.?interchange/i.test(r.description),
        }))
        setPredictions(mapped)
        setOpen(true)
        setActiveIdx(-1)
      }
    )
  }, 220)

  function resolveAndSelect(prediction: Prediction) {
    const services = getServices()
    if (!services) return

    onChange(prediction.mainText, null)

    services.gc.geocode({ placeId: prediction.placeId }, (results, status) => {
      if (status !== 'OK' || !results?.[0]) return
      const loc = results[0].geometry.location
      const resolved: ResolvedPlace = {
        placeId: prediction.placeId,
        name: prediction.mainText,
        lat: loc.lat(),
        lng: loc.lng(),
        formattedAddress: results[0].formatted_address,
      }
      onChange(prediction.mainText, resolved)
    })

    setOpen(false)
    setPredictions([])
    onCommit?.()
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    onChange(val, null)
    if (val.length >= 2) fetchPredictions(val)
    else { setPredictions([]); setOpen(false) }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || !predictions.length) {
      if (e.key === 'Enter' || e.key === 'Tab') onCommit?.()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, predictions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIdx >= 0) resolveAndSelect(predictions[activeIdx])
    } else if (e.key === 'Escape') {
      setOpen(false)
      setActiveIdx(-1)
    }
  }

  useEffect(() => {
    if (activeIdx < 0 || !listRef.current) return
    const item = listRef.current.children[activeIdx] as HTMLElement
    item?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!inputRef.current?.closest('.pac-container-wrap')?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const isResolved = !!resolvedPlace

  return (
    <div className={`pac-container-wrap relative ${className ?? ''}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={() => value.length >= 2 && predictions.length && setOpen(true)}
          autoComplete="off"
          className={[
            'w-full px-3 py-2 pr-8 text-sm rounded-lg border outline-none transition-colors',
            isResolved
              ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 focus:border-emerald-500'
              : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-400 dark:focus:border-gray-500 focus:bg-white dark:focus:bg-gray-700',
            disabled ? 'opacity-40 cursor-not-allowed' : '',
          ].join(' ')}
          aria-autocomplete="list"
          aria-controls={open ? `pac-list-${placeholder}` : undefined}
          aria-activedescendant={activeIdx >= 0 ? `pac-item-${activeIdx}` : undefined}
          role="combobox"
          aria-expanded={open}
        />

        {isResolved ? (
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 text-emerald-500 hover:text-red-400 transition-colors"
            onClick={() => { onChange('', null); inputRef.current?.focus() }}
            aria-label="Clear location"
            tabIndex={-1}
          >
            ✓
          </button>
        ) : loading ? (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs animate-spin">⟳</span>
        ) : value ? (
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
            onClick={() => { onChange('', null); inputRef.current?.focus() }}
            aria-label="Clear"
            tabIndex={-1}
          >
            ×
          </button>
        ) : null}
      </div>

      {open && predictions.length > 0 && (
        <ul
          ref={listRef}
          id={`pac-list-${placeholder}`}
          role="listbox"
          className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-lg"
        >
          {predictions.map((p, i) => (
            <li
              key={p.placeId}
              id={`pac-item-${i}`}
              role="option"
              aria-selected={i === activeIdx}
              onMouseDown={e => { e.preventDefault(); resolveAndSelect(p) }}
              onMouseEnter={() => setActiveIdx(i)}
              className={[
                'flex items-start gap-2.5 px-3 py-2.5 cursor-pointer text-sm border-b border-gray-50 dark:border-gray-700 last:border-0',
                i === activeIdx ? 'bg-gray-50 dark:bg-gray-700' : 'hover:bg-gray-50 dark:hover:bg-gray-700',
              ].join(' ')}
            >
              <span className="mt-0.5 text-gray-400 flex-shrink-0" aria-hidden="true">
                {p.isTransit ? '🚉' : '📍'}
              </span>
              <span>
                <span className="font-medium text-gray-900 dark:text-gray-100 block leading-snug">{p.mainText}</span>
                {p.secondaryText && (
                  <span className="text-xs text-gray-400 dark:text-gray-500 leading-tight block">{p.secondaryText}</span>
                )}
              </span>
            </li>
          ))}
          <li className="px-3 py-1.5 text-right" aria-hidden="true">
            <img
              src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png"
              height="12"
              alt="Powered by Google"
              className="inline opacity-50"
            />
          </li>
        </ul>
      )}
    </div>
  )
}