"""
BlancBleu — Service de Scoring Dispatch v2.0
Recommandation véhicule + chauffeur — scoring multicritère explicable

Algorithme : scoring pondéré sur 7 critères (score final 0-100)
Chaque critère est noté 0-100, puis pondéré selon DEFAULT_SCORING_WEIGHTS.

    Score final = Σ (poids_critère × score_critère)   [total des poids = 1.0]

Critères :
  A. distance          (0.25) — proximité GPS véhicule → patient
  B. driverAvailability (0.20) — disponibilité du chauffeur
  C. vehicleTypeMatch  (0.20) — compatibilité type véhicule / mobilité
  D. planningLoad      (0.15) — charge de planning du véhicule/chauffeur
  E. traffic           (0.10) — estimation du trafic selon l'heure
  F. medicalPriority   (0.05) — priorité médicale du transport
  G. punctualityHistory (0.05) — historique de ponctualité du chauffeur

L'IA ne prend jamais la décision finale — le dispatcher garde le contrôle.
"""

import logging
import math
from datetime import datetime
from typing import List, Optional, Dict, Tuple

from schemas.dispatch_schemas import (
    DispatchRequest, DispatchResponse,
    RecommandationIA, CandidatExclu, CriteriaScores,
    ScoreDetail, SummaryDispatch,
)

logger = logging.getLogger("blancbleu.ai.dispatch")

# ── Poids configurables (somme = 1.0) ─────────────────────────────────────────
DEFAULT_SCORING_WEIGHTS: Dict[str, float] = {
    "distance":           0.25,
    "driverAvailability": 0.20,
    "vehicleTypeMatch":   0.20,
    "planningLoad":       0.15,
    "traffic":            0.10,
    "medicalPriority":    0.05,
    "punctualityHistory": 0.05,
}

# ── Labels de recommandation selon le score ────────────────────────────────────
def _label(score: int) -> str:
    if score >= 80: return "Meilleur choix"
    if score >= 65: return "Bon choix"
    if score >= 50: return "Choix acceptable"
    return "Choix risqué"

# ── Matrice de compatibilité mobilité → type véhicule ─────────────────────────
# Scores 0-100 (0 = incompatible → exclu)
COMPATIBILITE_MOBILITE: Dict[str, Dict[str, int]] = {
    "ASSIS": {
        "VSL":       100,  # Optimal
        "TPMR":       85,  # Compatible, légèrement sur-équipé
        "AMBULANCE":  60,  # Compatible mais coûteux
    },
    "FAUTEUIL_ROULANT": {
        "TPMR":      100,  # Optimal : TPMR = Transport Personnes à Mobilité Réduite
        "AMBULANCE":  50,  # Compatible si rampe disponible
        "VSL":         0,  # Incompatible
    },
    "ALLONGE": {
        "AMBULANCE": 100,  # Obligatoire
        "TPMR":        0,  # Incompatible
        "VSL":         0,  # Incompatible
    },
    "CIVIERE": {
        "AMBULANCE": 100,  # Seul compatible
        "TPMR":        0,
        "VSL":         0,
    },
}

HEURES_POINTE = {7, 8, 9, 17, 18, 19}


# ════════════════════════════════════════════════════════════════════════════════
# FONCTION PRINCIPALE
# ════════════════════════════════════════════════════════════════════════════════

