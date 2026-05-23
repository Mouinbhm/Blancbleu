"""
BlancBleu — Entraînement du DurationPredictor sur données réelles
(+ complément synthétique tant que real < seuil).

Stratégie de validation HONNÊTE :
  - Si on a >= MIN_REAL_FOR_CHRONO transports réels avec timestamps, on
    fait un split CHRONOLOGIQUE : les 80 % les plus anciens → train,
    les 20 % les plus récents → test. Pas de shuffle.
  - Sinon (cold start), on shuffle un split 80/20 sur l'agrégat (réel +
    synthétique) — strategy "shuffled", documenté dans metrics.json.

Le but : éviter le data-leakage temporel et produire des métriques
out-of-sample crédibles, même si elles sont basses au début.

Sauvegarde :
  - ai-service/model/duration_model.pkl
  - ai-service/model/duration_model_features.json
  - ai-service/model/metrics.json (avec data_composition, split_strategy,
    warning honnête tant que real < 300)
  - ai-service/model/shap_*.png

Usage :
  python -m data.train_real
  python -m data.train_real --since 2026-01-01 --target-total 1500
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

# Imports locaux
from data.generate_dataset import generer_dataset, preprocess
from data.load_real_data import fetch_real_features

logger = logging.getLogger("blancbleu.ai.train_real")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# ─── Constantes ────────────────────────────────────────────────────────────────

# En dessous de ce seuil de transports réels, on documente le warning
# "data_composition_low_real" dans metrics.json.
MIN_REAL_FOR_TRUST = 300

# Seuil minimum pour utiliser un split chronologique sur le test set.
# En dessous, on retombe sur un split shuffled (cold-start).
MIN_REAL_FOR_CHRONO = 50

# Si total < ce seuil, on complète avec du synthétique pour avoir un volume
# d'entraînement raisonnable.
TARGET_TOTAL = 1500

MODEL_DIR = Path(__file__).resolve().parent.parent / "model"


# ─── Pipeline ─────────────────────────────────────────────────────────────────

def main(since: Optional[str] = None, target_total: int = TARGET_TOTAL) -> dict:
    real_df, meta = fetch_real_features(since=since)
    n_real = len(real_df)
    logger.info(f"Pull /training-data → {n_real} ligne(s) réelle(s) ; meta={meta}")

    # Tri chronologique des données réelles (clé pour le split)
    has_real_timestamps = False
    if n_real > 0 and "completed_at" in real_df.columns:
        if real_df["completed_at"].notna().any():
            real_df = real_df.sort_values("completed_at").reset_index(drop=True)
            has_real_timestamps = True

    # Complément synthétique pour atteindre TARGET_TOTAL
    n_to_synth = max(0, target_total - n_real)
    if n_to_synth > 0:
        logger.info(f"Complément synthétique : génération de {n_to_synth} lignes")
        synth_df = generer_dataset(n=n_to_synth)
        synth_df["source"] = "synthetic"
        synth_df["completed_at"] = pd.NaT
    else:
        synth_df = pd.DataFrame()

    # ── Split ──────────────────────────────────────────────────────────────────
    can_chrono = has_real_timestamps and n_real >= MIN_REAL_FOR_CHRONO
    if can_chrono:
        # Test set = les 20% les plus récents des transports RÉELS
        test_n = max(10, int(n_real * 0.2))
        real_train = real_df.iloc[:-test_n].copy()
        real_test  = real_df.iloc[-test_n:].copy()
        train_df = pd.concat([real_train, synth_df], ignore_index=True)
        test_df  = real_test
        split_strategy = "chronological_real"
        logger.info(f"Split chronologique : train={len(train_df)} (real={len(real_train)} + synth={len(synth_df)}), "
                    f"test={len(test_df)} (real récents)")
    else:
        combined = pd.concat([real_df, synth_df], ignore_index=True)
        rng = np.random.default_rng(42)
        idx = rng.permutation(len(combined))
        combined = combined.iloc[idx].reset_index(drop=True)
        test_n = max(20, int(len(combined) * 0.2))
        train_df = combined.iloc[:-test_n].copy()
        test_df  = combined.iloc[-test_n:].copy()
        split_strategy = "shuffled_cold_start" if n_real == 0 else "shuffled_low_real"
        logger.info(f"Split shuffled (real={n_real} < seuil chrono {MIN_REAL_FOR_CHRONO}) : "
                    f"train={len(train_df)} / test={len(test_df)}")

    # ── Preprocessing (même fonction pour train + test) ───────────────────────
    cols_to_drop = [c for c in ("completed_at", "source") if c in train_df.columns]
    train_proc = preprocess(train_df.drop(columns=cols_to_drop, errors="ignore"))
    test_proc  = preprocess(test_df.drop(columns=cols_to_drop, errors="ignore"))

    # Aligner les colonnes (au cas où des one-hot manquent côté test)
    for col in train_proc.columns:
        if col not in test_proc.columns:
            test_proc[col] = 0
    test_proc = test_proc[train_proc.columns]

    y_col = "duree_minutes"
    X_train = train_proc.drop(columns=[y_col])
    y_train = train_proc[y_col]
    X_test  = test_proc.drop(columns=[y_col])
    y_test  = test_proc[y_col]

    # ── Entraînement & benchmark ──────────────────────────────────────────────
    from sklearn.linear_model import LinearRegression
    from sklearn.ensemble import RandomForestRegressor
    from sklearn.metrics import (
        mean_absolute_error, r2_score, mean_squared_error,
        mean_absolute_percentage_error,
    )
    from xgboost import XGBRegressor
    import joblib

    candidates = {
        "Linear Regression": LinearRegression(),
        "Random Forest":     RandomForestRegressor(n_estimators=200, max_depth=12, random_state=42, n_jobs=-1),
        "XGBoost":           XGBRegressor(
            n_estimators=400, max_depth=6, learning_rate=0.05,
            subsample=0.8, colsample_bytree=0.8,
            random_state=42, verbosity=0, n_jobs=-1,
        ),
    }

    results = {}
    best_name, best_mae, best_model = None, float("inf"), None

    for name, mdl in candidates.items():
        mdl.fit(X_train, y_train)
        y_pred = mdl.predict(X_test)

        mae  = float(mean_absolute_error(y_test, y_pred))
        rmse = float(np.sqrt(mean_squared_error(y_test, y_pred)))
        r2   = float(r2_score(y_test, y_pred))
        mape = float(mean_absolute_percentage_error(y_test, y_pred))

        results[name] = {
            "MAE":  round(mae,  2),
            "RMSE": round(rmse, 2),
            "R2":   round(r2,   3),
            "MAPE": round(mape * 100, 1),
        }

        if mae < best_mae:
            best_mae, best_name, best_model = mae, name, mdl

    logger.info(f"Gagnant : {best_name} (MAE={best_mae:.2f} min)")

    # ── Sauvegarde modèle + features ──────────────────────────────────────────
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    model_path    = MODEL_DIR / "duration_model.pkl"
    features_path = MODEL_DIR / "duration_model_features.json"
    metrics_path  = MODEL_DIR / "metrics.json"

    joblib.dump(best_model, model_path)
    with features_path.open("w", encoding="utf-8") as f:
        json.dump(X_train.columns.tolist(), f, indent=2)

    # ── Metrics honnêtes ──────────────────────────────────────────────────────
    n_synth = len(synth_df)
    metrics = {
        "modeles":       results,
        "gagnant":       best_name,
        "meilleur_mae":  round(best_mae, 2),
        "data_composition": {
            "real":      int(n_real),
            "synthetic": int(n_synth),
            "train_n":   int(len(X_train)),
            "test_n":    int(len(X_test)),
        },
        "split_strategy": split_strategy,
        "trained_at":     datetime.now(timezone.utc).isoformat(),
    }
    if n_real < MIN_REAL_FOR_TRUST:
        metrics["warning"] = (
            f"Modèle entraîné majoritairement sur données synthétiques "
            f"(real={n_real} < seuil {MIN_REAL_FOR_TRUST}) — métriques à "
            f"interpréter avec prudence tant qu'on n'a pas accumulé assez "
            f"de transports terminés réels."
        )

    with metrics_path.open("w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2, ensure_ascii=False)

    # SHAP plots — best-effort
    try:
        import shap
        explainer = shap.TreeExplainer(best_model)
        shap_vals = explainer.shap_values(X_test)
        _save_shap_plots(X_test, shap_vals)
    except Exception as e:
        logger.warning(f"SHAP plots non générés : {e}")

    return metrics


def _save_shap_plots(X_test, shap_vals) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import shap

    shap.summary_plot(shap_vals, X_test, show=False)
    plt.savefig(MODEL_DIR / "shap_summary.png", bbox_inches="tight", dpi=100)
    plt.close()

    shap.summary_plot(shap_vals, X_test, plot_type="bar", show=False)
    plt.savefig(MODEL_DIR / "shap_importance.png", bbox_inches="tight", dpi=100)
    plt.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--since", default=None, help="Date ISO (YYYY-MM-DD) pour filtrer les transports réels")
    parser.add_argument("--target-total", type=int, default=TARGET_TOTAL,
                        help="Volume total visé après complément synthétique")
    args = parser.parse_args()

    out = main(since=args.since, target_total=args.target_total)
    print(json.dumps(out, indent=2, ensure_ascii=False))
    sys.exit(0)
