"""
AutoVantage — Model B: Strategy Engine
=======================================
Algorithm : CatBoost  (MultiClass classifier)
Target    : promotion_level  →  0=Standard  1=Plus  2=Premium
Tuning    : Optuna  (30 trials, maximise val macro-F1)
Output    : models/strategy_model.cbm   ← native CatBoost binary
            models/strategy_model.pkl   ← joblib backup

Why CatBoost?
  CatBoost handles class imbalance (Standard 1114 vs Premium 165) gracefully
  via built-in class weights. It also produces well-calibrated class
  probabilities, which we use in Spring Boot to return a confidence score
  alongside the recommended promotion plan.
"""

import json
import time
import joblib
import warnings
import numpy as np
import optuna
from pathlib import Path
from catboost import CatBoostClassifier, Pool
from sklearn.metrics import (classification_report, confusion_matrix,
                              f1_score, log_loss)

warnings.filterwarnings("ignore")
optuna.logging.set_verbosity(optuna.logging.WARNING)

# ── Paths ──────────────────────────────────────────────────────────────────────
DATA_DIR   = Path("data")
MODELS_DIR = Path("models")
MODELS_DIR.mkdir(exist_ok=True)

SEED        = 42
N_TRIALS    = 30
EARLY_STOP  = 50
CLASS_NAMES = ["Standard", "Plus", "Premium"]


# ══════════════════════════════════════════════════════════════════════════════
# 1. LOAD
# ══════════════════════════════════════════════════════════════════════════════
def load_data():
    X_train = np.load(DATA_DIR / "X_train_b.npy")
    X_test  = np.load(DATA_DIR / "X_test_b.npy")
    y_train = np.load(DATA_DIR / "y_train_b.npy")
    y_test  = np.load(DATA_DIR / "y_test_b.npy")
    print(f"  Train: {X_train.shape}  Test: {X_test.shape}")

    unique, counts = np.unique(y_train, return_counts=True)
    dist = dict(zip([CLASS_NAMES[i] for i in unique], counts))
    print(f"  Class distribution (train): {dist}")
    return X_train, X_test, y_train, y_test


# ══════════════════════════════════════════════════════════════════════════════
# 2. CLASS WEIGHTS  (inverse-frequency to handle imbalance)
# ══════════════════════════════════════════════════════════════════════════════
def compute_class_weights(y: np.ndarray) -> list:
    unique, counts = np.unique(y, return_counts=True)
    total   = len(y)
    n_cls   = len(unique)
    weights = {int(cls): total / (n_cls * cnt)
               for cls, cnt in zip(unique, counts)}
    ordered = [weights[i] for i in sorted(weights)]
    print(f"  Class weights: { {CLASS_NAMES[i]: round(w,3) for i,w in enumerate(ordered)} }")
    return ordered


# ══════════════════════════════════════════════════════════════════════════════
# 3. OPTUNA OBJECTIVE
# ══════════════════════════════════════════════════════════════════════════════
def make_objective(X_train, y_train, X_val, y_val, class_weights):
    def objective(trial: optuna.Trial) -> float:
        params = {
            "loss_function":      "MultiClass",
            "eval_metric":        "TotalF1",
            "random_seed":        SEED,
            "verbose":            False,
            "class_weights":      class_weights,
            # ── Sampled ──────────────────────────────────────────────────────
            "iterations":         trial.suggest_int("iterations", 100, 800),
            "depth":              trial.suggest_int("depth", 4, 10),
            "learning_rate":      trial.suggest_float("learning_rate", 0.01, 0.3, log=True),
            "l2_leaf_reg":        trial.suggest_float("l2_leaf_reg", 1.0, 20.0),
            "bagging_temperature":trial.suggest_float("bagging_temperature", 0.0, 1.0),
            "random_strength":    trial.suggest_float("random_strength", 0.0, 10.0),
            "border_count":       trial.suggest_int("border_count", 32, 255),
        }

        model = CatBoostClassifier(**params, early_stopping_rounds=EARLY_STOP)
        train_pool = Pool(X_train, y_train)
        val_pool   = Pool(X_val, y_val)

        model.fit(train_pool, eval_set=val_pool, use_best_model=True)
        y_pred = model.predict(X_val).flatten()
        return f1_score(y_val, y_pred, average="macro")

    return objective


# ══════════════════════════════════════════════════════════════════════════════
# 4. FINAL TRAINING
# ══════════════════════════════════════════════════════════════════════════════
def train_final(best_params, X_train, y_train, X_test, y_test, class_weights):
    params = {
        "loss_function":   "MultiClass",
        "eval_metric":     "TotalF1",
        "random_seed":     SEED,
        "verbose":         100,
        "class_weights":   class_weights,
        **best_params,
    }
    model = CatBoostClassifier(**params, early_stopping_rounds=EARLY_STOP)
    train_pool = Pool(X_train, y_train)
    test_pool  = Pool(X_test, y_test)
    model.fit(train_pool, eval_set=test_pool, use_best_model=True)
    return model


