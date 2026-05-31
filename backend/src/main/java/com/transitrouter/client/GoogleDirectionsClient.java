package com.transitrouter.client;

import com.google.maps.DirectionsApi;
import com.google.maps.GeoApiContext;
import com.google.maps.model.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Component;

import jakarta.annotation.PreDestroy;
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

    @PreDestroy
    public void shutdown() {
        if (context != null) {
            context.shutdown();
        }
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
        result.setDurationSeconds((int) leg.duration.inSeconds);
        result.setDepartureTimeEpoch(leg.departureTime != null
                ? leg.departureTime.toInstant().getEpochSecond()
                : Instant.now().getEpochSecond());
        result.setArrivalTimeEpoch(leg.arrivalTime != null
                ? leg.arrivalTime.toInstant().getEpochSecond()
                : Instant.now().plusSeconds(leg.duration.inSeconds).getEpochSecond());
        result.setPolyline(decodePolyline(route.overviewPolyline.getEncodedPath()));

        List<StepDetail> steps = new ArrayList<>();
        for (DirectionsStep step : leg.steps) {
            StepDetail s = new StepDetail();
            s.setInstruction(step.htmlInstructions.replaceAll("<[^>]+>", ""));
            s.setMode(step.travelMode.name());
            s.setDurationSeconds((int) step.duration.inSeconds);
            if (step.polyline != null) {
                s.setPolyline(decodePolyline(step.polyline.getEncodedPath()));
            }
            if (step.transitDetails != null) {
                s.setLine(step.transitDetails.line.shortName != null
                        ? step.transitDetails.line.shortName
                        : step.transitDetails.line.name);
                s.setVehicleType(step.transitDetails.line.vehicle.type.name());
                s.setDepartureStop(step.transitDetails.departureStop.name);
                s.setArrivalStop(step.transitDetails.arrivalStop.name);
            }
            steps.add(s);
        }
        result.setSteps(steps);
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
        private int durationSeconds;
        private long departureTimeEpoch;
        private long arrivalTimeEpoch;
        private List<LatLngPoint> polyline;
        private List<StepDetail> steps;

        public int getDurationSeconds() {
            return durationSeconds;
        }

        public void setDurationSeconds(int v) {
            this.durationSeconds = v;
        }

        public long getDepartureTimeEpoch() {
            return departureTimeEpoch;
        }

        public void setDepartureTimeEpoch(long v) {
            this.departureTimeEpoch = v;
        }

        public long getArrivalTimeEpoch() {
            return arrivalTimeEpoch;
        }

        public void setArrivalTimeEpoch(long v) {
            this.arrivalTimeEpoch = v;
        }

        public List<LatLngPoint> getPolyline() {
            return polyline;
        }

        public void setPolyline(List<LatLngPoint> v) {
            this.polyline = v;
        }

        public List<StepDetail> getSteps() {
            return steps;
        }

        public void setSteps(List<StepDetail> v) {
            this.steps = v;
        }
    }

    public static class StepDetail {
        private String instruction;
        private String mode;
        private String line;
        private String vehicleType;
        private String departureStop;
        private String arrivalStop;
        private int durationSeconds;
        private List<LatLngPoint> polyline;

        public String getInstruction() {
            return instruction;
        }

        public void setInstruction(String v) {
            this.instruction = v;
        }

        public String getMode() {
            return mode;
        }

        public void setMode(String v) {
            this.mode = v;
        }

        public String getLine() {
            return line;
        }

        public void setLine(String v) {
            this.line = v;
        }

        public String getVehicleType() {
            return vehicleType;
        }

        public void setVehicleType(String v) {
            this.vehicleType = v;
        }

        public String getDepartureStop() {
            return departureStop;
        }

        public void setDepartureStop(String v) {
            this.departureStop = v;
        }

        public String getArrivalStop() {
            return arrivalStop;
        }

        public void setArrivalStop(String v) {
            this.arrivalStop = v;
        }

        public int getDurationSeconds() {
            return durationSeconds;
        }

        public void setDurationSeconds(int v) {
            this.durationSeconds = v;
        }

        public List<LatLngPoint> getPolyline() {
            return polyline;
        }

        public void setPolyline(List<LatLngPoint> v) {
            this.polyline = v;
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