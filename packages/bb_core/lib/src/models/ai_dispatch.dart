import 'package:freezed_annotation/freezed_annotation.dart';

part 'ai_dispatch.freezed.dart';
part 'ai_dispatch.g.dart';

/// Sous-doc `transport.aiDispatch` — recommandation IA dénormalisée
/// (cf. server/controllers/aiController.recommanderDispatch).
@freezed
class AiDispatch with _$AiDispatch {
  const factory AiDispatch({
    String? recommendedVehicleId,
    String? recommendedDriverId,
    String? vehicleName,
    String? driverName,
    double? score,
    @Default([]) List<String> explanation,
    @Default([]) List<String> risks,
    @Default([]) List<String> warnings,
    String? source,
    @Default(false) bool fallbackUsed,
    DateTime? generatedAt,
    bool? acceptedByDispatcher,
    DateTime? acceptedAt,
    String? lastRecommendationId,
  }) = _AiDispatch;

  factory AiDispatch.fromJson(Map<String, dynamic> json) =>
      _$AiDispatchFromJson(json);
}
