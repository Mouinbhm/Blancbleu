import 'package:freezed_annotation/freezed_annotation.dart';

import 'coordonnees.dart';
import 'equipements.dart';
import 'vehicle_type.dart';

part 'vehicle.freezed.dart';
part 'vehicle.g.dart';

/// Véhicule sanitaire (source : `server/models/Vehicle.js`).
@freezed
class Vehicle with _$Vehicle {
  const factory Vehicle({
    @JsonKey(name: '_id') required String id,
    String? immatriculation,
    String? nom,
    @JsonKey(unknownEnumValue: VehicleType.unknown)
    @Default(VehicleType.unknown) VehicleType type,
    String? statut,
    Coordonnees? position,
    @JsonKey(name: 'capacites') Equipements? equipements,
    double? carburant,
    int? kilometrage,
  }) = _Vehicle;

  factory Vehicle.fromJson(Map<String, dynamic> json) =>
      _$VehicleFromJson(json);
}