def recommander(request: DispatchRequest) -> DispatchResponse:
    """
    Évalue tous les véhicules disponibles et retourne un classement complet
    avec scores détaillés et explications en français.
    """
    transport = request.transport
    vehicules  = request.vehicules
    chauffeurs = request.chauffeurs
    now_str    = datetime.utcnow().isoformat() + "Z"

    mobilite = transport.mobilite.value if hasattr(transport.mobilite, "value") else transport.mobilite
    heure_depart = _parse_heure(transport.heureDepart)

    logger.info(
        f"Dispatch scoring v2 — mobilité: {mobilite}, "
        f"véhicules candidats: {len(vehicules)}, chauffeurs: {len(chauffeurs)}"
    )

    candidats: List[RecommandationIA] = []
    exclus: List[CandidatExclu] = []

    for vehicule in vehicules:
        scores, raison_exclusion = _calculer_scores(transport, vehicule, chauffeurs, heure_depart, mobilite)

        if raison_exclusion:
            exclus.append(CandidatExclu(
                vehiculeId=vehicule.id or "",
                immatriculation=vehicule.immatriculation,
                raison=raison_exclusion,
            ))
            continue

        final_score = _score_pondere(scores)
        explanation, risks, warnings = _construire_explications(transport, vehicule, scores, chauffeurs, mobilite)
        chauffeur_associe = _trouver_meilleur_chauffeur(vehicule, chauffeurs)
        eta = _estimer_eta(vehicule, transport)

        # Score legacy pour rétrocompatibilité
        score_legacy = _to_legacy_score(scores)

        rec = RecommandationIA(
            vehiculeId     = vehicule.id or "",
            vehiculeName   = vehicule.nom or vehicule.immatriculation,
            vehiculeType   = vehicule.type.value if hasattr(vehicule.type, "value") else vehicule.type,
            driverId       = chauffeur_associe.id if chauffeur_associe else None,
            driverName     = f"{chauffeur_associe.prenom} {chauffeur_associe.nom}" if chauffeur_associe else None,
            finalScore     = final_score,
            rank           = 0,  # sera assigné après tri
            recommendationLabel = _label(final_score),
            criteriaScores = CriteriaScores(**scores),
            explanation    = explanation,
            risks          = risks,
            warnings       = warnings,
            etaMinutes     = eta,
            # backward compat
            immatriculation = vehicule.immatriculation,
            type            = vehicule.type.value if hasattr(vehicule.type, "value") else vehicule.type,
            score           = final_score,
            scoreDetail     = score_legacy,
            justification   = explanation,
        )
        candidats.append(rec)

    # Tri par score décroissant + assignation des rangs
    candidats.sort(key=lambda c: c.finalScore, reverse=True)
    for i, c in enumerate(candidats):
        c.rank = i + 1

    summary = SummaryDispatch(
        totalCandidates   = len(vehicules),
        eligibleCandidates = len(candidats),
        excludedCandidates = len(exclus),
    )

    if not candidats:
        logger.warning(f"Aucun véhicule éligible pour mobilité {mobilite}")
        return DispatchResponse(
            success          = False,
            transportId      = transport.id,
            generatedAt      = now_str,
            weights          = DEFAULT_SCORING_WEIGHTS,
            recommendations  = [],
            bestRecommendation = None,
            excludedCandidates = exclus,
            summary          = summary,
            message          = f"Aucun véhicule compatible avec mobilité {mobilite}",
            suggestions      = [
                "Reprogrammer le transport à une heure de faible charge",
                "Libérer un véhicule actuellement en mission",
                f"Vérifier la disponibilité de véhicules {mobilite.replace('_',' ').lower()}",
            ],
            recommandation   = None,
            alternatives     = [],
            source           = "ia",
        )

    best = candidats[0]
    logger.info(
        f"Meilleur candidat : {best.immatriculation} "
        f"(score {best.finalScore}/100, label={best.recommendationLabel})"
    )

    return DispatchResponse(
        success            = True,
        transportId        = transport.id,
        generatedAt        = now_str,
        weights            = DEFAULT_SCORING_WEIGHTS,
        recommendations    = candidats,
        bestRecommendation = best,
        excludedCandidates = exclus,
        summary            = summary,
        message            = None,
        recommandation     = best,
        alternatives       = candidats[1:4],
        source             = "ia",
    )


# ════════════════════════════════════════════════════════════════════════════════
# CALCUL DES CRITÈRES
# ════════════════════════════════════════════════════════════════════════════════

