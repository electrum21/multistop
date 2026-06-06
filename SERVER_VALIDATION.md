Server-side validation for Singapore-only locations

This document provides reference code and guidance to enforce that incoming route requests only contain stops within Singapore. Client-side checks are useful UX but cannot be trusted — the server must validate.

Approaches

1) Simple bounding-box check (fast, minimal, may include/exclude edge islands)
2) Strict polygon check with GeoJSON + turf (recommended for legal/precise boundaries)

Java / Spring Boot example (insert into your TransitController or a shared validator)

```java
// simple bbox validator
public class GeoUtils {
    private static final double MIN_LAT = 1.130;
    private static final double MAX_LAT = 1.470;
    private static final double MIN_LNG = 103.600;
    private static final double MAX_LNG = 104.040;

    public static boolean inSingapore(double lat, double lng) {
        return lat >= MIN_LAT && lat <= MAX_LAT && lng >= MIN_LNG && lng <= MAX_LNG;
    }
}

// inside controller
@PostMapping("/api/transit/route")
public ResponseEntity<?> plan(@RequestBody RouteRequest req) {
    for (Stop s : req.getStops()) {
        if (s.getLat() == null || s.getLng() == null) {
            // geocode on server (using Google Geocoding) then validate
            GeocodeResult g = geocodeByNameOrPlaceId(s.getName(), s.getPlaceId());
            if (g == null || !GeoUtils.inSingapore(g.getLat(), g.getLng())) {
                return ResponseEntity.badRequest().body(Map.of("error","All stops must be within Singapore"));
            }
        } else {
            if (!GeoUtils.inSingapore(s.getLat(), s.getLng())) {
                return ResponseEntity.badRequest().body(Map.of("error","All stops must be within Singapore"));
            }
        }
    }
    // proceed with routing
}
```

Node / Express example (with optional turf geojson)

```js
const SG_BBOX = { minLat: 1.130, maxLat: 1.470, minLng: 103.600, maxLng: 104.040 }
function inSingapore(lat, lng) {
  return lat >= SG_BBOX.minLat && lat <= SG_BBOX.maxLat && lng >= SG_BBOX.minLng && lng <= SG_BBOX.maxLng
}

app.post('/api/transit/route', async (req, res) => {
  const { stops } = req.body
  for (const s of stops) {
    if (s.lat == null || s.lng == null) {
      // geocode by name or placeId, then validate
      const g = await geocodeNameOrPlaceId(s.name || s.placeId)
      if (!g || !inSingapore(g.lat, g.lng)) return res.status(400).json({ error: 'All stops must be within Singapore' })
    } else {
      if (!inSingapore(s.lat, s.lng)) return res.status(400).json({ error: 'All stops must be within Singapore' })
    }
  }
  // proceed
})
```

Using GeoJSON + turf for strict boundary checks

- Add `@turf/boolean-point-in-polygon` (Node) or a Java equivalent.
- Keep an authoritative Singapore polygon (GeoJSON) in your backend resources.
- Example (Node):

```js
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import { point } from '@turf/helpers'
import sgPolygon from './singapore.geojson'

function inSingaporePoint(lat, lng) {
  return booleanPointInPolygon(point([lng, lat]), sgPolygon)
}
```

Notes

- Always validate on the server; client checks are just for UX.
- If geocoding on the server, prefer verifying the `address_components` for `country: SG` and then perform a bbox or polygon check of the coordinates.
- Return clear HTTP 400 responses with explanations so the frontend can show helpful messages.

Done — adapt these snippets to your backend language/framework.
