"""
AutoVantage — Synthetic Dataset Generator
==========================================
Generates a realistic car listings CSV (~2000 rows) for training two models:
  - Model A: Ranking Engine   (XGBoost)   → mlScore (relevance float 0–1)
  - Model B: Strategy Engine  (CatBoost)  → promotionLevel (Standard/Plus/Premium)

Output: data/raw_listings.csv
"""

import numpy as np
import pandas as pd
import random
from pathlib import Path

# ── Reproducibility ────────────────────────────────────────────────────────────
SEED = 42
np.random.seed(SEED)
random.seed(SEED)

N_ROWS = 2000

# ── Domain constants ───────────────────────────────────────────────────────────
BRANDS = {
    "Maruti":    {"weight": 0.22, "base_price": (280_000,  750_000)},
    "Hyundai":   {"weight": 0.18, "base_price": (400_000,  950_000)},
    "Tata":      {"weight": 0.15, "base_price": (350_000,  900_000)},
    "Honda":     {"weight": 0.10, "base_price": (600_000, 1_400_000)},
    "Toyota":    {"weight": 0.08, "base_price": (700_000, 2_000_000)},
    "Mahindra":  {"weight": 0.08, "base_price": (800_000, 2_200_000)},
    "Ford":      {"weight": 0.05, "base_price": (550_000, 1_200_000)},
    "Kia":       {"weight": 0.05, "base_price": (750_000, 1_800_000)},
    "BMW":       {"weight": 0.04, "base_price": (2_500_000, 7_000_000)},
    "Mercedes":  {"weight": 0.03, "base_price": (3_000_000, 9_000_000)},
    "Volkswagen":{"weight": 0.02, "base_price": (1_000_000, 2_800_000)},
}

MODELS_BY_BRAND = {
    "Maruti":     ["Swift", "Baleno", "Vitara Brezza", "WagonR", "Ciaz"],
    "Hyundai":    ["i20", "Creta", "Venue", "Verna", "Tucson"],
    "Tata":       ["Nexon", "Harrier", "Safari", "Tiago", "Tigor"],
    "Honda":      ["City", "Amaze", "Jazz", "WR-V", "CR-V"],
    "Toyota":     ["Innova Crysta", "Fortuner", "Glanza", "Urban Cruiser"],
    "Mahindra":   ["Scorpio", "XUV700", "Thar", "XUV300", "Bolero"],
    "Ford":       ["EcoSport", "Endeavour", "Figo", "Aspire"],
    "Kia":        ["Seltos", "Sonet", "Carnival", "Carens"],
    "BMW":        ["3 Series", "5 Series", "X1", "X3", "X5"],
    "Mercedes":   ["C-Class", "E-Class", "GLC", "GLE", "A-Class"],
    "Volkswagen": ["Polo", "Vento", "Tiguan", "Taigun"],
}

CITIES = {
    "Bengaluru":  0.18,
    "Mumbai":     0.17,
    "Delhi":      0.16,
    "Hyderabad":  0.12,
    "Chennai":    0.10,
    "Pune":       0.09,
    "Kolkata":    0.08,
    "Ahmedabad":  0.06,
    "Jaipur":     0.04,
}

FUEL_TYPES  = ["Petrol", "Diesel", "CNG", "Electric", "Hybrid"]
FUEL_WEIGHT = [0.45,    0.30,    0.10,  0.10,       0.05]

TRANSMISSION = ["Manual", "Automatic"]
TRANS_WEIGHT = [0.55,     0.45]

OWNERS = ["First", "Second", "Third"]
OWNER_WEIGHT = [0.55, 0.35, 0.10]

PROMOTION_LEVELS = ["Standard", "Plus", "Premium"]


# ── Helper: realistic pricing ──────────────────────────────────────────────────
def calc_price(brand: str, year: int, health_score: float, fuel: str) -> int:
    lo, hi = BRANDS[brand]["base_price"]
    base = np.random.randint(lo, hi)

    # Depreciation: ~12% per year from 2024
    age = max(0, 2024 - year)
    depreciation = (1 - 0.12) ** age
    price = base * depreciation

    # Health premium/penalty  ±15%
    price *= (0.85 + 0.30 * health_score)

    # Fuel type adjustment
    adjustments = {"Electric": 1.18, "Hybrid": 1.10, "Diesel": 1.05,
                   "Petrol": 1.00, "CNG": 0.94}
    price *= adjustments.get(fuel, 1.0)

    return max(100_000, int(price))


# ── Helper: health score (0–1, physics-based) ─────────────────────────────────
def calc_health(year: int, owner: str, km_driven: int) -> float:
    age_penalty = max(0, (2024 - year) * 0.04)
    owner_penalty = {"First": 0.0, "Second": 0.08, "Third": 0.18}[owner]
    km_penalty = min(0.30, km_driven / 500_000)
    noise = np.random.normal(0, 0.05)
    score = 1.0 - age_penalty - owner_penalty - km_penalty + noise
    return round(float(np.clip(score, 0.05, 1.0)), 3)


