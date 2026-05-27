/// Dio configurée pour les apps mobile : bearer token + refresh single-flight
/// + mapping des DioException vers BbException.
///
/// Sprint M1 a introduit le refresh token cote driver (api_client.dart) et
/// patient (api_service.dart) séparément. Sprint M3 consolide la logique
/// commune ici, paramétrée par :
///   - baseUrl (driver: /api/v1, patient: /api/patient)
///   - TokenManager (clés différentes selon l'app)
///   - refreshPath  (driver: /personnel/auth/refresh, patient: /refresh)
///   - onRefreshSuccess callback : permet aux apps de propager le nouveau
///     token au socket (cf. M2 SocketManager.reauthenticate).
///   - onAuthFailed callback : déclenche le logout côté app (clear storage,
///     navigation login).
library;

import 'dart:async';

import 'package:dio/dio.dart';

import '../errors/exceptions.dart';
import 'error_mapper.dart';
import 'ssl_pinning.dart';
import 'token_manager.dart';

class DioClient {
  late final Dio dio;
  final TokenManager _tokens;
  final String _refreshPath;
  final Future<void> Function()? _onRefreshSuccess;
  final Future<void> Function()? _onAuthFailed;

  // Single-flight refresh : un seul appel /refresh à la fois, les autres
  // requêtes en 401 attendent ce Completer.
  Completer<bool>? _refreshCompleter;

  /// Marker dans RequestOptions.extra pour éviter de retry indéfiniment.
  static const String _retriedKey = '_bb_retried';

  DioClient({
    required String baseUrl,
    required TokenManager tokens,
    required String refreshPath,
    Duration connectTimeout = const Duration(seconds: 15),
    Duration receiveTimeout = const Duration(seconds: 30),
    Future<void> Function()? onRefreshSuccess,
    Future<void> Function()? onAuthFailed,
    /// Sprint M5 — SSL public-key pinning (SPKI SHA-256 base64).
    /// Vide ou baseUrl non https → adapter par défaut (dev).
    /// Voir docs/mobile-security.md pour la procédure d'extraction.
    List<String> spkiSha256PinsBase64 = const [],
  })  : _tokens = tokens,
        _refreshPath = refreshPath,
        _onRefreshSuccess = onRefreshSuccess,
        _onAuthFailed = onAuthFailed {
    dio = Dio(BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: connectTimeout,
      receiveTimeout: receiveTimeout,
      headers: {'Content-Type': 'application/json'},
    ));

    // Sprint M5 — Si des pins SSL sont fournis ET baseUrl est https, on
    // installe l'adapter pinné (rejet automatique des certs non matchant).
    // Sinon adapter Dio par défaut (validation système).
    final pinnedAdapter = SslPinning.buildPinnedAdapter(
      spkiSha256PinsBase64: spkiSha256PinsBase64,
      baseUrl: baseUrl,
    );
    if (pinnedAdapter != null) {
      dio.httpClientAdapter = pinnedAdapter;
    }

    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await _tokens.getAccessToken();
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onError: (err, handler) async {
        final status = err.response?.statusCode;
        final ro = err.requestOptions;
        final isRefreshCall  = ro.path.endsWith(_refreshPath);
        final alreadyRetried = ro.extra[_retriedKey] == true;

        // 403 → vraiment interdit, pas une expiration.
        if (status == 403) {
          await _onAuthFailed?.call();
          return handler.reject(err.copyWith(error: ForbiddenException(_msg(err))));
        }

        if (status != 401 || isRefreshCall || alreadyRetried) {
          return handler.reject(err.copyWith(error: mapDioError(err)));
        }

        final ok = await _ensureRefreshed();
        if (!ok) {
          await _onAuthFailed?.call();
          return handler.reject(err.copyWith(error: AuthException(_msg(err))));
        }

        try {
          final newToken = await _tokens.getAccessToken();
          final retryOptions = Options(
            method:         ro.method,
            headers: {...ro.headers, 'Authorization': 'Bearer $newToken'},
            contentType:    ro.contentType,
            responseType:   ro.responseType,
            sendTimeout:    ro.sendTimeout,
            receiveTimeout: ro.receiveTimeout,
            extra: {...ro.extra, _retriedKey: true},
            validateStatus: ro.validateStatus,
          );
          final response = await dio.request<dynamic>(
            ro.path,
            data:            ro.data,
            queryParameters: ro.queryParameters,
            options:         retryOptions,
          );
          return handler.resolve(response);
        } on DioException catch (e) {
          if (e.response?.statusCode == 401) {
            await _onAuthFailed?.call();
            return handler.reject(e.copyWith(error: AuthException(_msg(e))));
          }
          return handler.reject(e.copyWith(error: mapDioError(e)));
        }
      },
    ));
  }

  /// Appel atomique du endpoint /refresh, avec single-flight.
  /// L'app fournit le shape de la requête/réponse via [_refreshRequest] et
  /// [_extractTokens] passés en sous-classe ? Non — on simplifie : on POST
  /// `{refreshToken}` et on s'attend à `{token | accessToken, refreshToken?}`.
  Future<bool> _ensureRefreshed() async {
    if (_refreshCompleter != null) return _refreshCompleter!.future;
    final c = Completer<bool>();
    _refreshCompleter = c;
    try {
      final raw = await _tokens.getRefreshToken();
      if (raw == null || raw.isEmpty) {
        c.complete(false);
        return false;
      }
      // Dio standalone sans intercepteur pour éviter de re-déclencher refresh.
      final plain = Dio(BaseOptions(
        baseUrl: dio.options.baseUrl,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 10),
        headers: {'Content-Type': 'application/json'},
      ));
      final res = await plain.post(
        _refreshPath,
        data: {'refreshToken': raw},
        options: Options(validateStatus: (s) => s != null && s < 500),
      );
      if (res.statusCode == 200 && res.data is Map) {
        final body = res.data as Map<String, dynamic>;
        // Driver utilise 'token', patient utilise 'accessToken' — on accepte les 2.
        final newAccess  = (body['token'] ?? body['accessToken']) as String?;
        final newRefresh = body['refreshToken'] as String?;
        if (newAccess != null && newAccess.isNotEmpty) {
          await _tokens.saveTokens(access: newAccess, refresh: newRefresh);
          await _onRefreshSuccess?.call();
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
}

String _msg(DioException e) =>
    e.message ?? (e.response?.statusMessage ?? 'Erreur HTTP');
