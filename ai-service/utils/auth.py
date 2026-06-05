"""
BlancBleu — Authentification service-to-service du microservice IA.

Garde unique (dépendance FastAPI) appliquée à tous les routers métier.
Le secret est partagé avec le backend Node via l'env AI_SERVICE_TOKEN ;
le header transporté est X-Service-Token.
"""

import hmac
import os

from fastapi import Header, HTTPException


def require_service_token(x_service_token: str | None = Header(default=None)) -> None:
    """Garde service-to-service. 503 si le token n'est pas configuré côté IA,
    401 s'il est absent/incorrect. Comparaison à temps constant."""
    expected = os.getenv("AI_SERVICE_TOKEN")
    if not expected:
        raise HTTPException(status_code=503, detail="AI_SERVICE_TOKEN non configuré côté IA")
    if not x_service_token or not hmac.compare_digest(x_service_token, expected):
        raise HTTPException(status_code=401, detail="Service token invalide ou manquant")
