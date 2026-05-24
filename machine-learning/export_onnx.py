"""
AutoVantage — Phase 3: ONNX Export & Validation
=================================================
Converts trained models AND scalers into ONNX format so Spring Boot
never needs to import scikit-learn or any Python library at inference time.

Input  (models/)
  ranking_model.json     ← XGBoost native JSON
  strategy_model.cbm     ← CatBoost native binary
  scaler_a.pkl           ← StandardScaler for Model A
  scaler_b.pkl           ← StandardScaler for Model B

Output  (onnx/)          ← copy these into Spring Boot
  ranking_model.onnx     ← XGBoost ranker  (input: float[41] → output: float)
  strategy_model.onnx    ← CatBoost clf    (input: float[39] → output: int + float[3])
  scaler_a.onnx          ← StandardScaler A (input: float[11] → output: float[11])
  scaler_b.onnx          ← StandardScaler B (input: float[9]  → output: float[9])
  onnx_manifest.json     ← input/output tensor spec for Java

Validation
  Runs 100 random test samples through both the original Python model
  and the ONNX runtime, asserts outputs match within tolerance.
  Any mismatch → script exits with a clear error before you ever touch Java.
"""

import json
import joblib
import numpy as np
import onnx
import onnxruntime as ort
from pathlib import Path
from catboost import CatBoostClassifier
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType
import onnxmltools
from onnxmltools.convert import convert_xgboost
import xgboost as xgb

# ── Paths ──────────────────────────────────────────────────────────────────────
DATA_DIR   = Path("data")
MODELS_DIR = Path("models")
ONNX_DIR   = Path("onnx")
ONNX_DIR.mkdir(exist_ok=True)

# Spring Boot resource path reminder
SPRING_BOOT_TARGET = Path("src/main/resources/models")

OPSET       = 15       # safe for XGBoost + CatBoost + skl2onnx
TOLERANCE   = 1e-3     # max allowed difference between Python and ONNX output
N_VALIDATE  = 100      # samples to cross-check


# ══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════════════════════════════════
def banner(msg):
    print(f"\n{'━'*52}")
    print(f"  {msg}")
    print(f"{'━'*52}")

def ok(msg):   print(f"  ✓  {msg}")
def info(msg): print(f"  ·  {msg}")
def warn(msg): print(f"  ⚠  {msg}")


def load_schema():
    return json.load(open(DATA_DIR / "features_schema.json"))


def ort_session(path: Path) -> ort.InferenceSession:
    return ort.InferenceSession(str(path),
           providers=["CPUExecutionProvider"])


def describe_onnx(path: Path):
    """Print input/output tensor names and shapes."""
    sess = ort_session(path)
    info(f"File : {path.name}  ({path.stat().st_size // 1024} KB)")
    for inp in sess.get_inputs():
        info(f"  IN  {inp.name:<30} {inp.type}  {inp.shape}")
    for out in sess.get_outputs():
        info(f"  OUT {out.name:<30} {out.type}  {out.shape}")


# ══════════════════════════════════════════════════════════════════════════════
# 1. EXPORT SCALERS  (skl2onnx)
# ══════════════════════════════════════════════════════════════════════════════
def export_scaler(pkl_name: str, out_name: str, n_features: int) -> Path:
    scaler = joblib.load(MODELS_DIR / pkl_name)
    initial_type = [("float_input", FloatTensorType([None, n_features]))]
    onnx_model = convert_sklearn(scaler, initial_types=initial_type,
                                  target_opset=OPSET)
    out_path = ONNX_DIR / out_name
    onnx.save(onnx_model, str(out_path))
    ok(f"Scaler exported → {out_path}")
    return out_path


