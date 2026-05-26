import 'package:freezed_annotation/freezed_annotation.dart';

part 'equipements.freezed.dart';
part 'equipements.g.dart';

/// Équipements à bord d'un véhicule sanitaire (sous-doc `Vehicle.capacites`).
@freezed
class Equipements with _$Equipements {
  const factory Equipements({
    @JsonKey(name: 'equipeFauteuil') @Default(false) bool fauteuil,
    @JsonKey(name: 'equipeOxygene')  @Default(false) bool oxygene,
    @JsonKey(name: 'equipeBrancard') @Default(false) bool brancard,
  }) = _Equipements;

  factory Equipements.fromJson(Map<String, dynamic> json) =>
      _$EquipementsFromJson(json);
}
