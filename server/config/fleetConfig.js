/**
 * BlancBleu — Configuration analytics flotte
 * Constantes utilisées par fleetAnalyticsService et fleetAlertService.
 * Modifier ces valeurs pour adapter les calculs à votre contexte.
 */
module.exports = {
  // ── Coûts opérationnels (€) ──────────────────────────────────────────────────
  costPerKm:            0.35,   // coût estimé par km parcouru
  costPerHour:          25.00,  // coût estimé par heure de mission
  maintenanceCostRatio: 0.10,   // surcoût maintenance (10 % des coûts opérationnels)

  // ── Seuils d'alerte ──────────────────────────────────────────────────────────
  alertThresholds: {
    maintenanceDaysWarning:   14,    // alerte jaune à J-14 avant maintenance
    maintenanceDaysUrgent:     7,    // alerte rouge à J-7 avant maintenance
    highUtilizationPct:       85,    // taux > 85 % → charge élevée
    lowUtilizationPct:        20,    // taux < 20 % → sous-utilisation
    unusedVehicleDays:         7,    // véhicule non utilisé depuis X jours
    kmBeforeMaintenanceWarn: 2000,   // km restant avant entretien → alerte
  },

  // ── Créneaux horaires de disponibilité ──────────────────────────────────────
  timeSlots: [
    { id: "matin_tot", label: "06h–08h", start:  6, end:  8 },
    { id: "matin1",    label: "08h–10h", start:  8, end: 10 },
    { id: "matin2",    label: "10h–12h", start: 10, end: 12 },
    { id: "midi",      label: "12h–14h", start: 12, end: 14 },
    { id: "apres1",    label: "14h–16h", start: 14, end: 16 },
    { id: "apres2",    label: "16h–18h", start: 16, end: 18 },
    { id: "soir",      label: "18h–20h", start: 18, end: 20 },
    { id: "nuit",      label: "20h–06h", start: 20, end:  6 },  // wraps midnight
  ],

  // ── Capacité de référence (calcul taux d'utilisation) ───────────────────────
  maxMissionsPerDay: 8,   // nombre max de missions par véhicule par jour

  // ── Période mensuelle de référence (jours) ───────────────────────────────────
  monthlyPeriodDays: 30,
};
