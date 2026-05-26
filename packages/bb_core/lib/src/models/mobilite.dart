import 'package:json_annotation/json_annotation.dart';

/// Mobilité patient (source : `server/models/Patient.js`).
/// Détermine le type de véhicule éligible (cf. autoDispatch eligibility M6).
enum Mobilite {
  @JsonValue('ASSIS')             assis,
  @JsonValue('FAUTEUIL_ROULANT')  fauteuilRoulant,
  @JsonValue('ALLONGE')           allonge,
  @JsonValue('CIVIERE')           civiere,
  @JsonValue('UNKNOWN')           unknown;

  String get wireValue => switch (this) {
    Mobilite.assis           => 'ASSIS',
    Mobilite.fauteuilRoulant => 'FAUTEUIL_ROULANT',
    Mobilite.allonge         => 'ALLONGE',
    Mobilite.civiere         => 'CIVIERE',
    Mobilite.unknown         => 'UNKNOWN',
  };

  String get label => switch (this) {
    Mobilite.assis           => 'Assis',
    Mobilite.fauteuilRoulant => 'Fauteuil roulant',
    Mobilite.allonge         => 'Allongé',
    Mobilite.civiere         => 'Civière',
    Mobilite.unknown         => 'Inconnu',
  };

  /// Sprint 6 — mobilités éligibles à l'auto-dispatch (ALLONGE/CIVIERE
  /// systématiquement exclus, trop sensibles).
  bool get isAutoDispatchEligible =>
      this == Mobilite.assis || this == Mobilite.fauteuilRoulant;

  static Mobilite fromString(String? raw) {
    if (raw == null) return Mobilite.unknown;
    for (final m in Mobilite.values) {
      if (m.wireValue == raw) return m;
    }
    return Mobilite.unknown;
  }
}
