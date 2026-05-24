"""
AutoVantage — Model A: Ranking Engine
=======================================
Algorithm : XGBoost  (objective = reg:squarederror, acts as pointwise ranker)
Target    : ml_score  (float 0–1, relevance of a listing for a user)
Tuning    : Optuna  (30 trials, maximise val NDCG@10)
Output    : models/ranking_model.json   ← native XGBoost format
            models/ranking_model.pkl    ← joblib backup

Why reg:squarederror instead of rank:pairwise?
  Pairwise ranking requires group/qid arrays (one query = one user session).
  Our synthetic data has no session IDs. We train a pointwise regressor on
  ml_score, then at inference time sort listings by predicted score DESC —
  which is functionally identical for a single-user recommendation feed.
  Swap to rank:pairwise when you add session tracking in production.
"""

import json
import time
import joblib
import warnings
import numpy as np
import optuna
from pathlib import Path
from sklearn.metrics import ndcg_score
import xgboost as xgb

warnings.filterwarnings("ignore")
optuna.logging.set_verbosity(optuna.logging.WARNING)

# ── Paths ──────────────────────────────────────────────────────────────────────
DATA_DIR   = Path("data")
MODELS_DIR = Path("models")
MODELS_DIR.mkdir(exist_ok=True)

SEED         = 42
N_TRIALS     = 30          # Optuna trials  (raise to 60+ for production)
EARLY_STOP   = 40          # XGBoost early-stopping rounds
N_BOOST_MAX  = 600         # max boosting rounds during tuning


# ══════════════════════════════════════════════════════════════════════════════
# 1. LOAD ARRAYS
# ══════════════════════════════════════════════════════════════════════════════
def load_data():
    X_train = np.load(DATA_DIR / "X_train_a.npy")
    X_test  = np.load(DATA_DIR / "X_test_a.npy")
    y_train = np.load(DATA_DIR / "y_train_a.npy")
    y_test  = np.load(DATA_DIR / "y_test_a.npy")
    print(f"  Train: {X_train.shape}  Test: {X_test.shape}")
    print(f"  y_train — min: {y_train.min():.3f}  max: {y_train.max():.3f}"
          f"  mean: {y_train.mean():.3f}")
    return X_train, X_test, y_train, y_test


# ══════════════════════════════════════════════════════════════════════════════
# 2. NDCG@K HELPER
# ══════════════════════════════════════════════════════════════════════════════
def ndcg_at_k(y_true: np.ndarray, y_pred: np.ndarray, k: int = 10) -> float:
    """
    sklearn's ndcg_score expects 2-D arrays (n_queries × n_docs).
    We treat the entire test set as one virtual query.
    """
    return ndcg_score(y_true.reshape(1, -1), y_pred.reshape(1, -1), k=k)


# ══════════════════════════════════════════════════════════════════════════════
# 3. OPTUNA OBJECTIVE
# ══════════════════════════════════════════════════════════════════════════════
def make_objective(X_train, y_train, X_val, y_val):
    def objective(trial: optuna.Trial) -> float:
        params = {
            "objective":        "reg:squarederror",
            "eval_metric":      "rmse",
            "tree_method":      "hist",          # fast histogram algorithm
            "seed":             SEED,
            "verbosity":        0,
            # ── Sampled hyperparameters ──────────────────────────────────
            "n_estimators":     trial.suggest_int("n_estimators", 100, N_BOOST_MAX),
            "max_depth":        trial.suggest_int("max_depth", 3, 9),
            "learning_rate":    trial.suggest_float("learning_rate", 0.01, 0.3, log=True),
            "subsample":        trial.suggest_float("subsample", 0.5, 1.0),
            "colsample_bytree": trial.suggest_float("colsample_bytree", 0.5, 1.0),
            "min_child_weight": trial.suggest_int("min_child_weight", 1, 10),
            "reg_alpha":        trial.suggest_float("reg_alpha", 1e-4, 10.0, log=True),
            "reg_lambda":       trial.suggest_float("reg_lambda", 1e-4, 10.0, log=True),
            "gamma":            trial.suggest_float("gamma", 0.0, 5.0),
        }

        model = xgb.XGBRegressor(**params, early_stopping_rounds=EARLY_STOP)
        model.fit(
            X_train, y_train,
            eval_set=[(X_val, y_val)],
            verbose=False,
        )
        y_pred = model.predict(X_val)
        return ndcg_at_k(y_val, y_pred, k=10)

    return objective


# ══════════════════════════════════════════════════════════════════════════════
# 4. FINAL TRAINING WITH BEST PARAMS
# ══════════════════════════════════════════════════════════════════════════════
def train_final(best_params: dict, X_train, y_train, X_test, y_test):
    params = {
        "objective":   "reg:squarederror",
        "eval_metric": "rmse",
        "tree_method": "hist",
        "seed":        SEED,
        "verbosity":   1,
        **best_params,
    }
    model = xgb.XGBRegressor(**params, early_stopping_rounds=EARLY_STOP)
    model.fit(
        X_train, y_train,
        eval_set=[(X_test, y_test)],
        verbose=50,
    )
    return model


