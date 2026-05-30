package com.transitrouter.service;

import com.transitrouter.client.GoogleDirectionsClient;
import com.transitrouter.client.GoogleDirectionsClient.LegResult;
import com.transitrouter.client.GoogleDirectionsClient.StepDetail;
import com.transitrouter.client.GoogleDirectionsClient.LatLngPoint;
import com.transitrouter.model.RouteRequest;
import com.transitrouter.model.RouteRequest.StopInput;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
public class TransitOrchestrationService {

    private static final Logger log = LoggerFactory.getLogger(TransitOrchestrationService.class);
    private static final ZoneId SGT = ZoneId.of("Asia/Singapore");
    private static final DateTimeFormatter TIME_FMT =
            DateTimeFormatter.ofPattern("hh:mm a").withZone(SGT);

    private final GoogleDirectionsClient directionsClient;

    public TransitOrchestrationService(GoogleDirectionsClient directionsClient) {
        this.directionsClient = directionsClient;
    }

    public Map<String, Object> planRoute(RouteRequest request) {
        List<StopInput> orderedStops = request.isOptimiseOrder()
                ? optimiseStopOrder(request.getStops(),
                    request.getDepartureTime().toInstant(java.time.ZoneOffset.UTC))
                : request.getStops();

        return orchestrate(orderedStops,
                request.getDepartureTime().toInstant(java.time.ZoneOffset.UTC));
    }

    private Map<String, Object> orchestrate(List<StopInput> stops, Instant cursor) {
        // Best (first) leg result per segment — drives timing
        List<LegResult> legResults = new ArrayList<>();
        // All alternatives per segment
        List<List<LegResult>> legAlternatives = new ArrayList<>();
        List<Map<String, Object>> stopMeta = new ArrayList<>();

        stopMeta.add(buildStopMeta(stops.get(0), null, cursor, 0));

        for (int i = 0; i < stops.size() - 1; i++) {
            StopInput from = stops.get(i);
            StopInput to   = stops.get(i + 1);

            log.info("Leg {}: {} -> {} departing at {}", i + 1,
                    from.getName(), to.getName(), TIME_FMT.format(cursor));

            List<LegResult> alternatives = directionsClient.fetchTransitLegs(
                    resolveLocation(from),
                    resolveLocation(to),
                    cursor.getEpochSecond()
            );
            legAlternatives.add(alternatives);

            // Best option drives the timeline
            LegResult best = alternatives.get(0);
            legResults.add(best);

            Instant arrival = Instant.ofEpochSecond(best.getArrivalTimeEpoch());
            Instant actualDeparture = Instant.ofEpochSecond(best.getDepartureTimeEpoch());

            if (i > 0) {
                stopMeta.get(i).put("departureTime", TIME_FMT.format(actualDeparture));
            }

            if (i < stops.size() - 2) {
                Instant nextDeparture = arrival.plusSeconds((long) from.getStayMinutes() * 60);
                stopMeta.add(buildStopMeta(to, arrival, nextDeparture, from.getStayMinutes()));
                log.info("  Arrived {}. Staying {} min. Next departure: {}",
                        TIME_FMT.format(arrival), from.getStayMinutes(), TIME_FMT.format(nextDeparture));
                cursor = nextDeparture;
            } else {
                stopMeta.add(buildStopMeta(to, arrival, null, 0));
                cursor = arrival;
            }
        }

        return buildResponse(legResults, legAlternatives, stopMeta, stops.get(0),
                Instant.ofEpochSecond(legResults.get(0).getDepartureTimeEpoch()),
                cursor);
    }

