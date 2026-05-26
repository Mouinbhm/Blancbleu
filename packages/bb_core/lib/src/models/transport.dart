import 'package:freezed_annotation/freezed_annotation.dart';

import 'adresse.dart';
import 'ai_dispatch.dart';
import 'patient_info.dart';
import 'populated_ref.dart';
import 'transport_status.dart';
import 'vehicle.dart';

part 'transport.freezed.dart';
part 'transport.g.dart';

/// Transport sanitaire — modèle central des deux apps.
///
/// Source : `server/models/Transport.js`. Champs FR conservés (matching
/// backend), traduits par l'UI au moment de l'affichage.
///
/// Champs polymorphes :
///   - `vehicule` / `chauffeur` peuvent être String (id) ou objet peuplé
///     selon l'endpoint. Encapsulés dans `PopulatedRef<Vehicle>` /
///     `PopulatedRef<Personnel>` via JsonConverter custom (cf. en bas).
@freezed
class Transport with _$Transport {
  const factory Transport({
    @JsonKey(name: '_id') required String id,
    String? numero,
    @JsonKey(unknownEnumValue: TransportStatus.unknown)
    @Default(TransportStatus.unknown) TransportStatus statut,
    String? typeTransport,
    String? motif,
    DateTime? dateTransport,
    String? heureRDV,
    String? heureDepart,
    @Default(false) bool allerRetour,
    PatientInfo? patient,
    Adresse? adresseDepart,
    Adresse? adresseDestination,
    @VehiculeRefConverter() PopulatedRef<Vehicle>? vehicule,
    /// `chauffeur` conservé en `String?` faute de modèle Personnel encore
    /// côté patient app (cf. étape 2c — sera typé `PopulatedRef<Personnel>?`).
    String? chauffeur,
    AiDispatch? aiDispatch,
    double? scoreDispatch,
    int? dureeReelleMinutes,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) = _Transport;

  factory Transport.fromJson(Map<String, dynamic> json) =>
      _$TransportFromJson(json);
}

/// Converter pour `transport.vehicule` polymorphe (id String vs Map populée).
class VehiculeRefConverter
    implements JsonConverter<PopulatedRef<Vehicle>?, Object?> {
  const VehiculeRefConverter();

  @override
  PopulatedRef<Vehicle>? fromJson(Object? json) {
    if (json == null) return null;
    if (json is String) {
      if (json.isEmpty) return null;
      return PopulatedRef.idOnly(json);
    }
    if (json is Map<String, dynamic>) {
      final id = (json['_id'] ?? json['id'])?.toString() ?? '';
      if (id.isEmpty) return null;
      try {
        return PopulatedRef.populated(id, Vehicle.fromJson(json));
      } catch (_) {
        return PopulatedRef.idOnly(id);
      }
    }
    return null;
  }

  @override
  Object? toJson(PopulatedRef<Vehicle>? value) {
    if (value == null) return null;
    return value.populated != null ? value.populated!.toJson() : value.id;
  }
}
