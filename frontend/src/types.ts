export interface RouteStep {
  instruction: string
  distance: { text: string; value: number }
  duration: { text: string; value: number }
}

export interface RouteLeg {
  startLocation: { lat: number; lng: number }
  endLocation: { lat: number; lng: number }
  distance: { text: string; value: number }
  duration: { text: string; value: number }
  departureTime?: string
  arrivalTime?: string
  steps: RouteStep[]
  alternatives?: RouteLeg[]
}

export interface RouteResult {
  legs: RouteLeg[]
  [key: string]: any
}
