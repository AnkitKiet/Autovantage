package com.autovantage.ml;

import com.autovantage.domain.CarListing;

public class FeatureVector {

    private static final String[] BRANDS = {
        "BMW", "Ford", "Honda", "Hyundai", "Kia",
        "Mahindra", "Maruti", "Mercedes", "Tata", "Toyota", "Volkswagen"
    };
    private static final String[] CITIES = {
        "Ahmedabad", "Bengaluru", "Chennai", "Delhi", "Hyderabad",
        "Jaipur", "Kolkata", "Mumbai", "Pune"
    };
    private static final String[] FUEL_TYPES = {"CNG", "Diesel", "Electric", "Hybrid", "Petrol"};
    private static final String[] OWNER_NUMBERS = {"First", "Second", "Third"};
    private static final String[] TRANSMISSIONS = {"Automatic", "Manual"};

    public static float[] forModelA(CarListing listing) {
        float[] numeric = buildNumericBlock(listing, true);
        float[] ohe = buildOheBlock(listing);
        float[] combined = new float[41];
        System.arraycopy(numeric, 0, combined, 0, 11);
        System.arraycopy(ohe, 0, combined, 11, 30);
        return combined;
    }

    public static float[] forModelB(CarListing listing) {
        float[] numeric = buildNumericBlock(listing, false);
        float[] ohe = buildOheBlock(listing);
        float[] combined = new float[39];
        System.arraycopy(numeric, 0, combined, 0, 9);
        System.arraycopy(ohe, 0, combined, 9, 30);
        return combined;
    }

    private static float[] buildNumericBlock(CarListing listing, boolean isModelA) {
        int carAge = 2024 - (listing.getYear() != null ? listing.getYear() : 2020);
        float healthScore = listing.getHealthScore() != null ? listing.getHealthScore().floatValue() : 0.7f;
        double price = listing.getPrice() != null ? listing.getPrice().doubleValue() : 0.0;
        float logPrice = (float) Math.log1p(price);
        int km = listing.getKmDriven() != null ? listing.getKmDriven() : 50000;
        float logKm = (float) Math.log1p(km);
        float pricePerYear = (float) (price / (carAge + 1));
        
        String promo = listing.getPromotionLevel();
        float isPromoted = (promo != null && !promo.equalsIgnoreCase("Standard") && !promo.equalsIgnoreCase("NONE")) ? 1.0f : 0.0f;
        float conversionTarget = 0.0f;
        float isFirstOwner = "First".equalsIgnoreCase(listing.getOwnerNumber()) ? 1.0f : 0.0f;
        float isAutomatic = "Automatic".equalsIgnoreCase(listing.getTransmission()) ? 1.0f : 0.0f;
        float isElectric = "Electric".equalsIgnoreCase(listing.getFuelType()) ? 1.0f : 0.0f;
        float isDiesel = "Diesel".equalsIgnoreCase(listing.getFuelType()) ? 1.0f : 0.0f;

        if (isModelA) {
            return new float[]{carAge, healthScore, logPrice, logKm, pricePerYear, isPromoted, conversionTarget, isFirstOwner, isAutomatic, isElectric, isDiesel};
        } else {
            return new float[]{carAge, healthScore, logPrice, logKm, pricePerYear, isFirstOwner, isAutomatic, isElectric, isDiesel};
        }
    }

    private static float[] buildOheBlock(CarListing listing) {
        float[] ohe = new float[30];
        int offset = 0;
        System.arraycopy(oneHot(listing.getBrand(), BRANDS), 0, ohe, offset, BRANDS.length); offset += BRANDS.length;
        System.arraycopy(oneHot(listing.getCity(), CITIES), 0, ohe, offset, CITIES.length); offset += CITIES.length;
        System.arraycopy(oneHot(listing.getFuelType(), FUEL_TYPES), 0, ohe, offset, FUEL_TYPES.length); offset += FUEL_TYPES.length;
        System.arraycopy(oneHot(listing.getOwnerNumber(), OWNER_NUMBERS), 0, ohe, offset, OWNER_NUMBERS.length); offset += OWNER_NUMBERS.length;
        System.arraycopy(oneHot(listing.getTransmission(), TRANSMISSIONS), 0, ohe, offset, TRANSMISSIONS.length);
        return ohe;
    }

    private static float[] oneHot(String value, String[] options) {
        float[] result = new float[options.length];
        if (value == null) return result;
        for (int i = 0; i < options.length; i++) {
            if (options[i].equalsIgnoreCase(value)) { result[i] = 1.0f; break; }
        }
        return result;
    }
}