def _calculer_scores(
    transport, vehicule, chauffeurs: list, heure_depart: Optional[int], mobilite: str
) -> Tuple[Dict[str, int], Optional[str]]:
    """
    Calcule les 7 scores (0-100 chacun).
    Retourne (dict_scores, raison_exclusion) — raison_exclusion non None → véhicule exclu.
    """
    scores: Dict[str, int] = {}

    # ── A. Compatibilité type véhicule (→ exclusion si 0) ─────────────────────
    type_v = vehicule.type.value if hasattr(vehicule.type, "value") else vehicule.type
    score_compat = COMPATIBILITE_MOBILITE.get(mobilite, {}).get(type_v, 0)

    # Malus oxygène requis mais absent
    if transport.oxygene and not vehicule.capacites.oxygene:
        if mobilite in ("ALLONGE", "CIVIERE"):
            return {}, f"Oxygène requis mais véhicule {vehicule.immatriculation} non équipé"
        score_compat = max(score_compat - 25, 0)
    elif transport.oxygene and vehicule.capacites.oxygene:
        score_compat = min(score_compat + 5, 100)

    if transport.brancardage and vehicule.capacites.brancard:
        score_compat = min(score_compat + 3, 100)

    if score_compat == 0:
        return {}, f"Type {type_v} incompatible avec mobilité {mobilite}"

    scores["vehicleTypeMatch"] = score_compat

    # ── B. Disponibilité chauffeur (0-100) ────────────────────────────────────
    scores["driverAvailability"] = _score_disponibilite_chauffeur(vehicule, chauffeurs)

    # ── C. Distance / proximité GPS (0-100) ───────────────────────────────────
    scores["distance"] = _score_distance(vehicule, transport)

    # ── D. Charge de planning (0-100) ────────────────────────────────────────
    scores["planningLoad"] = _score_charge_planning(vehicule)

    # ── E. Trafic estimé (0-100) ─────────────────────────────────────────────
    scores["traffic"] = _score_trafic(heure_depart)

    # ── F. Priorité médicale (0-100) ─────────────────────────────────────────
    scores["medicalPriority"] = _score_priorite_medicale(transport, vehicule)

    # ── G. Historique ponctualité (0-100) ────────────────────────────────────
    scores["punctualityHistory"] = _score_ponctualite(vehicule, chauffeurs)

    return scores, None


def _score_disponibilite_chauffeur(vehicule, chauffeurs: list) -> int:
    """
    100 si véhicule disponible ET chauffeur associé disponible.
    50 si véhicule disponible mais pas de chauffeur trouvé.
    0 si véhicule indisponible.
    """
    if vehicule.statut.lower() not in ("disponible",):
        return 0

    if not chauffeurs:
        return 60  # neutre si aucun chauffeur fourni

    # Chercher un chauffeur compatible (via immat ou premier disponible)
    disponibles = [c for c in chauffeurs if c.statut.lower() == "disponible"]
    if not disponibles:
        return 40  # véhicule dispo mais tous chauffeurs occupés
    return 100


def _score_distance(vehicule, transport) -> int:
    """
    Score basé sur la distance haversine véhicule → point de prise en charge.
    < 2 km → 100 pts   |   2-5 km → 80   |   5-10 km → 60
    10-20 km → 40      |   > 20 km → 20   |   inconnu → 50
    """
    if not vehicule.position or not vehicule.position.lat:
        return 50
    if not transport.positionDepart or not transport.positionDepart.lat:
        return 50

    dist = _haversine(
        vehicule.position.lat, vehicule.position.lng,
        transport.positionDepart.lat, transport.positionDepart.lng,
    )

    if dist < 2:   return 100
    if dist < 5:   return 80
    if dist < 10:  return 60
    if dist < 20:  return 40
    return 20


def _score_charge_planning(vehicule) -> int:
    """
    Score basé sur le nombre de transports déjà assignés dans la journée.
    0 mission → 100 | 1-3 → 80 | 4-6 → 50 | >6 → 20 | inconnu → 60
    Peut aussi utiliser chargeScore pré-calculé côté Node (0-100).
    """
    if vehicule.chargeScore is not None:
        return int(vehicule.chargeScore)
    nb = vehicule.nbTransportsDuJour
    if nb is None:     return 60
    if nb == 0:        return 100
    if nb <= 3:        return 80
    if nb <= 6:        return 50
    return 20


def _score_trafic(heure: Optional[int]) -> int:
    """
    Estimation du trafic selon l'heure de départ.
    Heures de pointe (7-9h, 17-19h) → pénalité.
    """
    if heure is None:
        return 60  # neutre si heure inconnue
    if heure in HEURES_POINTE:
        return 40  # trafic dense
    if 6 <= heure <= 22:
        return 80  # heure normale
    return 90  # nuit / très tôt → fluide


