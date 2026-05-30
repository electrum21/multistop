package com.transitrouter.client;

import com.google.maps.DirectionsApi;
import com.google.maps.GeoApiContext;
import com.google.maps.model.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Component
public class GoogleDirectionsClient {

    private static final Logger log = LoggerFactory.getLogger(GoogleDirectionsClient.class);

    @Value("${transit.google.api-key}")
    private String apiKey;

    private GeoApiContext context;

    private synchronized GeoApiContext ctx() {
        if (context == null) {
            context = new GeoApiContext.Builder()
                    .apiKey(apiKey)
                    .build();
        }
        return context;
    }

    /** Returns best route only (used for TSP probing) */
    @Cacheable(value = "legs", key = "#origin + ':' + #destination + ':' + #departureEpochSeconds")
    public LegResult fetchTransitLeg(String origin, String destination, long departureEpochSeconds) {
        List<LegResult> results = fetchTransitLegs(origin, destination, departureEpochSeconds, null, null);
        return results.get(0);
    }

    /** Returns all alternative routes (up to 3) */
    @Cacheable(value = "legAlternatives", key = "#origin + ':' + #destination + ':' + #departureEpochSeconds + ':' + #routingPreference + ':' + #transitModes")
    public List<LegResult> fetchTransitLegs(String origin, String destination, long departureEpochSeconds,
            String routingPreference, List<String> transitModes) {
        log.info("Fetching leg alternatives: {} -> {} at epoch {}", origin, destination, departureEpochSeconds);
        try {
            var request = DirectionsApi.newRequest(ctx())
                    .origin(origin)
                    .destination(destination)
                    .mode(TravelMode.TRANSIT)
                    .alternatives(true)
                    .departureTime(Instant.ofEpochSecond(departureEpochSeconds));

            if (routingPreference != null && !routingPreference.isBlank()) {
                request.transitRoutingPreference(TransitRoutingPreference.valueOf(routingPreference));
            }

            if (transitModes != null && !transitModes.isEmpty()) {
                TransitMode[] modes = transitModes.stream()
                        .map(TransitMode::valueOf)
                        .toArray(TransitMode[]::new);
                request.transitMode(modes);
            }

            DirectionsResult result = request.await();

            if (result.routes == null || result.routes.length == 0) {
                throw new RuntimeException("No transit route found from " + origin + " to " + destination);
            }

            List<LegResult> legs = new ArrayList<>();
            for (DirectionsRoute route : result.routes) {
                legs.add(mapToLegResult(route));
            }
            return legs;
        } catch (Exception e) {
            log.error("Google Directions API error", e);
            throw new RuntimeException("Transit API error: " + e.getMessage(), e);
        }
    }

    private LegResult mapToLegResult(DirectionsRoute route) {
        DirectionsLeg leg = route.legs[0];

        LegResult result = new LegResult();
        result.durationSeconds = (int) leg.duration.inSeconds;
        result.departureTimeEpoch = leg.departureTime != null
        ? leg.departureTime.toInstant().getEpochSecond()
        : Instant.now().getEpochSecond();          // fallback: now
        result.arrivalTimeEpoch = leg.arrivalTime != null
        ? leg.arrivalTime.toInstant().getEpochSecond()
        : Instant.now().plusSeconds(leg.duration.inSeconds).getEpochSecond(); // fallback: now + duration
        result.polyline = decodePolyline(route.overviewPolyline.getEncodedPath());

        List<StepDetail> steps = new ArrayList<>();
        for (DirectionsStep step : leg.steps) {
            StepDetail s = new StepDetail();
            s.instruction = step.htmlInstructions.replaceAll("<[^>]+>", "");
            s.mode = step.travelMode.name();
            s.durationSeconds = (int) step.duration.inSeconds;
            if (step.polyline != null) {
                s.polyline = decodePolyline(step.polyline.getEncodedPath());
            }
            if (step.transitDetails != null) {
                s.line = step.transitDetails.line.shortName != null
                        ? step.transitDetails.line.shortName
                        : step.transitDetails.line.name;
                s.vehicleType = step.transitDetails.line.vehicle.type.name();
                s.departureStop = step.transitDetails.departureStop.name;
                s.arrivalStop = step.transitDetails.arrivalStop.name;
            }
            steps.add(s);
        }
        result.steps = steps;
        return result;
    }

    private List<LatLngPoint> decodePolyline(String encoded) {
        List<LatLngPoint> points = new ArrayList<>();
        int index = 0, len = encoded.length();
        int lat = 0, lng = 0;
        while (index < len) {
            int b, shift = 0, res = 0;
            do { b = encoded.charAt(index++) - 63; res |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
            lat += (res & 1) != 0 ? ~(res >> 1) : (res >> 1);
            shift = 0; res = 0;
            do { b = encoded.charAt(index++) - 63; res |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
            lng += (res & 1) != 0 ? ~(res >> 1) : (res >> 1);
            points.add(new LatLngPoint(lat / 1e5, lng / 1e5));
        }
        return points;
    }

    // ── Inner DTOs ────────────────────────────────────────────────────────

    public static class LegResult {
        public int durationSeconds;
        public long departureTimeEpoch;
        public long arrivalTimeEpoch;
        public List<LatLngPoint> polyline;
        public List<StepDetail> steps;

        public int getDurationSeconds() {
            return durationSeconds;
        }

        public long getDepartureTimeEpoch() {
            return departureTimeEpoch;
        }

        public long getArrivalTimeEpoch() {
            return arrivalTimeEpoch;
        }

        public List<LatLngPoint> getPolyline() {
            return polyline;
        }

        public List<StepDetail> getSteps() {
            return steps;
        }
    }

    public static class StepDetail {
        public String instruction;
        public String mode;
        public String line;
        public String vehicleType;
        public String departureStop;
        public String arrivalStop;
        public int durationSeconds;
        public List<LatLngPoint> polyline;

        public String getInstruction() {
            return instruction;
        }

        public String getMode() {
            return mode;
        }

        public String getLine() {
            return line;
        }

        public String getVehicleType() {
            return vehicleType;
        }

        public String getDepartureStop() {
            return departureStop;
        }

        public String getArrivalStop() {
            return arrivalStop;
        }

        public int getDurationSeconds() {
            return durationSeconds;
        }

        public List<LatLngPoint> getPolyline() {
            return polyline;
        }
    }

    public static class LatLngPoint {
        public final double lat;
        public final double lng;

        public LatLngPoint(double lat, double lng) {
            this.lat = lat;
            this.lng = lng;
        }

        public double getLat() {
            return lat;
        }

        public double getLng() {
            return lng;
        }
    }
}