# ══════════════════════════════════════════════════════════════════════════════
# 5. EVALUATION
# ══════════════════════════════════════════════════════════════════════════════
def evaluate(model, X_test, y_test):
    y_pred  = model.predict(X_test)
    rmse    = np.sqrt(np.mean((y_pred - y_test) ** 2))
    mae     = np.mean(np.abs(y_pred - y_test))
    ndcg10  = ndcg_at_k(y_test, y_pred, k=10)
    ndcg20  = ndcg_at_k(y_test, y_pred, k=20)

    # Spearman rank correlation  (best metric for a ranker)
    from scipy.stats import spearmanr
    rho, _ = spearmanr(y_test, y_pred)

    print(f"\n  ── Model A evaluation ──────────────────────────")
    print(f"  RMSE              : {rmse:.4f}")
    print(f"  MAE               : {mae:.4f}")
    print(f"  NDCG@10           : {ndcg10:.4f}  (target ≥ 0.90)")
    print(f"  NDCG@20           : {ndcg20:.4f}")
    print(f"  Spearman ρ        : {rho:.4f}  (target ≥ 0.85)")
    return {"rmse": rmse, "mae": mae, "ndcg@10": ndcg10,
            "ndcg@20": ndcg20, "spearman_rho": rho}


# ══════════════════════════════════════════════════════════════════════════════
# 6. FEATURE IMPORTANCE
# ══════════════════════════════════════════════════════════════════════════════
def print_feature_importance(model, top_n: int = 15):
    schema      = json.load(open(DATA_DIR / "features_schema.json"))
    feat_names  = schema["model_a"]["ordered_feature_columns"]
    importances = model.feature_importances_

    ranked = sorted(zip(feat_names, importances),
                    key=lambda x: x[1], reverse=True)

    print(f"\n  ── Top {top_n} features (gain) ──────────────────")
    for name, score in ranked[:top_n]:
        bar = "█" * int(score * 300)
        print(f"  {name:<30}  {score:.4f}  {bar}")


# ══════════════════════════════════════════════════════════════════════════════
# 7. MAIN
# ══════════════════════════════════════════════════════════════════════════════
def main():
    print("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("  AutoVantage — Model A: Ranking Engine (XGBoost)")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")

    # ── Load ──────────────────────────────────────────────────────────────────
    print("[ 1/5 ] Loading preprocessed arrays …")
    X_train, X_test, y_train, y_test = load_data()

    # Use 15% of train as Optuna validation split (not touching test set)
    split   = int(len(X_train) * 0.85)
    X_opt   = X_train[split:]
    y_opt   = y_train[split:]
    X_tr    = X_train[:split]
    y_tr    = y_train[:split]

    # ── Optuna tuning ─────────────────────────────────────────────────────────
    print(f"\n[ 2/5 ] Optuna hyperparameter search ({N_TRIALS} trials) …")
    t0    = time.time()
    study = optuna.create_study(
        direction="maximize",
        sampler=optuna.samplers.TPESampler(seed=SEED),
        pruner=optuna.pruners.MedianPruner(n_warmup_steps=5),
    )
    study.optimize(
        make_objective(X_tr, y_tr, X_opt, y_opt),
        n_trials=N_TRIALS,
        show_progress_bar=False,
    )
    elapsed = time.time() - t0
    best    = study.best_params
    print(f"  Best NDCG@10 (val): {study.best_value:.4f}  [{elapsed:.1f}s]")
    print(f"  Best params: {json.dumps(best, indent=4)}")

    # ── Final training ────────────────────────────────────────────────────────
    print("\n[ 3/5 ] Training final model on full train set …")
    model = train_final(best, X_train, y_train, X_test, y_test)

    # ── Evaluate ─────────────────────────────────────────────────────────────
    print("\n[ 4/5 ] Evaluating …")
    metrics = evaluate(model, X_test, y_test)
    print_feature_importance(model)

    # ── Save ─────────────────────────────────────────────────────────────────
    print("\n[ 5/5 ] Saving model …")

    # Native XGBoost JSON (used by onnxmltools for ONNX conversion)
    json_path = MODELS_DIR / "ranking_model.json"
    model.save_model(json_path)
    print(f"  XGBoost JSON  → {json_path}")

    # joblib pickle (Python-only backup / quick reload)
    pkl_path = MODELS_DIR / "ranking_model.pkl"
    joblib.dump(model, pkl_path)
    print(f"  joblib pickle → {pkl_path}")

    # Save best params + metrics for reproducibility log
    log = {"best_params": best, "metrics": {k: round(float(v), 4)
                                             for k, v in metrics.items()}}
    log_path = MODELS_DIR / "ranking_model_log.json"
    with open(log_path, "w") as f:
        json.dump(log, f, indent=2)
    print(f"  Training log  → {log_path}")

    print("\n  Next step → run train_model_b.py (CatBoost Strategy Engine)")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")


if __name__ == "__main__":
    main()
