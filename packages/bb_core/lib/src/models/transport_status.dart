/// Enum exhaustif des 19 statuts de transport gérés par le backend.
///
/// Source de vérité : `server/services/transportStateMachine.js`. Synchroniser
/// à la main si un nouveau statut est ajouté côté serveur.
library;

import 'package:json_annotation/json_annotation.dart';

enum TransportStatus {
  @JsonValue('REQUESTED')              requested,
  @JsonValue('CONFIRMED')              confirmed,
  @JsonValue('SCHEDULED')              scheduled,
  @JsonValue('ASSIGNED')               assigned,
  @JsonValue('DRIVER_ACCEPTED')        driverAccepted,
  @JsonValue('DRIVER_REJECTED')        driverRejected,
  @JsonValue('EN_ROUTE_TO_PICKUP')     enRouteToPickup,
  @JsonValue('ARRIVED_AT_PICKUP')      arrivedAtPickup,
  @JsonValue('PATIENT_ON_BOARD')       patientOnBoard,
  @JsonValue('ARRIVED_AT_DESTINATION') arrivedAtDestination,
  @JsonValue('WAITING_AT_DESTINATION') waitingAtDestination,
  @JsonValue('RETURN_TO_BASE')         returnToBase,
  @JsonValue('COMPLETED')              completed,
  @JsonValue('BILLING_PENDING')        billingPending,
  @JsonValue('BILLED')                 billed,
  @JsonValue('PAID')                   paid,
  @JsonValue('CANCELLED')              cancelled,
  @JsonValue('NO_SHOW')                noShow,
  @JsonValue('RESCHEDULED')            rescheduled,
  @JsonValue('FAILED')                 failed,
  /// Valeur de secours pour les statuts inconnus arrivant du serveur après
  /// déploiement d'une nouvelle version (graceful degradation).
  @JsonValue('UNKNOWN')                unknown;

  /// Code court envoyé sur le wire (ex. `EN_ROUTE_TO_PICKUP`).
  String get wireValue => switch (this) {
    TransportStatus.requested            => 'REQUESTED',
    TransportStatus.confirmed            => 'CONFIRMED',
    TransportStatus.scheduled            => 'SCHEDULED',
    TransportStatus.assigned             => 'ASSIGNED',
    TransportStatus.driverAccepted       => 'DRIVER_ACCEPTED',
    TransportStatus.driverRejected       => 'DRIVER_REJECTED',
    TransportStatus.enRouteToPickup      => 'EN_ROUTE_TO_PICKUP',
    TransportStatus.arrivedAtPickup      => 'ARRIVED_AT_PICKUP',
    TransportStatus.patientOnBoard       => 'PATIENT_ON_BOARD',
    TransportStatus.arrivedAtDestination => 'ARRIVED_AT_DESTINATION',
    TransportStatus.waitingAtDestination => 'WAITING_AT_DESTINATION',
    TransportStatus.returnToBase         => 'RETURN_TO_BASE',
    TransportStatus.completed            => 'COMPLETED',
    TransportStatus.billingPending       => 'BILLING_PENDING',
    TransportStatus.billed               => 'BILLED',
    TransportStatus.paid                 => 'PAID',
    TransportStatus.cancelled            => 'CANCELLED',
    TransportStatus.noShow               => 'NO_SHOW',
    TransportStatus.rescheduled          => 'RESCHEDULED',
    TransportStatus.failed               => 'FAILED',
    TransportStatus.unknown              => 'UNKNOWN',
  };

  /// Le transport est-il dans un état final ? (Plus de transition possible.)
  bool get isTerminal => switch (this) {
    TransportStatus.completed ||
    TransportStatus.cancelled ||
    TransportStatus.noShow ||
    TransportStatus.failed ||
    TransportStatus.paid => true,
    _ => false,
  };

  /// Le transport est-il "actif" du point de vue du chauffeur ? Utilisé pour
  /// router le GPS vers la room transport:{id} (Sprint M1 étape 5).
  bool get isActive => switch (this) {
    TransportStatus.enRouteToPickup ||
    TransportStatus.arrivedAtPickup ||
    TransportStatus.patientOnBoard ||
    TransportStatus.arrivedAtDestination ||
    TransportStatus.waitingAtDestination ||
    TransportStatus.returnToBase => true,
    _ => false,
  };

  /// Libellé FR pour l'UI patient / dispatcher.
  String get label => switch (this) {
    TransportStatus.requested            => 'Demande reçue',
    TransportStatus.confirmed            => 'Transport confirmé',
    TransportStatus.scheduled            => 'Transport planifié',
    TransportStatus.assigned             => 'Véhicule assigné',
    TransportStatus.driverAccepted       => 'Mission acceptée',
    TransportStatus.driverRejected       => 'Mission refusée',
    TransportStatus.enRouteToPickup      => 'En route vers le patient',
    TransportStatus.arrivedAtPickup      => 'Arrivé chez le patient',
    TransportStatus.patientOnBoard       => 'Patient pris en charge',
    TransportStatus.arrivedAtDestination => 'Arrivé à destination',
    TransportStatus.waitingAtDestination => 'En attente à destination',
    TransportStatus.returnToBase         => 'Retour base',
    TransportStatus.completed            => 'Transport terminé',
    TransportStatus.billingPending       => 'Facturation en cours',
    TransportStatus.billed               => 'Facturé CPAM',
    TransportStatus.paid                 => 'Paiement reçu',
    TransportStatus.cancelled            => 'Annulé',
    TransportStatus.noShow               => 'Patient absent',
    TransportStatus.rescheduled          => 'Reprogrammé',
    TransportStatus.failed               => 'Échec',
    TransportStatus.unknown              => 'Inconnu',
  };

  /// Pourcentage de progression pour les UI timeline (0-100). null si le
  /// statut n'est pas sur le chemin nominal.
  int? get progressionPercent => switch (this) {
    TransportStatus.requested            => 0,
    TransportStatus.confirmed            => 10,
    TransportStatus.scheduled            => 20,
    TransportStatus.assigned             => 30,
    TransportStatus.driverAccepted       => 35,
    TransportStatus.enRouteToPickup      => 45,
    TransportStatus.arrivedAtPickup      => 55,
    TransportStatus.patientOnBoard       => 65,
    TransportStatus.arrivedAtDestination => 80,
    TransportStatus.waitingAtDestination => 85,
    TransportStatus.returnToBase         => 90,
    TransportStatus.completed            => 100,
    _ => null,
  };

  /// Parse une chaîne brute (du serveur) en TransportStatus. Retourne
  /// `TransportStatus.unknown` si la valeur n'est pas reconnue (graceful).
  static TransportStatus fromString(String? raw) {
    if (raw == null) return TransportStatus.unknown;
    for (final s in TransportStatus.values) {
      if (s.wireValue == raw) return s;
    }
    return TransportStatus.unknown;
  }
}
