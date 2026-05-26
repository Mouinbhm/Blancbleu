import 'package:freezed_annotation/freezed_annotation.dart';

part 'personnel.freezed.dart';
part 'personnel.g.dart';

/// Profil chauffeur ambulancier (source : `server/models/Personnel.js`).
/// Utilisé par l'app driver.
@freezed
class Personnel with _$Personnel {
  const factory Personnel({
    @JsonKey(name: '_id') @JsonKey(readValue: _readId) required String id,
    String? nom,
    String? prenom,
    String? email,
    String? telephone,
    String? role,
    String? statut,
    String? photoUrl,
    @Default(false) bool forcePasswordChange,
  }) = _Personnel;

  factory Personnel.fromJson(Map<String, dynamic> json) =>
      _$PersonnelFromJson(json);
}

/// Le backend renvoie soit `_id` soit `id` selon l'endpoint — accepte les 2.
Object? _readId(Map<dynamic, dynamic> json, String key) =>
    json['_id'] ?? json['id'];
