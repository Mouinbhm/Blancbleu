import 'package:dio/dio.dart';
import 'package:bb_core/bb_core.dart';
import '../utils/constants.dart';
import 'socket_manager.dart';

class ApiClient {
  static ApiClient? _instance;

  // Sprint M3 — toute la plomberie HTTP (bearer + refresh single-flight + 401/403
  // → exceptions typées) vit désormais dans bb_core/DioClient. Ce fichier ne
  // garde que le wiring driver (clés, refresh path, socket reauth, logout) et
  // les méthodes de domaine.
  final _storage = SecureStorageWrapper();
  late final TokenManager _tokens = TokenManager(
    storage:    _storage,
    accessKey:  AppConstants.tokenKey,   // 'personnel_token' (inchangé)
    refreshKey: AppConstants.refreshKey, // 'personnel_refresh' (inchangé)
  );
  late final DioClient _client = DioClient(
    baseUrl:          AppConstants.apiBase, // $baseUrl/api/v1
    tokens:           _tokens,
    refreshPath:      '/personnel/auth/refresh',
    onRefreshSuccess: () async => SocketManager.instance.reauthenticate(),
    onAuthFailed:     _forceLogout,
    spkiSha256PinsBase64: const [], // pinning off (AppConstants.sslPins non défini)
  );

  Dio get _dio => _client.dio;

  /// Set this callback from the app root to handle expired / invalid tokens.
  /// Called when refresh fails (or on 403 = vraiment interdit).
  static void Function()? onUnauthorized;

  bool _loggedOut = false; // prevent multiple logout calls in rapid succession

  ApiClient._();

  static ApiClient get instance => _instance ??= ApiClient._();

  /// Call after a successful login so the 401-guard is reset for the new session.
  void resetSession() => _loggedOut = false;

  /// Logout idempotent appelé par DioClient (onAuthFailed) sur échec de refresh
  /// ou 403. Purge les 3 clés (le TokenManager ne connaît pas userKey) puis
  /// notifie l'app via onUnauthorized.
  Future<void> _forceLogout() async {
    if (_loggedOut) return;
    _loggedOut = true;
    await _tokens.clear(); // tokenKey + refreshKey
    await _storage.delete(AppConstants.userKey); // 'personnel_data'
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
