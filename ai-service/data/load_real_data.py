"""
BlancBleu — Loader des features réelles depuis l'API Node.

Pull GET /api/ai/training-data?since=...&limit=... avec X-Service-Token.
Renvoie un DataFrame normalisé au schéma attendu par generate_dataset.preprocess :
    distance_km, heure_depart, jour_semaine, mobilite, type_vehicule,
    type_etablissement, motif, aller_retour, nb_patients,
    experience_chauffeur, duree_minutes

Les colonnes absentes du dataset réel (type_etablissement, nb_patients,
experience_chauffeur) sont remplies avec des valeurs neutres.
"""

import os
import logging
from typing import Optional, Tuple

import pandas as pd

logger = logging.getLogger("blancbleu.ai.load_real_data")

# Champs absents du TransportFeature → valeurs neutres pour rester compatible
# avec le preprocessing existant.
_DEFAULTS = {
    "type_etablissement":   "hopital_public",
    "nb_patients":          1,
    "experience_chauffeur": 0.5,
}


def fetch_real_features(
    since: Optional[str] = None,
    limit: int = 10_000,
    timeout: float = 30.0,
) -> Tuple[pd.DataFrame, dict]:
    """
    Récupère les TransportFeature réelles depuis le backend Node.

    Returns:
        (df, meta) où meta = { "count": int, "warning": Optional[str] }
        df : DataFrame au schéma synthétique (utilisable directement par preprocess).

    En cas d'erreur réseau / auth, renvoie (DataFrame vide, meta avec erreur).
    """
    import httpx

    base  = os.getenv("NODE_API_URL", "http://localhost:5000")
    token = os.getenv("AI_SERVICE_TOKEN", "")

    if not token:
        logger.warning("AI_SERVICE_TOKEN absent — pull skipped")
        return pd.DataFrame(), {"count": 0, "error": "no_token"}

    params = {"limit": limit}
    if since:
        params["since"] = since

    try:
        r = httpx.get(
            f"{base}/api/ai/training-data",
            params=params,
            headers={"X-Service-Token": token},
            timeout=timeout,
        )
        r.raise_for_status()
    except Exception as e:
        logger.warning(f"Pull /training-data échoué : {e}")
        return pd.DataFrame(), {"count": 0, "error": str(e)}

    data = r.json()
    features = data.get("features", [])
    count    = int(data.get("count", 0))
    warning  = data.get("warning")

    if not features:
        return pd.DataFrame(), {"count": count, "warning": warning}

    return _normalize_to_synthetic_schema(features), {"count": count, "warning": warning}


def _normalize_to_synthetic_schema(features: list[dict]) -> pd.DataFrame:
    """Mappe le JSON de l'API (camelCase + champs partiels) au schéma synthétique."""
    rows = []
    for f in features:
        rows.append({
            "distance_km":          float(f.get("distanceKm", 0.0)),
            "heure_depart":         int(f.get("heureDepart", 8)),
            "jour_semaine":         int(f.get("jourSemaine", 0)),
            "mobilite":             f.get("mobilite") or "ASSIS",
            "type_vehicule":        f.get("typeVehicule") or "VSL",
            "type_etablissement":   _DEFAULTS["type_etablissement"],
            "motif":                _map_motif(f.get("motif")),
            "aller_retour":         1 if f.get("allerRetour") else 0,
            "nb_patients":          _DEFAULTS["nb_patients"],
            "experience_chauffeur": _DEFAULTS["experience_chauffeur"],
            "duree_minutes":        float(f.get("dureeReelleMinutes", 0.0)),
            # Méta — non utilisé par le modèle mais utile pour le split chronologique
            "completed_at":         f.get("completedAt"),
            "source":               f.get("source", "real"),
        })
    df = pd.DataFrame(rows)
    if "completed_at" in df.columns:
        df["completed_at"] = pd.to_datetime(df["completed_at"], errors="coerce", utc=True)
    return df


def _map_motif(m: Optional[str]) -> str:
    """Mappe le motif Node vers la liste fermée du modèle synthétique."""
    if not m:
        return "Consultation"
    table = {
        "Dialyse": "Dialyse",
        "Chimiothérapie": "Chimiotherapie",
        "Chimiotherapie":  "Chimiotherapie",
        "Radiothérapie":   "Consultation",   # repli
        "Consultation":    "Consultation",
        "Hospitalisation": "Hospitalisation",
        "Sortie hospitalisation": "Hospitalisation",
        "Rééducation":     "Consultation",
        "Analyse":         "Consultation",
        "Autre":           "Consultation",
    }
    return table.get(m, "Consultation")
