import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../utils/constants.dart';

class ApiClient {
  static ApiClient? _instance;
  late final Dio _dio;
  final _storage = const FlutterSecureStorage();

  ApiClient._() {
    _dio = Dio(BaseOptions(
      baseUrl:        AppConstants.apiBase,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
      headers: {'Content-Type': 'application/json'},
    ));

    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await _storage.read(key: AppConstants.tokenKey);
        if (token != null) options.headers['Authorization'] = 'Bearer $token';
        handler.next(options);
      },
      onError: (err, handler) {
        handler.next(err);
      },
    ));
  }

  static ApiClient get instance => _instance ??= ApiClient._();

  // ── Auth ──────────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> login(String email, String password) async {
    final res = await _dio.post(
      '${AppConstants.baseUrl}/api/v1/personnel/auth/login',
      data: {'email': email, 'password': password},
    );
    return res.data as Map<String, dynamic>;
  }

  // ── Tournée ───────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getTournee(String date) async {
    final res = await _dio.get('/driver/tournee', queryParameters: {'date': date});
    return res.data as Map<String, dynamic>;
  }

  // ── Transport status ──────────────────────────────────────────────────────
  Future<void> updateTransportStatus(String id, String status, {String note = ''}) async {
    await _dio.patch('/driver/transports/$id/status', data: {
      'status': status,
      'note':   note,
      'timestamp': DateTime.now().toIso8601String(),
    });
  }

  // ── Signature ─────────────────────────────────────────────────────────────
  Future<void> saveSignature(String id, {String? patient, String? driver}) async {
    await _dio.post('/driver/transports/$id/signature', data: {
      if (patient != null) 'patientSignatureBase64': patient,
      if (driver  != null) 'driverSignatureBase64':  driver,
    });
  }

  // ── PMT photo ─────────────────────────────────────────────────────────────
  Future<String> uploadPmtPhoto(String transportId, String filePath) async {
    final formData = FormData.fromMap({
      'photo': await MultipartFile.fromFile(filePath, filename: 'pmt.jpg'),
    });
    final res = await _dio.post(
      '/driver/transports/$transportId/pmt-photo',
      data: formData,
      options: Options(contentType: 'multipart/form-data'),
    );
    return (res.data as Map<String, dynamic>)['url'] as String;
  }

  // ── Shift ─────────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> startShift(String vehicleId, Map<String, bool> checklist) async {
    final res = await _dio.post('/shifts/start', data: {'vehicleId': vehicleId, 'checklist': checklist});
    return res.data as Map<String, dynamic>;
  }

  Future<void> endShift({int totalKm = 0, String notes = ''}) async {
    await _dio.patch('/shifts/end', data: {'totalKm': totalKm, 'notes': notes});
  }

  Future<Map<String, dynamic>?> getActiveShift() async {
    final res = await _dio.get('/shifts/active');
    return (res.data as Map<String, dynamic>)['shift'] as Map<String, dynamic>?;
  }

  Future<void> addIncident(String description) async {
    await _dio.post('/shifts/incident', data: {'description': description});
  }

  // ── Tracking ──────────────────────────────────────────────────────────────
  Future<void> batchTracking(List<Map<String, dynamic>> points) async {
    await _dio.post('/tracking/batch', data: {'points': points});
  }

  // ── Change password ───────────────────────────────────────────────────────
  Future<String?> changePassword(String currentPassword, String newPassword) async {
    final res = await _dio.post(
      '${AppConstants.baseUrl}/api/v1/personnel/auth/change-password',
      data: {'currentPassword': currentPassword, 'newPassword': newPassword},
    );
    return (res.data as Map<String, dynamic>)['token'] as String?;
  }

  // ── SOS ───────────────────────────────────────────────────────────────────
  Future<void> sosSend({double? lat, double? lng, String? shiftId, String? transportId}) async {
    await _dio.post('/driver/sos', data: {
      if (lat != null) 'lat': lat,
      if (lng != null) 'lng': lng,
      if (shiftId != null) 'shiftId': shiftId,
      if (transportId != null) 'transportId': transportId,
      'timestamp': DateTime.now().toIso8601String(),
    });
  }

  // ── Notifications ─────────────────────────────────────────────────────────
  Future<int> getNotificationsUnreadCount() async {
    try {
      final res = await _dio.get('${AppConstants.baseUrl}/api/notifications/unread-count');
      final body = res.data as Map<String, dynamic>;
      return (body['count'] as num?)?.toInt() ?? 0;
    } catch (_) { return 0; }
  }

  Future<List<Map<String, dynamic>>> getNotifications({int page = 1, int limit = 15}) async {
    try {
      final res = await _dio.get(
        '${AppConstants.baseUrl}/api/notifications',
        queryParameters: {'page': page, 'limit': limit},
      );
      final body = res.data as Map<String, dynamic>;
      final list = body['notifications'] as List<dynamic>? ?? [];
      return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    } catch (_) { return []; }
  }

  Future<void> markNotificationRead(String id) async {
    try {
      await _dio.patch('${AppConstants.baseUrl}/api/notifications/$id/read');
    } catch (_) {}
  }

  // ── Vehicles ──────────────────────────────────────────────────────────────
  Future<List<dynamic>> getAvailableVehicles() async {
    final res = await _dio.get('/driver/vehicles');
    final body = res.data as Map<String, dynamic>;
    final raw  = body['vehicles'] ?? body['data'] ?? [];
    return (raw as List).cast<dynamic>();
  }

  // ── Profile ───────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getShiftStats(String driverId, {String period = 'month'}) async {
    final res = await _dio.get('/shifts/stats', queryParameters: {'driverId': driverId, 'period': period});
    return res.data as Map<String, dynamic>;
  }

  Future<String> uploadAvatar(String filePath) async {
    final formData = FormData.fromMap({
      'avatar': await MultipartFile.fromFile(filePath, filename: 'avatar.jpg'),
    });
    final res = await _dio.post(
      '${AppConstants.baseUrl}/api/v1/personnel/auth/avatar',
      data: formData,
      options: Options(contentType: 'multipart/form-data'),
    );
    return (res.data as Map<String, dynamic>)['url'] as String;
  }

  Future<String> uploadDocument(String type, String filePath) async {
    final formData = FormData.fromMap({
      'document': await MultipartFile.fromFile(filePath, filename: '$type.jpg'),
      'type': type,
    });
    final res = await _dio.post(
      '${AppConstants.baseUrl}/api/v1/personnel/auth/documents',
      data: formData,
      options: Options(contentType: 'multipart/form-data'),
    );
    return (res.data as Map<String, dynamic>)['url'] as String;
  }
}
