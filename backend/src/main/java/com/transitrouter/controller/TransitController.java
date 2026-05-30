package com.transitrouter.controller;

import com.transitrouter.model.RouteRequest;
import com.transitrouter.service.TransitOrchestrationService;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/transit")
public class TransitController {

    private static final Logger log = LoggerFactory.getLogger(TransitController.class);

    private final TransitOrchestrationService orchestrationService;

    public TransitController(TransitOrchestrationService orchestrationService) {
        this.orchestrationService = orchestrationService;
    }

    @PostMapping("/route")
    public ResponseEntity<Map<String, Object>> planRoute(
            @Valid @RequestBody RouteRequest request) {
        log.info("Route request: {} stops, depart {}, optimise={}",
                request.getStops().size(), request.getDepartureTime(), request.isOptimiseOrder());
        try {
            return ResponseEntity.ok(orchestrationService.planRoute(request));
        } catch (RuntimeException e) {
            String msg = e.getMessage() != null ? e.getMessage() : "";
            boolean noRoute = msg.contains("null") || msg.isBlank() || msg.contains("No transit route");
            String userMessage = noRoute
                    ? "No transit route found between these stops. Try different locations or a different departure time."
                    : msg;
            return ResponseEntity.unprocessableEntity()
                    .body(Map.of("error", userMessage));
        }
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        return ResponseEntity.ok(Map.of("status", "ok"));
    }
}
