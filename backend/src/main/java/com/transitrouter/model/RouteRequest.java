package com.transitrouter.model;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.LocalDateTime;
import java.util.List;

public class RouteRequest {

    @NotNull
    @Size(min = 2, max = 10, message = "Must have between 2 and 10 stops")
    @Valid
    private List<StopInput> stops;

    @NotNull(message = "Departure time is required")
    private LocalDateTime departureTime;

    private boolean optimiseOrder = false;

    public List<StopInput> getStops() { 
        return stops; 
    }

    public void setStops(List<StopInput> stops) {
         this.stops = stops; 
    }

    public LocalDateTime getDepartureTime() { 
        return departureTime; 
    }

    public void setDepartureTime(LocalDateTime departureTime) { 
        this.departureTime = departureTime; 
    }

    public boolean isOptimiseOrder() { 
        return optimiseOrder; 
    }

    public void setOptimiseOrder(boolean optimiseOrder) { 
        this.optimiseOrder = optimiseOrder; 
    }

    public static class StopInput {

        @NotBlank(message = "Stop name must not be empty")
        private String name;

        private Double lat;
        private Double lng;

        @Min(0) @Max(1440)
        private int stayMinutes = 0;

        public String getName() { 
            return name; 
        }

        public void setName(String name) { 
            this.name = name; 
        }

        public Double getLat() { 
            return lat; 
        }

        public void setLat(Double lat) { 
            this.lat = lat; 
        }

        public Double getLng() { 
            return lng; 
        }

        public void setLng(Double lng) { 
            this.lng = lng; 
        }

        public int getStayMinutes() { 
            return stayMinutes; 
        }

        public void setStayMinutes(int stayMinutes) { 
            this.stayMinutes = stayMinutes; 
        }
    }
}
