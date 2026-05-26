import 'package:freezed_annotation/freezed_annotation.dart';

part 'tracking_point.freezed.dart';
part 'tracking_point.g.dart';

/// Point GPS d'un chauffeur en mission (source : `server/models/TrackingPoint.js`).
/// Utilisé pour le buffering offline (Sprint M2 étape 8).
@freezed
class TrackingPoint with _$TrackingPoint {
  const factory TrackingPoint({
    required double lat,
    required double lng,
    @Default(0) double speed,
    double? accuracy,
    DateTime? timestamp,
    String? shiftId,
    String? transportId,
    String? driverId,
  }) = _TrackingPoint;

  factory TrackingPoint.fromJson(Map<String, dynamic> json) =>
      _$TrackingPointFromJson(json);
}
