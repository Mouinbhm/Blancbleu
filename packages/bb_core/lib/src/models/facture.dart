import 'package:freezed_annotation/freezed_annotation.dart';

part 'facture.freezed.dart';
part 'facture.g.dart';

/// Facture sanitaire (source : `server/models/Facture.js`).
@freezed
class Facture with _$Facture {
  const factory Facture({
    @JsonKey(name: '_id', readValue: _readId) required String id,
    String? numero,
    String? transportId,
    double? montantTotal,
    double? montantCPAM,
    double? montantPatient,
    String? statut, // brouillon | emise | payee | annulee | ...
    String? paymentStatus,
    DateTime? datePaiement,
    String? modePaiement,
    DateTime? createdAt,
  }) = _Facture;

  factory Facture.fromJson(Map<String, dynamic> json) =>
      _$FactureFromJson(json);
}

Object? _readId(Map<dynamic, dynamic> json, String key) =>
    json['_id'] ?? json['id'];