    private Map<String, Object> buildResponse(
            List<LegResult> legs, List<List<LegResult>> legAlternatives,
            List<Map<String, Object>> stops,
            StopInput origin, Instant departure, Instant arrival) {

        long totalMinutes = (arrival.getEpochSecond() - departure.getEpochSecond()) / 60;

        List<Map<String, Object>> legList = new ArrayList<>();
        for (int i = 0; i < legs.size(); i++) {
            Map<String, Object> legMap = buildLegMap(legs.get(i), i,
                    (String) stops.get(i).get("name"),
                    (String) stops.get(i + 1).get("name"));

            // Attach alternatives (skip index 0 since that's the leg itself, include all)
            List<Map<String, Object>> altList = new ArrayList<>();
            for (LegResult alt : legAlternatives.get(i)) {
                altList.add(buildLegMap(alt, i,
                        (String) stops.get(i).get("name"),
                        (String) stops.get(i + 1).get("name")));
            }
            legMap.put("alternatives", altList);

            legList.add(legMap);
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("departureTime", TIME_FMT.format(departure));
        response.put("arrivalTime", TIME_FMT.format(arrival));
        response.put("totalDurationMinutes", totalMinutes);
        response.put("legs", legList);
        response.put("stops", stops);
        return response;
    }

    private Map<String, Object> buildLegMap(LegResult leg, int index, String from, String to) {
        String mode = "BUS";
        String line = "";
        for (StepDetail step : leg.getSteps()) {
            if (step.getVehicleType() != null) {
                mode = normaliseMode(step.getVehicleType());
                line = step.getLine() != null ? formatLine(step.getLine(), mode) : "";
                break;
            }
        }

        List<Map<String, Object>> polyline = new ArrayList<>();
        for (LatLngPoint p : leg.getPolyline()) {
            Map<String, Object> pt = new LinkedHashMap<>();
            pt.put("lat", p.getLat());
            pt.put("lng", p.getLng());
            polyline.add(pt);
        }

        List<Map<String, Object>> steps = new ArrayList<>();
        for (StepDetail s : leg.getSteps()) {
            Map<String, Object> sm = new LinkedHashMap<>();
            String stepMode = s.getVehicleType() != null
                    ? normaliseMode(s.getVehicleType())
                    : "WALKING".equals(s.getMode()) ? "WALK" : s.getMode();
            sm.put("instruction", s.getInstruction());
            sm.put("mode", stepMode);
            sm.put("line", s.getLine() != null ? s.getLine() : "");
            sm.put("durationSeconds", s.getDurationSeconds());
            if (s.getPolyline() != null) {
                List<Map<String, Object>> stepPts = new ArrayList<>();
                for (LatLngPoint p : s.getPolyline()) {
                    Map<String, Object> pt = new LinkedHashMap<>();
                    pt.put("lat", p.getLat());
                    pt.put("lng", p.getLng());
                    stepPts.add(pt);
                }
                sm.put("polyline", stepPts);
            }
            steps.add(sm);
        }

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("legIndex", index);
        m.put("from", from);
        m.put("to", to);
        m.put("departureTime", TIME_FMT.format(Instant.ofEpochSecond(leg.getDepartureTimeEpoch())));
        m.put("arrivalTime", TIME_FMT.format(Instant.ofEpochSecond(leg.getArrivalTimeEpoch())));
        m.put("durationMinutes", leg.getDurationSeconds() / 60);
        m.put("mode", mode);
        m.put("line", line);
        m.put("polyline", polyline);
        m.put("steps", steps);
        return m;
    }

    private Map<String, Object> buildStopMeta(StopInput stop, Instant arrival,
                                               Instant departure, int stayMinutes) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("name", stop.getName());
        map.put("lat", stop.getLat() != null ? stop.getLat() : 0.0);
        map.put("lng", stop.getLng() != null ? stop.getLng() : 0.0);
        map.put("arrivalTime", arrival   != null ? TIME_FMT.format(arrival)   : null);
        map.put("departureTime", departure != null ? TIME_FMT.format(departure) : null);
        map.put("stay", stayMinutes);
        return map;
    }

    private List<StopInput> optimiseStopOrder(List<StopInput> stops, Instant cursor) {
        if (stops.size() <= 3) return stops;

        StopInput origin = stops.get(0);
        StopInput destination = stops.get(stops.size() - 1);
        List<StopInput> intermediates = new ArrayList<>(stops.subList(1, stops.size() - 1));

        List<StopInput> ordered = new ArrayList<>();
        ordered.add(origin);

        String currentLocation = resolveLocation(origin);
        Instant timeCursor = cursor;

        while (!intermediates.isEmpty()) {
            StopInput best = null;
            long bestSeconds = Long.MAX_VALUE;

            for (StopInput candidate : intermediates) {
                try {
                    LegResult probe = directionsClient.fetchTransitLeg(
                            currentLocation, resolveLocation(candidate),
                            timeCursor.getEpochSecond());
                    if (probe.getDurationSeconds() < bestSeconds) {
                        bestSeconds = probe.getDurationSeconds();
                        best = candidate;
                    }
                } catch (Exception e) {
                    log.warn("TSP probe failed for {}: {}", candidate.getName(), e.getMessage());
                }
            }

            if (best == null) {
                ordered.addAll(intermediates);
                break;
            }

            ordered.add(best);
            timeCursor = timeCursor.plusSeconds(bestSeconds + (long) best.getStayMinutes() * 60);
            currentLocation = resolveLocation(best);
            intermediates.remove(best);
        }

        ordered.add(destination);
        log.info("TSP optimised order: {}", ordered.stream().map(StopInput::getName).toList());
        return ordered;
    }

    private String resolveLocation(StopInput stop) {
        if (stop.getLat() != null && stop.getLng() != null) {
            return stop.getLat() + "," + stop.getLng();
        }
        return stop.getName();
    }

    private String normaliseMode(String vehicleType) {
        return switch (vehicleType.toUpperCase()) {
            case "SUBWAY", "METRO_RAIL", "HEAVY_RAIL", "COMMUTER_TRAIN" -> "SUBWAY";
            case "BUS", "INTERCITY_BUS", "TROLLEYBUS" -> "BUS";
            case "TRAM", "LIGHT_RAIL" -> "TRAM";
            case "FERRY" -> "FERRY";
            default -> "BUS";
        };
    }

    private String formatLine(String line, String mode) {
        return switch (mode) {
            case "SUBWAY" -> line + " Line";
            case "BUS" -> "Bus " + line;
            default -> line;
        };
    }
}