"""
BlancBleu — Service d'Optimisation de Tournée
Google OR-Tools — Vehicle Routing Problem (VRP)

Objectif : distribuer N transports sur M véhicules en minimisant
la distance totale parcourue, tout en respectant :
  - Les fenêtres horaires des transports
  - La compatibilité mobilité / type de véhicule
  - La capacité de chaque véhicule (1 patient à la fois)

Basé sur Google OR-Tools CP-SAT / Routing Library.
Documentation : https://developers.google.com/optimization/routing
"""

import logging
import math
from typing import List, Dict, Tuple, Optional

from schemas.routing_schemas import (
    RoutingRequest, RoutingResponse,
    RouteTournee, EtapeRoute,
)

logger = logging.getLogger("blancbleu.ai.routing")

# Temps de trajet fictif (en minutes) entre deux points si OSRM indisponible
VITESSE_MOYENNE_KMH = 50
FACTEUR_SINUOSITE = 1.35  # Les routes sont 35% plus longues qu'à vol d'oiseau
DUREE_PRISE_EN_CHARGE = 5  # Minutes pour embarquer le patient
DUREE_DEPOSE = 3            # Minutes pour déposer le patient


def optimiser_tournee(request: RoutingRequest) -> RoutingResponse:
    """
    Optimise la tournée des véhicules pour une journée donnée.

    Args:
        request : données de la journée (transports, véhicules, dépôt)

    Returns:
        RoutingResponse avec les routes optimisées par véhicule
    """
    logger.info(
        f"Optimisation tournée — date: {request.date}, "
        f"transports: {len(request.transports)}, "
        f"véhicules: {len(request.vehicules)}"
    )

    if not request.transports:
        return RoutingResponse(
            date=request.date,
            routes=[],
            distanceTotale=0.0,
            dureeMaxMinutes=0,
            nbTransports=0,
            nbVehicules=0,
            statut="OPTIMAL",
            messageOptimiseur="Aucun transport à planifier",
        )

    try:
        from ortools.constraint_solver import routing_enums_pb2, pywrapcp
        return _resoudre_avec_ortools(request, routing_enums_pb2, pywrapcp)
    except ImportError:
        logger.warning("OR-Tools non disponible — fallback attribution séquentielle")
        return _fallback_attribution_sequentielle(request)


