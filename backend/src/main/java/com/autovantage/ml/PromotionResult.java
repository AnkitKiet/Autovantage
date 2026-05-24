package com.autovantage.ml;

public record PromotionResult(
    String recommendedLevel,
    float confidence
) {}