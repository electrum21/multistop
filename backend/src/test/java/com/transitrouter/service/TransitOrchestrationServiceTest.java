package com.transitrouter.service;

import com.transitrouter.client.GoogleDirectionsClient;
import com.transitrouter.client.GoogleDirectionsClient.LegResult;
import com.transitrouter.client.GoogleDirectionsClient.LatLngPoint;
import com.transitrouter.model.RouteRequest;
import com.transitrouter.model.RouteRequest.StopInput;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TransitOrchestrationServiceTest {

    @Mock
    private GoogleDirectionsClient directionsClient;

    @InjectMocks
    private TransitOrchestrationService service;

    private static final long BASE_EPOCH = 1_717_250_000L;

    @BeforeEach
    void setUp() {
        when(directionsClient.fetchTransitLeg(anyString(), anyString(), anyLong()))
                .thenAnswer(inv -> mockLeg((long) inv.getArgument(2), 20 * 60));
    }

    @Test
    void twoStops_noLayover_returnsSingleLeg() {
        var result = service.planRoute(request(stop("Origin", 0), stop("Destination", 0)));
        assertThat(legList(result)).hasSize(1);
        assertThat(result.get("totalDurationMinutes")).isEqualTo(20L);
    }

    @Test
    void threeStops_45minLayover_secondLegDepartsAfterLayover() {
        long expectedLeg2Departure = BASE_EPOCH + 1200 + (45 * 60);
        service.planRoute(request(stop("Home", 0), stop("Hawker", 45), stop("Home", 0)));
        verify(directionsClient).fetchTransitLeg(eq("Hawker"), eq("Home"), eq(expectedLeg2Departure));
    }

    @Test
    void multipleLayovers_timeShiftsAccumulate() {
        service.planRoute(request(stop("A", 0), stop("B", 15), stop("C", 30), stop("D", 0)));
        long dep2 = BASE_EPOCH + 1200 + 900;
        long dep3 = dep2 + 1200 + 1800;
        verify(directionsClient).fetchTransitLeg(eq("B"), eq("C"), eq(dep2));
        verify(directionsClient).fetchTransitLeg(eq("C"), eq("D"), eq(dep3));
    }

    @Test
    void resultContainsAllRequiredFields() {
        var result = service.planRoute(request(stop("A", 0), stop("B", 0)));
        assertThat(result).containsKeys("departureTime", "arrivalTime", "totalDurationMinutes", "legs", "stops");
    }

    @Test
    void resultStopsHaveCorrectCount() {
        var result = service.planRoute(request(stop("A", 0), stop("B", 30), stop("C", 0)));
        assertThat((List<?>) result.get("stops")).hasSize(3);
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private RouteRequest request(StopInput... stops) {
        RouteRequest req = new RouteRequest();
        req.setStops(List.of(stops));
        req.setDepartureTime(LocalDateTime.ofEpochSecond(BASE_EPOCH, 0, ZoneOffset.UTC));
        req.setOptimiseOrder(false);
        return req;
    }

    private StopInput stop(String name, int stayMinutes) {
        StopInput s = new StopInput();
        s.setName(name);
        s.setStayMinutes(stayMinutes);
        return s;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> legList(Map<String, Object> result) {
        return (List<Map<String, Object>>) result.get("legs");
    }

    private LegResult mockLeg(long departureEpoch, int durationSeconds) {
        LegResult leg = new LegResult();
        leg.setDurationSeconds(durationSeconds);
        leg.setDepartureTimeEpoch(departureEpoch);
        leg.setArrivalTimeEpoch(departureEpoch + durationSeconds);
        leg.setPolyline(List.of(new LatLngPoint(1.3, 103.8)));
        leg.setSteps(List.of());
        return leg;
    }
}