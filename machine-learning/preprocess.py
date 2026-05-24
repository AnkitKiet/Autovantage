"""
AutoVantage — Preprocessing Pipeline
======================================
Reads data/raw_listings.csv and produces:

  data/
  ├── processed_model_a.csv      ← Ranking Engine features + ml_score target
  ├── processed_model_b.csv      ← Strategy Engine features + promotion_level target
  ├── X_train_a.npy / X_test_a.npy / y_train_a.npy / y_test_a.npy
  ├── X_train_b.npy / X_test_b.npy / y_train_b.npy / y_test_b.npy
  └── features_schema.json       ← !! The contract between Python & Spring Boot !!

  models/
  ├── scaler_a.pkl               ← StandardScaler for Model A (save → ONNX later)
  └── scaler_b.pkl               ← StandardScaler for Model B
"""

import json
import joblib
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder

# ── Paths ──────────────────────────────────────────────────────────────────────
DATA_DIR   = Path("data")
MODELS_DIR = Path("models")
MODELS_DIR.mkdir(exist_ok=True)

RAW_CSV = DATA_DIR / "raw_listings.csv"

SEED       = 42
TEST_SIZE  = 0.20


# ══════════════════════════════════════════════════════════════════════════════
# 1. LOAD
# ══════════════════════════════════════════════════════════════════════════════
def load_raw() -> pd.DataFrame:
    df = pd.read_csv(RAW_CSV)
    print(f"  Loaded {len(df):,} rows, {df.shape[1]} columns")
    return df


# ══════════════════════════════════════════════════════════════════════════════
# 2. SHARED FEATURE ENGINEERING  (runs before the model-specific forks)
# ══════════════════════════════════════════════════════════════════════════════
def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    # --- Numeric derivations ---
    df["car_age"]        = 2024 - df["year"]                         # 0–14
    df["log_price"]      = np.log1p(df["listing_price"])             # tames right skew
    df["log_km"]         = np.log1p(df["km_driven"])                 # tames right skew
    df["price_per_year"] = df["listing_price"] / (df["car_age"] + 1) # value density

    # --- Binary encodings ---
    df["is_first_owner"] = (df["owner_number"] == "First").astype(int)
    df["is_automatic"]   = (df["transmission"] == "Automatic").astype(int)
    df["is_electric"]    = (df["fuel_type"] == "Electric").astype(int)
    df["is_diesel"]      = (df["fuel_type"] == "Diesel").astype(int)

    return df


# ══════════════════════════════════════════════════════════════════════════════
# 3. ONE-HOT ENCODING  (categorical → dummy columns)
# ══════════════════════════════════════════════════════════════════════════════
CATEGORICAL_COLS = ["brand", "city", "fuel_type", "transmission", "owner_number"]

def one_hot_encode(df: pd.DataFrame) -> pd.DataFrame:
    """
    Produces deterministic, alphabetically sorted dummy columns.
    e.g. brand → Brand_BMW, Brand_Ford, Brand_Honda …
    The resulting column list is LOCKED into features_schema.json.
    """
    df = df.copy()
    dummies = pd.get_dummies(
        df[CATEGORICAL_COLS],
        prefix={c: c.replace("_", "").title() for c in CATEGORICAL_COLS},
        prefix_sep="_",
        drop_first=False,       # keep all → explicit, no reference category ambiguity
        dtype=int,
    )
    # Sort columns alphabetically for determinism across re-runs
    dummies = dummies.reindex(sorted(dummies.columns), axis=1)
    df = df.drop(columns=CATEGORICAL_COLS)
    df = pd.concat([df, dummies], axis=1)
    return df, list(dummies.columns)


# ══════════════════════════════════════════════════════════════════════════════
# 4. DEFINE FEATURE SETS (per model)
# ══════════════════════════════════════════════════════════════════════════════
#
# MODEL A  — Ranking Engine
#   Input : user preference signal + car attributes  →  ml_score [0,1]
#   NOTE  : conversion_target is an INPUT feature here (engagement signal)
#
MODEL_A_NUMERIC = [
    "car_age", "health_score", "log_price", "log_km",
    "price_per_year", "is_promoted", "conversion_target",
    "is_first_owner", "is_automatic", "is_electric", "is_diesel",
]
MODEL_A_TARGET = "ml_score"

