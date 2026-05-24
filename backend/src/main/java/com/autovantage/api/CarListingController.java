package com.autovantage.api;

import com.autovantage.domain.CarListing;
import com.autovantage.domain.common.CursorPagedResponse;
import com.autovantage.service.CarListingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/listings")
@RequiredArgsConstructor
public class CarListingController {

    private final CarListingService carListingService;

   @GetMapping
public CursorPagedResponse<CarListing> getAllListings(
        @RequestParam(required = false) String cursor,
        @RequestParam(defaultValue = "12") int size,
        @RequestParam(required = false) String brand,
        @RequestParam(required = false) BigDecimal minPrice,
        @RequestParam(required = false) BigDecimal maxPrice) {
    return carListingService.getAllListings(cursor, size, brand, minPrice, maxPrice);
}

    @GetMapping("/user")
    public ResponseEntity<CursorPagedResponse<CarListing>> getUserListings(
            @RequestParam String username,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "8") int size
    ) {
        return ResponseEntity.ok(carListingService.getUserListings(username, cursor, size));
    }

    @PostMapping
    public ResponseEntity<CarListing> createListing(@Valid @RequestBody CarListing listing) {
        CarListing createdListing = carListingService.createListing(listing);
        return ResponseEntity.status(HttpStatus.CREATED).body(createdListing);
    }

    @PutMapping("/{id}")
    public ResponseEntity<CarListing> updateListing(@PathVariable UUID id, @Valid @RequestBody CarListing listing) {
        CarListing updatedListing = carListingService.updateListing(id, listing);
        return ResponseEntity.ok(updatedListing);
    }
}