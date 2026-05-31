import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../utils/constants.dart';
import 'socket_manager.dart';

class ApiClient {
  static ApiClient? _instance;
  late final Dio _dio;
  final _storage = const FlutterSecureStorage();

  /// Set this callback from the app root to handle expired / invalid tokens.
  /// Called when refresh fails (or on 403 = vraiment interdit).
  static void Function()? onUnauthorized;

  bool _loggedOut = false; // prevent multiple logout calls in rapid succession

  // Single-flight refresh : si plusieurs requêtes échouent en 401 en parallèle,
  // une seule tentative de refresh est lancée ; les autres attendent son résultat.
  static Completer<bool>? _refreshCompleter;

  // Marker dans RequestOptions.extra pour éviter de retry indéfiniment.
  static const String _retriedKey = '_bb_retried';

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
      onError: (err, handler) async {
        final status = err.response?.statusCode;
        final ro = err.requestOptions;
        final path = ro.path;

        // 403 = interdit (rôle, ressource), pas expiré → logout direct.
        if (status == 403) {
          await _forceLogout();
          return handler.next(err);
        }

        // 401 sur le endpoint /refresh lui-même → logout (refresh KO ou
        // révoqué). Sans ce garde, on boucle.
        final isRefreshCall = path.endsWith('/personnel/auth/refresh');
        final alreadyRetried = ro.extra[_retriedKey] == true;

        if (status != 401 || isRefreshCall || alreadyRetried) {
          return handler.next(err);
        }

        // Tente le refresh (single-flight).
        final ok = await _ensureRefreshed();
        if (!ok) {
          await _forceLogout();
          return handler.next(err);
        }

        // Rejoue la requête originale avec le nouveau token.
        try {
          final newToken = await _storage.read(key: AppConstants.tokenKey);
          if (newToken == null) {
            await _forceLogout();
            return handler.next(err);
          }
          final retryOptions = Options(
            method:  ro.method,
            headers: {...ro.headers, 'Authorization': 'Bearer $newToken'},
            contentType:     ro.contentType,
            responseType:    ro.responseType,
            sendTimeout:     ro.sendTimeout,
            receiveTimeout:  ro.receiveTimeout,
            extra: {...ro.extra, _retriedKey: true},
            validateStatus:  ro.validateStatus,
          );
          final response = await _dio.request<dynamic>(
            ro.path,
            data:            ro.data,
            queryParameters: ro.queryParameters,
            options:         retryOptions,
          );
          return handler.resolve(response);
        } on DioException catch (e) {
          // Si le retry échoue à nouveau en 401 → logout (refresh ne suffit plus).
          if (e.response?.statusCode == 401) {
            await _forceLogout();
          }
          return handler.next(e);
        } catch (_) {
          return handler.next(err);
        }
      },
    ));
  }

  static ApiClient get instance => _instance ??= ApiClient._();

  /// Call after a successful login so the 401-guard is reset for the new session.
  void resetSession() => _loggedOut = false;

  // ── Refresh single-flight ─────────────────────────────────────────────────
  Future<bool> _ensureRefreshed() async {
    if (_refreshCompleter != null) return _refreshCompleter!.future;
    final c = Completer<bool>();
    _refreshCompleter = c;
    try {
      final raw = await _storage.read(key: AppConstants.refreshKey);
      if (raw == null || raw.isEmpty) {
        c.complete(false);
        return false;
      }
      // Dio dédié SANS interceptor pour éviter de re-déclencher le refresh.
      final plain = Dio(BaseOptions(
        baseUrl: AppConstants.baseUrl,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 10),
        headers: {'Content-Type': 'application/json'},
      ));
      final res = await plain.post(
        '/api/v1/personnel/auth/refresh',
        data: {'refreshToken': raw},
        options: Options(validateStatus: (s) => s != null && s < 500),
      );
      if (res.statusCode == 200 && res.data is Map) {
        final body = res.data as Map<String, dynamic>;
        final newAccess  = body['token']        as String?;
        final newRefresh = body['refreshToken'] as String?;
        if (newAccess != null && newAccess.isNotEmpty) {
          await _storage.write(key: AppConstants.tokenKey, value: newAccess);
          if (newRefresh != null && newRefresh.isNotEmpty) {
            await _storage.write(key: AppConstants.refreshKey, value: newRefresh);
          }
          // Sprint M2 — propage le nouveau token au foreground socket pour
          // éviter une déconnexion silencieuse au prochain heartbeat serveur.
          SocketManager.instance.reauthenticate();
          c.complete(true);
          return true;
        }
      }
      c.complete(false);
      return false;
    } catch (_) {
      c.complete(false);
      return false;
    } finally {
      _refreshCompleter = null;
    }
  }

  Future<void> _forceLogout() async {
    if (_loggedOut) return;
    _loggedOut = true;
    await _storage.delete(key: AppConstants.tokenKey);
    await _storage.delete(key: AppConstants.refreshKey);
    await _storage.delete(key: AppConstants.userKey);
    onUnauthorized?.call();
  }

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

  /// Sprint M6 — Push d'un point GPS unique, utilisé par l'ActionQueue offline
  /// quand chaque point est rejoué individuellement après reconnexion.
  /// Le serveur tolère un batch d'un seul point.
  Future<void> pushTrackingPoint({
    required String shiftId,
    required double lat,
    required double lng,
    double? speed,
    double? heading,
    double? accuracy,
    String? timestamp,
  }) async {
    await _dio.post('/tracking/batch', data: {
      'shiftId': shiftId,
      'points': [
        {
          'lat': lat,
          'lng': lng,
          if (speed != null) 'speed': speed,
          if (heading != null) 'heading': heading,
          if (accuracy != null) 'accuracy': accuracy,
          'timestamp': timestamp ?? DateTime.now().toIso8601String(),
        },
      ],
    });
  }

  // ── Change password ───────────────────────────────────────────────────────
  Future<String?> changePassword(String currentPassword, String newPassword) async {
    final res = await _dio.post(
      '${AppConstants.baseUrl}/api/v1/personnel/auth/change-password',
      data: {'currentPassword': currentPassword, 'newPassword': newPassword},
    );
    return (res.data as Map<String, dynamic>)['token'] as String?;
  }

  // ── Sprint M4 — FCM push token lifecycle ─────────────────────────────────
  Future<void> registerFcmToken(String token) async {
    try {
      await _dio.post(
        '${AppConstants.baseUrl}/api/v1/personnel/auth/fcm-token',
        data: {'token': token},
      );
    } catch (_) {
      // Best-effort : si l'enregistrement échoue, on n'empêche pas le boot.
      // Le prochain onTokenRefresh ré-essaiera.
    }
  }

  Future<void> deleteFcmToken() async {
    try {
      await _dio.delete('${AppConstants.baseUrl}/api/v1/personnel/auth/fcm-token');
    } catch (_) { /* best-effort */ }
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

  // ── Profile update ────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> updateProfile({
    String? nom,
    String? prenom,
    String? telephone,
  }) async {
    final res = await _dio.patch(
      '${AppConstants.baseUrl}/api/v1/personnel/auth/profile',
      data: {
        if (nom       != null) 'nom':       nom,
        if (prenom    != null) 'prenom':    prenom,
        if (telephone != null) 'telephone': telephone,
      },
    );
    return res.data as Map<String, dynamic>;
  }

  // ── Messages ──────────────────────────────────────────────────────────────
  Future<List<Map<String, dynamic>>> getMessageHistory() async {
    try {
      final res = await _dio.get('/messages/history');
      final list = res.data as List<dynamic>? ?? [];
      return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    } catch (_) { return []; }
  }
}
