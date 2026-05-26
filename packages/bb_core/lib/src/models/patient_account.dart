import 'package:freezed_annotation/freezed_annotation.dart';

import 'mobilite.dart';

part 'patient_account.freezed.dart';
part 'patient_account.g.dart';

/// Compte patient mobile (source : `server/models/User.js` avec role:patient).
/// Distinct de `PatientInfo` qui est le sous-doc embarqué dans Transport.
@freezed
class PatientAccount with _$PatientAccount {
  const factory PatientAccount({
    @JsonKey(name: '_id', readValue: _readId) required String id,
    String? nom,
    String? prenom,
    String? email,
    String? telephone,
    DateTime? dateNaissance,
    String? adresse,
    @JsonKey(unknownEnumValue: Mobilite.unknown)
    @Default(Mobilite.unknown) Mobilite mobilite,
    String? medecin,
    String? mutuelle,
    @Default('patient') String role,
  }) = _PatientAccount;

  factory PatientAccount.fromJson(Map<String, dynamic> json) =>
      _$PatientAccountFromJson(json);
}

Object? _readId(Map<dynamic, dynamic> json, String key) =>
    json['_id'] ?? json['id'];