def _score_priorite_medicale(transport, vehicule) -> int:
    """
    Favorise les véhicules bien équipés pour les transports prioritaires.
    """
    prio = transport.prioriteMedicale
    if hasattr(prio, "value"):
        prio = prio.value

    if prio == "urgent":
        # Bonus si véhicule proche ET équipé
        bonus = 10 if vehicule.capacites.oxygene else 0
        return min(90 + bonus, 100)
    if prio == "prioritaire":
        return 85
    return 80  # transport standard


def _score_ponctualite(vehicule, chauffeurs: list) -> int:
    """
    Score basé sur la ponctualité historique du véhicule / chauffeur associé.
    ≥ 95% → 100 | ≥ 90% → 80 | ≥ 80% → 60 | ≥ 70% → 40 | < 70% → 20 | inconnu → 50
    """
    ponctualite = vehicule.ponctualite

    # Chercher le chauffeur associé pour sa ponctualité
    if ponctualite is None and chauffeurs:
        disponibles = [c for c in chauffeurs if c.statut.lower() == "disponible"]
        if disponibles and disponibles[0].ponctualite is not None:
            ponctualite = disponibles[0].ponctualite

    if ponctualite is None:
        return 50  # neutre si aucun historique

    if ponctualite >= 95:   return 100
    if ponctualite >= 90:   return 80
    if ponctualite >= 80:   return 60
    if ponctualite >= 70:   return 40
    return 20


# ════════════════════════════════════════════════════════════════════════════════
# SCORE PONDÉRÉ FINAL
# ════════════════════════════════════════════════════════════════════════════════

def _score_pondere(scores: Dict[str, int]) -> int:
    """
    Calcule le score final pondéré :
        Score = Σ (poids_critère × score_critère)

    Score final sur 100.
    """
    total = sum(
        DEFAULT_SCORING_WEIGHTS.get(critere, 0) * score
        for critere, score in scores.items()
    )
    return min(100, max(0, round(total)))


# ════════════════════════════════════════════════════════════════════════════════
# EXPLICATIONS EN FRANÇAIS
# ════════════════════════════════════════════════════════════════════════════════

def _construire_explications(
    transport, vehicule, scores: Dict[str, int], chauffeurs: list, mobilite: str
) -> Tuple[List[str], List[str], List[str]]:
    """Génère trois listes : explications positives, risques, avertissements."""
    explanation: List[str] = []
    risks: List[str]       = []
    warnings: List[str]    = []
    type_v = vehicule.type.value if hasattr(vehicule.type, "value") else vehicule.type

    # --- Type véhicule ---
    s_type = scores.get("vehicleTypeMatch", 0)
    if s_type >= 90:
        explanation.append(f"Type {type_v} optimal pour patient {_label_mobilite(mobilite)}")
    elif s_type >= 60:
        explanation.append(f"Type {type_v} compatible (non optimal) pour {_label_mobilite(mobilite)}")

    if transport.oxygene and vehicule.capacites.oxygene:
        explanation.append("Véhicule équipé oxygène — requis par le patient")
    elif transport.oxygene and not vehicule.capacites.oxygene:
        risks.append("Oxygène requis mais véhicule non équipé — vérifier avant dispatch")

    if transport.brancardage and vehicule.capacites.brancard:
        explanation.append("Véhicule équipé brancard — requis par le patient")

    # --- Disponibilité ---
    s_dispo = scores.get("driverAvailability", 0)
    if s_dispo == 100:
        explanation.append("Chauffeur disponible sur le créneau")
    elif s_dispo == 60:
        warnings.append("Aucun chauffeur fourni — vérifier l'affectation manuellement")
    elif s_dispo == 40:
        risks.append("Tous les chauffeurs sont occupés sur ce créneau")
    elif s_dispo == 0:
        risks.append("Véhicule non disponible — conflit de planning possible")

    # --- Distance ---
    s_dist = scores.get("distance", 50)
    if s_dist >= 80:
        if vehicule.position and vehicule.position.lat:
            dist = _haversine(
                vehicule.position.lat, vehicule.position.lng,
                transport.positionDepart.lat, transport.positionDepart.lng,
            ) if (transport.positionDepart and transport.positionDepart.lat) else None
            if dist is not None:
                explanation.append(f"Faible distance au patient ({dist:.1f} km)")
            else:
                explanation.append("Véhicule proche du lieu de prise en charge")
        else:
            explanation.append("Véhicule proche du lieu de prise en charge")
    elif s_dist <= 40:
        risks.append("Distance élevée — délai de prise en charge prolongé estimé")

    if s_dist == 50:
        warnings.append("Position GPS du véhicule inconnue — distance non calculable")

    # --- Charge planning ---
    s_charge = scores.get("planningLoad", 60)
    if s_charge >= 80:
        explanation.append("Charge de planning légère — véhicule peu sollicité")
    elif s_charge <= 40:
        risks.append("Charge de planning élevée — risque de retard ou de surcharge")

    # --- Trafic ---
    s_traffic = scores.get("traffic", 60)
    if s_traffic >= 80:
        explanation.append("Heure de départ hors pointe — trafic fluide estimé")
    elif s_traffic <= 40:
        risks.append("Heure de pointe estimée — trafic dense probable")
    elif s_traffic == 60:
        warnings.append("Heure de départ inconnue — estimation trafic non disponible")

    # --- Ponctualité ---
    s_ponc = scores.get("punctualityHistory", 50)
    if s_ponc >= 80:
        pct = vehicule.ponctualite
        if pct:
            explanation.append(f"Excellent historique de ponctualité ({pct:.0f}%)")
        else:
            explanation.append("Bon historique de ponctualité du chauffeur")
    elif s_ponc <= 40:
        risks.append("Historique de ponctualité insuffisant — surveiller les délais")
    elif s_ponc == 50:
        warnings.append("Pas d'historique de ponctualité disponible")

    return explanation, risks, warnings


