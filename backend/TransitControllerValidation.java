// Example validation snippet for Spring Boot TransitController
// Place into your controller/service; adapt package imports and names

public class GeoUtils {
    private static final double MIN_LAT = 1.130;
    private static final double MAX_LAT = 1.470;
    private static final double MIN_LNG = 103.600;
    private static final double MAX_LNG = 104.040;

    public static boolean inSingapore(double lat, double lng) {
        return lat >= MIN_LAT && lat <= MAX_LAT && lng >= MIN_LNG && lng <= MAX_LNG;
    }
}

// Example usage inside your TransitController
// @PostMapping("/api/transit/route")
public ResponseEntity<?> plan(@RequestBody RouteRequest req) {
    for (Stop s : req.getStops()) {
        if (s.getLat() == null || s.getLng() == null) {
            // Geocode server-side (use Google Geocoding API) then validate
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
    // proceed with routing logic
    return ResponseEntity.ok(/* result */);
}
