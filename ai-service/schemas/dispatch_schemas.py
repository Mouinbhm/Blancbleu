"""
Schémas Pydantic — Module Dispatch (recommandation véhicule/chauffeur)
"""

from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from enum import Enum


class MobilitePatient(str, Enum):
    ASSIS = "ASSIS"
    FAUTEUIL_ROULANT = "FAUTEUIL_ROULANT"
    ALLONGE = "ALLONGE"
    CIVIERE = "CIVIERE"


class TypeVehicule(str, Enum):
    VSL = "VSL"
    TPMR = "TPMR"
    AMBULANCE = "AMBULANCE"


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
    positionDepart: Optional[Position] = None  # coordonnées GPS du lieu de prise en charge
    dateTransport: Optional[str] = None
    heureDepart: Optional[str] = None
    oxygene: bool = False
    brancardage: bool = False


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
    position: Optional[Position] = None
    capacites: CapacitesVehicule = Field(default_factory=CapacitesVehicule)
    ponctualite: Optional[float] = None        # % de ponctualité historique
    nbTransportsDuJour: Optional[int] = None   # transports déjà effectués aujourd'hui


class ChauffeurDispatch(BaseModel):
    """Chauffeur candidat pour le dispatch."""
    model_config = ConfigDict(populate_by_name=True)

    id: Optional[str] = Field(default=None, alias="_id")
    nom: str
    prenom: str
    statut: str
    certifications: List[str] = []
    ponctualite: Optional[float] = None  # % de ponctualité historique


class DispatchRequest(BaseModel):
    transport: TransportDispatch
    vehicules: List[VehiculeDispatch]
    chauffeurs: List[ChauffeurDispatch] = []


class ScoreDetail(BaseModel):
    """Décomposition du score pour un candidat."""
    compatibiliteMobilite: int = Field(description="0-40 pts")
    disponibilite: int = Field(description="0-20 pts")
    proximite: int = Field(description="0-20 pts")
    chargeTravail: int = Field(description="0-10 pts")
    fiabilite: int = Field(description="0-10 pts")
    total: int = Field(description="0-100 pts")


class VehiculeRecommande(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    vehiculeId: str
    immatriculation: str
    type: TypeVehicule
    score: int = Field(..., ge=0, le=100)
    scoreDetail: ScoreDetail
    etaMinutes: Optional[int] = None
    justification: List[str]


class DispatchResponse(BaseModel):
    recommandation: Optional[VehiculeRecommande]
    alternatives: List[VehiculeRecommande] = []
    source: str = Field(description="'ia' | 'rules'")
    message: Optional[str] = None
