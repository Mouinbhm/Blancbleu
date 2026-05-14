"""
Schémas Pydantic — Module Dispatch (recommandation véhicule/chauffeur)
Scoring multicritère explicable v2.0
"""

from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any
from enum import Enum
from datetime import datetime


class MobilitePatient(str, Enum):
    ASSIS = "ASSIS"
    FAUTEUIL_ROULANT = "FAUTEUIL_ROULANT"
    ALLONGE = "ALLONGE"
    CIVIERE = "CIVIERE"


class TypeVehicule(str, Enum):
    VSL = "VSL"
    TPMR = "TPMR"
    AMBULANCE = "AMBULANCE"


class PrioriteMedicale(str, Enum):
    NORMAL = "normal"
    PRIORITAIRE = "prioritaire"
    URGENT = "urgent"


class Position(BaseModel):
    lat: float
    lng: float


class TransportDispatch(BaseModel):
    """Informations du transport pour le dispatch."""
    model_config = ConfigDict(populate_by_name=True)

    id: Optional[str] = Field(default=None, alias="_id")
    motif: Optional[str] = None
    mobilite: MobilitePatient = MobilitePatient.ASSIS
    adresseDepart: Optional[str] = None
    adresseDestination: Optional[str] = None
    positionDepart: Optional[Position] = None
    dateTransport: Optional[str] = None
    heureDepart: Optional[str] = None
    oxygene: bool = False
    brancardage: bool = False
    prioriteMedicale: PrioriteMedicale = PrioriteMedicale.NORMAL
    # Charge planning enrichie (envoyée depuis Node.js)
    requiredVehicleType: Optional[str] = None


class CapacitesVehicule(BaseModel):
    fauteuil: bool = False
    oxygene: bool = False
    brancard: bool = False


class VehiculeDispatch(BaseModel):
    """Véhicule candidat pour le dispatch."""
    model_config = ConfigDict(populate_by_name=True)

    id: Optional[str] = Field(default=None, alias="_id")
    immatriculation: str
    type: TypeVehicule
    statut: str
    nom: Optional[str] = None
    position: Optional[Position] = None
    capacites: CapacitesVehicule = Field(default_factory=CapacitesVehicule)
    ponctualite: Optional[float] = None       # % ponctualité historique (0-100)
    nbTransportsDuJour: Optional[int] = None  # transports déjà effectués aujourd'hui
    chargeScore: Optional[float] = None       # score charge planning (0-100, calculé côté Node)


class ChauffeurDispatch(BaseModel):
    """Chauffeur candidat pour le dispatch."""
    model_config = ConfigDict(populate_by_name=True)

    id: Optional[str] = Field(default=None, alias="_id")
    nom: str
    prenom: str
    statut: str
    certifications: List[str] = []
    ponctualite: Optional[float] = None  # % ponctualité historique (0-100)
    nbTransportsDuJour: Optional[int] = None


class DispatchRequest(BaseModel):
    transport: TransportDispatch
    vehicules: List[VehiculeDispatch]
    chauffeurs: List[ChauffeurDispatch] = []


# ── Schemas de scoring détaillé ───────────────────────────────────────────────

class ScoreDetail(BaseModel):
    """Décomposition du score (format legacy — maintenu pour rétrocompatibilité)."""
    compatibiliteMobilite: int = Field(description="0-40 pts")
    disponibilite: int = Field(description="0-20 pts")
    proximite: int = Field(description="0-20 pts")
    chargeTravail: int = Field(description="0-10 pts")
    fiabilite: int = Field(description="0-10 pts")
    total: int = Field(description="0-100 pts")


class CriteriaScores(BaseModel):
    """Scores détaillés par critère (0-100 chacun) — scoring v2."""
    distance: int = Field(ge=0, le=100, description="Proximité GPS véhicule→patient")
    driverAvailability: int = Field(ge=0, le=100, description="Disponibilité chauffeur")
    vehicleTypeMatch: int = Field(ge=0, le=100, description="Compatibilité type véhicule")
    planningLoad: int = Field(ge=0, le=100, description="Charge de planning")
    traffic: int = Field(ge=0, le=100, description="Estimation trafic")
    medicalPriority: int = Field(ge=0, le=100, description="Priorité médicale")
    punctualityHistory: int = Field(ge=0, le=100, description="Historique ponctualité")


class CandidatExclu(BaseModel):
    """Véhicule ou chauffeur exclu du scoring avec raison."""
    vehiculeId: str
    immatriculation: str
    raison: str


class RecommandationIA(BaseModel):
    """Recommandation enrichie et explicable — format v2."""
    vehiculeId: str
    vehiculeName: str
    vehiculeType: str
    driverId: Optional[str] = None
    driverName: Optional[str] = None
    finalScore: int = Field(ge=0, le=100)
    rank: int
    recommendationLabel: str  # "Meilleur choix" | "Bon choix" | "Choix acceptable" | "Choix risqué"
    criteriaScores: CriteriaScores
    explanation: List[str]   # raisons positives
    risks: List[str]          # risques identifiés
    warnings: List[str]       # avertissements (données manquantes, etc.)
    etaMinutes: Optional[int] = None
    # ── Backward compat avec format v1 ───────────────────────────────────────
    immatriculation: str = ""
    type: str = ""
    score: int = 0
    scoreDetail: Optional[ScoreDetail] = None
    justification: List[str] = []


class SummaryDispatch(BaseModel):
    totalCandidates: int
    eligibleCandidates: int
    excludedCandidates: int


class DispatchResponse(BaseModel):
    """Réponse du service dispatch — format v2 enrichi."""
    success: bool
    transportId: Optional[str] = None
    generatedAt: str
    weights: Dict[str, float]
    recommendations: List[RecommandationIA] = []
    bestRecommendation: Optional[RecommandationIA] = None
    excludedCandidates: List[CandidatExclu] = []
    summary: SummaryDispatch
    message: Optional[str] = None
    suggestions: List[str] = []
    # ── Backward compat v1 ────────────────────────────────────────────────────
    recommandation: Optional[RecommandationIA] = None
    alternatives: List[RecommandationIA] = []
    source: str = "ia"


class VehiculeRecommande(BaseModel):
    """Format legacy — maintenu pour rétrocompatibilité."""
    model_config = ConfigDict(populate_by_name=True)

    vehiculeId: str
    immatriculation: str
    type: TypeVehicule
    score: int = Field(..., ge=0, le=100)
    scoreDetail: ScoreDetail
    etaMinutes: Optional[int] = None
    justification: List[str]
