import 'package:freezed_annotation/freezed_annotation.dart';

part 'coordonnees.freezed.dart';
part 'coordonnees.g.dart';

/// Coordonnées GPS (lat/lng) — sous-doc de `Adresse` et `Vehicle.position`.
@freezed
class Coordonnees with _$Coordonnees {
  const factory Coordonnees({
    double? lat,
    double? lng,
  }) = _Coordonnees;

  factory Coordonnees.fromJson(Map<String, dynamic> json) =>
      _$CoordonneesFromJson(json);
}
