package com.autovantage.api;

import com.autovantage.ml.OnnxInferenceService;
import com.autovantage.ml.PromotionResult;
import com.autovantage.ml.StrategyResponse;
import com.autovantage.repository.CarListingRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/listings")
@RequiredArgsConstructor
public class CarListingStrategyController {

    private static final Logger logger = LoggerFactory.getLogger(CarListingStrategyController.class);

    private final CarListingRepository carListingRepository;
    private final OnnxInferenceService onnxService;

    @GetMapping("/{id}/strategy")
    public ResponseEntity<StrategyResponse> getStrategy(@PathVariable UUID id) {
        return carListingRepository.findById(id).map(listing -> {
            try {
                PromotionResult result = onnxService.predictPromotion(listing);
                
                String currentLevel = listing.getPromotionLevel() != null && !listing.getPromotionLevel().equalsIgnoreCase("NONE") 
                        ? listing.getPromotionLevel() 
                        : "Standard";
                boolean upgrade = !currentLevel.equalsIgnoreCase(result.recommendedLevel());
                
                return ResponseEntity.ok(new StrategyResponse(
                    listing.getId(), currentLevel, result.recommendedLevel(), result.confidence(), upgrade));
            } catch (Exception e) {
                logger.error("Error generating strategy for listing ID: " + id, e);
                return ResponseEntity.internalServerError().<StrategyResponse>build(); 
            }
        }).orElse(ResponseEntity.notFound().build());
    }
}