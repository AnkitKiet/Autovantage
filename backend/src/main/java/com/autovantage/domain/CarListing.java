package com.autovantage.domain;

import com.autovantage.domain.common.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Transient;
import jakarta.persistence.Table;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "car_listings")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CarListing extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @NotBlank(message = "Title is required")
    private String title;

    @NotBlank(message = "Brand is required")
    private String brand;

    @NotNull(message = "Price is required")
    @Positive(message = "Price must be greater than zero")
    private BigDecimal price;

    private String promotionLevel;
    
    private Double mlScore;

    private String username;

    @NotNull(message = "Year is required")
    private Integer year;

    @NotNull(message = "Health score is required")
    private Double healthScore;

    @NotBlank(message = "City is required")
    private String city;

    @NotNull(message = "Kilometers driven is required")
    private Integer kmDriven;

    @NotBlank(message = "Fuel type is required")
    @Pattern(regexp = "^(CNG|DIESEL|ELECTRIC|HYBRID|PETROL)$", flags = Pattern.Flag.CASE_INSENSITIVE, message = "Fuel type must be one of: CNG, DIESEL, ELECTRIC, HYBRID, PETROL")
    private String fuelType;

    @NotBlank(message = "Transmission is required")
    private String transmission;

    @NotBlank(message = "Owner number is required")
    private String ownerNumber;

    @Transient
    private String recommendedPromotion;

    @Transient
    private Double promotionConfidence;
}