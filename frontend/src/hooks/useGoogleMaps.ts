import { useEffect, useState } from 'react'

declare global {
  interface Window {
    google: typeof google
    __googleMapsLoaded?: () => void
  }
}

let loadPromise: Promise<void> | null = null

export function useGoogleMaps(apiKey: string): boolean {
  const [loaded, setLoaded] = useState(
    () => typeof window !== 'undefined' && !!window.google?.maps?.places
  )

  useEffect(() => {
    if (loaded || !apiKey) return

    if (!loadPromise) {
      loadPromise = new Promise<void>((resolve, reject) => {
        window.__googleMapsLoaded = resolve

        const script = document.createElement('script')
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=__googleMapsLoaded`
        script.async = true
        script.onerror = () => reject(new Error('Failed to load Google Maps'))
        document.head.appendChild(script)
      })
    }

    loadPromise.then(() => setLoaded(true)).catch(console.error)
  }, [apiKey, loaded])

  return loaded
}
