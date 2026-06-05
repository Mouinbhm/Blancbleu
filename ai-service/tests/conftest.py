"""
BlancBleu — Configuration pytest partagée (microservice IA).

Définit AI_SERVICE_TOKEN pour toute la session de test : le guard
service-to-service (utils.auth.require_service_token) est ainsi "configuré"
(jamais de 503 accidentel). Les fixtures TestClient envoient ce même token via
le header X-Service-Token ; les tests d'auth dédiés le manipulent explicitement.
"""

import os

# Token de test partagé — lu par le guard via os.getenv au moment de la requête.
TEST_SERVICE_TOKEN = "test-service-token"
os.environ.setdefault("AI_SERVICE_TOKEN", TEST_SERVICE_TOKEN)
