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
        return ResponseEntity.ok(orchestrationService.planRoute(request));
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        return ResponseEntity.ok(Map.of("status", "ok"));
    }
}