#
# MODEL B  — Strategy Engine (Pricing / Promotion Recommender)
#   Input : car profile + location  →  promotion_level (Standard/Plus/Premium)
#   NOTE  : ml_score NOT used here (avoid target leakage between models)
#
MODEL_B_NUMERIC = [
    "car_age", "health_score", "log_price", "log_km",
    "price_per_year", "is_first_owner", "is_automatic",
    "is_electric", "is_diesel",
]
MODEL_B_TARGET = "promotion_level"


# ══════════════════════════════════════════════════════════════════════════════
# 5. SCALE NUMERICS
# ══════════════════════════════════════════════════════════════════════════════
def scale_numerics(X_train: pd.DataFrame, X_test: pd.DataFrame,
                   numeric_cols: list, scaler_path: Path):
    scaler = StandardScaler()
    X_train = X_train.copy()
    X_test  = X_test.copy()

    X_train[numeric_cols] = scaler.fit_transform(X_train[numeric_cols])
    X_test[numeric_cols]  = scaler.transform(X_test[numeric_cols])

    joblib.dump(scaler, scaler_path)
    print(f"  Scaler saved → {scaler_path}")
    return X_train, X_test, scaler


# ══════════════════════════════════════════════════════════════════════════════
# 6. BUILD FEATURE SCHEMA  (the Python ↔ Java contract)
# ══════════════════════════════════════════════════════════════════════════════
def build_and_save_schema(
    feature_cols_a: list,
    feature_cols_b: list,
    ohe_cols: list,
    numeric_a: list,
    numeric_b: list,
):
    schema = {
        "_comment": (
            "AUTO-GENERATED — DO NOT EDIT BY HAND. "
            "Re-run preprocess.py to regenerate. "
            "Spring Boot's FeatureVector.java must mirror this exactly."
        ),
        "version": "1.0.0",
        "model_a": {
            "description": "Ranking Engine — predicts ml_score (float 0–1)",
            "target": MODEL_A_TARGET,
            "feature_count": len(feature_cols_a),
            "numeric_features": numeric_a,
            "ohe_features": ohe_cols,
            "ordered_feature_columns": feature_cols_a,
        },
        "model_b": {
            "description": "Strategy Engine — predicts promotion_level (multiclass)",
            "target": MODEL_B_TARGET,
            "classes": ["Standard", "Plus", "Premium"],
            "label_encoding": {"Standard": 0, "Plus": 1, "Premium": 2},
            "feature_count": len(feature_cols_b),
            "numeric_features": numeric_b,
            "ohe_features": ohe_cols,
            "ordered_feature_columns": feature_cols_b,
        },
        "ohe_source_columns": CATEGORICAL_COLS,
        "all_ohe_columns": ohe_cols,
    }

    path = DATA_DIR / "features_schema.json"
    with open(path, "w") as f:
        json.dump(schema, f, indent=2)
    print(f"  Schema saved → {path}")
    print(f"  Model A: {len(feature_cols_a)} features")
    print(f"  Model B: {len(feature_cols_b)} features")
    return schema


