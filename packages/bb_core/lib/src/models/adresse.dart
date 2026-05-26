import 'package:freezed_annotation/freezed_annotation.dart';

import 'coordonnees.dart';

part 'adresse.freezed.dart';
part 'adresse.g.dart';

/// Adresse postale + coordonnées GPS optionnelles.
///
/// Champs FR pour matcher le backend (`server/models/Transport.js`).
@freezed
class Adresse with _$Adresse {
  const factory Adresse({
    String? nom,
    String? rue,
    String? ville,
    String? codePostal,
    Coordonnees? coordonnees,
  }) = _Adresse;

  factory Adresse.fromJson(Map<String, dynamic> json) =>
      _$AdresseFromJson(json);
}
