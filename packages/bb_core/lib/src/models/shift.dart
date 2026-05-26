import 'package:freezed_annotation/freezed_annotation.dart';

part 'shift.freezed.dart';
part 'shift.g.dart';

/// Shift chauffeur (source : `server/models/DriverShift.js`).
@freezed
class Shift with _$Shift {
  const factory Shift({
    @JsonKey(name: '_id', readValue: _readId) required String id,
    String? personnelId,
    /// `vehicleId` peut être String OU Map populée selon l'endpoint —
    /// non typé ici pour rester souple ; les écrans extraient l'id si besoin.
    @JsonKey(name: 'vehicleId', readValue: _readVehicleId) String? vehicleId,
    String? status, // ACTIVE | ENDED | ABANDONED
    DateTime? startTime,
    DateTime? endTime,
    int? totalKm,
    String? notes,
  }) = _Shift;

  factory Shift.fromJson(Map<String, dynamic> json) => _$ShiftFromJson(json);
}

Object? _readId(Map<dynamic, dynamic> json, String key) =>
    json['_id'] ?? json['id'];

Object? _readVehicleId(Map<dynamic, dynamic> json, String key) {
  final raw = json['vehicleId'];
  if (raw == null) return null;
  if (raw is String) return raw;
  if (raw is Map) return raw['_id']?.toString() ?? raw['id']?.toString();
  return null;
}