def validate_scaler(pkl_name: str, onnx_path: Path,
                    X_sample: np.ndarray, numeric_cols: list):
    scaler  = joblib.load(MODELS_DIR / pkl_name)
    sess    = ort_session(onnx_path)

    # Only the numeric slice goes through the scaler
    X_num   = X_sample[:, :len(numeric_cols)].astype(np.float32)
    py_out  = scaler.transform(X_num.astype(np.float64)).astype(np.float32)
    ort_out = sess.run(None, {sess.get_inputs()[0].name: X_num})[0]

    max_diff = np.abs(py_out - ort_out).max()
    assert max_diff < TOLERANCE, \
        f"Scaler mismatch! max_diff={max_diff:.6f} > tol={TOLERANCE}"
    ok(f"Scaler validated  max_diff={max_diff:.2e}  ({N_VALIDATE} samples)")


# ══════════════════════════════════════════════════════════════════════════════
# 2. EXPORT MODEL A  (XGBoost → ONNX via onnxmltools)
# ══════════════════════════════════════════════════════════════════════════════
def export_model_a(n_features: int) -> Path:
    # Load native XGBoost JSON
    model = xgb.XGBRegressor()
    model.load_model(MODELS_DIR / "ranking_model.json")

    # Convert — onnxmltools reads the booster directly
    onnx_model = convert_xgboost(
        model,
        name="AutoVantageRanking",
        initial_types=[("float_input", FloatTensorType([None, n_features]))],
        target_opset=OPSET,
    )
    out_path = ONNX_DIR / "ranking_model.onnx"
    onnxmltools.utils.save_model(onnx_model, str(out_path))
    ok(f"Model A exported  → {out_path}")
    return out_path


def validate_model_a(onnx_path: Path, X_test: np.ndarray, y_test: np.ndarray):
    model = xgb.XGBRegressor()
    model.load_model(MODELS_DIR / "ranking_model.json")
    sess  = ort_session(onnx_path)

    idx     = np.random.choice(len(X_test), N_VALIDATE, replace=False)
    X_samp  = X_test[idx].astype(np.float32)

    py_pred  = model.predict(X_samp.astype(np.float64))
    ort_pred = sess.run(None, {sess.get_inputs()[0].name: X_samp})[0].flatten()

    max_diff = np.abs(py_pred - ort_pred).max()
    assert max_diff < TOLERANCE, \
        f"Model A mismatch! max_diff={max_diff:.6f}"

    # Also check ranking order is preserved (Spearman ρ)
    from scipy.stats import spearmanr
    rho, _ = spearmanr(py_pred, ort_pred)
    ok(f"Model A validated  max_diff={max_diff:.2e}  rank_corr={rho:.6f}  ({N_VALIDATE} samples)")


# ══════════════════════════════════════════════════════════════════════════════
# 3. EXPORT MODEL B  (CatBoost native ONNX export)
# ══════════════════════════════════════════════════════════════════════════════
def export_model_b(n_features: int) -> Path:
    model = CatBoostClassifier()
    model.load_model(MODELS_DIR / "strategy_model.cbm")

    out_path = ONNX_DIR / "strategy_model.onnx"

    # CatBoost's built-in ONNX export — most reliable path
    model.save_model(
        str(out_path),
        format="onnx",
        export_parameters={
            "onnx_domain":       "ai.catboost",
            "onnx_model_version": 1,
            "onnx_doc_string":   "AutoVantage Strategy Engine",
            "onnx_graph_name":   "AutoVantageStrategy",
        }
    )
    ok(f"Model B exported  → {out_path}")
    return out_path


