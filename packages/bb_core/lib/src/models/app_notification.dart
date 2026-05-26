import 'package:freezed_annotation/freezed_annotation.dart';

part 'app_notification.freezed.dart';
part 'app_notification.g.dart';

/// Notification persistée (source : `server/models/Notification.js`).
@freezed
class AppNotification with _$AppNotification {
  const factory AppNotification({
    @JsonKey(name: '_id', readValue: _readId) required String id,
    String? type,
    String? title,
    String? message,
    String? recipientId,
    String? recipientRole,
    @Default(false) bool read,
    @Default(false) bool archived,
    DateTime? createdAt,
    Map<String, dynamic>? data, // payload libre (transportId, etc.)
  }) = _AppNotification;

  factory AppNotification.fromJson(Map<String, dynamic> json) =>
      _$AppNotificationFromJson(json);
}

Object? _readId(Map<dynamic, dynamic> json, String key) =>
    json['_id'] ?? json['id'];