# ══════════════════════════════════════════════════════════════════════════════
# 7. MAIN PIPELINE
# ══════════════════════════════════════════════════════════════════════════════
def main():
    print("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("  AutoVantage — Preprocessing Pipeline")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")

    # ── Step 1: Load ───────────────────────────────────────────────────────────
    print("[ 1/6 ] Loading raw data …")
    df = load_raw()

    # ── Step 2: Feature engineering ────────────────────────────────────────────
    print("[ 2/6 ] Engineering features …")
    df = engineer_features(df)

    # ── Step 3: One-hot encoding ───────────────────────────────────────────────
    print("[ 3/6 ] One-hot encoding categoricals …")
    df, ohe_columns = one_hot_encode(df)
    print(f"  OHE produced {len(ohe_columns)} dummy columns")
    print(f"  Samples: {ohe_columns[:4]} … {ohe_columns[-2:]}")

    # ── Step 4: Encode Model B target ─────────────────────────────────────────
    print("[ 4/6 ] Encoding targets …")
    le = LabelEncoder()
    le.classes_ = np.array(["Standard", "Plus", "Premium"])   # lock order
    df["promotion_level_enc"] = le.transform(df["promotion_level"])
    joblib.dump(le, MODELS_DIR / "label_encoder_b.pkl")
    print(f"  LabelEncoder: {dict(zip(le.classes_, le.transform(le.classes_)))}")

    # ── Step 5: Build feature matrices ────────────────────────────────────────
    print("[ 5/6 ] Building feature matrices …")

    all_feature_cols_a = MODEL_A_NUMERIC + ohe_columns
    all_feature_cols_b = MODEL_B_NUMERIC + ohe_columns

    # Ensure all expected columns exist (fill any missing OHE cols with 0)
    for col in all_feature_cols_a + all_feature_cols_b:
        if col not in df.columns:
            df[col] = 0

    # ── Model A ────────────────────────────────────────────────────────────────
    X_a = df[all_feature_cols_a].astype(float)
    y_a = df[MODEL_A_TARGET].astype(float)

    X_train_a, X_test_a, y_train_a, y_test_a = train_test_split(
        X_a, y_a, test_size=TEST_SIZE, random_state=SEED
    )
    X_train_a, X_test_a, _ = scale_numerics(
        X_train_a, X_test_a, MODEL_A_NUMERIC, MODELS_DIR / "scaler_a.pkl"
    )

    # ── Model B ────────────────────────────────────────────────────────────────
    X_b = df[all_feature_cols_b].astype(float)
    y_b = df["promotion_level_enc"].astype(int)

    X_train_b, X_test_b, y_train_b, y_test_b = train_test_split(
        X_b, y_b, test_size=TEST_SIZE, random_state=SEED
    )
    X_train_b, X_test_b, _ = scale_numerics(
        X_train_b, X_test_b, MODEL_B_NUMERIC, MODELS_DIR / "scaler_b.pkl"
    )

    print(f"  Model A — Train: {len(X_train_a):,}  Test: {len(X_test_a):,}")
    print(f"  Model B — Train: {len(X_train_b):,}  Test: {len(X_test_b):,}")

    # ── Step 6: Save everything ────────────────────────────────────────────────
    print("[ 6/6 ] Saving artefacts …")

    # Processed CSVs (for inspection / EDA)
    df_a = pd.concat([X_train_a, X_test_a])
    df_a[MODEL_A_TARGET] = pd.concat([y_train_a, y_test_a]).values
    df_a.to_csv(DATA_DIR / "processed_model_a.csv", index=False)

    df_b = pd.concat([X_train_b, X_test_b])
    df_b["promotion_level_enc"] = pd.concat([y_train_b, y_test_b]).values
    df_b.to_csv(DATA_DIR / "processed_model_b.csv", index=False)

    # NumPy arrays (fed directly into XGBoost / CatBoost)
    np.save(DATA_DIR / "X_train_a.npy", X_train_a.values)
    np.save(DATA_DIR / "X_test_a.npy",  X_test_a.values)
    np.save(DATA_DIR / "y_train_a.npy", y_train_a.values)
    np.save(DATA_DIR / "y_test_a.npy",  y_test_a.values)

    np.save(DATA_DIR / "X_train_b.npy", X_train_b.values)
    np.save(DATA_DIR / "X_test_b.npy",  X_test_b.values)
    np.save(DATA_DIR / "y_train_b.npy", y_train_b.values)
    np.save(DATA_DIR / "y_test_b.npy",  y_test_b.values)
    print("  NumPy arrays saved (X/y train/test for A and B)")

    # Feature schema — the Python ↔ Java contract
    build_and_save_schema(
        all_feature_cols_a, all_feature_cols_b,
        ohe_columns, MODEL_A_NUMERIC, MODEL_B_NUMERIC,
    )

    # ── Final summary ──────────────────────────────────────────────────────────
    print("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("  Done! Artefact manifest")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    for p in sorted((DATA_DIR).iterdir()) + sorted((MODELS_DIR).iterdir()):
        size_kb = p.stat().st_size // 1024
        print(f"  {str(p):<45}  {size_kb:>5} KB")

    print("\n  Next step → run train_model_a.py (XGBoost Ranking)")


if __name__ == "__main__":
    main()