def validate_model_b(onnx_path: Path, X_test: np.ndarray, y_test: np.ndarray):
    model = CatBoostClassifier()
    model.load_model(MODELS_DIR / "strategy_model.cbm")
    sess  = ort_session(onnx_path)

    idx    = np.random.choice(len(X_test), N_VALIDATE, replace=False)
    X_samp = X_test[idx].astype(np.float32)

    py_labels = model.predict(X_samp).flatten().astype(int)
    py_proba  = model.predict_proba(X_samp)

    # CatBoost ONNX outputs: [0]=labels  [1]=probabilities dict
    ort_out    = sess.run(None, {sess.get_inputs()[0].name: X_samp})
    ort_labels = np.array(ort_out[0]).flatten().astype(int)

    # Extract proba — CatBoost ONNX returns a list of {0:p, 1:p, 2:p} dicts
    ort_proba = np.array([[d[i] for i in range(3)] for d in ort_out[1]])

    label_match = np.mean(py_labels == ort_labels)
    proba_diff  = np.abs(py_proba - ort_proba).max()

    assert label_match == 1.0, \
        f"Model B label mismatch! agreement={label_match:.3f}"
    assert proba_diff < TOLERANCE, \
        f"Model B proba mismatch! max_diff={proba_diff:.6f}"

    ok(f"Model B validated  label_match=100%  proba_diff={proba_diff:.2e}  ({N_VALIDATE} samples)")


# ══════════════════════════════════════════════════════════════════════════════
# 4. BUILD ONNX MANIFEST  (Java reads this to know tensor names + shapes)
# ══════════════════════════════════════════════════════════════════════════════
def build_manifest(schema: dict):
    """
    Generates onnx_manifest.json — Spring Boot's OnnxInferenceService.java
    reads this at startup to know exact input tensor names and feature counts.
    """
    manifest = {
        "_comment": "Auto-generated by export_onnx.py — do not edit by hand.",
        "version": schema["version"],
        "models": {
            "ranking": {
                "file":              "ranking_model.onnx",
                "input_tensor_name": "float_input",
                "output_tensor_name":"variable",
                "input_shape":       [1, schema["model_a"]["feature_count"]],
                "output_type":       "float",
                "description":       "Returns ml_score float [0-1]. Sort DESC for ranked feed.",
                "feature_count":     schema["model_a"]["feature_count"],
                "numeric_features":  schema["model_a"]["numeric_features"],
                "scaler_file":       "scaler_a.onnx",
                "scaler_input_name": "float_input",
                "scaler_output_name":"variable",
                "scaler_features":   schema["model_a"]["numeric_features"],
            },
            "strategy": {
                "file":              "strategy_model.onnx",
                "input_tensor_name": "features",
                "output_tensor_name_label":  "label",
                "output_tensor_name_proba":  "probabilities",
                "input_shape":       [1, schema["model_b"]["feature_count"]],
                "output_type":       "multiclass",
                "classes":           schema["model_b"]["classes"],
                "label_encoding":    schema["model_b"]["label_encoding"],
                "description":       "Returns promotion_level int + class probabilities float[3].",
                "feature_count":     schema["model_b"]["feature_count"],
                "numeric_features":  schema["model_b"]["numeric_features"],
                "scaler_file":       "scaler_b.onnx",
                "scaler_input_name": "float_input",
                "scaler_output_name":"variable",
                "scaler_features":   schema["model_b"]["numeric_features"],
            },
        },
        "feature_schema_version": schema["version"],
        "ohe_columns":            schema["all_ohe_columns"],
    }

    # Patch strategy input name from actual ONNX file
    try:
        sess = ort_session(ONNX_DIR / "strategy_model.onnx")
        actual_input = sess.get_inputs()[0].name
        manifest["models"]["strategy"]["input_tensor_name"] = actual_input
        actual_label = sess.get_outputs()[0].name
        actual_proba = sess.get_outputs()[1].name
        manifest["models"]["strategy"]["output_tensor_name_label"] = actual_label
        manifest["models"]["strategy"]["output_tensor_name_proba"] = actual_proba
    except Exception:
        pass

    # Patch ranking output name from actual ONNX file
    try:
        sess = ort_session(ONNX_DIR / "ranking_model.onnx")
        actual_out = sess.get_outputs()[0].name
        manifest["models"]["ranking"]["output_tensor_name"] = actual_out
    except Exception:
        pass

    path = ONNX_DIR / "onnx_manifest.json"
    with open(path, "w") as f:
        json.dump(manifest, f, indent=2)
    ok(f"Manifest saved    → {path}")
    return manifest


