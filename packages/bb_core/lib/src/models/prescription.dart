import 'package:freezed_annotation/freezed_annotation.dart';

part 'prescription.freezed.dart';
part 'prescription.g.dart';

/// Prescription Médicale de Transport (source : `server/models/Prescription.js`).
@freezed
class Prescription with _$Prescription {
  const factory Prescription({
    @JsonKey(name: '_id', readValue: _readId) required String id,
    String? numero,
    String? motif,
    String? statut,
    String? source, // web | app_mobile | papier
    DateTime? dateEmission,
    String? etablissementDestination,
    String? fichierUrl,
    String? fichierNom,
    String? notes,
  }) = _Prescription;

  factory Prescription.fromJson(Map<String, dynamic> json) =>
      _$PrescriptionFromJson(json);
}

Object? _readId(Map<dynamic, dynamic> json, String key) =>
    json['_id'] ?? json['id'];
