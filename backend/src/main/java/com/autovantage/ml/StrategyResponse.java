package com.autovantage.ml;

import java.util.UUID;

public record StrategyResponse(
    UUID listingId,
    String currentPromotion,
    String recommendedPromotion,
    float confidence,
    boolean upgrade
) {}