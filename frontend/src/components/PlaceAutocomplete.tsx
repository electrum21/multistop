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
  const [geoOption, setGeoOption] = useState<{ label: string; place: ResolvedPlace } | null>(null)
  const [geoLoading, setGeoLoading] = useState(false)

  function getServices() {
    if (!window.google?.maps?.places) return null
    if (!svcRef.current) svcRef.current = new google.maps.places.AutocompleteService()
    if (!gcRef.current) gcRef.current = new google.maps.Geocoder()
    return { svc: svcRef.current, gc: gcRef.current }
  }

  function fetchCurrentLocation() {
    if (!navigator.geolocation) return
    setGeoLoading(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lng } = pos.coords
        const services = getServices()
        if (!services) { setGeoLoading(false); return }
        services.gc.geocode({ location: { lat, lng } }, (results, status) => {
          setGeoLoading(false)
          if (status !== 'OK' || !results?.[0]) return
          const r = results[0]
          setGeoOption({
            label: r.formatted_address,
            place: {
              placeId: r.place_id,
              name: r.formatted_address,
              lat,
              lng,
              formattedAddress: r.formatted_address,
            },
          })
        })
      },
      () => setGeoLoading(false)
    )
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

  function selectGeoOption() {
    if (!geoOption) return
    onChange(geoOption.place.name, geoOption.place)
    setOpen(false)
    setGeoOption(null)
    onCommit?.()
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    onChange(val, null)
    setGeoOption(null)
    if (val.length >= 2) fetchPredictions(val)
    else { setPredictions([]); setOpen(false) }
  }

  function handleFocus() {
    if (value.length >= 2 && predictions.length) {
      setOpen(true)
    } else if (!value) {
      setOpen(true)
    }
  }

  // geoOffset only counts once location is resolved (for keyboard nav index)
  const geoOffset = !value && geoOption ? 1 : 0
  const totalItems = geoOffset + predictions.length

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || totalItems === 0) {
      if (e.key === 'Enter' || e.key === 'Tab') onCommit?.()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, totalItems - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIdx === 0 && geoOffset === 1) {
        selectGeoOption()
      } else if (activeIdx >= geoOffset) {
        resolveAndSelect(predictions[activeIdx - geoOffset])
      }
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
  const showDropdown = open && (!value || predictions.length > 0)

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
          onFocus={handleFocus}
          autoComplete="off"
          className={[
            'w-full px-3 py-2 pr-8 text-sm rounded-lg border outline-none transition-colors',
            isResolved
              ? 'border-blue-400 bg-blue-50 dark:bg-blue-950 text-blue-800 dark:text-blue-300 focus:border-blue-500'
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
            className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-500 hover:text-red-400 transition-colors"
            onClick={() => { onChange('', null); inputRef.current?.focus() }}
            aria-label="Clear location"
            tabIndex={-1}
          >
            <i className="fa-solid fa-xmark dark:text-white" />
          </button>
        ) : loading ? (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs"><i className="fa-solid fa-spinner fa-spin dark:text-white" /></span>
        ) : value ? (
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
            onClick={() => { onChange('', null); inputRef.current?.focus() }}
            aria-label="Clear"
            tabIndex={-1}
          >
            <i className="fa-solid fa-xmark dark:text-white" />
          </button>
        ) : null}
      </div>

      {showDropdown && (
        <ul
          ref={listRef}
          id={`pac-list-${placeholder}`}
          role="listbox"
          className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-lg"
        >
          {/* Current location row — always shown when field is empty */}
          {!value && (
            geoLoading ? (
              <li className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-400 border-b border-gray-100 dark:border-gray-700">
                <i className="fa-solid fa-spinner fa-spin text-gray-400" />
                Locating…
              </li>
            ) : geoOption ? (
              <li
                id="pac-item-0"
                role="option"
                aria-selected={activeIdx === 0}
                onMouseDown={e => { e.preventDefault(); selectGeoOption() }}
                onMouseEnter={() => setActiveIdx(0)}
                className={[
                  'flex items-start gap-2.5 px-3 py-2.5 cursor-pointer text-sm border-b border-gray-100 dark:border-gray-700',
                  activeIdx === 0 ? 'bg-gray-50 dark:bg-gray-700' : 'hover:bg-gray-50 dark:hover:bg-gray-700',
                ].join(' ')}
              >
                <span>
                  <span className="font-medium text-blue-600 dark:text-blue-400 block leading-snug">Current location</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 leading-tight block">{geoOption.label}</span>
                </span>
              </li>
            ) : (
              <li
                role="option"
                onMouseDown={e => { e.preventDefault(); fetchCurrentLocation() }}
                className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer text-sm border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <i className="fa-solid fa-location-dot text-blue-500 flex-shrink-0 mt-0.5" />
                <span className="font-medium text-blue-600 dark:text-blue-400">Use my current location</span>
              </li>
            )
          )}

          {/* Place predictions */}
          {predictions.map((p, i) => (
            <li
              key={p.placeId}
              id={`pac-item-${i + geoOffset}`}
              role="option"
              aria-selected={i + geoOffset === activeIdx}
              onMouseDown={e => { e.preventDefault(); resolveAndSelect(p) }}
              onMouseEnter={() => setActiveIdx(i + geoOffset)}
              className={[
                'flex items-start gap-2.5 px-3 py-2.5 cursor-pointer text-sm border-b border-gray-50 dark:border-gray-700 last:border-0',
                i + geoOffset === activeIdx ? 'bg-gray-50 dark:bg-gray-700' : 'hover:bg-gray-50 dark:hover:bg-gray-700',
              ].join(' ')}
            >
              {p.isTransit
                ? <i className="fa-solid fa-train-subway mt-0.5 text-blue-400 flex-shrink-0 text-sm" aria-hidden="true" />
                : <i className="fa-solid fa-location-dot mt-0.5 text-gray-400 flex-shrink-0 text-sm" aria-hidden="true" />
              }
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