package com.autovantage.service;

import com.autovantage.domain.CarListing;
import com.autovantage.domain.common.CursorPagedResponse;
import com.autovantage.ml.OnnxInferenceService;
import com.autovantage.ml.PromotionResult;
import com.autovantage.repository.CarListingRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import java.time.LocalDateTime;
import java.math.BigDecimal;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class CarListingService {

    private final CarListingRepository carListingRepository;
    private final OnnxInferenceService onnxService;

    public CursorPagedResponse<CarListing> getAllListings(String cursor, int size, String brand, BigDecimal minPrice, BigDecimal maxPrice) {
        List<CarListing> listings;
        PageRequest limitOnlyRequest = PageRequest.of(0, size); // Page 0 ensures we only apply a LIMIT clause, no OFFSET

        boolean hasFilters = (brand != null && !brand.isBlank()) || minPrice != null || maxPrice != null;

        if (cursor == null || cursor.isBlank()) {
            listings = hasFilters ? carListingRepository.findFirstPageFiltered(brand, minPrice, maxPrice, limitOnlyRequest)
                                  : carListingRepository.findAllByOrderByCreatedAtDescIdDesc(limitOnlyRequest);
        } else {
            String[] parts = cursor.split("_");
            if (parts.length != 2) {
                throw new IllegalArgumentException("Invalid cursor format. Expected format: {timestamp}_{uuid}");
            }
            LocalDateTime cursorTime = LocalDateTime.parse(parts[0]);
            UUID cursorId = UUID.fromString(parts[1]);
            
            listings = hasFilters ? carListingRepository.findNextPageFiltered(cursorTime, cursorId, brand, minPrice, maxPrice, limitOnlyRequest)
                                  : carListingRepository.findNextPage(cursorTime, cursorId, limitOnlyRequest);
        }

        String nextCursor = null;
        if (listings.size() == size) { // If the list is full, there are likely more items ahead
            CarListing lastListing = listings.get(listings.size() - 1);
            nextCursor = lastListing.getCreatedAt().toString() + "_" + lastListing.getId().toString();
        }
        
        applyMlScoringAndSort(listings);

        return new CursorPagedResponse<>(listings, nextCursor);
    }

    public CursorPagedResponse<CarListing> getUserListings(String username, String cursor, int size) {
        List<CarListing> listings;
        PageRequest limitOnlyRequest = PageRequest.of(0, size);

        if (cursor == null || cursor.isBlank()) {
            listings = carListingRepository.findAllByUsernameOrderByCreatedAtDescIdDesc(username, limitOnlyRequest);
        } else {
            String[] parts = cursor.split("_");
            if (parts.length != 2) {
                throw new IllegalArgumentException("Invalid cursor format. Expected format: {timestamp}_{uuid}");
            }
            LocalDateTime cursorTime = LocalDateTime.parse(parts[0]);
            UUID cursorId = UUID.fromString(parts[1]);
            listings = carListingRepository.findNextPageByUsername(username, cursorTime, cursorId, limitOnlyRequest);
        }

        String nextCursor = null;
        if (listings.size() == size) { // If the list is full, there are likely more items ahead
            CarListing lastListing = listings.get(listings.size() - 1);
            nextCursor = lastListing.getCreatedAt().toString() + "_" + lastListing.getId().toString();
        }
        
        applyMlScoringAndSort(listings);

        return new CursorPagedResponse<>(listings, nextCursor);
    }

    public CarListing createListing(CarListing listing) {
        return carListingRepository.save(listing);
    }

    public CarListing updateListing(UUID id, CarListing updatedListing) {
        return carListingRepository.findById(id).map(existingListing -> {
            existingListing.setTitle(updatedListing.getTitle());
            existingListing.setBrand(updatedListing.getBrand());
            existingListing.setPrice(updatedListing.getPrice());
            existingListing.setPromotionLevel(updatedListing.getPromotionLevel());
            existingListing.setMlScore(updatedListing.getMlScore());
            existingListing.setUsername(updatedListing.getUsername());
            existingListing.setYear(updatedListing.getYear());
            existingListing.setHealthScore(updatedListing.getHealthScore());
            existingListing.setCity(updatedListing.getCity());
            existingListing.setKmDriven(updatedListing.getKmDriven());
            existingListing.setFuelType(updatedListing.getFuelType());
            existingListing.setTransmission(updatedListing.getTransmission());
            existingListing.setOwnerNumber(updatedListing.getOwnerNumber());
            return carListingRepository.save(existingListing);
        }).orElseThrow(() -> new RuntimeException("CarListing not found with id: " + id));
    }

    private void applyMlScoringAndSort(List<CarListing> listings) {
        listings.forEach(listing -> {
            try {
                float score = onnxService.predictMlScore(listing);
                listing.setMlScore((double) score);
                
                PromotionResult promo = onnxService.predictPromotion(listing);
                listing.setRecommendedPromotion(promo.recommendedLevel());
                listing.setPromotionConfidence((double) promo.confidence());
            } catch (Exception e) {
                listing.setMlScore(0.5);
                listing.setRecommendedPromotion("Standard");
                listing.setPromotionConfidence(0.0);
            }
        });
        listings.sort(Comparator.comparingDouble((CarListing c) -> c.getMlScore() != null ? c.getMlScore() : 0.0).reversed());
    }
}