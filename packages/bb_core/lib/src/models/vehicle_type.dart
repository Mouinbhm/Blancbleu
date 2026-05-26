import 'package:json_annotation/json_annotation.dart';

/// Type de véhicule sanitaire (source : `server/models/Vehicle.js`).
enum VehicleType {
  @JsonValue('VSL')       vsl,
  @JsonValue('AMBULANCE') ambulance,
  @JsonValue('TPMR')      tpmr,
  @JsonValue('UNKNOWN')   unknown;

  String get wireValue => switch (this) {
    VehicleType.vsl       => 'VSL',
    VehicleType.ambulance => 'AMBULANCE',
    VehicleType.tpmr      => 'TPMR',
    VehicleType.unknown   => 'UNKNOWN',
  };

  String get label => switch (this) {
    VehicleType.vsl       => 'VSL',
    VehicleType.ambulance => 'Ambulance',
    VehicleType.tpmr      => 'TPMR (fauteuil roulant)',
    VehicleType.unknown   => 'Inconnu',
  };

  static VehicleType fromString(String? raw) {
    if (raw == null) return VehicleType.unknown;
    for (final t in VehicleType.values) {
      if (t.wireValue == raw) return t;
    }
    return VehicleType.unknown;
  }
}
