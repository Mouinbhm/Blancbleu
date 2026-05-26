import 'package:freezed_annotation/freezed_annotation.dart';

import 'mobilite.dart';

part 'patient_info.freezed.dart';
part 'patient_info.g.dart';

/// Sous-document `transport.patient` (informations patient embarquées dans
/// chaque transport — distinct de `PatientAccount` qui est le compte mobile).
@freezed
class PatientInfo with _$PatientInfo {
  const factory PatientInfo({
    String? nom,
    String? prenom,
    String? telephone,
    String? email,
    @JsonKey(unknownEnumValue: Mobilite.unknown)
    @Default(Mobilite.unknown) Mobilite mobilite,
    @Default(false) bool oxygene,
    @Default(false) bool brancardage,
    @Default(false) bool accompagnateur,
  }) = _PatientInfo;

  factory PatientInfo.fromJson(Map<String, dynamic> json) =>
      _$PatientInfoFromJson(json);
}
