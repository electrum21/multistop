export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) {
    return (crypto as any).randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function getStorageItem(key: string, defaultValue: string): string {
  try {
    return localStorage.getItem(key) ?? defaultValue
  } catch (e) {
    console.warn(`Failed to read ${key} from localStorage:`, e)
    return defaultValue
  }
}

export function setStorageItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch (e) {
    console.warn(`Failed to write ${key} to localStorage:`, e)
  }
}

// Simple Singapore bounding box (approx). Use GeoJSON + turf for stricter checks.
export const SG_BBOX = { minLat: 1.130, maxLat: 1.470, minLng: 103.600, maxLng: 104.040 }

export function inSingapore(lat: number, lng: number): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) return false
  return lat >= SG_BBOX.minLat && lat <= SG_BBOX.maxLat && lng >= SG_BBOX.minLng && lng <= SG_BBOX.maxLng
}

// Strict check using GeoJSON polygon (turf). Falls back to bbox if turf import fails.
export function inSingaporeStrict(lat: number, lng: number): boolean {
  try {
    // Lazy import to avoid breaking environments without turf
    // @ts-ignore
    const booleanPointInPolygon = require('@turf/boolean-point-in-polygon').default || require('@turf/boolean-point-in-polygon')
    // @ts-ignore
    const helpers = require('@turf/helpers')
    // @ts-ignore
    const sg = require('./data/sg.geojson')
    const pt = helpers.point([lng, lat])
    return booleanPointInPolygon(pt, sg)
  } catch (e) {
    return inSingapore(lat, lng)
  }
}
