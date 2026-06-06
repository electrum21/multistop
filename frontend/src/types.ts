export interface LatLng { lat: number; lng: number }

export interface RouteStep {
  instruction: string
  mode?: string
  line?: string
  durationSeconds: number
  polyline?: LatLng[]
  departureStop?: string
  arrivalStop?: string
}

export interface RouteLeg {
  legIndex?: number
  from?: string
  to?: string
  departureTime?: string
  arrivalTime?: string
  durationMinutes?: number
  mode?: string
  line?: string
  polyline?: LatLng[]
  steps?: RouteStep[]
  alternatives?: RouteLeg[]
}

export interface RouteStop {
  name: string
  lat?: number
  lng?: number
  arrivalTime?: string | null
  departureTime?: string | null
  stay?: number
}

export interface RouteResult {
  departureTime: string
  arrivalTime: string
  totalDurationMinutes: number
  legs: RouteLeg[]
  stops: RouteStop[]
  [key: string]: any
}