# ══════════════════════════════════════════════════════════════════════════════
# 5. EVALUATION
# ══════════════════════════════════════════════════════════════════════════════
def evaluate(model, X_test, y_test):
    y_pred      = model.predict(X_test).flatten()
    y_proba     = model.predict_proba(X_test)

    f1_macro    = f1_score(y_test, y_pred, average="macro")
    f1_weighted = f1_score(y_test, y_pred, average="weighted")
    logloss     = log_loss(y_test, y_proba)

    print(f"\n  ── Model B evaluation ──────────────────────────")
    print(f"  F1 (macro)        : {f1_macro:.4f}  (target ≥ 0.75)")
    print(f"  F1 (weighted)     : {f1_weighted:.4f}")
    print(f"  Log-loss          : {logloss:.4f}")
    print(f"\n  Per-class report:\n")
    print(classification_report(y_test, y_pred,
                                 target_names=CLASS_NAMES, digits=3))

    cm = confusion_matrix(y_test, y_pred)
    print("  Confusion matrix  (rows=actual, cols=predicted):")
    header = "          " + "  ".join(f"{c:>10}" for c in CLASS_NAMES)
    print(header)
    for i, row in enumerate(cm):
        row_str = "  ".join(f"{v:>10}" for v in row)
        print(f"  {CLASS_NAMES[i]:<10}{row_str}")

    return {"f1_macro": f1_macro, "f1_weighted": f1_weighted, "log_loss": logloss}


# ══════════════════════════════════════════════════════════════════════════════
# 6. FEATURE IMPORTANCE
# ══════════════════════════════════════════════════════════════════════════════
def print_feature_importance(model, top_n: int = 15):
    schema      = json.load(open(DATA_DIR / "features_schema.json"))
    feat_names  = schema["model_b"]["ordered_feature_columns"]
    importances = model.get_feature_importance()

    ranked = sorted(zip(feat_names, importances),
                    key=lambda x: x[1], reverse=True)

    print(f"\n  ── Top {top_n} features (PredictionValuesChange) ────")
    for name, score in ranked[:top_n]:
        bar = "█" * int(score / 2)
        print(f"  {name:<30}  {score:6.2f}  {bar}")


# ══════════════════════════════════════════════════════════════════════════════
# 7. MAIN
# ══════════════════════════════════════════════════════════════════════════════
def main():
    print("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("  AutoVantage — Model B: Strategy Engine (CatBoost)")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")

    # ── Load ──────────────────────────────────────────────────────────────────
    print("[ 1/5 ] Loading preprocessed arrays …")
    X_train, X_test, y_train, y_test = load_data()
    class_weights = compute_class_weights(y_train)

    # Optuna val split (15% of train)
    split = int(len(X_train) * 0.85)
    X_opt, y_opt = X_train[split:], y_train[split:]
    X_tr,  y_tr  = X_train[:split], y_train[:split]

    # ── Optuna ────────────────────────────────────────────────────────────────
    print(f"\n[ 2/5 ] Optuna search ({N_TRIALS} trials) …")
    t0    = time.time()
    study = optuna.create_study(
        direction="maximize",
        sampler=optuna.samplers.TPESampler(seed=SEED),
        pruner=optuna.pruners.MedianPruner(n_warmup_steps=5),
    )
    study.optimize(
        make_objective(X_tr, y_tr, X_opt, y_opt, class_weights),
        n_trials=N_TRIALS,
    )
    elapsed = time.time() - t0
    best    = study.best_params
    print(f"  Best F1-macro (val): {study.best_value:.4f}  [{elapsed:.1f}s]")
    print(f"  Best params: {json.dumps(best, indent=4)}")

    # ── Final training ────────────────────────────────────────────────────────
    print("\n[ 3/5 ] Training final model on full train set …")
    model = train_final(best, X_train, y_train, X_test, y_test, class_weights)

    # ── Evaluate ─────────────────────────────────────────────────────────────
    print("\n[ 4/5 ] Evaluating …")
    metrics = evaluate(model, X_test, y_test)
    print_feature_importance(model)

    # ── Save ─────────────────────────────────────────────────────────────────
    print("\n[ 5/5 ] Saving model …")

    # Native CatBoost binary (used by model.save_model("...", format="onnx"))
    cbm_path = MODELS_DIR / "strategy_model.cbm"
    model.save_model(cbm_path)
    print(f"  CatBoost binary  → {cbm_path}")

    # joblib pickle (Python-only backup)
    pkl_path = MODELS_DIR / "strategy_model.pkl"
    joblib.dump(model, pkl_path)
    print(f"  joblib pickle    → {pkl_path}")

    # Training log
    log = {"best_params": best, "metrics": {k: round(float(v), 4)
                                             for k, v in metrics.items()},
           "class_names": CLASS_NAMES,
           "label_encoding": {"Standard": 0, "Plus": 1, "Premium": 2}}
    log_path = MODELS_DIR / "strategy_model_log.json"
    with open(log_path, "w") as f:
        json.dump(log, f, indent=2)
    print(f"  Training log     → {log_path}")

    print("\n  Next step → run export_onnx.py (Phase 3 — ONNX conversion)")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")


if __name__ == "__main__":
    main()