# ── Helper: conversion target (was this listing reserved?) ────────────────────
def calc_conversion(price: int, health: float, is_promoted: int,
                    brand: str, city: str) -> int:
    """
    Simulates real-world conversion probability using logistic-like scoring.
    Higher health, lower price, promoted listings → higher conversion.
    """
    score = 0.0

    # Price quartile penalty (cheap cars convert better)
    # We'll normalise later; use raw for now
    score += health * 0.35

    if is_promoted:
        score += 0.20

    # Premium brand bias (aspirational)
    if brand in ("BMW", "Mercedes"):
        score += 0.10
    elif brand in ("Toyota", "Honda", "Kia"):
        score += 0.05

    # Tier-1 city boost
    if city in ("Bengaluru", "Mumbai", "Delhi"):
        score += 0.08

    # Noise
    score += np.random.normal(0, 0.12)

    prob = 1 / (1 + np.exp(-6 * (score - 0.45)))   # sigmoid centred at 0.45
    return int(np.random.binomial(1, np.clip(prob, 0.02, 0.98)))


# ── Helper: mlScore (ranking relevance) ───────────────────────────────────────
def calc_ml_score(health: float, price: int, conversion: int,
                  is_promoted: int, year: int) -> float:
    """
    Ground-truth relevance score for ranking model training.
    Combines health, recency, value perception, and engagement signals.
    """
    recency = (year - 2010) / (2024 - 2010)        # newer → higher
    value   = 1 - min(1, price / 10_000_000)        # cheaper → higher
    base    = 0.35 * health + 0.25 * recency + 0.20 * value + 0.20 * conversion
    if is_promoted:
        base += 0.08
    noise = np.random.normal(0, 0.04)
    return round(float(np.clip(base + noise, 0.0, 1.0)), 4)


# ── Helper: promotion level (strategy target) ─────────────────────────────────
def calc_promotion_level(price: int, health: float, brand: str,
                          city: str, year: int) -> str:
    """
    Determines the optimal promotion tier that maximises conversion probability.
    Premium tier warranted for high-value, high-health, recent vehicles.
    """
    score = 0
    if price > 1_500_000:  score += 2
    elif price > 600_000:  score += 1

    if health > 0.75:      score += 2
    elif health > 0.50:    score += 1

    if brand in ("BMW", "Mercedes", "Toyota", "Kia"):  score += 2
    elif brand in ("Honda", "Mahindra", "Hyundai"):    score += 1

    if city in ("Bengaluru", "Mumbai", "Delhi"):       score += 1

    if year >= 2021:       score += 2
    elif year >= 2018:     score += 1

    noise = np.random.randint(-1, 2)
    score = max(0, score + noise)

    if score >= 7:   return "Premium"
    elif score >= 4: return "Plus"
    else:            return "Standard"


# ── Main generation loop ───────────────────────────────────────────────────────
def generate_dataset(n: int = N_ROWS) -> pd.DataFrame:
    brands_list = list(BRANDS.keys())
    brand_weights = [BRANDS[b]["weight"] for b in brands_list]
    city_list = list(CITIES.keys())
    city_weights = list(CITIES.values())

    records = []
    for i in range(n):
        brand       = random.choices(brands_list, weights=brand_weights)[0]
        model       = random.choice(MODELS_BY_BRAND[brand])
        year        = int(np.random.choice(range(2010, 2025),
                          p=np.array([0.02,0.03,0.04,0.05,0.06,0.07,0.08,
                                      0.09,0.10,0.11,0.11,0.10,0.08,0.06,0.00])))
        city        = random.choices(city_list, weights=city_weights)[0]
        fuel        = random.choices(FUEL_TYPES, weights=FUEL_WEIGHT)[0]
        transmission= random.choices(TRANSMISSION, weights=TRANS_WEIGHT)[0]
        owner       = random.choices(OWNERS, weights=OWNER_WEIGHT)[0]
        km_driven   = int(np.random.lognormal(mean=10.8, sigma=0.6))  # ~50k median

        health_score    = calc_health(year, owner, km_driven)
        listing_price   = calc_price(brand, year, health_score, fuel)
        is_promoted     = int(np.random.binomial(1, 0.30))   # 30% listings promoted
        conversion_target = calc_conversion(listing_price, health_score,
                                            is_promoted, brand, city)
        ml_score        = calc_ml_score(health_score, listing_price,
                                        conversion_target, is_promoted, year)
        promotion_level = calc_promotion_level(listing_price, health_score,
                                               brand, city, year)

        records.append({
            "listing_id":        f"LID{i+1:05d}",
            "brand":             brand,
            "model":             model,
            "year":              year,
            "city":              city,
            "fuel_type":         fuel,
            "transmission":      transmission,
            "owner_number":      owner,
            "km_driven":         km_driven,
            "health_score":      health_score,
            "listing_price":     listing_price,
            "is_promoted":       is_promoted,
            # ── Targets ──────────────────────────────
            "conversion_target": conversion_target,   # Model A feature / Model B target
            "ml_score":          ml_score,             # Model A target (ranking)
            "promotion_level":   promotion_level,     # Model B target (strategy)
        })

    return pd.DataFrame(records)


if __name__ == "__main__":
    out_dir = Path("data")
    out_dir.mkdir(exist_ok=True)

    print("⟳  Generating dataset …")
    df = generate_dataset(N_ROWS)

    csv_path = out_dir / "raw_listings.csv"
    df.to_csv(csv_path, index=False)

    print(f"✓  Saved {len(df):,} rows → {csv_path}")
    print(f"\n── Column summary ──────────────────────────────")
    print(df.dtypes.to_string())
    print(f"\n── Class distributions ─────────────────────────")
    print("conversion_target:\n", df["conversion_target"].value_counts().to_string())
    print("\npromotion_level:\n",  df["promotion_level"].value_counts().to_string())
    print(f"\n── Numeric stats ───────────────────────────────")
    print(df[["year","health_score","listing_price","ml_score"]].describe().round(3).to_string())