def _label_mobilite(mobilite: str) -> str:
    MAP = {
        "ASSIS":            "assis (VSL)",
        "FAUTEUIL_ROULANT": "en fauteuil roulant (TPMR)",
        "ALLONGE":          "allongé (Ambulance)",
        "CIVIERE":          "sur civière (Ambulance)",
    }
    return MAP.get(mobilite, mobilite)


# ════════════════════════════════════════════════════════════════════════════════
# HELPERS
# ════════════════════════════════════════════════════════════════════════════════

def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance en km entre deux points GPS (formule Haversine)."""
    R = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (math.sin(d_lat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(d_lon / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))


def _parse_heure(heure_str: Optional[str]) -> Optional[int]:
    """Parse 'HH:MM' → heure entière, None si invalide."""
    if not heure_str:
        return None
    try:
        return int(heure_str.split(":")[0])
    except (ValueError, IndexError):
        return None


def _estimer_eta(vehicule, transport) -> Optional[int]:
    """ETA en minutes : distance haversine / 30 km·h (urbain)."""
    if not vehicule.position or not vehicule.position.lat:
        return None
    if not transport.positionDepart or not transport.positionDepart.lat:
        return None
    dist = _haversine(
        vehicule.position.lat, vehicule.position.lng,
        transport.positionDepart.lat, transport.positionDepart.lng,
    )
    return max(1, round(dist / 30 * 60))


def _trouver_meilleur_chauffeur(vehicule, chauffeurs: list):
    """Retourne le meilleur chauffeur disponible pour ce véhicule."""
    disponibles = [c for c in chauffeurs if c.statut.lower() == "disponible"]
    if not disponibles:
        return None
    # Trier par ponctualité décroissante
    return sorted(disponibles, key=lambda c: c.ponctualite or 0, reverse=True)[0]


def _to_legacy_score(scores: Dict[str, int]) -> ScoreDetail:
    """Convertit les scores v2 → format legacy ScoreDetail (pour rétrocompatibilité)."""
    # Mapping approximatif : adapte les plages 0-100 aux plages v1
    return ScoreDetail(
        compatibiliteMobilite = int(scores.get("vehicleTypeMatch", 0) * 0.4),
        disponibilite         = int(scores.get("driverAvailability", 0) * 0.2),
        proximite             = int(scores.get("distance", 0) * 0.2),
        chargeTravail         = int(scores.get("planningLoad", 0) * 0.1),
        fiabilite             = int(scores.get("punctualityHistory", 0) * 0.1),
        total                 = _score_pondere(scores),
    )