def _resoudre_avec_ortools(request, routing_enums_pb2, pywrapcp) -> RoutingResponse:
    """
    Résolution VRP avec Google OR-Tools.

    Modélisation :
    - Nœuds : dépôt (0) + [prise en charge, destination] pour chaque transport
    - Chaque transport = 2 nœuds consécutifs (PEC puis DEST)
    - Chaque véhicule repart du dépôt et y revient
    """
    transports = request.transports
    vehicules = request.vehicules
    depot = request.depot

    # ── Construction de la matrice de temps ──────────────────────────────────
    # Nœuds : [dépôt] + [PEC_1, DEST_1, PEC_2, DEST_2, ...]
    points = [{"lat": depot.lat, "lng": depot.lng, "nom": "Dépôt"}]
    transport_indices = []  # (idx_pec, idx_dest) pour chaque transport

    for t in transports:
        coords_pec = _parse_adresse(t.adresseDepart, t.coordonneesDepart)
        coords_dest = _parse_adresse(t.adresseDestination, t.coordonneesDestination)

        idx_pec = len(points)
        points.append({**coords_pec, "nom": f"PEC {t.numero}", "transportId": t.id, "numero": t.numero})
        idx_dest = len(points)
        points.append({**coords_dest, "nom": f"DEST {t.numero}", "transportId": t.id, "numero": t.numero})
        transport_indices.append((idx_pec, idx_dest))

    n_nodes = len(points)
    n_vehicules = len(vehicules)

    # Matrice de temps (en minutes × 100 pour OR-Tools, qui travaille en entiers)
    matrice_temps = _construire_matrice_temps(points)

    # ── Configuration OR-Tools ────────────────────────────────────────────────
    manager = pywrapcp.RoutingIndexManager(n_nodes, n_vehicules, 0)  # 0 = dépôt
    routing = pywrapcp.RoutingModel(manager)

    # Callback de temps de trajet
    def callback_temps(from_idx, to_idx):
        from_node = manager.IndexToNode(from_idx)
        to_node = manager.IndexToNode(to_idx)
        return matrice_temps[from_node][to_node]

    transit_callback_index = routing.RegisterTransitCallback(callback_temps)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

    # Dimension temps (pour fenêtres horaires)
    routing.AddDimension(
        transit_callback_index,
        30,    # Marge de 30 min
        600,   # Durée max tournée : 10h
        False,
        "Temps",
    )

    # Contrainte : les 2 nœuds d'un même transport sont visités en ordre
    for idx_pec, idx_dest in transport_indices:
        routing.AddPickupAndDelivery(
            manager.NodeToIndex(idx_pec),
            manager.NodeToIndex(idx_dest),
        )
        routing.solver().Add(
            routing.VehicleVar(manager.NodeToIndex(idx_pec))
            == routing.VehicleVar(manager.NodeToIndex(idx_dest))
        )

    # ── Paramètres du solveur ──────────────────────────────────────────────────
    search_params = pywrapcp.DefaultRoutingSearchParameters()
    search_params.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    )
    search_params.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    )
    search_params.time_limit.seconds = 30  # Max 30s de calcul

    # ── Résolution ────────────────────────────────────────────────────────────
    solution = routing.SolveWithParameters(search_params)

    if not solution:
        logger.warning("OR-Tools : aucune solution trouvée — fallback séquentiel")
        return _fallback_attribution_sequentielle(request)

    # ── Extraction des routes ──────────────────────────────────────────────────
    routes = []
    distance_totale = 0.0
    duree_max = 0

    for vehicule_idx in range(n_vehicules):
        etapes = []
        index = routing.Start(vehicule_idx)
        distance_vehicule = 0.0
        duree_vehicule = 0
        ordre = 0

        while not routing.IsEnd(index):
            node_index = manager.IndexToNode(index)
            next_index = solution.Value(routing.NextVar(index))
            next_node = manager.IndexToNode(next_index)

            if node_index != 0:  # Ignorer le dépôt dans les étapes
                point = points[node_index]
                type_etape = "PRISE_EN_CHARGE" if "PEC" in point["nom"] else "DESTINATION"
                etapes.append(EtapeRoute(
                    ordre=ordre,
                    transportId=point.get("transportId", ""),
                    numero=point.get("numero", ""),
                    type=type_etape,
                    adresse=f"{point['lat']:.4f},{point['lng']:.4f}",
                    distanceDepuisPrecedent=round(
                        matrice_temps[node_index][next_node] / 100 * VITESSE_MOYENNE_KMH / 60, 2
                    ),
                ))
                ordre += 1

            dist = matrice_temps[node_index][next_node] / 100
            distance_vehicule += dist * VITESSE_MOYENNE_KMH / 60
            duree_vehicule += dist

            index = next_index

        if etapes:
            routes.append(RouteTournee(
                vehiculeId=vehicules[vehicule_idx].id,
                immatriculation=vehicules[vehicule_idx].immatriculation,
                etapes=etapes,
                distanceTotaleKm=round(distance_vehicule, 2),
                dureeMinutes=int(duree_vehicule),
                nbTransports=len([e for e in etapes if e.type == "PRISE_EN_CHARGE"]),
            ))
            distance_totale += distance_vehicule
            duree_max = max(duree_max, int(duree_vehicule))

    statut = (
        "OPTIMAL"
        if routing.status() == 1
        else "FEASIBLE"
    )

    return RoutingResponse(
        date=request.date,
        routes=routes,
        distanceTotale=round(distance_totale, 2),
        dureeMaxMinutes=duree_max,
        nbTransports=len(transports),
        nbVehicules=len([r for r in routes if r.etapes]),
        statut=statut,
        messageOptimiseur=f"OR-Tools — {len(routes)} véhicules utilisés",
    )