# ══════════════════════════════════════════════════════════════════════════════
# 5. PRINT SPRING BOOT INSTRUCTIONS
# ══════════════════════════════════════════════════════════════════════════════
def print_java_instructions():
    print(f"""
  ┌─────────────────────────────────────────────────────┐
  │  Copy these 5 files into your Spring Boot project   │
  └─────────────────────────────────────────────────────┘

  From  onnx/
  To    src/main/resources/models/

    ranking_model.onnx
    strategy_model.onnx
    scaler_a.onnx
    scaler_b.onnx
    onnx_manifest.json

  pom.xml dependency to add:

    <dependency>
      <groupId>com.microsoft.onnxruntime</groupId>
      <artifactId>onnxruntime</artifactId>
      <version>1.17.3</version>
    </dependency>

  Next step → OnnxInferenceService.java (Phase 4)
""")


# ══════════════════════════════════════════════════════════════════════════════
# 6. MAIN
# ══════════════════════════════════════════════════════════════════════════════
def main():
    np.random.seed(42)
    schema = load_schema()

    n_feat_a = schema["model_a"]["feature_count"]   # 41
    n_feat_b = schema["model_b"]["feature_count"]   # 39
    n_num_a  = len(schema["model_a"]["numeric_features"])   # 11
    n_num_b  = len(schema["model_b"]["numeric_features"])   # 9

    X_test_a = np.load(DATA_DIR / "X_test_a.npy")
    y_test_a = np.load(DATA_DIR / "y_test_a.npy")
    X_test_b = np.load(DATA_DIR / "X_test_b.npy")
    y_test_b = np.load(DATA_DIR / "y_test_b.npy")

    # ── Scaler A ──────────────────────────────────────────────────────────────
    banner("Exporting scaler_a.onnx")
    export_scaler("scaler_a.pkl", "scaler_a.onnx", n_num_a)
    validate_scaler("scaler_a.pkl", ONNX_DIR / "scaler_a.onnx",
                    X_test_a[:N_VALIDATE],
                    schema["model_a"]["numeric_features"])
    describe_onnx(ONNX_DIR / "scaler_a.onnx")

    # ── Scaler B ──────────────────────────────────────────────────────────────
    banner("Exporting scaler_b.onnx")
    export_scaler("scaler_b.pkl", "scaler_b.onnx", n_num_b)
    validate_scaler("scaler_b.pkl", ONNX_DIR / "scaler_b.onnx",
                    X_test_b[:N_VALIDATE],
                    schema["model_b"]["numeric_features"])
    describe_onnx(ONNX_DIR / "scaler_b.onnx")

    # ── Model A ───────────────────────────────────────────────────────────────
    banner("Exporting ranking_model.onnx  (XGBoost)")
    export_model_a(n_feat_a)
    validate_model_a(ONNX_DIR / "ranking_model.onnx", X_test_a, y_test_a)
    describe_onnx(ONNX_DIR / "ranking_model.onnx")

    # ── Model B ───────────────────────────────────────────────────────────────
    banner("Exporting strategy_model.onnx  (CatBoost)")
    export_model_b(n_feat_b)
    validate_model_b(ONNX_DIR / "strategy_model.onnx", X_test_b, y_test_b)
    describe_onnx(ONNX_DIR / "strategy_model.onnx")

    # ── Manifest ──────────────────────────────────────────────────────────────
    banner("Building onnx_manifest.json")
    build_manifest(schema)

    # ── Summary ───────────────────────────────────────────────────────────────
    banner("All exports validated ✓")
    print()
    for f in sorted(ONNX_DIR.iterdir()):
        kb = f.stat().st_size // 1024
        print(f"  {f.name:<35}  {kb:>5} KB")

    print_java_instructions()


if __name__ == "__main__":
    main()