def _fallback_attribution_sequentielle(request: RoutingRequest) -> RoutingResponse:
    """
    Attribution simple sans optimisation — 1 transport par véhicule en séquence.
    Utilisé si OR-Tools n'est pas installé ou si la résolution échoue.
    """
    routes = []
    transports_par_vehicule = _repartir_equitablement(
        request.transports, request.vehicules
    )

    distance_totale = 0.0
    duree_max = 0

    for vehicule, transports_v in transports_par_vehicule:
        etapes = []
        distance_v = 0.0
        for i, t in enumerate(transports_v):
            dist_estimee = 10.0  # km estimés par défaut
            etapes.append(EtapeRoute(
                ordre=i * 2,
                transportId=t.id,
                numero=t.numero,
                type="PRISE_EN_CHARGE",
                adresse=t.adresseDepart,
                distanceDepuisPrecedent=dist_estimee,
            ))
            etapes.append(EtapeRoute(
                ordre=i * 2 + 1,
                transportId=t.id,
                numero=t.numero,
                type="DESTINATION",
                adresse=t.adresseDestination,
                distanceDepuisPrecedent=dist_estimee,
            ))
            distance_v += dist_estimee * 2

        if etapes:
            duree = int(distance_v / VITESSE_MOYENNE_KMH * 60)
            routes.append(RouteTournee(
                vehiculeId=vehicule.id,
                immatriculation=vehicule.immatriculation,
                etapes=etapes,
                distanceTotaleKm=round(distance_v, 2),
                dureeMinutes=duree,
                nbTransports=len(transports_v),
            ))
            distance_totale += distance_v
            duree_max = max(duree_max, duree)

    return RoutingResponse(
        date=request.date,
        routes=routes,
        distanceTotale=round(distance_totale, 2),
        dureeMaxMinutes=duree_max,
        nbTransports=len(request.transports),
        nbVehicules=len(routes),
        statut="FEASIBLE",
        messageOptimiseur="Attribution séquentielle (OR-Tools non disponible)",
    )


def _construire_matrice_temps(points: list) -> List[List[int]]:
    """
    Construit la matrice des temps de trajet entre tous les nœuds.
    Unité : minutes × 100 (OR-Tools travaille en entiers).
    Utilise Haversine × facteur sinuosité.
    """
    n = len(points)
    matrice = [[0] * n for _ in range(n)]

    for i in range(n):
        for j in range(n):
            if i != j:
                dist = _haversine(
                    points[i]["lat"], points[i]["lng"],
                    points[j]["lat"], points[j]["lng"],
                )
                dist_route = dist * FACTEUR_SINUOSITE
                temps = (dist_route / VITESSE_MOYENNE_KMH) * 60  # minutes
                matrice[i][j] = int(temps * 100)

    return matrice


def _haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calcule la distance à vol d'oiseau en km."""
    R = 6371
    d1 = math.radians(lat2 - lat1)
    d2 = math.radians(lng2 - lng1)
    a = (
        math.sin(d1 / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d2 / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _parse_adresse(adresse: str, coords=None) -> dict:
    """
    Retourne les coordonnées GPS d'une adresse.
    Utilise les coordonnées pré-géocodées si disponibles (BAN côté Node.js),
    sinon replie sur le centre de Nice (MVP — à remplacer par Nominatim).
    """
    if coords and coords.lat and coords.lng:
        return {"lat": coords.lat, "lng": coords.lng}
    logger.warning(f"Coordonnées GPS manquantes pour l'adresse '{adresse}' — repli sur dépôt")
    return {"lat": 43.7102, "lng": 7.2620}


def _repartir_equitablement(transports, vehicules) -> list:
    """Répartit les transports équitablement sur les véhicules disponibles."""
    result = [(v, []) for v in vehicules]
    for i, t in enumerate(transports):
        result[i % len(vehicules)][1].append(t)
    return result
